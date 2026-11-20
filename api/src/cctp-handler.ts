import type { Pool } from 'pg';
import type { OutboxItem } from '@cheque/core';
import {
  MIN_CCTP_NET_MICRO,
  stroopsToMicroUsdc,
  transition,
  withTransaction,
  createSettlementConfirmedTransaction,
  type DestinationChain,
} from '@cheque/core';
import type { CctpAdapter } from '@cheque/chain';
import { logger } from '@cheque/shared';

export interface CctpHandlerDeps {
  pool: Pool;
  adapter: CctpAdapter;
}

export class CctpTerminalError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CctpTerminalError';
  }
}

async function loadPayout(pool: Pool, chequeId: string) {
  const res = await pool.query(
    `SELECT p.id, p.status, p.cctp_burn_tx AS "cctpBurnTx", p.cctp_forward_tx AS "cctpForwardTx",
            p.dest_chain AS "destChain", p.fee_quote_minor AS "feeQuoteMinor",
            p.net_amount_minor AS "netAmountMinor", p.attempts,
            d.account_ref AS "accountRef", d.chain,
            c.usdc_amount_stroops AS "usdcAmountStroops", c.state
       FROM payouts p
       JOIN destinations d ON d.id = p.destination_id
       JOIN cheques c ON c.id = p.cheque_id
      WHERE p.cheque_id = $1
      ORDER BY p.created_at DESC
      LIMIT 1`,
    [chequeId],
  );
  return res.rows[0] as
    | {
        id: string;
        status: string;
        cctpBurnTx: string | null;
        cctpForwardTx: string | null;
        destChain: DestinationChain | null;
        feeQuoteMinor: string | null;
        netAmountMinor: string | null;
        attempts: number;
        accountRef: string;
        chain: DestinationChain;
        usdcAmountStroops: string | null;
        state: string;
      }
    | undefined;
}

async function enqueueWait(pool: Pool, chequeId: string, burnTx: string): Promise<void> {
  await pool.query(
    `INSERT INTO outbox (id, topic, aggregate_type, aggregate_id, payload, status, next_run_at, max_attempts, backoff_ms)
     VALUES ($1, 'chain:cctp', 'cheque', $2, $3, 'PENDING', NOW(), 20, 5000)`,
    [
      crypto.randomUUID(),
      chequeId,
      JSON.stringify({ operation: 'cctp_wait_forward', burnTx }),
    ],
  );
}

