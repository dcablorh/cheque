import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import crypto from 'node:crypto';
import pg from 'pg';
import { generateClaimToken, runMigrations } from '@cheque/core';
import { createChequeAlertHandler } from '../src/outbox-worker.js';
import type { OutboxItem } from '@cheque/core';

const DATABASE_URL =
  process.env.DATABASE_URL || 'postgresql://cheque_user:cheque_password@127.0.0.1:5432/cheque_db';

describe('Funded-cheque alert outbox handler', () => {
  const pool = new pg.Pool({ connectionString: DATABASE_URL });

  beforeAll(async () => {
    await runMigrations(pool);
  });

  afterAll(async () => {
    await pool.end();
  });

  async function insertCheque(state: string) {
    const userId = crypto.randomUUID();
    const chequeId = crypto.randomUUID();
    const { rawToken, claimTokenHash, publicCode } = generateClaimToken();
    const payee = `alert-${crypto.randomBytes(6).toString('hex')}@example.com`;
    const claimUrl = `http://localhost:3100/c/${rawToken}`;
    const email = `sender-${crypto.randomBytes(6).toString('hex')}@example.com`;

    await pool.query(`INSERT INTO users (id, email, name) VALUES ($1, $2, $3)`, [
      userId,
      email,
      'Alert Sender',
    ]);
    await pool.query(
      `INSERT INTO cheques (
          id, public_code, claim_token_hash, sender_id, payee_name,
          payee_contact_type, payee_contact, face_amount_minor, fee_minor,
          state, expires_at, corridor, currency
       ) VALUES ($1,$2,$3,$4,$5,'EMAIL',$6,5000,50,$7,$8,'GH','GHS')`,
      [
        chequeId,
        publicCode,
        claimTokenHash,
        userId,
        'Kojo Mensah',
        payee,
        state,
        new Date(Date.now() + 48 * 3600 * 1000),
      ]
    );
    return { chequeId, payee, claimUrl };
  }

  function item(chequeId: string, payload: Record<string, unknown>): OutboxItem {
    const now = new Date();
    return {
      id: crypto.randomUUID(),
      topic: 'email:cheque:alert',
      aggregateType: 'cheque',
      aggregateId: chequeId,
      payload,
      status: 'PENDING',
      attempts: 0,
      maxAttempts: 5,
      backoffMs: 1000,
      nextRunAt: now,
      createdAt: now,
      updatedAt: now,
    };
  }

  it('sends the real claim URL only when the cheque is ACTIVE', async () => {
    const { chequeId, payee, claimUrl } = await insertCheque('ACTIVE');
    const sent: { to: string; subject: string; text: string }[] = [];
    const handler = createChequeAlertHandler(
      { sendEmail: async (params) => { sent.push(params); return {}; } },
      pool
    );

    await handler(item(chequeId, { to: payee, claimUrl }));

    expect(sent).toHaveLength(1);
    expect(sent[0].to).toBe(payee);
    expect(sent[0].text).toContain(claimUrl);
    expect(sent[0].text).not.toContain('/c/<token>');
  });

  it('skips sending when the cheque is not ACTIVE', async () => {
    const { chequeId, payee, claimUrl } = await insertCheque('PENDING_FUNDING');
    const sent: { to: string; subject: string; text: string }[] = [];
    const handler = createChequeAlertHandler(
      { sendEmail: async (params) => { sent.push(params); return {}; } },
      pool
    );

    await handler(item(chequeId, { to: payee, claimUrl }));
    expect(sent).toHaveLength(0);
  });

  it('skips sending when the cheque has been cancelled', async () => {
    const { chequeId, payee, claimUrl } = await insertCheque('CANCELLED');
    const sent: { to: string; subject: string; text: string }[] = [];
    const handler = createChequeAlertHandler(
      { sendEmail: async (params) => { sent.push(params); return {}; } },
      pool
    );

    await handler(item(chequeId, { to: payee, claimUrl }));
    expect(sent).toHaveLength(0);
  });

  it('rejects a placeholder claim URL', async () => {
    const { chequeId, payee } = await insertCheque('ACTIVE');
    const handler = createChequeAlertHandler(
      { sendEmail: async () => ({}) },
      pool
    );

    await expect(
      handler(item(chequeId, { to: payee, claimUrl: 'http://localhost:3100/c/<token>' }))
    ).rejects.toThrow(/Missing claim URL/);
  });
});
