import { z } from 'zod';
import type { OutboxItem } from '@cheque/core';
import {
  ContractError,
  ContractErrorCode,
  OnChainChequeState,
  deriveChequeIdHex,
  type KeySigner,
  type OnChainCheque,
  type OnChainLockInfo,
  type InvokeContractOptions,
} from '@cheque/chain';
import { logger } from '@cheque/shared';

/**
 * Outbox payload for topic `chain:contract:submit`. `item.aggregateId` is the cheque UUID;
 * the on-chain id is derived from it (see packages/chain/src/cheque-id.ts).
 */
export const ChainOperationPayloadSchema = z.discriminatedUnion('operation', [
  z.object({
    operation: z.literal('create_cheque'),
    refundTo: z.string().length(56),
    amountStroops: z.string().regex(/^\d+$/),
    expiresAt: z.number().int().positive(),
  }),
  z.object({
    operation: z.literal('lock'),
    to: z.string().length(56),
    lockSecs: z.number().int().positive(),
  }),
  z.object({ operation: z.literal('unlock') }),
  z.object({ operation: z.literal('redeem') }),
  z.object({ operation: z.literal('cancel') }),
  z.object({ operation: z.literal('refund') }),
]);

export type ChainOperationPayload = z.infer<typeof ChainOperationPayloadSchema>;

/** The subset of ChequeContractClient the handler needs (keeps it unit-testable). */
export interface ChainClientLike {
  createCheque(
    funder: KeySigner,
    p: { chequeIdHex: string; refundTo: string; amountStroops: bigint; expiresAt: number },
    o?: InvokeContractOptions
  ): Promise<{ txHash: string; ledger: number }>;
  lock(
    authority: KeySigner,
    p: { chequeIdHex: string; to: string; lockSecs: number },
    o?: InvokeContractOptions
  ): Promise<{ txHash: string; ledger: number }>;
  unlock(caller: KeySigner, id: string, o?: InvokeContractOptions): Promise<{ txHash: string; ledger: number }>;
  redeem(authority: KeySigner, id: string, o?: InvokeContractOptions): Promise<{ txHash: string; ledger: number }>;
  cancel(funder: KeySigner, id: string, o?: InvokeContractOptions): Promise<{ txHash: string; ledger: number }>;
  refund(caller: KeySigner, id: string, o?: InvokeContractOptions): Promise<{ txHash: string; ledger: number }>;
  getCheque(id: string): Promise<OnChainCheque>;
  getLock(id: string): Promise<OnChainLockInfo | undefined>;
}

export interface ChainTxStore {
  /** Persist the signed XDR BEFORE it is sent (SPEC 6.1 / idempotency rule). */
  recordSubmitted(p: { chequeId: string; operation: string; txHash: string; signedXdr: string }): Promise<void>;
  recordConfirmed(p: { txHash: string; ledger: number }): Promise<void>;
  recordFailed(p: { txHash: string; error: string }): Promise<void>;
}

export interface ChainHandlerDeps {
  client: ChainClientLike;
  /** Signs create_cheque and cancel (the account that holds/escrows the funds). */
  funder: KeySigner;
  /** Signs lock/redeem; also used as the arbitrary caller for unlock/refund. */
  authority: KeySigner;
  store: ChainTxStore;
  /**
   * Called after the operation's effect is on-chain (confirmed now, or already applied by an
   * earlier attempt). Must be idempotent: it can run more than once per operation.
   */
  onApplied?: (item: OutboxItem, payload: ChainOperationPayload) => Promise<void>;
}

/** Errors where retrying cannot help; the outbox item should dead-letter instead of looping. */
const TERMINAL_CODES = new Set<ContractErrorCode>([
  ContractErrorCode.AmountOutOfBounds,
  ContractErrorCode.InvalidExpiry,
  ContractErrorCode.InvalidLockDuration,
  ContractErrorCode.ChequeNotFound,
  ContractErrorCode.ChequeExpired,
]);

export class TerminalChainError extends Error {
  constructor(message: string, public readonly code: ContractErrorCode) {
    super(message);
    this.name = 'TerminalChainError';
  }
}

/**
 * Has this operation's effect already landed on-chain? Makes retries safe after a
 * submission that timed out but actually succeeded.
 */
