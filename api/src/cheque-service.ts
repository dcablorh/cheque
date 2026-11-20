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
  type DestinationChain,
  quantizeStroopsToSixDecimals,
  stroopsToMicroUsdc,
  microUsdcToString,
  MIN_CCTP_NET_MICRO,
  explorerTxUrl,
  generateClaimToken,
  hashClaimToken,
  generateSessionToken,
  hashSessionToken,
  hashOtp,
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
import { deriveChequeIdHex, type ChequeContractClient, type CctpAdapter } from '@cheque/chain';
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
  /** Stellar account that receives escrow USDC on redeem before a CCTP burn (plan A). */
  settlementPublicKey?: string;
  /** Quotes and submits Stellar → Base/Solana CCTP transfers. */
  cctpAdapter?: CctpAdapter;
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

async function enqueueCctp(pool: Pool, chequeId: string, payload: Record<string, unknown>): Promise<void> {
  await pool.query(
    `INSERT INTO outbox (id, topic, aggregate_type, aggregate_id, payload, status, next_run_at, max_attempts, backoff_ms)
     VALUES ($1, 'chain:cctp', 'cheque', $2, $3, 'PENDING', NOW(), 20, 5000)`,
    [crypto.randomUUID(), chequeId, JSON.stringify(payload)]
  );
}

export async function quoteCrossChainPayout(
  adapter: CctpAdapter,
  chain: Exclude<DestinationChain, 'stellar'>,
  recipient: string,
  amountStroops: bigint,
) {
  let includeRecipientSetup = false;
  if (chain === 'solana') {
    try {
      const ata = adapter.deriveSolanaAta(recipient);
      includeRecipientSetup = !(await adapter.ataExists(ata));
    } catch {
      includeRecipientSetup = true;
    }
  }
  const quote = await adapter.quoteForwardFee(chain, { includeRecipientSetup, amountStroops });
  const amountMicro = stroopsToMicroUsdc(amountStroops);
  const netMicro = amountMicro - quote.forwardFeeMicro.med;
  return { quote, amountMicro, netMicro, includeRecipientSetup };
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
  // Release the alert queued at create time (payload already has the claim URL).
  if (cheque.payeeContact && cheque.payeeContactType === 'EMAIL') {
    await pool.query(
      `UPDATE outbox
          SET next_run_at = NOW(), updated_at = NOW()
        WHERE topic = 'email:cheque:alert'
          AND aggregate_id = $1
          AND status = 'PENDING'`,
      [cheque.id]
    );
  }
}