export function createCctpOperationHandler(deps: CctpHandlerDeps) {
  const { pool, adapter } = deps;

  return async function handleCctpOperation(item: OutboxItem): Promise<void> {
    const payload = (item.payload ?? {}) as { operation?: string; burnTx?: string };
    const chequeId = item.aggregateId;
    const payout = await loadPayout(pool, chequeId);
    if (!payout) throw new Error(`No payout found for cheque ${chequeId}`);
    const chain = payout.destChain ?? payout.chain;
    if (chain !== 'base' && chain !== 'solana') {
      throw new CctpTerminalError(`CCTP handler invoked for non-cross-chain payout (${chain})`);
    }

    if (payload.operation === 'cctp_burn') {
      if (payout.cctpBurnTx) {
        logger.info(`[cctp] burn already recorded for ${chequeId}: ${payout.cctpBurnTx}; queueing wait`);
        await enqueueWait(pool, chequeId, payout.cctpBurnTx);
        return;
      }
      const amountStroops = BigInt(payout.usdcAmountStroops ?? 0);
      if (amountStroops <= 0n) throw new CctpTerminalError('Cheque has no USDC amount to burn');

      try {
        const result = await adapter.burnToDestination({
          amountStroops,
          chain,
          recipientAddress: payout.accountRef,
        });
        const feeMicro = result.quote.forwardFeeMicro.med;
        const netMicro = stroopsToMicroUsdc(amountStroops) - feeMicro;
        if (netMicro < MIN_CCTP_NET_MICRO) {
          // Burn already submitted — still record it and wait; the recipient will get whatever minted.
          logger.warn(`[cctp] net after re-quote is ${netMicro} micro-USDC for ${chequeId} (below minimum, burn already sent)`);
        }
        await pool.query(
          `UPDATE payouts
              SET cctp_burn_tx = $2,
                  cctp_max_fee_minor = $3,
                  fee_quote_minor = $4,
                  net_amount_minor = $5,
                  status = 'SENT',
                  updated_at = NOW()
            WHERE id = $1`,
          [payout.id, result.burnTx, (result.quote.maxFeeStroops / 10n).toString(), feeMicro.toString(), (netMicro < 0n ? 0n : netMicro).toString()],
        );
        await enqueueWait(pool, chequeId, result.burnTx);
        logger.info(`[cctp] burned ${amountStroops} stroops on Stellar for ${chequeId}: ${result.burnTx}`);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        await pool.query(
          `UPDATE payouts SET last_error = $2, attempts = attempts + 1, updated_at = NOW() WHERE id = $1`,
          [payout.id, message],
        );
        if (err instanceof CctpTerminalError || /below minimum|Invalid/.test(message)) {
          await pool.query(`UPDATE payouts SET status = 'FAILED', updated_at = NOW() WHERE id = $1`, [payout.id]);
          logger.error(`[cctp] terminal burn failure for ${chequeId}: ${message}`);
          return; // do not retry; cheque stays SETTLING for manual recovery
        }
        throw err;
      }
      return;
    }

    if (payload.operation === 'cctp_wait_forward') {
      const burnTx = payload.burnTx ?? payout.cctpBurnTx;
      if (!burnTx) throw new Error(`No Stellar CCTP burn tx to wait on for ${chequeId}`);
      if (payout.cctpForwardTx) {
        await finishSettled(pool, chequeId, payout.id, burnTx, payout.cctpForwardTx, null);
        return;
      }
      try {
        const { forwardTxHash, message } = await adapter.waitForForward(burnTx, {
          timeoutMs: 15_000,
          pollMs: 3_000,
        });
        await finishSettled(pool, chequeId, payout.id, burnTx, forwardTxHash, message);
        logger.info(`[cctp] forward confirmed for ${chequeId}: ${forwardTxHash}`);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        await pool.query(`UPDATE payouts SET last_error = $2, updated_at = NOW() WHERE id = $1`, [
          payout.id,
          message,
        ]);
        const lastAttempt = item.attempts + 1 >= item.maxAttempts;
        if (lastAttempt) {
          await pool.query(`UPDATE payouts SET status = 'FAILED', updated_at = NOW() WHERE id = $1`, [payout.id]);
          logger.error(`[cctp] giving up wait for ${chequeId} after ${item.maxAttempts} attempts: ${message}`);
          return; // cheque stays SETTLING for manual recovery; no auto-refund
        }
        throw err;
      }
      return;
    }

    throw new Error(`Unknown CCTP operation ${payload.operation} for ${chequeId}`);
  };
}

async function finishSettled(
  pool: Pool,
  chequeId: string,
  payoutId: string,
  _burnTx: string,
  forwardTx: string,
  irisMessage: Record<string, unknown> | null,
): Promise<void> {
  await pool.query(
    `UPDATE payouts
        SET status = 'CONFIRMED',
            cctp_forward_tx = $2,
            iris_message = COALESCE($3::jsonb, iris_message),
            last_error = NULL,
            updated_at = NOW()
      WHERE id = $1`,
    [payoutId, forwardTx, irisMessage ? JSON.stringify(irisMessage) : null],
  );
  const row = await pool.query(
    `SELECT state, version, face_amount_minor::float8 AS "faceAmountMinor", currency
       FROM cheques WHERE id = $1`,
    [chequeId],
  );
  const cheque = row.rows[0] as
    | { state: string; version: number; faceAmountMinor: number; currency: string }
    | undefined;
  if (cheque?.state !== 'SETTLING') return;
  try {
    await withTransaction(async (client) => {
      await transition(
        {
          chequeId,
          fromState: 'SETTLING',
          toState: 'SETTLED',
          actor: 'SYSTEM',
          expectedVersion: cheque.version,
          ledgerTx: createSettlementConfirmedTransaction({
            chequeId,
            amountMinor: cheque.faceAmountMinor,
            currency: cheque.currency as 'GHS' | 'NGN' | 'USD' | 'USDC',
          }),
        },
        client,
      );
    });
  } catch (err) {
    // Payout is already confirmed; a version conflict means another worker settled it.
    const message = err instanceof Error ? err.message : String(err);
    if (!/version|SETTLING|optimistic/i.test(message)) throw err;
  }
}
