import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  ContractError,
  ContractErrorCode,
  OnChainChequeState,
  deriveChequeIdHex,
  type KeySigner,
} from '@cheque/chain';
import type { OutboxItem } from '@cheque/core';
import {
  createChainOperationHandler,
  TerminalChainError,
  type ChainClientLike,
  type ChainTxStore,
} from '../src/chain-handler.js';

const CHEQUE_UUID = '3f1c2b7e-9a41-4c1e-8d0a-5b6f7a8c9d01';
const CHEQUE_HEX = deriveChequeIdHex(CHEQUE_UUID);
const G = 'G'.padEnd(56, 'A');

const signer = (name: string) => ({ name }) as unknown as KeySigner;
const funder = signer('funder');
const authority = signer('authority');

function item(payload: Record<string, unknown>): OutboxItem {
  return {
    id: 'o1',
    topic: 'chain:contract:submit',
    aggregateType: 'cheque',
    aggregateId: CHEQUE_UUID,
    payload,
    status: 'PROCESSING',
    attempts: 0,
    maxAttempts: 5,
    backoffMs: 1000,
    nextRunAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function setup() {
  const tx = { txHash: 'abc123', ledger: 42 };
  const client = {
    createCheque: vi.fn(async (_s, _p, o) => {
      await o?.onSignedXdrReady?.('XDR', tx.txHash);
      return tx;
    }),
    lock: vi.fn(async (_s, _p, o) => {
      await o?.onSignedXdrReady?.('XDR', tx.txHash);
      return tx;
    }),
    unlock: vi.fn(async () => tx),
    redeem: vi.fn(async (_s, _id, o) => {
      await o?.onSignedXdrReady?.('XDR', tx.txHash);
      return tx;
    }),
    cancel: vi.fn(async () => tx),
    refund: vi.fn(async () => tx),
    getCheque: vi.fn(async () => {
      throw new ContractError(ContractErrorCode.ChequeNotFound);
    }),
    getLock: vi.fn(async () => undefined),
  } as unknown as ChainClientLike & Record<string, ReturnType<typeof vi.fn>>;

  const store: ChainTxStore = {
    recordSubmitted: vi.fn(async () => {}),
    recordConfirmed: vi.fn(async () => {}),
    recordFailed: vi.fn(async () => {}),
  };
  const handler = createChainOperationHandler({ client, funder, authority, store });
  return { client, store, handler };
}

describe('chain operation handler', () => {
  let ctx: ReturnType<typeof setup>;
  beforeEach(() => {
    ctx = setup();
  });

  it('create_cheque signs with the funder using the canonical on-chain id', async () => {
    await ctx.handler(
      item({ operation: 'create_cheque', refundTo: G, amountStroops: '20000000', expiresAt: 1_900_000_000 })
    );
    expect(ctx.client.createCheque).toHaveBeenCalledWith(
      funder,
      { chequeIdHex: CHEQUE_HEX, refundTo: G, amountStroops: 20_000_000n, expiresAt: 1_900_000_000 },
      expect.anything()
    );
  });

  it('records SUBMITTED (with signed XDR) before CONFIRMED, using the real tx hash', async () => {
    await ctx.handler(item({ operation: 'redeem' }));
    expect(ctx.store.recordSubmitted).toHaveBeenCalledWith({
      chequeId: CHEQUE_UUID,
      operation: 'redeem',
      txHash: 'abc123',
      signedXdr: 'XDR',
    });
    expect(ctx.store.recordConfirmed).toHaveBeenCalledWith({ txHash: 'abc123', ledger: 42 });
    const submittedOrder = (ctx.store.recordSubmitted as any).mock.invocationCallOrder[0];
    const confirmedOrder = (ctx.store.recordConfirmed as any).mock.invocationCallOrder[0];
    expect(submittedOrder).toBeLessThan(confirmedOrder);
  });

  it('is a no-op when the operation is already applied on-chain (safe retry)', async () => {
    ctx.client.getCheque.mockResolvedValue({ state: OnChainChequeState.Redeemed } as any);
    await ctx.handler(item({ operation: 'redeem' }));
    expect(ctx.client.redeem).not.toHaveBeenCalled();
    expect(ctx.store.recordConfirmed).not.toHaveBeenCalled();
  });

  it('lock is skipped only when locked to the same recipient', async () => {
    ctx.client.getCheque.mockResolvedValue({ state: OnChainChequeState.Locked } as any);
    ctx.client.getLock.mockResolvedValue({ to: 'G'.padEnd(56, 'B') } as any);
    await ctx.handler(item({ operation: 'lock', to: G, lockSecs: 600 }));
    expect(ctx.client.lock).toHaveBeenCalledTimes(1);
  });

  it('rejects malformed payloads instead of faking success', async () => {
    await expect(ctx.handler(item({ operation: 'create_cheque' }))).rejects.toBeInstanceOf(TerminalChainError);
    await expect(ctx.handler(item({ operation: 'teleport' }))).rejects.toBeInstanceOf(TerminalChainError);
    expect(ctx.store.recordConfirmed).not.toHaveBeenCalled();
  });

  it('marks terminal contract errors as non-retryable and records the failed tx', async () => {
    ctx.client.createCheque.mockImplementation(async (_s: unknown, _p: unknown, o: any) => {
      await o?.onSignedXdrReady?.('XDR', 'deadbeef');
      throw new ContractError(ContractErrorCode.AmountOutOfBounds);
    });
    await expect(
      ctx.handler(item({ operation: 'create_cheque', refundTo: G, amountStroops: '1', expiresAt: 1_900_000_000 }))
    ).rejects.toBeInstanceOf(TerminalChainError);
    expect(ctx.store.recordFailed).toHaveBeenCalledWith(expect.objectContaining({ txHash: 'deadbeef' }));
  });

  it('rethrows transient errors unchanged so the outbox retries', async () => {
    const boom = new Error('RPC timeout');
    ctx.client.redeem.mockRejectedValue(boom);
    await expect(ctx.handler(item({ operation: 'redeem' }))).rejects.toBe(boom);
  });
});
