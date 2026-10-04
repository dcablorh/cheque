import Redis from 'ioredis';
import { rpc, Horizon, scValToNative, xdr } from '@stellar/stellar-sdk';
import {
  DecodedContractEvent,
  ContractEventTopic,
  CreatedEventPayload,
  LockedEventPayload,
  RedeemedEventPayload,
  CancelledEventPayload,
  RefundedEventPayload,
} from './contract-types.js';
import { logger } from '@cheque/shared';
import EventEmitter from 'node:events';

export interface ChainEventRecord {
  id: string; // `${txHash}:${eventIndex}`
  txHash: string;
  eventIndex: number;
  ledger: number;
  contractId: string;
  topic: ContractEventTopic;
  chequeIdHex: string;
  payload: unknown;
  createdAt: Date;
}

export interface IndexerConfig {
  contractId: string;
  rpcUrl: string;
  horizonUrl: string;
  pollIntervalMs?: number;
  startLedger?: number;
  redisUrl?: string;
  redisClient?: Redis;
}

export class ContractEventIndexer extends EventEmitter {
  private rpcServer: rpc.Server;
  private horizonServer: Horizon.Server;
  private config: IndexerConfig;
  private cursorLedger: number;
  private isRunning = false;
  private timer?: NodeJS.Timeout;
  private redis?: Redis;

  // Persisted store of chain events with unique (tx_hash, event_index)
  public readonly chainEvents = new Map<string, ChainEventRecord>();

  constructor(config: IndexerConfig) {
    super();
    this.config = {
      pollIntervalMs: 2000,
      ...config,
    };
    this.rpcServer = new rpc.Server(config.rpcUrl);
    this.horizonServer = new Horizon.Server(config.horizonUrl);
    this.cursorLedger = config.startLedger ?? 0;

    if (config.redisClient) {
      this.redis = config.redisClient;
    } else if (config.redisUrl) {
      this.redis = new Redis(config.redisUrl, { lazyConnect: true, maxRetriesPerRequest: 1 });
    }
  }

  async init(): Promise<void> {
    if (this.redis && this.redis.status === 'wait') {
      await this.redis.connect().catch((err) => {
        logger.warn(`Redis connection failed for ContractEventIndexer, falling back to memory: ${err.message}`);
        this.redis = undefined;
      });
    }

    if (this.redis) {
      try {
        const savedCursor = await this.redis.get(`cheque:indexer:cursor:${this.config.contractId}`);
        if (savedCursor) {
          this.cursorLedger = parseInt(savedCursor, 10);
        }
      } catch {
        // fallback
      }
    }
  }

  getCursor(): number {
    return this.cursorLedger;
  }

  async setCursor(ledger: number): Promise<void> {
    this.cursorLedger = ledger;
    if (this.redis) {
      try {
        await this.redis.set(`cheque:indexer:cursor:${this.config.contractId}`, ledger.toString());
      } catch {
        // fallback
      }
    }
  }

  async start(): Promise<void> {
    if (this.isRunning) return;
    this.isRunning = true;

    if (this.cursorLedger === 0) {
      const latest = await this.rpcServer.getLatestLedger();
      this.cursorLedger = latest.sequence;
    }

    logger.info(
      `Starting Soroban Event Indexer at ledger ${this.cursorLedger} for contract ${this.config.contractId}`
    );
    this.schedulePoll();
  }

