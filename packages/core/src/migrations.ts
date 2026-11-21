import pg from 'pg';

export const SCHEMA_SQL = `
-- Enable UUID and pgcrypto extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. Users
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email VARCHAR(255) UNIQUE,
  name VARCHAR(255),
  pin_hash TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT users_contact_check CHECK (email IS NOT NULL)
);

-- 2. Cheques
CREATE TABLE IF NOT EXISTS cheques (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  public_code VARCHAR(20) NOT NULL UNIQUE,
  claim_token_hash VARCHAR(64) NOT NULL UNIQUE,
  sender_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  payee_name VARCHAR(255) NOT NULL,
  payee_contact_type VARCHAR(10) CHECK (payee_contact_type IN ('PHONE', 'EMAIL')),
  payee_contact VARCHAR(255), -- E.164 phone or lowercase email
  face_amount_minor BIGINT NOT NULL CHECK (face_amount_minor > 0),
  fee_minor BIGINT NOT NULL DEFAULT 0 CHECK (fee_minor >= 0),
  note VARCHAR(80),
  state VARCHAR(32) NOT NULL CHECK (
    state IN (
      'DRAFT', 'PENDING_FUNDING', 'ACTIVE', 'CLAIMING', 'AUTHORIZED',
      'SETTLING', 'SETTLED', 'CANCELLED', 'EXPIRED', 'REFUNDING',
      'REFUNDED', 'REFUND_REVIEW'
    )
  ),
  expires_at TIMESTAMPTZ NOT NULL,
  quote_id VARCHAR(128),
  usdc_amount_stroops BIGINT CHECK (usdc_amount_stroops IS NULL OR usdc_amount_stroops > 0),
  fx_rate NUMERIC(18, 6),
  version INT NOT NULL DEFAULT 1 CHECK (version >= 1),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cheques_state ON cheques(state);
CREATE INDEX IF NOT EXISTS idx_cheques_sender_id ON cheques(sender_id);
CREATE INDEX IF NOT EXISTS idx_cheques_payee_contact ON cheques(payee_contact_type, payee_contact);

-- 3. Fundings
CREATE TABLE IF NOT EXISTS fundings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  cheque_id UUID NOT NULL REFERENCES cheques(id) ON DELETE CASCADE,
  method VARCHAR(20) NOT NULL CHECK (method IN ('MOMO', 'USDC')),
  status VARCHAR(20) NOT NULL CHECK (status IN ('PENDING', 'CONFIRMED', 'FAILED', 'EXPIRED')),
  amount_minor BIGINT NOT NULL CHECK (amount_minor > 0),
  provider_ref VARCHAR(255),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fundings_cheque_id ON fundings(cheque_id);

-- 4. Claim Sessions
CREATE TABLE IF NOT EXISTS claim_sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  cheque_id UUID NOT NULL REFERENCES cheques(id) ON DELETE CASCADE,
  otp_hash VARCHAR(64) NOT NULL,
  attempts INT NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  max_attempts INT NOT NULL DEFAULT 5,
  verified_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL,
  device_fp VARCHAR(255),
  session_token VARCHAR(255),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_claim_sessions_cheque_id ON claim_sessions(cheque_id);

-- 5. Destinations
CREATE TABLE IF NOT EXISTS destinations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  cheque_id UUID NOT NULL REFERENCES cheques(id) ON DELETE CASCADE,
  type VARCHAR(20) NOT NULL CHECK (type IN ('MOMO', 'USDC', 'BANK')),
  network VARCHAR(20),
  account_ref VARCHAR(255) NOT NULL,
  account_name VARCHAR(255),
  verified_name_match BOOLEAN NOT NULL DEFAULT FALSE,
  memo VARCHAR(64),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_destinations_cheque_id ON destinations(cheque_id);

-- 6. Payouts (with Partial Unique Index constraint)
CREATE TABLE IF NOT EXISTS payouts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  cheque_id UUID NOT NULL REFERENCES cheques(id) ON DELETE CASCADE,
  destination_id UUID NOT NULL REFERENCES destinations(id) ON DELETE RESTRICT,
  status VARCHAR(20) NOT NULL CHECK (status IN ('PENDING', 'SENT', 'CONFIRMED', 'FAILED')),
  provider_ref VARCHAR(255),
  idempotency_key VARCHAR(255) NOT NULL UNIQUE,
  amount_minor BIGINT NOT NULL CHECK (amount_minor > 0),
  attempts INT NOT NULL DEFAULT 0,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Constraint: partial unique index payouts(cheque_id) WHERE status IN ('PENDING','SENT','CONFIRMED')
CREATE UNIQUE INDEX IF NOT EXISTS idx_payouts_active_cheque
  ON payouts(cheque_id)
  WHERE status IN ('PENDING', 'SENT', 'CONFIRMED');

-- 7. Refunds
CREATE TABLE IF NOT EXISTS refunds (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  cheque_id UUID NOT NULL REFERENCES cheques(id) ON DELETE CASCADE,
  method VARCHAR(20) NOT NULL CHECK (method IN ('MOMO', 'USDC')),
  status VARCHAR(20) NOT NULL CHECK (status IN ('PENDING', 'CONFIRMED', 'FAILED', 'REVIEW')),
  provider_ref VARCHAR(255),
  amount_minor BIGINT NOT NULL CHECK (amount_minor > 0),
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_refunds_cheque_id ON refunds(cheque_id);

-- 8. Ledger Entries (Double-Entry Ledger with Amount Checks)
CREATE TABLE IF NOT EXISTS ledger_entries (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tx_id UUID NOT NULL,
  account VARCHAR(64) NOT NULL CHECK (
    account IN (
      'sender_funds', 'cheque_escrow_onchain', 'payout_pending',
      'settled', 'fees', 'fx_buffer', 'refunds_pending'
    )
  ),
  debit_minor BIGINT NOT NULL DEFAULT 0 CHECK (debit_minor >= 0),
  credit_minor BIGINT NOT NULL DEFAULT 0 CHECK (credit_minor >= 0),
  cheque_id UUID REFERENCES cheques(id) ON DELETE SET NULL,
  currency VARCHAR(10) NOT NULL CHECK (currency IN ('GHS', 'USDC')),
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT check_debit_or_credit CHECK (
    (debit_minor > 0 AND credit_minor = 0) OR
    (credit_minor > 0 AND debit_minor = 0)
  )
);

CREATE INDEX IF NOT EXISTS idx_ledger_entries_tx_id ON ledger_entries(tx_id);
CREATE INDEX IF NOT EXISTS idx_ledger_entries_account ON ledger_entries(account);
CREATE INDEX IF NOT EXISTS idx_ledger_entries_cheque_id ON ledger_entries(cheque_id);

-- 9. Events (Audit Trail)
CREATE TABLE IF NOT EXISTS events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  cheque_id UUID REFERENCES cheques(id) ON DELETE CASCADE,
  event_type VARCHAR(64) NOT NULL,
  from_state VARCHAR(32),
  to_state VARCHAR(32),
  actor VARCHAR(64) NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_events_cheque_id ON events(cheque_id);
CREATE INDEX IF NOT EXISTS idx_events_event_type ON events(event_type);

-- 10. Outbox
CREATE TABLE IF NOT EXISTS outbox (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  topic VARCHAR(128) NOT NULL,
  aggregate_type VARCHAR(64) NOT NULL,
  aggregate_id VARCHAR(255) NOT NULL,
  payload JSONB NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'PENDING' CHECK (
    status IN ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'DEAD_LETTER')
  ),
  attempts INT NOT NULL DEFAULT 0,
  max_attempts INT NOT NULL DEFAULT 5,
  backoff_ms INT NOT NULL DEFAULT 1000,
  next_run_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  locked_at TIMESTAMPTZ,
  locked_by VARCHAR(255),
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_outbox_pending ON outbox(status, next_run_at)
  WHERE status IN ('PENDING', 'FAILED');

-- 12. Idempotency Keys
CREATE TABLE IF NOT EXISTS idempotency_keys (
  key VARCHAR(255) PRIMARY KEY,
  scope VARCHAR(64) NOT NULL,
  request_hash VARCHAR(64),
  response_code INT,
  response_body JSONB,
  status VARCHAR(32) NOT NULL CHECK (status IN ('IN_PROGRESS', 'COMPLETED', 'FAILED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL
);

-- 13. Chain Txs
CREATE TABLE IF NOT EXISTS chain_txs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  cheque_id UUID REFERENCES cheques(id) ON DELETE CASCADE,
  operation VARCHAR(32) NOT NULL,
  tx_hash VARCHAR(64) NOT NULL UNIQUE,
  signed_xdr TEXT NOT NULL,
  status VARCHAR(32) NOT NULL CHECK (status IN ('SUBMITTED', 'CONFIRMED', 'FAILED', 'EXPIRED')),
  ledger BIGINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chain_txs_cheque_id ON chain_txs(cheque_id);

-- Recipient contact is no longer collected: the claim link is the key.
ALTER TABLE cheques ALTER COLUMN payee_contact_type DROP NOT NULL;
ALTER TABLE cheques ALTER COLUMN payee_contact DROP NOT NULL;

-- 9. Multi-corridor upgrade (idempotent). Existing rows become Ghana/GHS cheques.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_name = 'cheques' AND column_name = 'face_amount_ghs_minor'
  ) THEN
    ALTER TABLE cheques RENAME COLUMN face_amount_ghs_minor TO face_amount_minor;
  END IF;
END $$;

ALTER TABLE cheques ADD COLUMN IF NOT EXISTS signature TEXT;
ALTER TABLE cheques ADD COLUMN IF NOT EXISTS funder_address VARCHAR(56);
ALTER TABLE cheques ADD COLUMN IF NOT EXISTS corridor VARCHAR(2) NOT NULL DEFAULT 'GH';
ALTER TABLE cheques DROP CONSTRAINT IF EXISTS cheques_corridor_check;
ALTER TABLE cheques ADD CONSTRAINT cheques_corridor_check CHECK (corridor IN ('GH', 'NG', 'US'));

ALTER TABLE users ADD COLUMN IF NOT EXISTS email VARCHAR(255);
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users(email);
-- Email-only accounts: the legacy phone column is dropped and the contact check now requires an email.
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_contact_check;
ALTER TABLE users DROP COLUMN IF EXISTS phone_e164;
-- webhook_events was only used by the removed WhatsApp/SMS webhook receivers
DROP TABLE IF EXISTS webhook_events;
ALTER TABLE users ADD CONSTRAINT users_contact_check CHECK (email IS NOT NULL);

ALTER TABLE cheques ADD COLUMN IF NOT EXISTS currency VARCHAR(3) NOT NULL DEFAULT 'GHS';
ALTER TABLE cheques DROP CONSTRAINT IF EXISTS cheques_currency_check;
ALTER TABLE cheques ADD CONSTRAINT cheques_currency_check CHECK (currency IN ('GHS', 'NGN', 'USD'));

ALTER TABLE ledger_entries DROP CONSTRAINT IF EXISTS ledger_entries_currency_check;
ALTER TABLE ledger_entries ADD CONSTRAINT ledger_entries_currency_check
  CHECK (currency IN ('GHS', 'NGN', 'USD', 'USDC'));

-- Session tokens are now stored as SHA-256 hex (64 chars). Expire any leftover plaintext values.
UPDATE claim_sessions
   SET expires_at = LEAST(expires_at, NOW()),
       session_token = NULL
 WHERE session_token IS NOT NULL
   AND session_token !~ '^[0-9a-f]{64}$';

-- Cross-chain USDC claims (Stellar escrow -> Stellar / Base / Solana via CCTP).
ALTER TABLE destinations ADD COLUMN IF NOT EXISTS chain VARCHAR(16) NOT NULL DEFAULT 'stellar';
ALTER TABLE destinations DROP CONSTRAINT IF EXISTS destinations_chain_check;
ALTER TABLE destinations ADD CONSTRAINT destinations_chain_check
  CHECK (chain IN ('stellar', 'base', 'solana'));

ALTER TABLE payouts ADD COLUMN IF NOT EXISTS dest_chain VARCHAR(16);
ALTER TABLE payouts DROP CONSTRAINT IF EXISTS payouts_dest_chain_check;
ALTER TABLE payouts ADD CONSTRAINT payouts_dest_chain_check
  CHECK (dest_chain IS NULL OR dest_chain IN ('stellar', 'base', 'solana'));
ALTER TABLE payouts ADD COLUMN IF NOT EXISTS fee_quote_minor BIGINT;
ALTER TABLE payouts ADD COLUMN IF NOT EXISTS net_amount_minor BIGINT;
ALTER TABLE payouts ADD COLUMN IF NOT EXISTS cctp_max_fee_minor BIGINT;
ALTER TABLE payouts ADD COLUMN IF NOT EXISTS cctp_burn_tx VARCHAR(128);
ALTER TABLE payouts ADD COLUMN IF NOT EXISTS iris_message JSONB;
ALTER TABLE payouts ADD COLUMN IF NOT EXISTS cctp_forward_tx VARCHAR(128);
`;

export async function runMigrations(clientOrPool: pg.Pool | pg.PoolClient): Promise<void> {
  await clientOrPool.query(SCHEMA_SQL);
}
