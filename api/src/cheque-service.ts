import crypto from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Pool } from 'pg';
import {
  CreateChequeSchema,
  RedeemChequeSchema,
  decimalToMinor,
  minorToDecimalString,
  convertFiatMinorToStroops,
  convertStroopsToFiatMinor,
  getCorridor,
  parseEnabledCorridors,
  validateFaceAmount,
  validatePayoutDestination,
  CORRIDORS,
  type FiatCurrency,
  generateClaimToken,
  hashClaimToken,
  generateSessionToken,
  transition,
  withTransaction,
  mapChequeRow,
  createFundingTransaction,
  createSettlementPendingTransaction,
  createSettlementConfirmedTransaction,
  createRefundPendingTransaction,
  createRefundConfirmedTransaction,
  type Cheque,
  type ChequeState,
  type OutboxItem,
} from '@cheque/core';
import type { SenderAuthService } from '@cheque/notify';
import { OtpService, EmailClient } from '@cheque/notify';
import type { Env } from '@cheque/shared';
import { logger } from '@cheque/shared';
import { deriveChequeIdHex, type ChequeContractClient } from '@cheque/chain';
import type { ChainOperationPayload } from './chain-handler.js';

/** Contract defaults (docs/CONTRACT.md): cheques >= 50 USDC wait 15 min before redeem. */
const DELAY_THRESHOLD_STROOPS = 500_000_000n;
const DELAY_SECS = 900;
const MIN_STROOPS = 10_000_000n; // contract min_amount: 1 USDC
const LOCK_SECS = 600;

const CHEQUE_COLS = `
  c.id,
  c.public_code AS "publicCode",
  c.claim_token_hash AS "claimTokenHash",
  c.sender_id AS "senderId",
  c.payee_name AS "payeeName",
  c.payee_contact_type AS "payeeContactType",
  c.payee_contact AS "payeeContact",
  c.corridor,
  c.currency,
  c.face_amount_minor::float8 AS "faceAmountMinor",
  c.fee_minor::float8 AS "feeMinor",
  c.note,
  c.signature,
  c.funder_address AS "funderAddress",
  c.state,
  c.expires_at AS "expiresAt",
  c.quote_id AS "quoteId",
  c.usdc_amount_stroops::text AS "usdcAmountStroops",
  c.fx_rate::text AS "fxRate",
  c.version,
  c.created_at AS "createdAt",
  c.updated_at AS "updatedAt"`;

/** FX rate (currency per 1 USD) from env; USDC itself is the 1:1 peg. */
function fxPerUsd(env: Env, currency: FiatCurrency): string {
  switch (currency) {
    case 'GHS':
      return env.FX_GHS_PER_USDC;
    case 'NGN':
      return env.FX_NGN_PER_USDC;
    case 'USD':
      return env.FX_USD_PER_USDC;
  }
}

function amountView(minor: number, currency: FiatCurrency) {
  return { amount: minorToDecimalString(minor), currency };
}

export interface ChequeServiceDeps {
  app: FastifyInstance;
  pool: Pool;
  env: Env;
  authService: SenderAuthService;
  /** Optional email OTP service for recipient claim verification (PRD v4). */
  emailOtpService?: OtpService;
  /** Optional email client for OTP delivery (PRD v4). */
  emailClient?: EmailClient;
  /** Public key of the account that escrows funds; refunds on-chain go back to it. */
  fundingPublicKey?: string;
  /** Builds and relays wallet-signed deposits and cancels. */
  chainClient?: ChequeContractClient;
  chainEnabled: boolean;
}

function maskName(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((p) => p[0] + '*'.repeat(Math.max(p.length - 1, 2)))
    .join(' ');
}

function publicView(c: Cheque, senderName?: string | null) {
  return {
    id: c.id,
    publicCode: c.publicCode,
    state: c.state,
    payee: maskName(c.payeeName),
    senderFirstName: senderName ? senderName.split(/\s+/)[0] : null,
    corridor: c.corridor,
    ...amountView(c.faceAmountMinor, c.currency),
    note: c.note ?? null,
    signature: c.signature ?? null,
    expiresAt: c.expiresAt,
    createdAt: c.createdAt,
  };
}