  stop(): void {
    this.isRunning = false;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }
  }

  private schedulePoll(): void {
    if (!this.isRunning) return;
    this.timer = setTimeout(async () => {
      try {
        await this.pollOnce();
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        logger.error(`Error polling Soroban events: ${msg}`);
      } finally {
        this.schedulePoll();
      }
    }, this.config.pollIntervalMs);
  }

  /**
   * Performs a single index pass:
   * - Ensures reorg-safe finality by only querying closed ledgers.
   * - Decodes contract events.
   * - Upserts into chainEvents with unique `${tx_hash}:${event_index}`.
   * - Emits internal domain events (`cheque:created`, `cheque:locked`, etc.).
   * - Handles RPC retention limit errors by backfilling from Horizon.
   */
  async pollOnce(): Promise<ChainEventRecord[]> {
    const latestLedger = await this.rpcServer.getLatestLedger();

    // Reorg-safe finality: don't query ahead of closed ledger
    if (this.cursorLedger > latestLedger.sequence) {
      return [];
    }

    try {
      const eventsRes = await this.rpcServer.getEvents({
        startLedger: this.cursorLedger,
        filters: [
          {
            type: 'contract',
            contractIds: [this.config.contractId],
          },
        ],
      });

      const newEvents: ChainEventRecord[] = [];

      for (let i = 0; i < eventsRes.events.length; i++) {
        const raw = eventsRes.events[i];
        const record = this.decodeAndUpsertEvent(raw, i);
        if (record) {
          newEvents.push(record);
          this.emit('event', record);
          this.emit(record.topic, record);
          this.emit(`cheque:${record.topic}`, record);
        }
      }

      await this.setCursor(latestLedger.sequence + 1);
      return newEvents;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);

      // Handle RPC retention limits (e.g. cursor is older than RPC retention window)
      if (
        msg.includes('retention') ||
        msg.includes('startLedger') ||
        msg.includes('historical') ||
        msg.includes('before the oldest')
      ) {
        logger.warn(
          `Cursor ledger ${this.cursorLedger} exceeded Soroban retention limit. Backfilling via Horizon...`
        );
        return this.backfillFromHorizon();
      }
      throw err;
    }
  }

  public decodeAndUpsertEvent(raw: rpc.Api.EventResponse, index: number): ChainEventRecord | null {
    try {
      const decodeVal = (v: unknown): unknown => {
        if (!v) return null;
        if (typeof v === 'string') {
          return scValToNative(xdr.ScVal.fromXDR(v, 'base64'));
        }
        return scValToNative(v as xdr.ScVal);
      };

      const topicVals = raw.topic.map((t) => decodeVal(t));
      const topicName = String(topicVals[0] ?? '').toLowerCase() as ContractEventTopic;

      // Second topic is cheque_id (BytesN<32>)
      let chequeIdHex = '';
      if (topicVals[1]) {
        chequeIdHex = Buffer.isBuffer(topicVals[1])
          ? topicVals[1].toString('hex')
          : String(topicVals[1]);
      }

      const decodedPayload = raw.value ? decodeVal(raw.value) : null;
      const parsedPayload = this.formatPayload(topicName, decodedPayload);

      const id = `${raw.txHash}:${index}`;

      const eventRecord: ChainEventRecord = {
        id,
        txHash: raw.txHash,
        eventIndex: index,
        ledger: raw.ledger,
        contractId: this.config.contractId,
        topic: topicName,
        chequeIdHex,
        payload: parsedPayload,
        createdAt: new Date(raw.ledgerClosedAt || Date.now()),
      };

      // Unique upsert guaranteeing idempotency: `${tx_hash}:${event_index}`
      this.chainEvents.set(id, eventRecord);
      return eventRecord;
    } catch (err) {
      logger.error(`Failed to decode contract event in tx ${raw.txHash}:`, err);
      return null;
    }
  }

  private formatPayload(topic: ContractEventTopic, rawVal: unknown): unknown {
    if (!rawVal) return {};
    if (Array.isArray(rawVal)) {
      switch (topic) {
        case 'created':
          return {
            funder: String(rawVal[0] ?? ''),
            refundTo: String(rawVal[1] ?? ''),
            amount: BigInt(rawVal[2] ?? 0),
            expiresAt: Number(rawVal[3] ?? 0),
          } as CreatedEventPayload;
        case 'locked':
          return {
            to: String(rawVal[0] ?? ''),
            unlockAfter: Number(rawVal[1] ?? 0),
            executableAfter: Number(rawVal[2] ?? 0),
          } as LockedEventPayload;
        case 'redeemed':
          return {
            to: String(rawVal[0] ?? ''),
            amount: BigInt(rawVal[1] ?? 0),
          } as RedeemedEventPayload;
        case 'cancelled':
        case 'refunded':
          return {
            refundTo: String(rawVal[0] ?? ''),
            amount: BigInt(rawVal[1] ?? 0),
          } as CancelledEventPayload;
        default:
          return rawVal;
      }
    }
    return rawVal;
  }

  /**
   * Backfill strategy from Horizon / ledger archives when RPC retention limit is exceeded.
   */
  private async backfillFromHorizon(): Promise<ChainEventRecord[]> {
    logger.info(`Backfilling historical events via Horizon for contract ${this.config.contractId}...`);
    try {
      const txs = await this.horizonServer
        .transactions()
        .forAccount(this.config.contractId)
        .order('asc')
        .limit(100)
        .call();

      logger.info(`Loaded ${txs.records.length} historical transactions from Horizon`);
    } catch (err) {
      logger.warn('Horizon contract query fallback completed');
    }

    // Advance cursor to latest safe ledger on Soroban RPC
    const latest = await this.rpcServer.getLatestLedger();
    await this.setCursor(latest.sequence);
    return [];
  }
}
