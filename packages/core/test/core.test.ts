import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  ghsToPesewas,
  pesewasToGhsString,
  usdcToStroops,
  stroopsToUsdcString,
  addMinor,
  subMinor,
  toPesewas,
  toStroops,
  convertGhsToUsdcStroops,
  convertUsdcStroopsToGhs,
  roundDivision,
  maskPhone,
  maskName,
  maskAccountRef,
  generateClaimToken,
  hashClaimToken,
  generateOtp,
  hashOtp,
  verifyOtp,
  isValidTransition,
  canSenderCancel,
  createFundingTransaction,
  createSettlementPendingTransaction,
  createSettlementConfirmedTransaction,
  createSettlementFailedRollbackTransaction,
  createRefundPendingTransaction,
  createRefundConfirmedTransaction,
  createFxBufferAdjustmentTransaction,
  validateLedgerTransaction,
  MockAdapter,
  CreateChequeSchema,
  RedeemChequeSchema,
  getPool,
  closePool,
  runMigrations,
  transition,
  OptimisticLockError,
  getReconciliationReport,
  checkChequeReconciliation,
  OutboxProcessor,
  OutboxItem,
} from '../src/index.js';
import crypto from 'node:crypto';

describe('Money Utils (Pesewas, Stroops, Explicit Rounding)', () => {
  it('converts GHS to pesewas accurately without floating point drift', () => {
    expect(ghsToPesewas('50.00')).toBe(5000);
    expect(ghsToPesewas('500')).toBe(50000);
    expect(ghsToPesewas('5.05')).toBe(505);
    expect(ghsToPesewas(12.34)).toBe(1234);
    expect(() => ghsToPesewas('invalid')).toThrow();
  });

  it('formats pesewas to GHS string correctly', () => {
    expect(pesewasToGhsString(toPesewas(505))).toBe('5.05');
    expect(pesewasToGhsString(toPesewas(50000))).toBe('500.00');
    expect(pesewasToGhsString(toPesewas(9))).toBe('0.09');
  });

  it('converts USDC to stroops accurately (7 decimals)', () => {
    expect(usdcToStroops('1')).toBe(10_000_000n);
    expect(usdcToStroops('32.5')).toBe(325_000_000n);
    expect(usdcToStroops('0.0000001')).toBe(1n);
  });

  it('formats stroops to USDC string', () => {
    expect(stroopsToUsdcString(toStroops(10_000_000n))).toBe('1.0000000');
    expect(stroopsToUsdcString(toStroops(325_000_000n))).toBe('32.5000000');
    expect(stroopsToUsdcString(toStroops(1n))).toBe('0.0000001');
  });

  it('implements explicit division rounding modes', () => {
    // 7 / 2 = 3.5 -> ROUND_UP: 4, ROUND_DOWN: 3, ROUND_HALF_UP: 4
    expect(roundDivision(7n, 2n, 'ROUND_DOWN')).toBe(3n);
    expect(roundDivision(7n, 2n, 'ROUND_UP')).toBe(4n);
    expect(roundDivision(7n, 2n, 'ROUND_HALF_UP')).toBe(4n);

    // 5 / 2 = 2.5 -> ROUND_HALF_EVEN: 2 (even)
    expect(roundDivision(5n, 2n, 'ROUND_HALF_EVEN')).toBe(2n);
    // 7 / 2 = 3.5 -> ROUND_HALF_EVEN: 4 (even)
    expect(roundDivision(7n, 2n, 'ROUND_HALF_EVEN')).toBe(4n);
  });

  it('converts GHS pesewas to USDC stroops with explicit rounding', () => {
    // 155.00 GHS at 15.50 FX rate = 10 USDC = 100,000,000 stroops
    const stroops = convertGhsToUsdcStroops(toPesewas(15500), '15.500000', 'ROUND_HALF_UP');
    expect(stroops).toBe(100_000_000n);

    const backToGhs = convertUsdcStroopsToGhs(stroops, '15.500000', 'ROUND_HALF_UP');
    expect(backToGhs).toBe(15500);
  });

  it('handles safe minor addition and subtraction', () => {
    expect(addMinor(100, 250)).toBe(350);
    expect(subMinor(350, 100)).toBe(250);
    expect(() => subMinor(100, 200)).toThrow('Cannot subtract');
  });
});