async function loadByToken(pool: Pool, token: string) {
  const res = await pool.query(
    `SELECT ${CHEQUE_COLS}, u.name AS "senderName"
       FROM cheques c JOIN users u ON u.id = c.sender_id
      WHERE c.claim_token_hash = $1`,
    [hashClaimToken(token)]
  );
  if (res.rowCount === 0) return null;
  const row = res.rows[0];
  return { cheque: mapChequeRow(row), senderName: row.senderName as string | null };
}

async function loadById(pool: Pool, id: string) {
  const res = await pool.query(`SELECT ${CHEQUE_COLS} FROM cheques c WHERE c.id = $1`, [id]);
  return res.rowCount ? mapChequeRow(res.rows[0]) : null;
}

/** Moves a cheque if (and only if) it is still in `from`; returns false when it already moved. */
async function moveIfStill(
  pool: Pool,
  chequeId: string,
  from: ChequeState,
  to: ChequeState,
  extra: Partial<Parameters<typeof transition>[0]> = {}
): Promise<boolean> {
  const cur = await loadById(pool, chequeId);
  if (!cur || cur.state !== from) return false;
  await transition({
    chequeId,
    fromState: from,
    toState: to,
    actor: 'SYSTEM',
    expectedVersion: cur.version,
    ...extra,
  });
  return true;
}

async function enqueue(
  pool: Pool,
  chequeId: string,
  payload: ChainOperationPayload,
  delaySecs = 0
): Promise<void> {
  await pool.query(
    `INSERT INTO outbox (id, topic, aggregate_type, aggregate_id, payload, status, next_run_at)
     VALUES ($1, 'chain:contract:submit', 'cheque', $2, $3, 'PENDING', NOW() + ($4 || ' seconds')::interval)`,
    [crypto.randomUUID(), chequeId, JSON.stringify(payload), String(delaySecs)]
  );
}

/** Funds are on-chain: PENDING_FUNDING -> ACTIVE (idempotent). */
async function activateFunded(pool: Pool, cheque: Cheque, source: string): Promise<void> {
  const moved = await moveIfStill(pool, cheque.id, 'PENDING_FUNDING', 'ACTIVE', {
    ledgerTx: createFundingTransaction({
      chequeId: cheque.id,
      faceAmountMinor: cheque.faceAmountMinor,
      feeMinor: cheque.feeMinor,
      currency: cheque.currency,
    }),
    auditPayload: { source },
  });
  if (!moved) return;
  // Queue recipient email alert when a recipient email is on file (PRD v4).
  if (cheque.payeeContact && cheque.payeeContactType === 'EMAIL') {
    await pool.query(
      `INSERT INTO outbox (id, topic, aggregate_type, aggregate_id, payload, status, next_run_at)
       VALUES ($1, 'email:cheque:alert', 'cheque', $2, $3, 'PENDING', NOW())`,
      [
        crypto.randomUUID(),
        cheque.id,
        JSON.stringify({ chequeId: cheque.id, to: cheque.payeeContact }),
      ]
    );
  }
}

/** Reflects confirmed on-chain operations into the off-chain cheque state machine. */
export function createChainAppliedHook(pool: Pool) {
  return async function onApplied(item: OutboxItem, payload: ChainOperationPayload): Promise<void> {
    const chequeId = item.aggregateId;
    const cheque = await loadById(pool, chequeId);
    if (!cheque) return;

    switch (payload.operation) {
      case 'create_cheque':
        await activateFunded(pool, cheque, 'chain:create_cheque');
        break;

      case 'lock': {
        // Redeem only after the lock is on-chain; high-value cheques also wait out the delay.
        const stroops = BigInt(cheque.usdcAmountStroops ?? 0);
        const delay = stroops >= DELAY_THRESHOLD_STROOPS ? DELAY_SECS + 5 : 0;
        await enqueue(pool, chequeId, { operation: 'redeem' }, delay);
        break;
      }

      case 'redeem':
        await moveIfStill(pool, chequeId, 'AUTHORIZED', 'SETTLING', {
          ledgerTx: createSettlementPendingTransaction({
            chequeId,
            amountMinor: cheque.faceAmountMinor,
            currency: cheque.currency,
          }),
        });
        await moveIfStill(pool, chequeId, 'SETTLING', 'SETTLED', {
          ledgerTx: createSettlementConfirmedTransaction({
            chequeId,
            amountMinor: cheque.faceAmountMinor,
            currency: cheque.currency,
          }),
        });
        await pool.query(
          `UPDATE payouts SET status = 'CONFIRMED', updated_at = NOW()
            WHERE cheque_id = $1 AND status IN ('PENDING','SENT')`,
          [chequeId]
        );
        break;

      case 'refund':
        await moveIfStill(pool, chequeId, 'REFUNDING', 'REFUNDED', {
          ledgerTx: createRefundConfirmedTransaction({
            chequeId,
            amountMinor: cheque.faceAmountMinor,
            currency: cheque.currency,
          }),
        });
        await pool.query(
          `UPDATE refunds SET status = 'CONFIRMED', updated_at = NOW()
            WHERE cheque_id = $1 AND status = 'PENDING'`,
          [chequeId]
        );
        break;

      default:
        break; // unlock / cancel: state already moved when the request was accepted
    }
  };
}

