import pg from 'pg';
import { getPool } from './db.js';

export interface ReconciliationRow {
  chequeId: string;
  publicCode: string;
  offchainState: string;
  lastChainEvent: string | null;
  lastChainLedger: number | null;
  lastChainTxHash: string | null;
  isReconciled: boolean;
  reconciliationStatus: string;
}

export async function getReconciliationReport(
  clientOrPool?: pg.Pool | pg.PoolClient
): Promise<ReconciliationRow[]> {
  const runner = clientOrPool ?? getPool();
  const res = await runner.query(`
    SELECT
      cheque_id AS "chequeId",
      public_code AS "publicCode",
      offchain_state AS "offchainState",
      last_chain_event AS "lastChainEvent",
      last_chain_ledger AS "lastChainLedger",
      last_chain_tx_hash AS "lastChainTxHash",
      is_reconciled AS "isReconciled",
      reconciliation_status AS "reconciliationStatus"
    FROM reconciliation_view
    ORDER BY public_code ASC;
  `);

  return res.rows as ReconciliationRow[];
}

export async function checkChequeReconciliation(
  chequeId: string,
  clientOrPool?: pg.Pool | pg.PoolClient
): Promise<ReconciliationRow | null> {
  const runner = clientOrPool ?? getPool();
  const res = await runner.query(
    `
    SELECT
      cheque_id AS "chequeId",
      public_code AS "publicCode",
      offchain_state AS "offchainState",
      last_chain_event AS "lastChainEvent",
      last_chain_ledger AS "lastChainLedger",
      last_chain_tx_hash AS "lastChainTxHash",
      is_reconciled AS "isReconciled",
      reconciliation_status AS "reconciliationStatus"
    FROM reconciliation_view
    WHERE cheque_id = $1;
    `,
    [chequeId]
  );

  return (res.rows[0] as ReconciliationRow) ?? null;
}
