import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import crypto from 'node:crypto';
import pg from 'pg';
import { runMigrations } from '../src/index.js';

const SOURCE_URL =
  process.env.DATABASE_URL || 'postgresql://cheque_user:cheque_password@127.0.0.1:5432/cheque_db';

function withDatabase(url: string, database: string): string {
  const replaced = url.replace(/\/[^/?]+(?=\?|$)/, `/${database}`);
  if (replaced === url) {
    throw new Error(`Could not swap database name in DATABASE_URL: ${url}`);
  }
  return replaced;
}

describe('users migration to email-only accounts on an existing database', () => {
  const dbName = `cheque_mig_${crypto.randomBytes(4).toString('hex')}`;
  let admin: pg.Pool;
  let pool: pg.Pool;

  beforeAll(async () => {
    admin = new pg.Pool({ connectionString: withDatabase(SOURCE_URL, 'postgres') });
    await admin.query(`CREATE DATABASE ${dbName} OWNER cheque_user`);
    pool = new pg.Pool({ connectionString: withDatabase(SOURCE_URL, dbName) });

    // Recreate the users table as it existed before email login: phone-based with a
    // contact check that required a phone.
    await pool.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');
    await pool.query('CREATE EXTENSION IF NOT EXISTS "pgcrypto"');
    await pool.query(`
      CREATE TABLE users (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        phone_e164 VARCHAR(20) NOT NULL UNIQUE,
        name VARCHAR(255),
        pin_hash TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT users_contact_check CHECK (phone_e164 IS NOT NULL)
      )
    `);
    await pool.query(
      `INSERT INTO users (id, phone_e164, name) VALUES ($1, $2, $3)`,
      ['11111111-1111-1111-1111-111111111111', '+233241111111', 'Existing Sender']
    );
  });

  afterAll(async () => {
    if (pool) await pool.end();
    if (admin) {
      await admin.query(`DROP DATABASE IF EXISTS ${dbName}`);
      await admin.end();
    }
  });

  it('drops the legacy phone column and requires an email after upgrade', async () => {
    await runMigrations(pool);

    // The legacy phone column is gone; the migrated user keeps their row.
    const existing = await pool.query(
      `SELECT email, name FROM users WHERE id = $1`,
      ['11111111-1111-1111-1111-111111111111']
    );
    expect(existing.rows).toHaveLength(1);
    expect(existing.rows[0].email).toBeNull();
    expect(existing.rows[0].name).toBe('Existing Sender');

    const col = await pool.query(
      `SELECT column_name FROM information_schema.columns
        WHERE table_name = 'users' AND column_name = 'phone_e164'`
    );
    expect(col.rows).toHaveLength(0);

    // Email-only accounts work, and a user without any contact is rejected.
    const inserted = await pool.query(
      `INSERT INTO users (email, name) VALUES ($1, $2) RETURNING email`,
      ['new-user@example.com', 'Email Only']
    );
    expect(inserted.rows[0].email).toBe('new-user@example.com');

    await expect(
      pool.query(`INSERT INTO users (name) VALUES ($1)`, ['No Contact'])
    ).rejects.toThrow(/users_contact_check|violates check constraint/i);
  });
});
