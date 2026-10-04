import Redis from 'ioredis';
import { Account, Keypair, TransactionBuilder, FeeBumpTransaction, Transaction } from '@stellar/stellar-sdk';
import { KeySigner, EnvKeypairSigner } from './signer.js';
import { logger } from '@cheque/shared';
import crypto from 'node:crypto';

export interface ChannelPoolConfig {
  redisUrl?: string;
  redisClient?: Redis;
  channelSecrets: string[];
  feeSourceSecret?: string;
  leaseTtlSeconds?: number;
  maxWaitMs?: number;
}

export class ChannelPool {
  private redis?: Redis;
  private channelSigners: EnvKeypairSigner[];
  private channelPublicKeys: string[];
  public readonly feeSigner?: EnvKeypairSigner;
  private leaseTtl: number;
  private maxWaitMs: number;
  private inMemoryLeases = new Map<string, { leaseId: string; expiresAt: number }>();

  constructor(config: ChannelPoolConfig) {
    this.leaseTtl = config.leaseTtlSeconds ?? 30;
    this.maxWaitMs = config.maxWaitMs ?? 30000;

    if (config.redisClient) {
      this.redis = config.redisClient;
    } else if (config.redisUrl) {
      this.redis = new Redis(config.redisUrl, { lazyConnect: true, maxRetriesPerRequest: 1 });
    }

    this.channelSigners = config.channelSecrets.map((s) => new EnvKeypairSigner(s));
    this.channelPublicKeys = config.channelSecrets.map((s) => Keypair.fromSecret(s).publicKey());

    if (config.feeSourceSecret) {
      this.feeSigner = new EnvKeypairSigner(config.feeSourceSecret);
    }
  }

  async init(): Promise<void> {
    if (this.redis && this.redis.status === 'wait') {
      await this.redis.connect().catch((err) => {
        logger.warn(`Redis connection failed for ChannelPool, falling back to in-memory leases: ${err.message}`);
        this.redis = undefined;
      });
    }
  }

  getChannelCount(): number {
    return this.channelSigners.length;
  }

  getChannelPublicKeys(): string[] {
    return [...this.channelPublicKeys];
  }

  async getPoolStats(): Promise<{ total: number; available: number; leased: number }> {
    const total = this.channelSigners.length;
    let leased = 0;

    for (const pubKey of this.channelPublicKeys) {
      const key = `cheque:channel:lease:${pubKey}`;
      if (this.redis) {
        try {
          const val = await this.redis.get(key);
          if (val) leased++;
          continue;
        } catch {
          // fallback to memory
        }
      }
      const mem = this.inMemoryLeases.get(key);
      if (mem && mem.expiresAt > Date.now()) {
        leased++;
      }
    }

    return {
      total,
      available: Math.max(0, total - leased),
      leased,
    };
  }

  /**
   * Leases a channel account for a single transaction, executes the callback,
   * and guarantees release of the channel account lease upon completion or failure.
   */
  async withLeasedChannel<T>(
    callback: (channelSigner: KeySigner, channelPublicKey: string) => Promise<T>
  ): Promise<T> {
    if (this.channelSigners.length === 0) {
      throw new Error('No channel accounts configured in ChannelPool');
    }

    const startTime = Date.now();
    const leaseId = crypto.randomUUID();

    while (Date.now() - startTime < this.maxWaitMs) {
      // Shuffle channel order to balance load across pool
      const indices = Array.from({ length: this.channelSigners.length }, (_, i) => i)
        .sort(() => Math.random() - 0.5);

      for (const i of indices) {
        const signer = this.channelSigners[i];
        const pubKey = this.channelPublicKeys[i];

        const acquired = await this.acquireLease(pubKey, leaseId);
        if (acquired) {
          try {
            return await callback(signer, pubKey);
          } finally {
            await this.releaseLease(pubKey, leaseId);
          }
        }
      }

      // Jitter backoff before retrying
      await new Promise((r) => setTimeout(r, 100 + Math.random() * 200));
    }

    throw new Error('ChannelPool timeout: all channel accounts are currently leased');
  }

  private async acquireLease(publicKey: string, leaseId: string): Promise<boolean> {
    const key = `cheque:channel:lease:${publicKey}`;

    if (this.redis) {
      try {
        const res = await this.redis.set(key, leaseId, 'EX', this.leaseTtl, 'NX');
        return res === 'OK';
      } catch (err) {
        // Fall back to memory on Redis error
      }
    }

    // In-memory leasing fallback
    const existing = this.inMemoryLeases.get(key);
    const now = Date.now();
    if (!existing || existing.expiresAt <= now) {
      this.inMemoryLeases.set(key, { leaseId, expiresAt: now + this.leaseTtl * 1000 });
      return true;
    }
    return false;
  }

  private async releaseLease(publicKey: string, leaseId: string): Promise<void> {
    const key = `cheque:channel:lease:${publicKey}`;

    if (this.redis) {
      try {
        const luaScript = `
          if redis.call("get", KEYS[1]) == ARGV[1] then
            return redis.call("del", KEYS[1])
          else
            return 0
          end
        `;
        await this.redis.eval(luaScript, 1, key, leaseId);
        return;
      } catch (err) {
        // Fall back to memory
      }
    }

    const existing = this.inMemoryLeases.get(key);
    if (existing && existing.leaseId === leaseId) {
      this.inMemoryLeases.delete(key);
    }
  }

  /**
   * Applies fee-bump from fee-source account to guarantee priority and absorb transaction fees.
   */
  async feeBumpTransaction(
    innerTx: Transaction,
    networkPassphrase: string,
    maxFee = '500000'
  ): Promise<FeeBumpTransaction> {
    if (!this.feeSigner) {
      throw new Error('No fee-source account configured for fee-bump');
    }

    const feeSourcePub = await this.feeSigner.getPublicKey();
    const feeBumpTx = TransactionBuilder.buildFeeBumpTransaction(
      feeSourcePub,
      maxFee,
      innerTx,
      networkPassphrase
    );

    await this.feeSigner.signTransaction(feeBumpTx);
    return feeBumpTx;
  }
}