async function alreadyApplied(
  client: ChainClientLike,
  payload: ChainOperationPayload,
  chequeIdHex: string
): Promise<boolean> {
  let onChain: OnChainCheque;
  try {
    onChain = await client.getCheque(chequeIdHex);
  } catch (err) {
    if (err instanceof ContractError && err.code === ContractErrorCode.ChequeNotFound) {
      return false; // not created yet
    }
    throw err;
  }

  switch (payload.operation) {
    case 'create_cheque':
      return true; // any existing record means create already happened
    case 'lock': {
      if (onChain.state !== OnChainChequeState.Locked) return false;
      const lock = await client.getLock(chequeIdHex);
      return lock?.to === payload.to;
    }
    case 'unlock':
      return onChain.state === OnChainChequeState.Active;
    case 'redeem':
      return onChain.state === OnChainChequeState.Redeemed;
    case 'cancel':
      return onChain.state === OnChainChequeState.Cancelled;
    case 'refund':
      return onChain.state === OnChainChequeState.Refunded;
  }
}

export function createChainOperationHandler(deps: ChainHandlerDeps) {
  const { client, funder, authority, store, onApplied } = deps;

  return async function handleChainOperation(item: OutboxItem): Promise<void> {
    const parsed = ChainOperationPayloadSchema.safeParse(item.payload);
    if (!parsed.success) {
      // A malformed payload will never become valid; fail loudly instead of faking success.
      throw new TerminalChainError(
        `Invalid chain operation payload for ${item.aggregateId}: ${parsed.error.message}`,
        ContractErrorCode.InvalidState
      );
    }

    const payload = parsed.data;
    const chequeIdHex = deriveChequeIdHex(item.aggregateId);

    if (await alreadyApplied(client, payload, chequeIdHex)) {
      logger.info(`[chain] ${payload.operation} for ${item.aggregateId} already applied on-chain; skipping`);
      await onApplied?.(item, payload);
      return;
    }

    let submittedHash: string | undefined;
    const options: InvokeContractOptions = {
      onSignedXdrReady: async (signedXdr, txHash) => {
        submittedHash = txHash;
        await store.recordSubmitted({
          chequeId: item.aggregateId,
          operation: payload.operation,
          txHash,
          signedXdr,
        });
      },
    };

    try {
      let result: { txHash: string; ledger: number };
      switch (payload.operation) {
        case 'create_cheque':
          result = await client.createCheque(
            funder,
            {
              chequeIdHex,
              refundTo: payload.refundTo,
              amountStroops: BigInt(payload.amountStroops),
              expiresAt: payload.expiresAt,
            },
            options
          );
          break;
        case 'lock':
          result = await client.lock(
            authority,
            { chequeIdHex, to: payload.to, lockSecs: payload.lockSecs },
            options
          );
          break;
        case 'unlock':
          result = await client.unlock(authority, chequeIdHex, options);
          break;
        case 'redeem':
          result = await client.redeem(authority, chequeIdHex, options);
          break;
        case 'cancel':
          result = await client.cancel(funder, chequeIdHex, options);
          break;
        case 'refund':
          result = await client.refund(authority, chequeIdHex, options);
          break;
      }

      await store.recordConfirmed({ txHash: result.txHash, ledger: result.ledger });
      logger.info(`[chain] ${payload.operation} confirmed for ${item.aggregateId}: ${result.txHash}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (submittedHash) {
        await store.recordFailed({ txHash: submittedHash, error: message });
      }
      if (err instanceof ContractError && TERMINAL_CODES.has(err.code)) {
        throw new TerminalChainError(message, err.code);
      }
      throw err; // transient: outbox retries with backoff
    }

    // Outside the try: a bookkeeping failure must not mark a confirmed tx as FAILED. The outbox
    // retries the item, `alreadyApplied` short-circuits the chain call, and this runs again.
    await onApplied?.(item, payload);
  };
}

/** Postgres-backed store writing to the `chain_txs` table. */
export function createPgChainTxStore(pool: {
  query: (text: string, params?: unknown[]) => Promise<unknown>;
}): ChainTxStore {
  return {
    async recordSubmitted({ chequeId, operation, txHash, signedXdr }) {
      await pool.query(
        `INSERT INTO chain_txs (cheque_id, operation, tx_hash, signed_xdr, status)
         VALUES ($1, $2, $3, $4, 'SUBMITTED')
         ON CONFLICT (tx_hash) DO NOTHING`,
        [chequeId, operation, txHash, signedXdr]
      );
    },
    async recordConfirmed({ txHash, ledger }) {
      await pool.query(
        `UPDATE chain_txs SET status = 'CONFIRMED', ledger = $2, updated_at = NOW() WHERE tx_hash = $1`,
        [txHash, ledger]
      );
    },
    async recordFailed({ txHash, error }) {
      logger.warn(`[chain] tx ${txHash} failed: ${error}`);
      await pool.query(
        `UPDATE chain_txs SET status = 'FAILED', updated_at = NOW() WHERE tx_hash = $1`,
        [txHash]
      );
    },
  };
}
