import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import crypto from 'node:crypto';
import Fastify, { type FastifyInstance } from 'fastify';
import sensible from '@fastify/sensible';
import { generateClaimToken, getPool, runMigrations, type OutboxItem } from '@cheque/core';
import type { CctpAdapter, CctpFeeQuote } from '@cheque/chain';
import type { Env } from '@cheque/shared';
import { loadEnv } from '@cheque/shared';
import { createChainAppliedHook, registerChequeRoutes } from '../src/cheque-service.js';
import { createCctpOperationHandler } from '../src/cctp-handler.js';

const SETTLEMENT = 'GC7NESFNIKPLWIYW2APKFSEXX54GXTFBNALMJ73LPJZGYKMIIIB3WYST';
const BASE_ADDR = '0xfc4Ad12BC5Dd48f78fcAD24d476bDDF22A92390A';
const SOL_OWNER = '2tsqy83JyTQMCVQysqWEFe76zEKqoBvb4JeLtWzKpYEx';
const SOL_ATA = '8iwQRhpeDNALXjXcutPP15BLND3QKnEB7ffmWkZ5DyLZ';
const STELLAR_ADDR = 'G' + 'A'.repeat(55);

const TWO_USDC_STROOPS = 20_000_000n;

function feeQuote(overrides: Partial<CctpFeeQuote> = {}): CctpFeeQuote {
  return {
    finalityThreshold: 2000,
    minimumFeeBps: 0,
    forwardFeeMicro: { low: 50_000n, med: 52_969n, high: 60_000n },
    maxFeeStroops: 529_690n,
    includeRecipientSetup: false,
    raw: { finalityThreshold: 2000, minimumFee: 0, forwardFee: { low: 50000, med: 52969, high: 60000 } } as CctpFeeQuote['raw'],
    ...overrides,
  };
}

