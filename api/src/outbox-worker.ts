import { OutboxProcessor, OutboxItem, getPool, type OutboxHandler } from '@cheque/core';
import { logger } from '@cheque/shared';

import type { EmailClient } from '@cheque/notify';
import type { Pool } from 'pg';

type EmailSender = Pick<EmailClient, 'sendEmail'>;

export interface OutboxWorkerDependencies {
  redisUrl?: string;
  onChainOperation?: (item: OutboxItem) => Promise<void>;
  onCctpOperation?: (item: OutboxItem) => Promise<void>;
  emailClient?: EmailClient;
}


/** Sends a funded-cheque alert only when the cheque is ACTIVE and the payload has a real claim URL. */
export function createChequeAlertHandler(emailClient?: EmailSender, db?: Pool): OutboxHandler {
  return async (item: OutboxItem) => {
    if (!emailClient) {
      throw new Error('No email client configured; cannot send cheque alert');
    }
    const payload = (item.payload ?? {}) as { to?: unknown; claimUrl?: unknown };
    const to = typeof payload.to === 'string' ? payload.to : '';
    const claimUrl = typeof payload.claimUrl === 'string' ? payload.claimUrl : '';
    if (!to) throw new Error('Missing recipient email in alert payload');
    if (!claimUrl || claimUrl.includes('<token>')) {
      throw new Error('Missing claim URL in alert payload');
    }

    const pool = db ?? getPool();
    const stateRes = await pool.query(`SELECT state FROM cheques WHERE id = $1`, [item.aggregateId]);
    const state = stateRes.rows[0]?.state as string | undefined;
    if (state !== 'ACTIVE') {
      logger.info(`[Outbox] Skipping cheque alert for ${item.aggregateId}; state is ${state ?? 'missing'}`);
      return;
    }

    await emailClient.sendEmail({
      to,
      subject: 'You received a sencheq cheque',
      text: `You have received a digital cheque. Open the link to claim it: ${claimUrl}`,
    });
    logger.info(`[Outbox] Sent cheque alert email to ${to}`);
  };
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

  processor.registerHandler('chain:cctp', async (item: OutboxItem) => {
    if (!deps.onCctpOperation) {
      throw new Error(`No CCTP handler configured; cannot execute ${String((item.payload as { operation?: string }).operation)} for ${item.aggregateId}`);
    }
    logger.info(`[Outbox] Executing CCTP operation for aggregate ${item.aggregateId}`);
    await deps.onCctpOperation(item);
  });

  processor.registerHandler('email:cheque:alert', createChequeAlertHandler(deps.emailClient));

  return processor;
}