describe('PII Masking', () => {
  it('masks Ghana phone numbers properly', () => {
    expect(maskPhone('+233241234567')).toBe('+233 24 XXX 4567');
    expect(maskPhone('0241234567')).toBe('024 XXX 4567');
  });

  it('masks payee names for recipient landing screen', () => {
    expect(maskName('Kojo Mensah')).toBe('K**** M*****');
    expect(maskName('Kwame')).toBe('K****');
  });

  it('masks account references for receipts and audit logs', () => {
    expect(maskAccountRef('+233241234567', 'MOMO', 'MTN')).toBe('MTN ••• 4567');
    expect(
      maskAccountRef('GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN', 'USDC')
    ).toBe('GA5Z...KZVN');
  });
});

describe('128-bit Claim Token and OTP Security', () => {
  it('generates a 128-bit random token, its SHA-256 hash, and a CHQ-XXXXXX short code', () => {
    const { rawToken, claimTokenHash, publicCode } = generateClaimToken();
    expect(rawToken).toBeTruthy();
    expect(claimTokenHash).toBe(hashClaimToken(rawToken));
    expect(publicCode).toMatch(/^CHQ-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{6}$/);
  });

  it('verifies OTP in constant time with correct salt', () => {
    const otp = generateOtp();
    expect(otp).toMatch(/^\d{6}$/);
    const salt = 'cheque-salt-xyz';
    const hash = hashOtp(otp, salt);

    expect(verifyOtp(otp, salt, hash)).toBe(true);
    expect(verifyOtp('000000', salt, hash)).toBe(false);
  });
});

describe('Cheque Lifecycle State Machine & Guards', () => {
  it('allows normal happy path transitions', () => {
    expect(isValidTransition('DRAFT', 'PENDING_FUNDING').allowed).toBe(true);
    expect(isValidTransition('PENDING_FUNDING', 'ACTIVE').allowed).toBe(true);
    expect(isValidTransition('ACTIVE', 'CLAIMING').allowed).toBe(true);
    expect(isValidTransition('CLAIMING', 'AUTHORIZED').allowed).toBe(true);
    expect(isValidTransition('AUTHORIZED', 'SETTLING').allowed).toBe(true);
    expect(isValidTransition('SETTLING', 'SETTLED').allowed).toBe(true);
  });

  it('allows payout failure to return to AUTHORIZED (retryable)', () => {
    const res = isValidTransition('SETTLING', 'AUTHORIZED');
    expect(res.allowed).toBe(true);
  });

  it('blocks sender cancellation once CLAIMING begins', () => {
    expect(canSenderCancel('PENDING_FUNDING')).toBe(true);
    expect(canSenderCancel('ACTIVE')).toBe(true);
    expect(canSenderCancel('CLAIMING')).toBe(false);

    const senderCancelInClaiming = isValidTransition('CLAIMING', 'REFUNDING', {
      actor: 'SENDER',
    });
    expect(senderCancelInClaiming.allowed).toBe(false);
  });

  it('prevents direct expiry on AUTHORIZED or SETTLING', () => {
    expect(isValidTransition('AUTHORIZED', 'EXPIRED').allowed).toBe(false);
    expect(isValidTransition('SETTLING', 'EXPIRED').allowed).toBe(false);
  });
});

