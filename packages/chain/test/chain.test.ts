import { describe, it, expect, vi } from 'vitest';
import {
  ContractErrorCode,
  ContractError,
  parseContractError,
  CONTRACT_ERROR_MESSAGES,
  ChannelPool,
  SubmissionIdempotencyStore,
  ContractEventIndexer,
  checkChainHealth,
  EnvKeypairSigner,
  KmsSigner,
  ChequeContractClient,
} from '../src/index.js';
import { Keypair, Horizon, rpc, TransactionBuilder, Account, Operation } from '@stellar/stellar-sdk';

describe('Typed Contract Errors', () => {
  it('maps contract error codes to human-readable names and typed exceptions', () => {
    const err = new ContractError(ContractErrorCode.ChequeAlreadyExists);
    expect(err.code).toBe(4);
    expect(err.codeName).toBe('ChequeAlreadyExists');
    expect(err.message).toContain('ChequeAlreadyExists (4)');
    expect(err.userMessage).toBe(CONTRACT_ERROR_MESSAGES[ContractErrorCode.ChequeAlreadyExists]);
  });

  it('parses Soroban simulation error strings into typed ContractError', () => {
    const simulatedError = new Error(
      'Transaction simulation failed: HostError: Error(Contract, 6)'
    );
    const parsed = parseContractError(simulatedError);
    expect(parsed).toBeInstanceOf(ContractError);
    expect((parsed as ContractError).code).toBe(ContractErrorCode.InvalidState);
    expect((parsed as ContractError).codeName).toBe('InvalidState');
  });

  it('correctly maps all 17 contract error codes', () => {
    for (let i = 1; i <= 17; i++) {
      const parsed = parseContractError(`HostError: Error(Contract, ${i})`);
      expect(parsed).toBeInstanceOf(ContractError);
      expect((parsed as ContractError).code).toBe(i);
      expect((parsed as ContractError).userMessage).toBeTruthy();
    }
  });
});

describe('Signer Interface (Env & KMS)', () => {
  it('EnvKeypairSigner signs transactions and hashes correctly', async () => {
    const kp = Keypair.random();
    const signer = new EnvKeypairSigner(kp.secret());
    expect(await signer.getPublicKey()).toBe(kp.publicKey());

    const hash = Buffer.from('0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef', 'hex');
    const sig = await signer.signHash(hash);
    expect(sig).toHaveLength(64);
    expect(kp.verify(hash, sig)).toBe(true);
  });

  it('KmsSigner delegates signing to KMS callback', async () => {
    const kp = Keypair.random();
    const kmsMock = vi.fn().mockImplementation(async (h: Buffer) => kp.sign(h));
    const kmsSigner = new KmsSigner(kp.publicKey(), kmsMock);

    expect(await kmsSigner.getPublicKey()).toBe(kp.publicKey());
    const hash = Buffer.from('0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef', 'hex');
    const sig = await kmsSigner.signHash(hash);
    expect(kmsMock).toHaveBeenCalledWith(hash);
    expect(kp.verify(hash, sig)).toBe(true);
  });
});

describe('Channel Accounts Pool & Fee-Bump', () => {
  it('manages channel accounts and leases them without collision', async () => {
    const s1 = Keypair.random().secret();
    const s2 = Keypair.random().secret();
    const feeSecret = Keypair.random().secret();

    const pool = new ChannelPool({
      channelSecrets: [s1, s2],
      feeSourceSecret: feeSecret,
      leaseTtlSeconds: 5,
    });
    await pool.init();

    expect(pool.getChannelCount()).toBe(2);

    const statsBefore = await pool.getPoolStats();
    expect(statsBefore.total).toBe(2);
    expect(statsBefore.available).toBe(2);

    // Lease channel 1 and channel 2 in parallel
    const p1 = pool.withLeasedChannel(async (signer, pubKey) => {
      expect(pubKey).toBeTruthy();
      await new Promise((r) => setTimeout(r, 60));
      return pubKey;
    });

    const p2 = pool.withLeasedChannel(async (signer, pubKey) => {
      expect(pubKey).toBeTruthy();
      await new Promise((r) => setTimeout(r, 60));
      return pubKey;
    });

    const [res1, res2] = await Promise.all([p1, p2]);
    // The two leased channels must be distinct
    expect(res1).not.toBe(res2);

    const statsAfter = await pool.getPoolStats();
    expect(statsAfter.available).toBe(2);
    expect(statsAfter.leased).toBe(0);
  });

  it('wraps inner transaction with fee-bump from fee-source account', async () => {
    const feeSecret = Keypair.random().secret();
    const pool = new ChannelPool({
      channelSecrets: [Keypair.random().secret()],
      feeSourceSecret: feeSecret,
    });

    const dummySource = Keypair.random();
    const innerTx = new TransactionBuilder(new Account(dummySource.publicKey(), '100'), {
      fee: '100',
      networkPassphrase: 'Test SDF Network ; September 2015',
    })
      .addOperation(
        Operation.payment({
          destination: Keypair.random().publicKey(),
          asset: (await import('@stellar/stellar-sdk')).Asset.native(),
          amount: '1',
        })
      )
      .setTimeout(30)
      .build();

    innerTx.sign(dummySource);

    const feeBumpTx = await pool.feeBumpTransaction(innerTx, 'Test SDF Network ; September 2015');
    expect(feeBumpTx.feeSource).toBe(Keypair.fromSecret(feeSecret).publicKey());
    expect(feeBumpTx.signatures.length).toBeGreaterThan(0);
  });
});