/** Reflects confirmed on-chain operations into the off-chain cheque state machine. */
export function createChainAppliedHook(pool: Pool, network: 'TESTNET' | 'PUBLIC' = 'TESTNET') {
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

      case 'redeem': {
        await moveIfStill(pool, chequeId, 'AUTHORIZED', 'SETTLING', {
          ledgerTx: createSettlementPendingTransaction({
            chequeId,
            amountMinor: cheque.faceAmountMinor,
            currency: cheque.currency,
          }),
        });
        const destRes = await pool.query(
          `SELECT chain FROM destinations WHERE cheque_id = $1 ORDER BY created_at DESC LIMIT 1`,
          [chequeId],
        );
        const chain = (destRes.rows[0]?.chain as DestinationChain | undefined) ?? 'stellar';
        await pool.query(
          `UPDATE payouts SET status = 'SENT', updated_at = NOW()
            WHERE cheque_id = $1 AND status = 'PENDING'`,
          [chequeId],
        );
        if (chain === 'stellar') {
          const txRes = await pool.query(
            `SELECT tx_hash FROM chain_txs WHERE cheque_id = $1 AND operation = 'redeem' AND status = 'CONFIRMED' ORDER BY created_at DESC LIMIT 1`,
            [chequeId],
          );
          const redeemTx = txRes.rows[0]?.tx_hash as string | undefined;
          await moveIfStill(pool, chequeId, 'SETTLING', 'SETTLED', {
            ledgerTx: createSettlementConfirmedTransaction({
              chequeId,
              amountMinor: cheque.faceAmountMinor,
              currency: cheque.currency,
            }),
            outboxItems: [
              {
                topic: 'email:cheque:status',
                aggregateType: 'cheque',
                payload: {
                  event: 'SETTLED',
                  chain: 'stellar',
                  explorerUrl: redeemTx ? explorerTxUrl('stellar', redeemTx, network) : null,
                },
              },
            ],
          });
          await pool.query(
            `UPDATE payouts SET status = 'CONFIRMED', updated_at = NOW()
              WHERE cheque_id = $1 AND status IN ('PENDING','SENT')`,
            [chequeId],
          );
        } else {
          // USDC has left Soroban escrow into the settlement account; the outbox burns via CCTP.
          await enqueueCctp(pool, chequeId, { operation: 'cctp_burn' });
        }
        break;
      }

      case 'refund':
        await moveIfStill(pool, chequeId, 'REFUNDING', 'REFUNDED', {
          ledgerTx: createRefundConfirmedTransaction({
            chequeId,
            amountMinor: cheque.faceAmountMinor,
            currency: cheque.currency,
          }),
          outboxItems: [
            {
              topic: 'email:cheque:status',
              aggregateType: 'cheque',
              payload: { event: 'REFUNDED' },
            },
          ],
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
/**
 * Expires every ACTIVE cheque past its expiry, queues the on-chain refund, and moves the
 * cheque to REFUNDING. Returns how many cheques were swept. Used by the interval sweeper
 * and by the cron-ticked /api/internal/tick endpoint on Vercel.
 */
export async function sweepExpiredCheques(pool: Pool): Promise<number> {
  const due = await pool.query(
    `SELECT id, expires_at FROM cheques WHERE state = 'ACTIVE' AND expires_at <= NOW() LIMIT 50`
  );
  let swept = 0;
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
      swept += 1;
    } catch (e) {
      logger.warn(`[sweeper] expire ${r.id}: ${(e as Error).message}`);
    }
  }
  return swept;
}

export function startSweeper(pool: Pool, intervalMs = 30_000): () => void {
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await sweepExpiredCheques(pool);
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
    const res = await pool.query(`SELECT id, email, name FROM users WHERE id = $1`, [userId]);
    return res.rows[0] ?? reply.notFound('User not found');
  });

  app.get('/config', async () => ({
    network: env.STELLAR_NETWORK,
    chainEnabled: deps.chainEnabled,
    walletFunding: deps.chainEnabled && !!deps.chainClient,
    cctpEnabled: !!deps.cctpAdapter && !!deps.settlementPublicKey,
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
    const stroops = quantizeStroopsToSixDecimals(convertFiatMinorToStroops(face, rate));
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
      if (input.payeeEmail) {
        const claimUrl = `${env.NEXT_PUBLIC_APP_URL}/c/${rawToken}`;
        await client.query(
          `INSERT INTO outbox (id, topic, aggregate_type, aggregate_id, payload, status, next_run_at)
           VALUES ($1, 'email:cheque:alert', 'cheque', $2, $3, 'PENDING', $4)`,
          [
            crypto.randomUUID(),
            chequeId,
            JSON.stringify({ chequeId, to: input.payeeEmail, claimUrl }),
            expiresAt, // held until activateFunded sets next_run_at = NOW(); skipped if never funded
          ]
        );
      }
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
          payeeEmail: c.payeeContactType === 'EMAIL' ? (c.payeeContact ?? null) : null,
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
    const [events, txs, payoutRes] = await Promise.all([
      pool.query(
        `SELECT event_type AS "type", from_state AS "from", to_state AS "to", actor, created_at AS "at"
           FROM events WHERE cheque_id = $1 ORDER BY created_at ASC`,
        [c.id]
      ),
      pool.query(
        `SELECT operation, tx_hash AS "txHash", status, ledger FROM chain_txs WHERE cheque_id = $1 ORDER BY created_at ASC`,
        [c.id]
      ),
      pool.query(
        `SELECT p.dest_chain AS "destChain", p.status, p.fee_quote_minor AS "feeQuoteMinor",
                p.net_amount_minor AS "netAmountMinor", p.cctp_burn_tx AS "burnTxHash",
                p.cctp_forward_tx AS "forwardTxHash", p.last_error AS "lastError"
           FROM payouts p WHERE p.cheque_id = $1 ORDER BY p.created_at DESC LIMIT 1`,
        [c.id]
      ),
    ]);
    const po = payoutRes.rows[0] as
      | {
          destChain?: DestinationChain | null;
          status?: string;
          feeQuoteMinor?: string | null;
          netAmountMinor?: string | null;
          burnTxHash?: string | null;
          forwardTxHash?: string | null;
          lastError?: string | null;
        }
      | undefined;
    const redeemTx = txs.rows.find((t: { operation: string; status: string }) => t.operation === 'redeem' && t.status === 'CONFIRMED')?.txHash as string | undefined;
    const destChain: DestinationChain = po?.destChain ?? 'stellar';
    const destTx = po?.forwardTxHash ?? (destChain === 'stellar' ? redeemTx : undefined);
    return {
      id: c.id,
      publicCode: c.publicCode,
      state: c.state,
      corridor: c.corridor,
      payeeName: c.payeeName,
      payeeEmail: c.payeeContactType === 'EMAIL' ? (c.payeeContact ?? null) : null,
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
      payout: po
        ? {
            destChain,
            status: po.status ?? null,
            feeUsdc: po.feeQuoteMinor != null ? microUsdcToString(BigInt(po.feeQuoteMinor)) : null,
            netUsdc: po.netAmountMinor != null ? microUsdcToString(BigInt(po.netAmountMinor)) : null,
            burnTxHash: po.burnTxHash ?? null,
            forwardTxHash: po.forwardTxHash ?? null,
            explorerUrl: destTx ? explorerTxUrl(destChain, destTx, env.STELLAR_NETWORK) : null,
            lastError: po.status === 'FAILED' ? po.lastError ?? null : null,
          }
        : null,
    };
  });

  app.post<{ Params: { id: string } }>('/cheques/:id/cancel', async (request, reply) => {
    const userId = requireSender(request, reply);
    if (!userId) return;
    const c = await loadById(pool, request.params.id);
    if (!c || c.senderId !== userId) return reply.notFound('Cheque not found');
    // Unfunded wallet cheques can be discarded without an on-chain transaction.
    if (c.state === 'PENDING_FUNDING' && c.funderAddress) {
      try {
        await transition({
          chequeId: c.id,
          fromState: 'PENDING_FUNDING',
          toState: 'CANCELLED',
          actor: 'SENDER',
          expectedVersion: c.version,
          auditPayload: { source: 'wallet:unfunded_cancel' },
        });
      } catch (e) {
        return reply.conflict((e as Error).message);
      }
      return { id: c.id, state: 'CANCELLED' };
    }
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
      // Cheques issued without a recipient email stay claimable without OTP.
      return { success: true, skipped: true };
    }
    try {
      const { otp } = await deps.emailOtpService.createOtpSession({ contact: email });
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
      [found.cheque.id, hashOtp(otp.trim(), env.OTP_SALT), hashSessionToken(sessionToken)]
    );
    return { sessionToken, expiresIn: 1800 };
  });


  app.get<{ Params: { token: string }; Querystring: { chain?: string } }>(
    '/claim/:token/payout-quote',
    async (request, reply) => {
      const found = await loadByToken(pool, request.params.token);
      if (!found) return reply.notFound('This cheque link is not valid.');
      const rawChain = String(request.query.chain ?? 'stellar').toLowerCase();
      if (rawChain !== 'stellar' && rawChain !== 'base' && rawChain !== 'solana') {
        return reply.badRequest('chain must be stellar, base, or solana');
      }
      const chain: DestinationChain = rawChain;
      const amountStroops = quantizeStroopsToSixDecimals(BigInt(found.cheque.usdcAmountStroops ?? 0));
      const amountMicro = stroopsToMicroUsdc(amountStroops);
      if (chain === 'stellar') {
        return {
          chain,
          amountUsdc: microUsdcToString(amountMicro),
          feeUsdc: '0.000000',
          netUsdc: microUsdcToString(amountMicro),
          includeRecipientSetup: false,
          minNetUsdc: microUsdcToString(MIN_CCTP_NET_MICRO),
        };
      }
      if (!deps.cctpAdapter) {
        return reply.serviceUnavailable('Cross-chain quotes are not configured yet.');
      }
      const recipient = typeof (request.query as { address?: string }).address === 'string'
        ? (request.query as { address?: string }).address!.trim()
        : '';
      const quoted = await quoteCrossChainPayout(
        deps.cctpAdapter,
        chain,
        recipient || (chain === 'solana' ? '11111111111111111111111111111111' : '0x0000000000000000000000000000000000000001'),
        amountStroops,
      );
      // If no address was provided, do not use a dummy Solana ATA-setup quote as authoritative —
      // still return the fee (setup-inclusive is the conservative default).
      return {
        chain,
        amountUsdc: microUsdcToString(quoted.amountMicro),
        feeUsdc: microUsdcToString(quoted.quote.forwardFeeMicro.med),
        netUsdc: microUsdcToString(quoted.netMicro < 0n ? 0n : quoted.netMicro),
        includeRecipientSetup: quoted.includeRecipientSetup,
        minNetUsdc: microUsdcToString(MIN_CCTP_NET_MICRO),
        sufficient: quoted.netMicro >= MIN_CCTP_NET_MICRO,
      };
    }
  );

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

      // When this cheque was addressed to an email, a verified claim session is required.
      const emailVerificationRequired =
        !!deps.emailOtpService &&
        cheque.payeeContactType === 'EMAIL' &&
        !!cheque.payeeContact;
      if (emailVerificationRequired) {
        if (!sessionToken) {
          return reply.unauthorized('Email verification required before redeeming.');
        }
        const session = await pool.query(
          `SELECT id FROM claim_sessions
            WHERE cheque_id = $1 AND session_token = $2
              AND verified_at IS NOT NULL AND expires_at > NOW()`,
          [cheque.id, hashSessionToken(sessionToken)]
        );
        if (!session.rowCount) {
          return reply.unauthorized('Invalid or expired verification session.');
        }
      }

      const chain: DestinationChain = destination.chain ?? 'stellar';
      const payoutError = validatePayoutDestination(getCorridor(cheque.corridor), {
        ...destination,
        chain,
      });
      if (payoutError) return reply.badRequest(payoutError);

      if (destination.type === 'MOMO' || destination.type === 'BANK') {
        // Corridor rails are validated above; the anchor payout itself is not connected yet.
        return reply.code(501).send({
          statusCode: 501,
          error: 'Not Implemented',
          message: `${destination.type === 'MOMO' ? 'Mobile money' : 'Bank'} payouts for ${getCorridor(cheque.corridor).name} are not live yet. Choose a USDC wallet on Stellar, Base, or Solana.`,
        });
      }

      // Idempotent replay: same key already created the payout.
      const existing = await pool.query(`SELECT status FROM payouts WHERE idempotency_key = $1`, [idempotencyKey]);
      if (existing.rowCount) return reply.send({ state: cheque.state, replay: true });

      if (cheque.state !== 'ACTIVE') return reply.conflict(`Cheque is ${cheque.state.toLowerCase().replace('_', ' ')}; it can't be redeemed now.`);
      if (cheque.expiresAt.getTime() <= Date.now()) return reply.conflict('This cheque has expired.');

      const amountStroops = quantizeStroopsToSixDecimals(BigInt(cheque.usdcAmountStroops ?? 0));
      let feeQuoteMinor: bigint | null = null;
      let netAmountMinor: bigint | null = null;

      if (chain === 'stellar') {
        const trustline = await hasUsdcTrustline(env, destination.accountRef);
        if (trustline === false) {
          return reply.badRequest(
            "This wallet can't receive USDC yet (no USDC trustline). Add USDC to the wallet first, or use another address."
          );
        }
      } else {
        if (!deps.settlementPublicKey || !deps.cctpAdapter) {
          return reply.serviceUnavailable(
            'Cross-chain USDC claims are not configured yet. You can still claim to a Stellar USDC address.',
          );
        }
        const quoted = await quoteCrossChainPayout(deps.cctpAdapter, chain, destination.accountRef, amountStroops);
        if (quoted.netMicro < MIN_CCTP_NET_MICRO) {
          return reply.badRequest(
            `After the cross-chain forwarding fee (${microUsdcToString(quoted.quote.forwardFeeMicro.med)} USDC) ` +
              `this cheque would deliver less than ${microUsdcToString(MIN_CCTP_NET_MICRO)} USDC. Claim to Stellar USDC instead, or contact the sender.`,
          );
        }
        feeQuoteMinor = quoted.quote.forwardFeeMicro.med;
        netAmountMinor = quoted.netMicro;
      }

      const lockTo = chain === 'stellar' ? destination.accountRef : deps.settlementPublicKey!;

      try {
        await withTransaction(async (client) => {
          const dest = await client.query(
            `INSERT INTO destinations (cheque_id, type, account_ref, memo, chain) VALUES ($1,'USDC',$2,$3,$4) RETURNING id`,
            [cheque.id, destination.accountRef, destination.memo ?? null, chain]
          );
          await client.query(
            `INSERT INTO payouts (cheque_id, destination_id, status, idempotency_key, amount_minor, dest_chain, fee_quote_minor, net_amount_minor)
             VALUES ($1,$2,'PENDING',$3,$4,$5,$6,$7)`,
            [cheque.id, dest.rows[0].id, idempotencyKey, cheque.faceAmountMinor, chain, feeQuoteMinor?.toString() ?? null, netAmountMinor?.toString() ?? null]
          );
          await transition(
            {
              chequeId: cheque.id,
              fromState: 'ACTIVE',
              toState: 'AUTHORIZED',
              actor: 'RECIPIENT',
              expectedVersion: cheque.version,
              auditPayload: { destinationType: 'USDC', chain },
              outboxItems: [
                {
                  topic: 'chain:contract:submit',
                  aggregateType: 'cheque',
                  payload: { operation: 'lock', to: lockTo, lockSecs: LOCK_SECS },
                },
              ],
            },
            client
          );
        });
      } catch (e) {
        return reply.conflict((e as Error).message);
      }
      return reply.code(202).send({
        state: 'AUTHORIZED',
        chain,
        feeUsdc: feeQuoteMinor != null ? microUsdcToString(feeQuoteMinor) : null,
        netUsdc: netAmountMinor != null ? microUsdcToString(netAmountMinor) : null,
      });
    }
  );

  app.get<{ Params: { token: string } }>('/claim/:token/status', async (request, reply) => {
    const found = await loadByToken(pool, request.params.token);
    if (!found) return reply.notFound('This cheque link is not valid.');
    const { cheque } = found;
    const [dest, tx, payout] = await Promise.all([
      pool.query(
        `SELECT account_ref, chain FROM destinations WHERE cheque_id = $1 ORDER BY created_at DESC LIMIT 1`,
        [cheque.id],
      ),
      pool.query(
        `SELECT tx_hash FROM chain_txs WHERE cheque_id = $1 AND operation = 'redeem' AND status = 'CONFIRMED' LIMIT 1`,
        [cheque.id]
      ),
      pool.query(
        `SELECT dest_chain, fee_quote_minor, net_amount_minor, cctp_burn_tx, cctp_forward_tx, status, last_error
           FROM payouts WHERE cheque_id = $1 ORDER BY created_at DESC LIMIT 1`,
        [cheque.id],
      ),
    ]);
    const acct: string | undefined = dest.rows[0]?.account_ref;
    const chain: DestinationChain = (dest.rows[0]?.chain as DestinationChain | undefined) ?? 'stellar';
    const po = payout.rows[0] as
      | {
          dest_chain?: string;
          fee_quote_minor?: string | null;
          net_amount_minor?: string | null;
          cctp_burn_tx?: string | null;
          cctp_forward_tx?: string | null;
          status?: string;
          last_error?: string | null;
        }
      | undefined;
    const destTx = po?.cctp_forward_tx ?? (chain === 'stellar' ? (tx.rows[0]?.tx_hash as string | undefined) : undefined);
    const feeMinor = po?.fee_quote_minor != null ? BigInt(po.fee_quote_minor) : null;
    const netMinor = po?.net_amount_minor != null ? BigInt(po.net_amount_minor) : null;
    return {
      ...publicView(cheque, found.senderName),
      destination: acct ? `${acct.slice(0, 4)}…${acct.slice(-4)}` : null,
      destinationChain: chain,
      txHash: destTx ?? tx.rows[0]?.tx_hash ?? null,
      burnTxHash: po?.cctp_burn_tx ?? null,
      forwardTxHash: po?.cctp_forward_tx ?? null,
      explorerUrl: destTx ? explorerTxUrl(chain, destTx, env.STELLAR_NETWORK) : null,
      stellarRedeemTx: tx.rows[0]?.tx_hash ?? null,
      feeUsdc: feeMinor != null ? microUsdcToString(feeMinor) : null,
      netUsdc: netMinor != null ? microUsdcToString(netMinor) : null,
      payoutStatus: po?.status ?? null,
      payoutError: po?.status === 'FAILED' ? po.last_error ?? 'Payout failed; funds are in the settlement account for manual recovery.' : null,
      cctpEnabled: !!deps.cctpAdapter && !!deps.settlementPublicKey,
      requiresEmailOtp: !!deps.emailOtpService && cheque.payeeContactType === 'EMAIL' && !!cheque.payeeContact,
      network: env.STELLAR_NETWORK,
    };
  });
}