describe('CCTP redeem API and outbox', () => {
  const pool = getPool();
  let app: FastifyInstance;
  let env: Env;
  const quoteForwardFee = vi.fn();
  const burnToDestination = vi.fn();
  const waitForForward = vi.fn();
  const ataExists = vi.fn();
  const deriveSolanaAta = vi.fn((owner: string) => (owner === SOL_OWNER ? SOL_ATA : '11111111111111111111111111111111111111111111'));

  const adapter = {
    quoteForwardFee,
    burnToDestination,
    waitForForward,
    ataExists,
    deriveSolanaAta,
  } as unknown as CctpAdapter;

  beforeAll(async () => {
    env = loadEnv();
    await runMigrations(pool);
    app = Fastify({ logger: false });
    await app.register(sensible);
    registerChequeRoutes({
      app,
      pool,
      env,
      authService: { verifyAccessToken: () => ({ sub: 'x', contact: 'x', role: 'sender' }) } as never,
      chainEnabled: false,
      settlementPublicKey: SETTLEMENT,
      cctpAdapter: adapter,
    });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    quoteForwardFee.mockReset().mockResolvedValue(feeQuote());
    burnToDestination.mockReset();
    waitForForward.mockReset();
    ataExists.mockReset().mockResolvedValue(false);
    deriveSolanaAta.mockClear();
  });

  async function insertActiveCheque(opts: { stroops?: bigint; faceMinor?: number; currency?: string; corridor?: string } = {}) {
    const userId = crypto.randomUUID();
    const chequeId = crypto.randomUUID();
    const { rawToken, claimTokenHash, publicCode } = generateClaimToken();
    const email = `sender-${crypto.randomUUID()}@example.com`;
    await pool.query(`INSERT INTO users (id, email, name) VALUES ($1, $2, $3)`, [userId, email, 'Test Sender']);
    await pool.query(
      `INSERT INTO cheques (
          id, public_code, claim_token_hash, sender_id, payee_name,
          payee_contact_type, payee_contact, face_amount_minor, fee_minor,
          state, expires_at, corridor, currency, usdc_amount_stroops, version
       ) VALUES ($1,$2,$3,$4,$5,NULL,NULL,$6,50,'ACTIVE',$7,$8,$9,$10,1)`,
      [
        chequeId,
        publicCode,
        claimTokenHash,
        userId,
        'Kojo Mensah',
        opts.faceMinor ?? 200,
        new Date(Date.now() + 48 * 3600 * 1000),
        opts.corridor ?? 'US',
        opts.currency ?? 'USD',
        (opts.stroops ?? TWO_USDC_STROOPS).toString(),
      ],
    );
    return { userId, chequeId, rawToken, publicCode };
  }

  async function insertSettlingPayout(opts: {
    chain: 'base' | 'solana';
    accountRef: string;
    burnTx?: string | null;
    forwardTx?: string | null;
    stroops?: bigint;
  }) {
    const { chequeId } = await insertActiveCheque({ stroops: opts.stroops });
    await pool.query(`UPDATE cheques SET state = 'SETTLING', version = 2 WHERE id = $1`, [chequeId]);
    const dest = await pool.query(
      `INSERT INTO destinations (cheque_id, type, account_ref, chain) VALUES ($1,'USDC',$2,$3) RETURNING id`,
      [chequeId, opts.accountRef, opts.chain],
    );
    const payout = await pool.query(
      `INSERT INTO payouts (cheque_id, destination_id, status, idempotency_key, amount_minor, dest_chain, cctp_burn_tx, cctp_forward_tx)
       VALUES ($1,$2,'SENT',$3,200,$4,$5,$6) RETURNING id`,
      [chequeId, dest.rows[0].id, crypto.randomUUID(), opts.chain, opts.burnTx ?? null, opts.forwardTx ?? null],
    );
    return { chequeId, payoutId: payout.rows[0].id as string };
  }

  function outboxItem(chequeId: string, payload: Record<string, unknown>, attempts = 0, maxAttempts = 20): OutboxItem {
    return {
      id: crypto.randomUUID(),
      topic: 'chain:cctp',
      aggregateType: 'cheque',
      aggregateId: chequeId,
      payload,
      status: 'PROCESSING',
      attempts,
      maxAttempts,
      backoffMs: 5000,
      nextRunAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }

  it('quotes a Base forwarding fee from Stellar and reports net USDC', async () => {
    quoteForwardFee.mockResolvedValue(feeQuote());
    const { rawToken } = await insertActiveCheque();
    const res = await app.inject({ method: 'GET', url: `/claim/${rawToken}/payout-quote?chain=base&address=${BASE_ADDR}` });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.chain).toBe('base');
    expect(body.amountUsdc).toBe('2.000000');
    expect(body.feeUsdc).toBe('0.052969');
    expect(body.netUsdc).toBe('1.947031');
    expect(body.sufficient).toBe(true);
  });

  it('rejects a Solana token-account (ATA) address on redeem', async () => {
    const { rawToken } = await insertActiveCheque();
    const res = await app.inject({
      method: 'POST',
      url: `/claim/${rawToken}/redeem`,
      payload: {
        destination: { type: 'USDC', chain: 'solana', accountRef: SOL_ATA },
        idempotencyKey: crypto.randomBytes(8).toString('hex'),
      },
    });
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).message).toMatch(/token account|owner wallet|off-curve|Solana/i);
  });

  it('rejects a quote that would leave less than the minimum net USDC', async () => {
    quoteForwardFee.mockResolvedValue(
      feeQuote({
        forwardFeeMicro: { low: 1_600_000n, med: 1_600_000n, high: 1_600_000n },
        maxFeeStroops: 16_000_000n,
      }),
    );
    const { rawToken } = await insertActiveCheque();
    const res = await app.inject({
      method: 'POST',
      url: `/claim/${rawToken}/redeem`,
      payload: {
        destination: { type: 'USDC', chain: 'base', accountRef: BASE_ADDR },
        idempotencyKey: crypto.randomBytes(8).toString('hex'),
      },
    });
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).message).toMatch(/less than 0\.500000 USDC|Claim to Stellar/i);
  });

  it('locks a Base redeem to the Stellar settlement account and records the fee', async () => {
    quoteForwardFee.mockResolvedValue(feeQuote());
    const { rawToken, chequeId } = await insertActiveCheque();
    const res = await app.inject({
      method: 'POST',
      url: `/claim/${rawToken}/redeem`,
      payload: {
        destination: { type: 'USDC', chain: 'base', accountRef: BASE_ADDR },
        idempotencyKey: crypto.randomBytes(8).toString('hex'),
      },
    });
    expect(res.statusCode).toBe(202);
    const body = JSON.parse(res.body);
    expect(body.state).toBe('AUTHORIZED');
    expect(body.chain).toBe('base');
    expect(body.feeUsdc).toBe('0.052969');
    expect(body.netUsdc).toBe('1.947031');

    const dest = await pool.query(`SELECT account_ref, chain FROM destinations WHERE cheque_id = $1`, [chequeId]);
    expect(dest.rows[0].chain).toBe('base');
    expect(dest.rows[0].account_ref).toBe(BASE_ADDR);

    const payout = await pool.query(`SELECT dest_chain, fee_quote_minor, net_amount_minor, status FROM payouts WHERE cheque_id = $1`, [chequeId]);
    expect(payout.rows[0].dest_chain).toBe('base');
    expect(Number(payout.rows[0].fee_quote_minor)).toBe(52969);
    expect(Number(payout.rows[0].net_amount_minor)).toBe(1_947_031);
    expect(payout.rows[0].status).toBe('PENDING');

    const outbox = await pool.query(
      `SELECT payload FROM outbox WHERE aggregate_id = $1 AND topic = 'chain:contract:submit' ORDER BY created_at DESC LIMIT 1`,
      [chequeId],
    );
    expect(outbox.rows[0].payload.to).toBe(SETTLEMENT);
    expect(outbox.rows[0].payload.operation).toBe('lock');
  });

  it('after on-chain redeem, keeps a Base cheque SETTLING and enqueues a CCTP burn', async () => {
    const { chequeId } = await insertActiveCheque();
    await pool.query(`UPDATE cheques SET state = 'AUTHORIZED', version = 2 WHERE id = $1`, [chequeId]);
    await pool.query(`INSERT INTO destinations (cheque_id, type, account_ref, chain) VALUES ($1,'USDC',$2,'base')`, [
      chequeId,
      BASE_ADDR,
    ]);
    await pool.query(
      `INSERT INTO payouts (cheque_id, destination_id, status, idempotency_key, amount_minor, dest_chain)
       SELECT $1, id, 'PENDING', $2, 200, 'base' FROM destinations WHERE cheque_id = $1`,
      [chequeId, crypto.randomUUID()],
    );

    const hook = createChainAppliedHook(pool);
    await hook(outboxItem(chequeId, { operation: 'redeem' }), { operation: 'redeem' });

    const cheque = await pool.query(`SELECT state FROM cheques WHERE id = $1`, [chequeId]);
    expect(cheque.rows[0].state).toBe('SETTLING');
    const payout = await pool.query(`SELECT status FROM payouts WHERE cheque_id = $1`, [chequeId]);
    expect(payout.rows[0].status).toBe('SENT');
    const outbox = await pool.query(
      `SELECT payload, topic, max_attempts, backoff_ms FROM outbox WHERE aggregate_id = $1 AND topic = 'chain:cctp'`,
      [chequeId],
    );
    expect(outbox.rowCount).toBe(1);
    expect(outbox.rows[0].payload.operation).toBe('cctp_burn');
    expect(Number(outbox.rows[0].max_attempts)).toBe(20);
    expect(Number(outbox.rows[0].backoff_ms)).toBe(5000);
  });

  it('after on-chain redeem, still settles a Stellar payout immediately', async () => {
    const { chequeId } = await insertActiveCheque();
    await pool.query(`UPDATE cheques SET state = 'AUTHORIZED', version = 2 WHERE id = $1`, [chequeId]);
    await pool.query(`INSERT INTO destinations (cheque_id, type, account_ref, chain) VALUES ($1,'USDC',$2,'stellar')`, [
      chequeId,
      STELLAR_ADDR,
    ]);
    await pool.query(
      `INSERT INTO payouts (cheque_id, destination_id, status, idempotency_key, amount_minor, dest_chain)
       SELECT $1, id, 'PENDING', $2, 200, 'stellar' FROM destinations WHERE cheque_id = $1`,
      [chequeId, crypto.randomUUID()],
    );

    const hook = createChainAppliedHook(pool);
    await hook(outboxItem(chequeId, { operation: 'redeem' }), { operation: 'redeem' });

    const cheque = await pool.query(`SELECT state FROM cheques WHERE id = $1`, [chequeId]);
    expect(cheque.rows[0].state).toBe('SETTLED');
    const payout = await pool.query(`SELECT status FROM payouts WHERE cheque_id = $1`, [chequeId]);
    expect(payout.rows[0].status).toBe('CONFIRMED');
    const cctp = await pool.query(`SELECT 1 FROM outbox WHERE aggregate_id = $1 AND topic = 'chain:cctp'`, [chequeId]);
    expect(cctp.rowCount).toBe(0);
  });

  it('burns once, skips a second burn, then settles when Iris reports a forward tx', async () => {
    const quote = feeQuote();
    burnToDestination.mockResolvedValue({
      burnTx: 'stellar-burn-hash-1',
      quote,
      mintRecipient: 'aa',
      hookKind: 'basic',
    });
    waitForForward.mockResolvedValue({
      forwardTxHash: '0xforwarded',
      message: { status: 'complete', forwardTxHash: '0xforwarded' },
    });

    const { chequeId, payoutId } = await insertSettlingPayout({ chain: 'base', accountRef: BASE_ADDR });
    const handler = createCctpOperationHandler({ pool, adapter });

    await handler(outboxItem(chequeId, { operation: 'cctp_burn' }));
    const afterBurn = await pool.query(`SELECT cctp_burn_tx, status FROM payouts WHERE id = $1`, [payoutId]);
    expect(afterBurn.rows[0].cctp_burn_tx).toBe('stellar-burn-hash-1');
    expect(afterBurn.rows[0].status).toBe('SENT');
    expect(burnToDestination).toHaveBeenCalledTimes(1);

    await handler(outboxItem(chequeId, { operation: 'cctp_burn' }));
    expect(burnToDestination).toHaveBeenCalledTimes(1);

    const waits = await pool.query(
      `SELECT payload FROM outbox WHERE aggregate_id = $1 AND topic = 'chain:cctp' AND payload->>'operation' = 'cctp_wait_forward'`,
      [chequeId],
    );
    expect(waits.rowCount).toBeGreaterThanOrEqual(2);

    await handler(outboxItem(chequeId, { operation: 'cctp_wait_forward', burnTx: 'stellar-burn-hash-1' }));
    const done = await pool.query(`SELECT cctp_forward_tx, status FROM payouts WHERE id = $1`, [payoutId]);
    expect(done.rows[0].cctp_forward_tx).toBe('0xforwarded');
    expect(done.rows[0].status).toBe('CONFIRMED');
    const cheque = await pool.query(`SELECT state FROM cheques WHERE id = $1`, [chequeId]);
    expect(cheque.rows[0].state).toBe('SETTLED');

  });

  it('marks a terminal burn failure as FAILED and leaves the cheque SETTLING (no auto-refund)', async () => {
    burnToDestination.mockRejectedValue(new Error('Invalid destination address'));
    const { chequeId, payoutId } = await insertSettlingPayout({ chain: 'solana', accountRef: SOL_OWNER });
    const handler = createCctpOperationHandler({ pool, adapter });

    await expect(handler(outboxItem(chequeId, { operation: 'cctp_burn' }))).resolves.toBeUndefined();
    const payout = await pool.query(`SELECT status, last_error, cctp_burn_tx FROM payouts WHERE id = $1`, [payoutId]);
    expect(payout.rows[0].status).toBe('FAILED');
    expect(payout.rows[0].cctp_burn_tx).toBeNull();
    expect(payout.rows[0].last_error).toMatch(/Invalid/);
    const cheque = await pool.query(`SELECT state FROM cheques WHERE id = $1`, [chequeId]);
    expect(cheque.rows[0].state).toBe('SETTLING');
  });

  it('retries a wait timeout until the last attempt, then fails without refunding', async () => {
    waitForForward.mockRejectedValue(new Error('Timed out waiting for CCTP forwardTxHash'));
    const { chequeId, payoutId } = await insertSettlingPayout({
      chain: 'base',
      accountRef: BASE_ADDR,
      burnTx: 'already-burned',
    });
    const handler = createCctpOperationHandler({ pool, adapter });

    await expect(
      handler(outboxItem(chequeId, { operation: 'cctp_wait_forward', burnTx: 'already-burned' }, 0, 20)),
    ).rejects.toThrow(/Timed out/);
    expect((await pool.query(`SELECT status FROM payouts WHERE id = $1`, [payoutId])).rows[0].status).toBe('SENT');

    await expect(
      handler(outboxItem(chequeId, { operation: 'cctp_wait_forward', burnTx: 'already-burned' }, 19, 20)),
    ).resolves.toBeUndefined();
    const payout = await pool.query(`SELECT status FROM payouts WHERE id = $1`, [payoutId]);
    expect(payout.rows[0].status).toBe('FAILED');
    const cheque = await pool.query(`SELECT state FROM cheques WHERE id = $1`, [chequeId]);
    expect(cheque.rows[0].state).toBe('SETTLING');
  });

  it('exposes burn/forward hashes and a destination explorer URL on status', async () => {
    quoteForwardFee.mockResolvedValue(feeQuote());
    const { rawToken, chequeId } = await insertActiveCheque();
    await app.inject({
      method: 'POST',
      url: `/claim/${rawToken}/redeem`,
      payload: {
        destination: { type: 'USDC', chain: 'base', accountRef: BASE_ADDR },
        idempotencyKey: crypto.randomBytes(8).toString('hex'),
      },
    });
    await pool.query(
      `UPDATE payouts SET cctp_burn_tx = 'stellar-burn', cctp_forward_tx = '0xminted', status = 'CONFIRMED' WHERE cheque_id = $1`,
      [chequeId],
    );
    const res = await app.inject({ method: 'GET', url: `/claim/${rawToken}/status` });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.destinationChain).toBe('base');
    expect(body.burnTxHash).toBe('stellar-burn');
    expect(body.forwardTxHash).toBe('0xminted');
    expect(body.explorerUrl).toBe('https://sepolia.basescan.org/tx/0xminted');
    expect(body.txHash).toBe('0xminted');
  });
});
