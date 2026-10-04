import Redis from 'ioredis';
import { rpc, TransactionBuilder } from '@stellar/stellar-sdk';
import { logger } from '@cheque/shared';
import { parseContractError } from './errors.js';

export type SubmissionOp =
  | 'create'
  | 'lock'
  | 'unlock'
  | 'veto'
  | 'redeem'
  | 'cancel'
  | 'refund';

export type SubmissionStatus =
  | 'PREPARED'
  | 'SUBMITTED'
  | 'CONFIRMED'
  | 'FAILED'
  | 'EXPIRED'
  | 'NOT_FOUND';

export interface SubmissionRecord {
  chequeId: string;
  operation: SubmissionOp;
  signedXdr: string;
  txHash: string;
  status: SubmissionStatus;
  ledgerBound?: number;
  confirmedLedger?: number;
  lastError?: string;
  createdAt: string; // ISO string for JSON serialization
  updatedAt: string;
}

export interface SubmissionStoreConfig {
  redisUrl?: string;
  redisClient?: Redis;
}

export class SubmissionIdempotencyStore {
  private records = new Map<string, SubmissionRecord>();
  private redis?: Redis;

  constructor(config?: SubmissionStoreConfig) {
    if (config?.redisClient) {
      this.redis = config.redisClient;
    } else if (config?.redisUrl) {
      this.redis = new Redis(config.redisUrl, { lazyConnect: true, maxRetriesPerRequest: 1 });
    }
  }

  async init(): Promise<void> {
    if (this.redis && this.redis.status === 'wait') {
      await this.redis.connect().catch((err) => {
        logger.warn(`Redis connection failed for SubmissionIdempotencyStore, falling back to memory: ${err.message}`);
        this.redis = undefined;
      });
    }
  }

  private getKey(chequeId: string, operation: SubmissionOp): string {
    return `cheque:submission:${chequeId}:${operation}`;
  }

  /**
   * Persists the signed transaction XDR and hash BEFORE sending over the network.
   */
  async recordBeforeSend(params: {
    chequeId: string;
    operation: SubmissionOp;
    signedXdr: string;
    txHash: string;
    ledgerBound?: number;
  }): Promise<SubmissionRecord> {
    const key = this.getKey(params.chequeId, params.operation);
    const existing = await this.getRecord(params.chequeId, params.operation);

    if (existing && existing.status === 'CONFIRMED') {
      return existing;
    }

    const record: SubmissionRecord = {
      chequeId: params.chequeId,
      operation: params.operation,
      signedXdr: params.signedXdr,
      txHash: params.txHash,
      status: 'SUBMITTED',
      ledgerBound: params.ledgerBound,
      createdAt: existing?.createdAt ?? new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    this.records.set(key, record);

    if (this.redis) {
      try {
        await this.redis.set(key, JSON.stringify(record));
      } catch {
        // Fall back to memory
      }
    }

    logger.info(`Idempotency stored: [${key}] -> txHash=${params.txHash}`);
    return record;
  }

  /**
   * Checks status of an existing submission on ambiguous results or retry attempts.
   * Distinguishes: not found yet, failed, success, expired (ledger bound passed).
   * Only permits rebuild if expired!
   */
  async resolveSubmission(
    chequeId: string,
    operation: SubmissionOp,
    rpcServer: rpc.Server,
    networkPassphrase: string
  ): Promise<{
    shouldRebuild: boolean;
    status: SubmissionStatus;
    confirmedLedger?: number;
    record?: SubmissionRecord;
  }> {
    const key = this.getKey(chequeId, operation);
    const record = await this.getRecord(chequeId, operation);

    if (!record) {
      return { shouldRebuild: true, status: 'PREPARED' };
    }

    if (record.status === 'CONFIRMED') {
      return {
        shouldRebuild: false,
        status: 'CONFIRMED',
        confirmedLedger: record.confirmedLedger,
        record,
      };
    }

    try {
      const txStatus = await rpcServer.getTransaction(record.txHash);

      if (txStatus.status === rpc.Api.GetTransactionStatus.SUCCESS) {
        record.status = 'CONFIRMED';
        record.confirmedLedger = txStatus.latestLedger;
        record.updatedAt = new Date().toISOString();
        await this.saveRecord(key, record);
        return {
          shouldRebuild: false,
          status: 'CONFIRMED',
          confirmedLedger: txStatus.latestLedger,
          record,
        };
      }

      if (txStatus.status === rpc.Api.GetTransactionStatus.FAILED) {
        record.status = 'FAILED';
        record.lastError = txStatus.resultXdr?.toXDR('base64');
        record.updatedAt = new Date().toISOString();
        await this.saveRecord(key, record);
        throw parseContractError(new Error(record.lastError ?? 'Transaction failed on-chain'));
      }

      // NOT_FOUND YET: Check if ledger bound passed
      const latestLedger = await rpcServer.getLatestLedger();
      if (record.ledgerBound && latestLedger.sequence > record.ledgerBound) {
        logger.warn(
          `Transaction ${record.txHash} expired past ledger bound ${record.ledgerBound} (current ${latestLedger.sequence}). Rebuilding allowed.`
        );
        record.status = 'EXPIRED';
        record.updatedAt = new Date().toISOString();
        await this.saveRecord(key, record);
        return { shouldRebuild: true, status: 'EXPIRED', record };
      }

      // Still in flight or not found yet: resubmit the EXACT same signed XDR!
      logger.info(`Resubmitting existing signed XDR for ${key} (txHash=${record.txHash})...`);
      const tx = TransactionBuilder.fromXDR(record.signedXdr, networkPassphrase);
      await rpcServer.sendTransaction(tx as any).catch((err) => {
        logger.debug(`Resubmit send result: ${err?.message ?? err}`);
      });

      return { shouldRebuild: false, status: 'NOT_FOUND', record };
    } catch (err) {
      if (record.status === 'FAILED') throw err;
      return { shouldRebuild: false, status: record.status, record };
    }
  }

  async markConfirmed(chequeId: string, operation: SubmissionOp, ledger: number): Promise<void> {
    const key = this.getKey(chequeId, operation);
    const record = await this.getRecord(chequeId, operation);
    if (record) {
      record.status = 'CONFIRMED';
      record.confirmedLedger = ledger;
      record.updatedAt = new Date().toISOString();
      await this.saveRecord(key, record);
    }
  }

  async getRecord(chequeId: string, operation: SubmissionOp): Promise<SubmissionRecord | undefined> {
    const key = this.getKey(chequeId, operation);

    if (this.redis) {
      try {
        const raw = await this.redis.get(key);
        if (raw) {
          const parsed = JSON.parse(raw) as SubmissionRecord;
          this.records.set(key, parsed);
          return parsed;
        }
      } catch {
        // Fall back to memory
      }
    }

    return this.records.get(key);
  }

  private async saveRecord(key: string, record: SubmissionRecord): Promise<void> {
    this.records.set(key, record);
    if (this.redis) {
      try {
        await this.redis.set(key, JSON.stringify(record));
      } catch {
        // Fall back to memory
      }
    }
  }
}
