import pg from 'pg';
import crypto from 'node:crypto';
import { Cheque, ChequeState, LedgerTransaction } from './types.js';
import { isValidTransition, TransitionCheckContext } from './state-machine.js';
import { validateLedgerTransaction } from './ledger.js';
import { withTransaction } from './db.js';

/** Maps a flat cheques row (aliased columns) into the domain `Cheque`. */
export function mapChequeRow(row: Record<string, any>): Cheque {
  return row as Cheque;
}

export class StateTransitionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StateTransitionError';
  }
}

export class OptimisticLockError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OptimisticLockError';
  }
}

export interface TransitionParams {
  chequeId: string;
  fromState: ChequeState;
  toState: ChequeState;
  actor: 'SENDER' | 'RECIPIENT' | 'SYSTEM' | 'ADMIN';
  expectedVersion: number;
  auditPayload?: Record<string, unknown>;
  ledgerTx?: LedgerTransaction;
  outboxItems?: Array<{
    topic: string;
    aggregateType: string;
    aggregateId?: string;
    payload: Record<string, unknown>;
  }>;
  chequePatch?: {
    expiresAt?: Date;
    quoteId?: string;
    usdcAmountStroops?: number;
    fxRate?: string;
  };
  context?: TransitionCheckContext;
}

export interface TransitionResult {
  cheque: Cheque;
  auditEventId: string;
  ledgerTxId?: string;
  outboxIds: string[];
}

/**
 * Executes state machine transition with optimistic locking, audit event recording,
 * balanced ledger entries, and outbox rows in ONE single atomic Postgres transaction.
 */
export async function transition(
  params: TransitionParams,
  existingClient?: pg.PoolClient
): Promise<TransitionResult> {
  const {
    chequeId,
    fromState,
    toState,
    actor,
    expectedVersion,
    auditPayload = {},
    ledgerTx,
    outboxItems = [],
    chequePatch = {},
    context,
  } = params;

  // 1. Guard check
  const guardResult = isValidTransition(fromState, toState, { actor, ...context });
  if (!guardResult.allowed) {
    throw new StateTransitionError(guardResult.reason ?? `Transition from ${fromState} to ${toState} disallowed`);
  }

  // 2. Validate ledger entries before beginning DB operations if present
  if (ledgerTx) {
    validateLedgerTransaction(ledgerTx);
  }

  return withTransaction(async (client) => {
    // 3. Conditional UPDATE with optimistic lock: WHERE id = $2 AND state = $3 AND version = $4
    const updateQuery = `
      UPDATE cheques
      SET state = $1,
          version = version + 1,
          updated_at = NOW(),
          expires_at = COALESCE($5, expires_at),
          quote_id = COALESCE($6, quote_id),
          usdc_amount_stroops = COALESCE($7, usdc_amount_stroops),
          fx_rate = COALESCE($8, fx_rate)
      WHERE id = $2 AND state = $3 AND version = $4
      RETURNING
        id,
        public_code AS "publicCode",
        claim_token_hash AS "claimTokenHash",
        sender_id AS "senderId",
        payee_name AS "payeeName",
        face_amount_minor AS "faceAmountMinor",
        fee_minor AS "feeMinor",
        note,
        state,
        expires_at AS "expiresAt",
        quote_id AS "quoteId",
        usdc_amount_stroops AS "usdcAmountStroops",
        fx_rate AS "fxRate",
        version,
        created_at AS "createdAt",
        updated_at AS "updatedAt";
    `;

    const updateRes = await client.query(updateQuery, [
      toState,
      chequeId,
      fromState,
      expectedVersion,
      chequePatch.expiresAt ?? null,
      chequePatch.quoteId ?? null,
      chequePatch.usdcAmountStroops ?? null,
      chequePatch.fxRate ?? null,
    ]);

    if (updateRes.rowCount === 0) {
      throw new OptimisticLockError(
        `Optimistic lock failure on cheque ${chequeId}: expected state ${fromState} and version ${expectedVersion}. Concurrent update detected.`
      );
    }

    const updatedCheque = mapChequeRow(updateRes.rows[0]);

    // 4. Record Audit Event in events table
    const auditEventId = crypto.randomUUID();
    await client.query(
      `
      INSERT INTO events (id, cheque_id, event_type, from_state, to_state, actor, payload, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, NOW());
      `,
      [
        auditEventId,
        chequeId,
        `CHEQUE_TRANSITION_${toState}`,
        fromState,
        toState,
        actor,
        JSON.stringify(auditPayload),
      ]
    );

    // 5. Record Ledger Entries
    if (ledgerTx) {
      for (const entry of ledgerTx.entries) {
        await client.query(
          `
          INSERT INTO ledger_entries (
            id, tx_id, account, debit_minor, credit_minor, cheque_id, currency, description, created_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW());
          `,
          [
            crypto.randomUUID(),
            ledgerTx.txId,
            entry.account,
            entry.debitMinor,
            entry.creditMinor,
            chequeId,
            ledgerTx.currency,
            ledgerTx.description,
          ]
        );
      }
    }

    // 6. Record Outbox rows
    const outboxIds: string[] = [];
    for (const item of outboxItems) {
      const outboxId = crypto.randomUUID();
      outboxIds.push(outboxId);
      await client.query(
        `
        INSERT INTO outbox (
          id, topic, aggregate_type, aggregate_id, payload, status, next_run_at, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, 'PENDING', NOW(), NOW(), NOW());
        `,
        [outboxId, item.topic, item.aggregateType, item.aggregateId ?? chequeId, JSON.stringify(item.payload)]
      );
    }

    return {
      cheque: updatedCheque,
      auditEventId,
      ledgerTxId: ledgerTx?.txId,
      outboxIds,
    };
  }, existingClient);
}