/** Periodic housekeeping: expire unclaimed cheques. */
export function startSweeper(pool: Pool, intervalMs = 30_000): () => void {
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      const due = await pool.query(
        `SELECT id, expires_at FROM cheques WHERE state = 'ACTIVE' AND expires_at <= NOW() LIMIT 50`
      );
      for (const r of due.rows) {
        try {
          const moved = await moveIfStill(pool, r.id, 'ACTIVE', 'EXPIRED', {
            context: { now: new Date(), expiresAt: new Date(r.expires_at) },
          });
          if (!moved) continue;
          const cheque = await loadById(pool, r.id);
          if (!cheque) continue;
          await withTransaction(async (client) => {
            await client.query(
              `INSERT INTO refunds (cheque_id, method, status, amount_minor, reason)
               VALUES ($1, 'USDC', 'PENDING', $2, 'cheque expired unclaimed')`,
              [r.id, cheque.faceAmountMinor]
            );
            await transition(
              {
                chequeId: r.id,
                fromState: 'EXPIRED',
                toState: 'REFUNDING',
                actor: 'SYSTEM',
                expectedVersion: cheque.version,
                ledgerTx: createRefundPendingTransaction({
                  chequeId: r.id,
                  amountMinor: cheque.faceAmountMinor,
                  currency: cheque.currency,
                }),
                outboxItems: [
                  {
                    topic: 'chain:contract:submit',
                    aggregateType: 'cheque',
                    payload: { operation: 'refund' },
                  },
                ],
              },
              client
            );
          });
        } catch (e) {
          logger.warn(`[sweeper] expire ${r.id}: ${(e as Error).message}`);
        }
      }
    } catch (e) {
      logger.warn(`[sweeper] tick failed: ${(e as Error).message}`);
    } finally {
      running = false;
    }
  };
  const timer = setInterval(tick, intervalMs);
  timer.unref?.();
  return () => clearInterval(timer);
}

async function hasUsdcTrustline(env: Env, address: string): Promise<boolean | 'unknown'> {
  try {
    const res = await fetch(`${env.STELLAR_HORIZON_URL}/accounts/${address}`);
    if (res.status === 404) return false;
    if (!res.ok) return 'unknown';
    const body = (await res.json()) as { balances: Array<{ asset_code?: string; asset_issuer?: string }> };
    return body.balances.some(
      (b) => b.asset_code === env.USDC_ASSET_CODE && b.asset_issuer === env.USDC_ISSUER_ADDRESS
    );
  } catch {
    return 'unknown';
  }
}

