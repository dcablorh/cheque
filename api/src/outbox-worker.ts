import { OutboxProcessor, OutboxItem, getPool } from '@cheque/core';
import { logger } from '@cheque/shared';

import type { EmailClient } from '@cheque/notify';

export interface OutboxWorkerDependencies {
  redisUrl?: string;
  onChainOperation?: (item: OutboxItem) => Promise<void>;
  emailClient?: EmailClient;
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

  // Handler for recipient email alerts (PRD v4).
  processor.registerHandler('email:cheque:alert', async (item: OutboxItem) => {
    if (!deps.emailClient) {
      throw new Error('No email client configured; cannot send cheque alert');
    }
    const to = String((item.payload as any)?.to ?? '');
    if (!to) throw new Error('Missing recipient email in alert payload');
    await deps.emailClient.sendEmail({
      to,
      subject: 'You received a sencheq cheque',
      text: `You have received a digital cheque. Open the link to claim it: ${process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3100'}/c/<token>`,
    });
    logger.info(`[Outbox] Sent cheque alert email to ${to}`);
  });

  return processor;
}
