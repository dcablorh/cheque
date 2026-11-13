import { OutboxProcessor, OutboxItem, getPool } from '@cheque/core';
import { logger } from '@cheque/shared';

export interface OutboxWorkerDependencies {
  redisUrl?: string;
  onChainOperation?: (item: OutboxItem) => Promise<void>;
  onRampOperation?: (item: OutboxItem) => Promise<void>;
  onRampRefund?: (item: OutboxItem) => Promise<void>;
}

export function createOutboxWorker(deps: OutboxWorkerDependencies = {}): OutboxProcessor {
  const pool = getPool();
  const processor = new OutboxProcessor(pool, {
    pollIntervalMs: 1000,
    batchSize: 10,
    redisUrl: deps.redisUrl || process.env.REDIS_URL || 'redis://localhost:6379',
  });

  // Handler for chain operations (create_cheque, lock, redeem, cancel, refund on Soroban).
  // There is deliberately NO default: a missing handler must fail the item (so it retries and
  // eventually dead-letters) rather than record a fabricated "CONFIRMED" transaction.
  processor.registerHandler('chain:contract:submit', async (item: OutboxItem) => {
    if (!deps.onChainOperation) {
      throw new Error(
        `No chain handler configured; cannot execute ${String(item.payload.operation)} for ${item.aggregateId}`
      );
    }
    logger.info(`[Outbox] Executing chain operation for aggregate ${item.aggregateId}: topic=${item.topic}`);
    await deps.onChainOperation(item);
  });

  // Ramp operations talk to the anchor; same rule — never fabricate provider references.
  processor.registerHandler('ramp:payout:settle', async (item: OutboxItem) => {
    if (!deps.onRampOperation) {
      throw new Error(`No ramp payout handler configured; cannot settle ${item.aggregateId}`);
    }
    logger.info(`[Outbox] Executing ramp payout for aggregate ${item.aggregateId}: topic=${item.topic}`);
    await deps.onRampOperation(item);
  });

  processor.registerHandler('ramp:refund:process', async (item: OutboxItem) => {
    if (!deps.onRampRefund) {
      throw new Error(`No ramp refund handler configured; cannot refund ${item.aggregateId}`);
    }
    logger.info(`[Outbox] Executing ramp refund for aggregate ${item.aggregateId}: topic=${item.topic}`);
    await deps.onRampRefund(item);
  });

  return processor;
}