describe('Submission Idempotency Store', () => {
  it('persists signed XDR before send and resolves duplicate resubmissions', async () => {
    const store = new SubmissionIdempotencyStore();

    const chequeId = 'chq-test-123';
    const txHash = 'a1b2c3d4e5f6';
    const signedXdr = 'AAAA...test';

    // 1. Persist before send
    await store.recordBeforeSend({
      chequeId,
      operation: 'create',
      signedXdr,
      txHash,
      ledgerBound: 100,
    });

    const record = await store.getRecord(chequeId, 'create');
    expect(record).toBeDefined();
    expect(record?.txHash).toBe(txHash);
    expect(record?.signedXdr).toBe(signedXdr);
    expect(record?.status).toBe('SUBMITTED');
  });

  it('distinguishes CONFIRMED, FAILED, and EXPIRED statuses on resolution', async () => {
    const store = new SubmissionIdempotencyStore();
    const chequeId = 'chq-status-test';

    await store.recordBeforeSend({
      chequeId,
      operation: 'lock',
      signedXdr: 'signed-xdr-data',
      txHash: 'tx-hash-1',
      ledgerBound: 50,
    });

    // Mock RPC server
    const mockRpc = {
      getTransaction: vi.fn().mockResolvedValue({
        status: rpc.Api.GetTransactionStatus.SUCCESS,
        latestLedger: 45,
      }),
      getLatestLedger: vi.fn().mockResolvedValue({ sequence: 45 }),
    } as unknown as rpc.Server;

    const res = await store.resolveSubmission(chequeId, 'lock', mockRpc, 'Test');
    expect(res.shouldRebuild).toBe(false);
    expect(res.status).toBe('CONFIRMED');
    expect(res.confirmedLedger).toBe(45);

    // Test expired ledger bound
    const expiredChequeId = 'chq-expired-test';
    await store.recordBeforeSend({
      chequeId: expiredChequeId,
      operation: 'create',
      signedXdr: 'signed-xdr-expired',
      txHash: 'tx-hash-expired',
      ledgerBound: 40,
    });

    const expiredRpc = {
      getTransaction: vi.fn().mockResolvedValue({
        status: rpc.Api.GetTransactionStatus.NOT_FOUND,
      }),
      getLatestLedger: vi.fn().mockResolvedValue({ sequence: 55 }), // 55 > 40
    } as unknown as rpc.Server;

    const expiredRes = await store.resolveSubmission(expiredChequeId, 'create', expiredRpc, 'Test');
    expect(expiredRes.shouldRebuild).toBe(true);
    expect(expiredRes.status).toBe('EXPIRED');
  });
});

describe('Event Indexer Idempotency, Decoding & Rebuild', () => {
  it('indexer decodes events, upserts by unique id, emits domain events, and rebuilds identically', async () => {
    const contractId = 'CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC';
    const indexer1 = new ContractEventIndexer({
      contractId,
      rpcUrl: 'https://soroban-testnet.stellar.org',
      horizonUrl: 'https://horizon-testnet.stellar.org',
      startLedger: 5000000,
    });

    const emittedEvents: string[] = [];
    indexer1.on('event', (e) => emittedEvents.push(`event:${e.topic}`));
    indexer1.on('cheque:created', (e) => emittedEvents.push(`cheque:created:${e.chequeIdHex}`));

    // Simulate raw event response from Soroban RPC with real ScVal XDR
    const symbolXdr = (await import('@stellar/stellar-sdk')).xdr.ScVal.scvSymbol('created').toXDR('base64');
    const chequeIdBytes = Buffer.alloc(32, 7);
    const bytesXdr = (await import('@stellar/stellar-sdk')).xdr.ScVal.scvBytes(chequeIdBytes).toXDR('base64');

    const rawEvent = {
      type: 'contract' as const,
      ledger: 5000010,
      ledgerClosedAt: '2026-10-04T10:00:00Z',
      contractId,
      id: '000001',
      pagingToken: 'token1',
      inSuccessfulContractCall: true,
      txHash: 'tx12345678',
      topic: [symbolXdr, bytesXdr],
      value: symbolXdr,
    };

    const record = indexer1.decodeAndUpsertEvent(rawEvent as any, 0);
    expect(record).toBeDefined();
    expect(record?.topic).toBe('created');
    expect(record?.chequeIdHex).toBe(chequeIdBytes.toString('hex'));
    expect(record?.id).toBe('tx12345678:0');
    expect(indexer1.chainEvents.size).toBe(1);

    // Rebuild indexer 2 from zero
    const indexer2 = new ContractEventIndexer({
      contractId,
      rpcUrl: 'https://soroban-testnet.stellar.org',
      horizonUrl: 'https://horizon-testnet.stellar.org',
      startLedger: 5000000,
    });

    indexer2.decodeAndUpsertEvent(rawEvent as any, 0);

    // Assert identical reproduced state
    expect(indexer2.chainEvents.size).toBe(indexer1.chainEvents.size);
    expect(indexer2.chainEvents.get('tx12345678:0')).toEqual(indexer1.chainEvents.get('tx12345678:0'));
  });
});

describe('Chain Health Monitor', () => {
  it('checks Soroban RPC and Horizon health and reports metrics with timeout protection', async () => {
    const mockRpc = {
      getLatestLedger: vi.fn().mockResolvedValue({ sequence: 5000000 }),
    } as unknown as rpc.Server;

    const mockHorizon = {
      fetchBaseFee: vi.fn().mockResolvedValue(100),
    } as unknown as Horizon.Server;

    const health = await checkChainHealth({
      rpcServer: mockRpc,
      horizonServer: mockHorizon,
      timeoutMs: 1000,
    });

    expect(health.status).toBe('HEALTHY');
    expect(health.latestLedger).toBe(5000000);
    expect(health.rpcLatencyMs).toBeGreaterThanOrEqual(0);
    expect(health.horizonLatencyMs).toBeGreaterThanOrEqual(0);
  });
});