export function registerChequeRoutes(deps: ChequeServiceDeps): void {
  const { app, pool, env, authService } = deps;
  const enabledCorridors = parseEnabledCorridors(env.ENABLED_CORRIDORS);

  const requireSender = (request: FastifyRequest, reply: FastifyReply): string | null => {
    const header = request.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      reply.unauthorized('Missing bearer token');
      return null;
    }
    try {
      return authService.verifyAccessToken(header.slice(7)).sub;
    } catch (e) {
      reply.unauthorized((e as Error).message);
      return null;
    }
  };

  // ---- Sender -----------------------------------------------------------------------------

  app.get('/me', async (request, reply) => {
    const userId = requireSender(request, reply);
    if (!userId) return;
    const res = await pool.query(`SELECT id, phone_e164 AS phone, name FROM users WHERE id = $1`, [userId]);
    return res.rows[0] ?? reply.notFound('User not found');
  });

  app.get('/config', async () => ({
    network: env.STELLAR_NETWORK,
    chainEnabled: deps.chainEnabled,
    walletFunding: deps.chainEnabled && !!deps.chainClient,
    feeBps: env.FEE_BPS,
    usdc: { code: env.USDC_ASSET_CODE, issuer: env.USDC_ISSUER_ADDRESS },
    horizonUrl: env.STELLAR_HORIZON_URL,
    networkPassphrase: env.STELLAR_NETWORK_PASSPHRASE,
    corridors: enabledCorridors.map((code) => {
      const c = CORRIDORS[code];
      return {
        code: c.code,
        name: c.name,
        currency: c.currency,
        minAmount: c.minAmount,
        maxAmount: c.maxAmount,
        dialCode: c.dialCode,
        payoutMethods: c.payoutMethods,
        /** Units of this currency per 1 USDC, for the deposit converter. */
        perUsdc: fxPerUsd(env, c.currency),
        minAmountUsdc: minorToDecimalString(
          convertStroopsToFiatMinor(MIN_STROOPS, fxPerUsd(env, c.currency), 'ROUND_UP')
        ),
      };
    }),
    // Legacy Ghana-only fields, kept for existing clients.
    fxGhsPerUsdc: env.FX_GHS_PER_USDC,
    minAmountGhs: minorToDecimalString(
      convertStroopsToFiatMinor(MIN_STROOPS, env.FX_GHS_PER_USDC, 'ROUND_UP')
    ),
    maxAmountGhs: '2000.00',
    momoPayouts: false,
  }));

  app.post('/cheques', async (request, reply) => {
    const userId = requireSender(request, reply);
    if (!userId) return;
    if (!deps.chainEnabled || !deps.fundingPublicKey) {
      return reply.serviceUnavailable('Chain settlement is not configured; cheques cannot be issued yet.');
    }

    const parsed = CreateChequeSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.badRequest(parsed.error.issues.map((i) => i.message).join('; '));
    }
    const input = parsed.data;

    const corridor = getCorridor(input.corridor);
    if (!enabledCorridors.includes(corridor.code)) {
      return reply.badRequest(`Cheques to ${corridor.name} are not available yet.`);
    }
    const currency = corridor.currency;

    const amount = input.amount ?? input.amountGhs!;
    const amountError = validateFaceAmount(corridor, amount);
    if (amountError) return reply.badRequest(amountError);

    const face = decimalToMinor(amount);
    const fee = Math.floor((face * env.FEE_BPS) / 10_000);
    const rate = fxPerUsd(env, currency);
    const stroops = convertFiatMinorToStroops(face, rate);
    if (stroops < MIN_STROOPS) {
      const minFace = convertStroopsToFiatMinor(MIN_STROOPS, rate, 'ROUND_UP');
      return reply.badRequest(`Minimum ${currency} cheque amount is ${minorToDecimalString(minFace)}`);
    }

    const generated = generateClaimToken();
    const { rawToken, claimTokenHash } = generated;
    const publicCode = input.publicCode ?? generated.publicCode;
    const chequeId = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + input.expiryHours * 3600 * 1000);

    await withTransaction(async (client) => {
      await client.query(
        `INSERT INTO cheques (id, public_code, claim_token_hash, sender_id, payee_name, payee_contact_type, payee_contact, face_amount_minor, fee_minor, note, state, expires_at, usdc_amount_stroops, fx_rate,
            corridor, currency, signature, funder_address)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'PENDING_FUNDING',$11,$12,$13,$14,$15,$16,$17)`,
        [
          chequeId,
          publicCode,
          claimTokenHash,
          userId,
          input.payeeName,
          input.payeeEmail ? 'EMAIL' : null,
          input.payeeEmail ?? null,
          face,
          fee,
          input.note ?? null,
          expiresAt,
          stroops.toString(),
          rate,
          corridor.code,
          currency,
          input.signature ?? null,
          input.funderAddress ?? null,
        ]
      );
      await client.query(
        `INSERT INTO fundings (cheque_id, method, status, amount_minor, provider_ref)
         VALUES ($1, 'USDC', 'PENDING', $2, $3)`,
        [chequeId, face + fee, input.funderAddress ? 'wallet' : 'platform-escrow']
      );
      await client.query(
        `INSERT INTO events (cheque_id, event_type, to_state, actor, payload)
         VALUES ($1, 'CHEQUE_CREATED', 'PENDING_FUNDING', 'SENDER', $2::jsonb)`,
        [chequeId, JSON.stringify({ corridor: corridor.code, currency })]
      );
      if (input.funderAddress) return; // the sender's wallet deposits; see /cheques/:id/tx/*
      const payload: ChainOperationPayload = {
        operation: 'create_cheque',
        refundTo: deps.fundingPublicKey!,
        amountStroops: stroops.toString(),
        expiresAt: Math.floor(expiresAt.getTime() / 1000),
      };
      await client.query(
        `INSERT INTO outbox (id, topic, aggregate_type, aggregate_id, payload, status, next_run_at)
         VALUES ($1, 'chain:contract:submit', 'cheque', $2, $3, 'PENDING', NOW())`,
        [crypto.randomUUID(), chequeId, JSON.stringify(payload)]
      );
    });

    return reply.code(201).send({
      id: chequeId,
      publicCode,
      state: 'PENDING_FUNDING',
      fundingMode: input.funderAddress ? 'WALLET' : 'PLATFORM',
      usdcAmountStroops: stroops.toString(),
      corridor: corridor.code,
      ...amountView(face, currency),
      feeMinor: fee,
      totalMinor: face + fee,
      expiresAt,
      // Shown once: only the hash is stored.
      claimToken: rawToken,
      claimUrl: `${env.NEXT_PUBLIC_APP_URL}/c/${rawToken}`,
    });
  });

  app.get('/cheques', async (request, reply) => {
    const userId = requireSender(request, reply);
    if (!userId) return;
    const res = await pool.query(
      `SELECT ${CHEQUE_COLS} FROM cheques c WHERE c.sender_id = $1 ORDER BY c.created_at DESC LIMIT 100`,
      [userId]
    );
    return {
      cheques: res.rows.map((r) => {
        const c = mapChequeRow(r);
        return {
          id: c.id,
          publicCode: c.publicCode,
          state: c.state,
          corridor: c.corridor,
          payeeName: c.payeeName,
          ...amountView(c.faceAmountMinor, c.currency),
          feeMinor: c.feeMinor,
          note: c.note ?? null,
          signature: c.signature ?? null,
          funderAddress: c.funderAddress ?? null,
          expiresAt: c.expiresAt,
          createdAt: c.createdAt,
        };
      }),
    };
  });

  app.get<{ Params: { id: string } }>('/cheques/:id', async (request, reply) => {
    const userId = requireSender(request, reply);
    if (!userId) return;
    const c = await loadById(pool, request.params.id);
    if (!c || c.senderId !== userId) return reply.notFound('Cheque not found');
    const [events, txs] = await Promise.all([
      pool.query(
        `SELECT event_type AS "type", from_state AS "from", to_state AS "to", actor, created_at AS "at"
           FROM events WHERE cheque_id = $1 ORDER BY created_at ASC`,
        [c.id]
      ),
      pool.query(
        `SELECT operation, tx_hash AS "txHash", status, ledger FROM chain_txs WHERE cheque_id = $1 ORDER BY created_at ASC`,
        [c.id]
      ),
    ]);
    return {
      id: c.id,
      publicCode: c.publicCode,
      state: c.state,
      corridor: c.corridor,
      payeeName: c.payeeName,
      ...amountView(c.faceAmountMinor, c.currency),
      feeMinor: c.feeMinor,
      usdcAmountStroops: c.usdcAmountStroops ?? null,
      funderAddress: c.funderAddress ?? null,
      note: c.note ?? null,
      signature: c.signature ?? null,
      expiresAt: c.expiresAt,
      createdAt: c.createdAt,
      events: events.rows,
      chain: txs.rows,
    };
  });

  app.post<{ Params: { id: string } }>('/cheques/:id/cancel', async (request, reply) => {
    const userId = requireSender(request, reply);
    if (!userId) return;
    const c = await loadById(pool, request.params.id);
    if (!c || c.senderId !== userId) return reply.notFound('Cheque not found');
    if (c.state !== 'ACTIVE') {
      return reply.conflict(`Only an active cheque can be cancelled (currently ${c.state}).`);
    }
    if (c.funderAddress) {
      return reply.conflict('This cheque was funded from your wallet; cancel it by signing with that wallet.');
    }
    try {
      await transition({
        chequeId: c.id,
        fromState: 'ACTIVE',
        toState: 'CANCELLED',
        actor: 'SENDER',
        expectedVersion: c.version,
        outboxItems: [
          { topic: 'chain:contract:submit', aggregateType: 'cheque', payload: { operation: 'cancel' } },
        ],
      });
    } catch (e) {
      return reply.conflict((e as Error).message);
    }
    return { id: c.id, state: 'CANCELLED' };
  });

  // ---- Wallet-signed deposits and cancels --------------------------------------------------

  const walletTxOp = { create: 'create_cheque', cancel: 'cancel' } as const;

  app.post<{ Params: { id: string }; Body: { op?: string } }>('/cheques/:id/tx/prepare', async (request, reply) => {
    const userId = requireSender(request, reply);
    if (!userId) return;
    if (!deps.chainClient) return reply.serviceUnavailable('Chain settlement is not configured.');
    const op = request.body?.op as keyof typeof walletTxOp;
    if (!(op in walletTxOp)) return reply.badRequest('op must be "create" or "cancel".');
    const c = await loadById(pool, request.params.id);
    if (!c || c.senderId !== userId) return reply.notFound('Cheque not found');
    if (!c.funderAddress) return reply.conflict('This cheque is not funded from a wallet.');
    const need: ChequeState = op === 'create' ? 'PENDING_FUNDING' : 'ACTIVE';
    if (c.state !== need) return reply.conflict(`Cheque is ${c.state}; expected ${need}.`);
    try {
      const idHex = deriveChequeIdHex(c.id);
      return op === 'create'
        ? await deps.chainClient.prepareCreateCheque({
            funderPublicKey: c.funderAddress,
            chequeIdHex: idHex,
            refundTo: c.funderAddress,
            amountStroops: BigInt(c.usdcAmountStroops ?? 0),
            expiresAt: Math.floor(c.expiresAt.getTime() / 1000),
          })
        : await deps.chainClient.prepareCancel(c.funderAddress, idHex);
    } catch (e) {
      return reply.badRequest((e as Error).message);
    }
  });

  app.post<{ Params: { id: string }; Body: { op?: string; signedXdr?: string } }>(
    '/cheques/:id/tx/submit',
    async (request, reply) => {
      const userId = requireSender(request, reply);
      if (!userId) return;
      if (!deps.chainClient) return reply.serviceUnavailable('Chain settlement is not configured.');
      const op = request.body?.op as keyof typeof walletTxOp;
      const signedXdr = request.body?.signedXdr;
      if (!(op in walletTxOp) || typeof signedXdr !== 'string') return reply.badRequest('op and signedXdr are required.');
      const c = await loadById(pool, request.params.id);
      if (!c || c.senderId !== userId) return reply.notFound('Cheque not found');
      if (!c.funderAddress) return reply.conflict('This cheque is not funded from a wallet.');
      const need: ChequeState = op === 'create' ? 'PENDING_FUNDING' : 'ACTIVE';
      if (c.state !== need) return reply.conflict(`Cheque is ${c.state}; expected ${need}.`);

      const idHex = deriveChequeIdHex(c.id);
      let txHash: string;
      let ledger: number;
      try {
        ({ txHash, ledger } = await deps.chainClient.submitSignedTransaction(signedXdr, {
          source: c.funderAddress,
          functionName: walletTxOp[op],
        }));
      } catch (e) {
        return reply.badGateway((e as Error).message);
      }
      await pool
        .query(
          `INSERT INTO chain_txs (cheque_id, operation, tx_hash, signed_xdr, status, ledger)
           VALUES ($1, $2, $3, $4, 'CONFIRMED', $5) ON CONFLICT DO NOTHING`,
          [c.id, op === 'create' ? 'create' : 'cancel', txHash, signedXdr, ledger]
        )
        .catch((e) => logger.warn(`[wallet] chain_txs insert: ${e.message}`));

      // Trust the chain, not the client: confirm the contract now holds what we expect.
      const onChain = await deps.chainClient.getCheque(idHex);
      if (op === 'create') {
        if (onChain.funder !== c.funderAddress || BigInt(onChain.amount) !== BigInt(c.usdcAmountStroops ?? 0)) {
          return reply.conflict('On-chain deposit does not match this cheque.');
        }
        await activateFunded(pool, c, 'wallet:create_cheque');
        return { state: 'ACTIVE', txHash };
      }
      await transition({
        chequeId: c.id,
        fromState: 'ACTIVE',
        toState: 'CANCELLED',
        actor: 'SENDER',
        expectedVersion: c.version,
        auditPayload: { source: 'wallet:cancel', txHash },
      });
      return { state: 'CANCELLED', txHash };
    }
  );

  // ---- Recipient (claim link; no account) ---------------------------------------------------

  app.get<{ Params: { token: string } }>('/claim/:token', async (request, reply) => {
    const found = await loadByToken(pool, request.params.token);
    if (!found) return reply.notFound('This cheque link is not valid.');
    return publicView(found.cheque, found.senderName);
  });

  // ---- Recipient email OTP (PRD v4) ---------------------------------------------------------
  app.post<{ Params: { token: string } }>('/claim/:token/otp/send', async (request, reply) => {
    if (!deps.emailOtpService || !deps.emailClient) {
      return reply.serviceUnavailable('Email verification is not configured.');
    }
    const found = await loadByToken(pool, request.params.token);
    if (!found) return reply.notFound('This cheque link is not valid.');
    const email = found.cheque.payeeContact;
    if (!email || found.cheque.payeeContactType !== 'EMAIL') {
      return reply.badRequest('This cheque has no recipient email to verify.');
    }
    try {
      const { otp } = await deps.emailOtpService.createOtpSession({ phoneInput: email });
      await deps.emailClient.sendEmail({
        to: email,
        subject: 'Your sencheq verification code',
        text: `Your verification code is ${otp}. It expires in 5 minutes. Do not share it.`,
      });
      return { success: true, message: 'Verification code sent.' };
    } catch (e) {
      const msg = (e as Error).message;
      if (msg.includes('Too many requests') || msg.includes('Please wait')) {
        return reply.tooManyRequests(msg);
      }
      return reply.badRequest(msg);
    }
  });

  app.post<{ Params: { token: string }; Body: { otp?: string } }>('/claim/:token/otp/verify', async (request, reply) => {
    if (!deps.emailOtpService) {
      return reply.serviceUnavailable('Email verification is not configured.');
    }
    const found = await loadByToken(pool, request.params.token);
    if (!found) return reply.notFound('This cheque link is not valid.');
    const email = found.cheque.payeeContact;
    if (!email || found.cheque.payeeContactType !== 'EMAIL') {
      return reply.badRequest('This cheque has no recipient email to verify.');
    }
    const otp = (request.body as { otp?: string } | undefined)?.otp;
    if (typeof otp !== 'string' || otp.trim() === '') {
      return reply.badRequest('otp is required');
    }
    try {
      const ok = await deps.emailOtpService.verifyOtp(email, otp.trim());
      if (!ok) return reply.unauthorized('Invalid verification code.');
    } catch (e) {
      return reply.unauthorized((e as Error).message);
    }
    const sessionToken = generateSessionToken();
    await pool.query(
      `INSERT INTO claim_sessions (cheque_id, otp_hash, attempts, max_attempts, verified_at, expires_at, session_token)
       VALUES ($1, $2, 0, 5, NOW(), NOW() + INTERVAL '30 minutes', $3)`,
      [found.cheque.id, 'verified', sessionToken]
    );
    return { sessionToken, expiresIn: 1800 };
  });

  app.post<{ Params: { token: string } }>(
    '/claim/:token/redeem',
    async (request, reply) => {
      const body = RedeemChequeSchema.safeParse(request.body);
      if (!body.success) {
        return reply.badRequest(body.error.issues.map((i) => i.message).join('; '));
      }
      const { destination, idempotencyKey, sessionToken } = body.data;

      const found = await loadByToken(pool, request.params.token);
      if (!found) return reply.notFound('This cheque link is not valid.');
      const { cheque } = found;

      // When email verification is enabled, a valid claim session is required.
      if (deps.emailOtpService) {
        if (!sessionToken) {
          return reply.unauthorized('Email verification required before redeeming.');
        }
        const session = await pool.query(
          `SELECT id FROM claim_sessions
            WHERE cheque_id = $1 AND session_token = $2
              AND verified_at IS NOT NULL AND expires_at > NOW()`,
          [cheque.id, sessionToken]
        );
        if (!session.rowCount) {
          return reply.unauthorized('Invalid or expired verification session.');
        }
      }

      const payoutError = validatePayoutDestination(getCorridor(cheque.corridor), destination);
      if (payoutError) return reply.badRequest(payoutError);

      if (destination.type === 'MOMO' || destination.type === 'BANK') {
        // Corridor rails are validated above; the anchor payout itself is not connected yet.
        return reply.code(501).send({
          statusCode: 501,
          error: 'Not Implemented',
          message: `${destination.type === 'MOMO' ? 'Mobile money' : 'Bank'} payouts for ${getCorridor(cheque.corridor).name} are not live yet. Choose a USDC wallet.`,
        });
      }

      // Idempotent replay: same key already created the payout.
      const existing = await pool.query(`SELECT status FROM payouts WHERE idempotency_key = $1`, [idempotencyKey]);
      if (existing.rowCount) return reply.send({ state: cheque.state, replay: true });

      if (cheque.state !== 'ACTIVE') return reply.conflict(`Cheque is ${cheque.state.toLowerCase().replace('_', ' ')}; it can't be redeemed now.`);
      if (cheque.expiresAt.getTime() <= Date.now()) return reply.conflict('This cheque has expired.');

      const trustline = await hasUsdcTrustline(env, destination.accountRef);
      if (trustline === false) {
        return reply.badRequest(
          "This wallet can't receive USDC yet (no USDC trustline). Add USDC to the wallet first, or use another address."
        );
      }

      try {
        await withTransaction(async (client) => {
          const dest = await client.query(
            `INSERT INTO destinations (cheque_id, type, account_ref, memo) VALUES ($1,'USDC',$2,$3) RETURNING id`,
            [cheque.id, destination.accountRef, destination.memo ?? null]
          );
          await client.query(
            `INSERT INTO payouts (cheque_id, destination_id, status, idempotency_key, amount_minor)
             VALUES ($1,$2,'PENDING',$3,$4)`,
            [cheque.id, dest.rows[0].id, idempotencyKey, cheque.faceAmountMinor]
          );
          await transition(
            {
              chequeId: cheque.id,
              fromState: 'ACTIVE',
              toState: 'AUTHORIZED',
              actor: 'RECIPIENT',
              expectedVersion: cheque.version,
              auditPayload: { destinationType: 'USDC' },
              outboxItems: [
                {
                  topic: 'chain:contract:submit',
                  aggregateType: 'cheque',
                  payload: { operation: 'lock', to: destination.accountRef, lockSecs: LOCK_SECS },
                },
              ],
            },
            client
          );
        });
      } catch (e) {
        return reply.conflict((e as Error).message);
      }
      return reply.code(202).send({ state: 'AUTHORIZED' });
    }
  );

  app.get<{ Params: { token: string } }>('/claim/:token/status', async (request, reply) => {
    const found = await loadByToken(pool, request.params.token);
    if (!found) return reply.notFound('This cheque link is not valid.');
    const { cheque } = found;
    const [dest, tx] = await Promise.all([
      pool.query(`SELECT account_ref FROM destinations WHERE cheque_id = $1 ORDER BY created_at DESC LIMIT 1`, [
        cheque.id,
      ]),
      pool.query(
        `SELECT tx_hash FROM chain_txs WHERE cheque_id = $1 AND operation = 'redeem' AND status = 'CONFIRMED' LIMIT 1`,
        [cheque.id]
      ),
    ]);
    const acct: string | undefined = dest.rows[0]?.account_ref;
    return {
      ...publicView(cheque, found.senderName),
      destination: acct ? `${acct.slice(0, 4)}…${acct.slice(-4)}` : null,
      txHash: tx.rows[0]?.tx_hash ?? null,
      network: env.STELLAR_NETWORK,
    };
  });
}