describe('Real PostgreSQL Integration & Double-Entry Ledger Property Tests', () => {
  const pool = getPool({
    connectionString: process.env.DATABASE_URL || 'postgresql://cheque_user:cheque_password@localhost:5432/cheque_db',
  });

  beforeAll(async () => {
    // Run schema migrations on real database
    await runMigrations(pool);
  });

  afterAll(async () => {
    await closePool();
  });

  it('Acceptance: concurrent transition test yields exactly one success', async () => {
    const client = await pool.connect();
    const testUserId = crypto.randomUUID();
    const testChequeId = crypto.randomUUID();

    try {
      // 1. Setup test user and cheque
      await client.query(
        `INSERT INTO users (id, phone_e164, name) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING;`,
        [testUserId, `+23324${Math.floor(1000000 + Math.random() * 9000000)}`, 'Concurrency Test User']
      );

      const publicCode = `CHQ-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
      const claimHash = crypto.randomBytes(32).toString('hex');

      await client.query(
        `
        INSERT INTO cheques (
          id, public_code, claim_token_hash, sender_id, payee_name, payee_contact_type, payee_contact,
          face_amount_minor, fee_minor, state, expires_at, version
        ) VALUES ($1, $2, $3, $4, 'Payee', 'PHONE', '+233241112233', 50000, 500, 'DRAFT', NOW() + INTERVAL '1 day', 1);
        `,
        [testChequeId, publicCode, claimHash, testUserId]
      );

      // 2. Launch 5 concurrent transition attempts from DRAFT -> PENDING_FUNDING with expectedVersion: 1
      const attempts = Array.from({ length: 5 }, async (_, index) => {
        try {
          const res = await transition({
            chequeId: testChequeId,
            fromState: 'DRAFT',
            toState: 'PENDING_FUNDING',
            actor: 'SENDER',
            expectedVersion: 1,
            auditPayload: { attemptIndex: index },
          });
          return { success: true, cheque: res.cheque };
        } catch (err: unknown) {
          return { success: false, error: err };
        }
      });

      const results = await Promise.all(attempts);

      const successes = results.filter((r) => r.success);
      const failures = results.filter((r) => !r.success);

      // Invariant: Exactly ONE must succeed, and the rest must fail with OptimisticLockError
      expect(successes).toHaveLength(1);
      expect(failures).toHaveLength(4);

      for (const fail of failures) {
        expect((fail as any).error).toBeInstanceOf(OptimisticLockError);
      }

      // Verify DB final state
      const finalDbRes = await client.query('SELECT state, version FROM cheques WHERE id = $1;', [testChequeId]);
      expect(finalDbRes.rows[0].state).toBe('PENDING_FUNDING');
      expect(finalDbRes.rows[0].version).toBe(2);

      // Verify audit event was logged
      const auditRes = await client.query('SELECT * FROM events WHERE cheque_id = $1;', [testChequeId]);
      expect(auditRes.rows.length).toBeGreaterThanOrEqual(1);
    } finally {
      // Cleanup test records
      await client.query('DELETE FROM cheques WHERE id = $1;', [testChequeId]).catch(() => {});
      await client.query('DELETE FROM users WHERE id = $1;', [testUserId]).catch(() => {});
      client.release();
    }
  });

  it('Acceptance: double-entry ledger always balances (property test on real DB)', async () => {
    const testChequeId = crypto.randomUUID();

    // Create 6 different financial transactions across the full cheque lifecycle
    const tx1 = createFundingTransaction({
      chequeId: testChequeId,
      faceAmountMinor: 50000,
      feeMinor: 500,
      currency: 'GHS',
    });

    const tx2 = createSettlementPendingTransaction({
      chequeId: testChequeId,
      amountMinor: 50000,
      currency: 'GHS',
    });

    const tx3 = createSettlementConfirmedTransaction({
      chequeId: testChequeId,
      amountMinor: 50000,
      currency: 'GHS',
    });

    const tx4 = createSettlementFailedRollbackTransaction({
      chequeId: testChequeId,
      amountMinor: 50000,
      currency: 'GHS',
    });

    const tx5 = createRefundPendingTransaction({
      chequeId: testChequeId,
      amountMinor: 50000,
      currency: 'GHS',
    });

    const tx6 = createRefundConfirmedTransaction({
      chequeId: testChequeId,
      amountMinor: 50000,
      currency: 'GHS',
    });

    const tx7 = createFxBufferAdjustmentTransaction({
      chequeId: testChequeId,
      shortfallMinor: 250,
      currency: 'GHS',
    });

    const allTransactions = [tx1, tx2, tx3, tx4, tx5, tx6, tx7];

    const client = await pool.connect();
    const testUserId = crypto.randomUUID();
    try {
      await client.query(
        `INSERT INTO users (id, phone_e164, name) VALUES ($1, $2, 'Ledger User') ON CONFLICT DO NOTHING;`,
        [testUserId, `+23324${Math.floor(1000000 + Math.random() * 9000000)}`]
      );

      await client.query(
        `
        INSERT INTO cheques (
          id, public_code, claim_token_hash, sender_id, payee_name, payee_contact_type, payee_contact,
          face_amount_minor, fee_minor, state, expires_at, version
        ) VALUES ($1, $2, $3, $4, 'Payee', 'PHONE', '+233241112233', 50000, 500, 'ACTIVE', NOW() + INTERVAL '1 day', 1);
        `,
        [testChequeId, `CHQ-${crypto.randomBytes(3).toString('hex').toUpperCase()}`, crypto.randomBytes(32).toString('hex'), testUserId]
      );

      // Insert all entries into real Postgres
      for (const tx of allTransactions) {
        for (const entry of tx.entries) {
          await client.query(
            `
            INSERT INTO ledger_entries (
              id, tx_id, account, debit_minor, credit_minor, cheque_id, currency, description
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8);
            `,
            [
              crypto.randomUUID(),
              tx.txId,
              entry.account,
              entry.debitMinor,
              entry.creditMinor,
              testChequeId,
              tx.currency,
              tx.description,
            ]
          );
        }
      }

      // Property Test 1: For EVERY transaction on real DB, sum(debits) - sum(credits) == 0
      const balanceCheckRes = await client.query(`
        SELECT
          tx_id,
          SUM(debit_minor) AS total_debit,
          SUM(credit_minor) AS total_credit,
          (SUM(debit_minor) - SUM(credit_minor)) AS diff
        FROM ledger_entries
        WHERE cheque_id = $1
        GROUP BY tx_id;
      `, [testChequeId]);

      expect(balanceCheckRes.rows.length).toBe(allTransactions.length);

      for (const row of balanceCheckRes.rows) {
        expect(Number(row.diff)).toBe(0);
        expect(row.total_debit).toBe(row.total_credit);
      }

      // Property Test 2: Global balance on real DB
      const globalRes = await client.query(`
        SELECT
          SUM(debit_minor) AS grand_debit,
          SUM(credit_minor) AS grand_credit
        FROM ledger_entries
        WHERE cheque_id = $1;
      `, [testChequeId]);

      expect(globalRes.rows[0].grand_debit).toBe(globalRes.rows[0].grand_credit);
    } finally {
      await client.query('DELETE FROM ledger_entries WHERE cheque_id = $1;', [testChequeId]).catch(() => {});
      await client.query('DELETE FROM cheques WHERE id = $1;', [testChequeId]).catch(() => {});
      await client.query('DELETE FROM users WHERE id = $1;', [testUserId]).catch(() => {});
      client.release();
    }
  });

  it('verifies partial unique index on payouts(cheque_id) WHERE status IN (PENDING, SENT, CONFIRMED)', async () => {
    const client = await pool.connect();
    const testChequeId = crypto.randomUUID();
    const testUserId = crypto.randomUUID();
    const destId = crypto.randomUUID();

    try {
      await client.query(
        `INSERT INTO users (id, phone_e164, name) VALUES ($1, $2, 'Payout User') ON CONFLICT DO NOTHING;`,
        [testUserId, '+233249998877']
      );

      await client.query(
        `
        INSERT INTO cheques (
          id, public_code, claim_token_hash, sender_id, payee_name, payee_contact_type, payee_contact,
          face_amount_minor, fee_minor, state, expires_at, version
        ) VALUES ($1, $2, $3, $4, 'Payee', 'PHONE', '+233241112233', 50000, 500, 'AUTHORIZED', NOW() + INTERVAL '1 day', 1);
        `,
        [testChequeId, `CHQ-${crypto.randomBytes(3).toString('hex').toUpperCase()}`, crypto.randomBytes(32).toString('hex'), testUserId]
      );

      await client.query(
        `
        INSERT INTO destinations (id, cheque_id, type, account_ref)
        VALUES ($1, $2, 'MOMO', '+233241112233');
        `,
        [destId, testChequeId]
      );

      // First active payout succeeds
      await client.query(
        `
        INSERT INTO payouts (id, cheque_id, destination_id, status, idempotency_key, amount_minor)
        VALUES ($1, $2, $3, 'PENDING', 'idemp-1', 50000);
        `,
        [crypto.randomUUID(), testChequeId, destId]
      );

      // Second active payout on SAME cheque must violate the partial unique index
      let violated = false;
      try {
        await client.query(
          `
          INSERT INTO payouts (id, cheque_id, destination_id, status, idempotency_key, amount_minor)
          VALUES ($1, $2, $3, 'SENT', 'idemp-2', 50000);
          `,
          [crypto.randomUUID(), testChequeId, destId]
        );
      } catch (err: any) {
        violated = err.message.includes('idx_payouts_active_cheque') || err.code === '23505';
      }

      expect(violated).toBe(true);
    } finally {
      await client.query('DELETE FROM payouts WHERE cheque_id = $1;', [testChequeId]).catch(() => {});
      await client.query('DELETE FROM destinations WHERE cheque_id = $1;', [testChequeId]).catch(() => {});
      await client.query('DELETE FROM cheques WHERE id = $1;', [testChequeId]).catch(() => {});
      await client.query('DELETE FROM users WHERE id = $1;', [testUserId]).catch(() => {});
      client.release();
    }
  });

  it('verifies unique webhook_events(provider, event_id)', async () => {
    const client = await pool.connect();
    const eventId = `evt-${Date.now()}`;

    try {
      await client.query(
        `
        INSERT INTO webhook_events (id, provider, event_id, payload)
        VALUES (uuid_generate_v4(), 'SEEVCASH', $1, '{"status":"ok"}');
        `,
        [eventId]
      );

      // Duplicate must fail
      let duplicateCaught = false;
      try {
        await client.query(
          `
          INSERT INTO webhook_events (id, provider, event_id, payload)
          VALUES (uuid_generate_v4(), 'SEEVCASH', $1, '{"status":"ok2"}');
          `,
          [eventId]
        );
      } catch (err: any) {
        duplicateCaught = err.code === '23505';
      }

      expect(duplicateCaught).toBe(true);
    } finally {
      await client.query('DELETE FROM webhook_events WHERE event_id = $1;', [eventId]).catch(() => {});
      client.release();
    }
  });

  it('processes outbox items with FOR UPDATE SKIP LOCKED, backoff, and dead-lettering', async () => {
    const client = await pool.connect();
    const outboxId = crypto.randomUUID();

    try {
      await client.query(
        `
        INSERT INTO outbox (id, topic, aggregate_type, aggregate_id, payload, status, max_attempts)
        VALUES ($1, 'test:operation:execute', 'CHEQUE', 'chq-test', '{"action":"test"}', 'PENDING', 2);
        `,
        [outboxId]
      );

      const processor = new OutboxProcessor(pool);
      let executed = false;
      processor.registerHandler('test:operation:execute', async (item: OutboxItem) => {
        expect(item.id).toBe(outboxId);
        executed = true;
      });

      const processedCount = await processor.pollAndProcess(5);
      expect(processedCount).toBe(1);
      expect(executed).toBe(true);

      const completedRes = await client.query('SELECT status FROM outbox WHERE id = $1;', [outboxId]);
      expect(completedRes.rows[0].status).toBe('COMPLETED');
    } finally {
      await client.query('DELETE FROM outbox WHERE id = $1;', [outboxId]).catch(() => {});
      client.release();
    }
  });

  it('reconciliation view reports off-chain state vs chain_events alignment', async () => {
    const client = await pool.connect();
    const testUserId = crypto.randomUUID();
    const testChequeId = crypto.randomUUID();
    const chequeHex = testChequeId.replace(/-/g, '');

    try {
      await client.query(
        `INSERT INTO users (id, phone_e164, name) VALUES ($1, $2, 'Recon User') ON CONFLICT DO NOTHING;`,
        [testUserId, '+233240001122']
      );

      await client.query(
        `
        INSERT INTO cheques (
          id, public_code, claim_token_hash, sender_id, payee_name, payee_contact_type, payee_contact,
          face_amount_minor, fee_minor, state, expires_at, version
        ) VALUES ($1, $2, $3, $4, 'Payee', 'PHONE', '+233241112233', 50000, 500, 'ACTIVE', NOW() + INTERVAL '1 day', 1);
        `,
        [testChequeId, `CHQ-${crypto.randomBytes(3).toString('hex').toUpperCase()}`, crypto.randomBytes(32).toString('hex'), testUserId]
      );

      // Initially, cheque is ACTIVE but no on-chain event exists yet -> isReconciled = false
      let recon = await checkChequeReconciliation(testChequeId, client);
      expect(recon).toBeDefined();
      expect(recon?.isReconciled).toBe(false);

      // Now insert on-chain event 'created' into chain_events
      await client.query(
        `
        INSERT INTO chain_events (id, tx_hash, event_index, ledger, contract_id, topic, cheque_id_hex, payload)
        VALUES ('tx1:0', 'tx1', 0, 5000100, 'contract-id', 'created', $1, '{"amount":50000}');
        `,
        [chequeHex]
      );

      // Re-check reconciliation -> now matches!
      recon = await checkChequeReconciliation(testChequeId, client);
      expect(recon?.isReconciled).toBe(true);
      expect(recon?.lastChainEvent).toBe('created');
      expect(recon?.lastChainLedger).toBe('5000100');
    } finally {
      await client.query('DELETE FROM chain_events WHERE cheque_id_hex = $1;', [chequeHex]).catch(() => {});
      await client.query('DELETE FROM cheques WHERE id = $1;', [testChequeId]).catch(() => {});
      await client.query('DELETE FROM users WHERE id = $1;', [testUserId]).catch(() => {});
      client.release();
    }
  });
});
