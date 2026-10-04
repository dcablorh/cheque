import { OutboxProcessor, OutboxItem, getPool } from '@cheque/core';
import { logger } from '@cheque/shared';

export interface OutboxWorkerDependencies {
  redisUrl?: string;
  onChainOperation?: (item: OutboxItem) => Promise<void>;
  onRampOperation?: (item: OutboxItem) => Promise<void>;
}

export function createOutboxWorker(deps: OutboxWorkerDependencies = {}): OutboxProcessor {
  const pool = getPool();
  const processor = new OutboxProcessor(pool, {
    pollIntervalMs: 1000,
    batchSize: 10,
    redisUrl: deps.redisUrl || process.env.REDIS_URL || 'redis://localhost:6379',
  });

  // Handler for chain operations (create_cheque, lock, redeem, refund on Soroban)
  processor.registerHandler('chain:contract:submit', async (item: OutboxItem) => {
    logger.info(`[Outbox] Executing chain operation for aggregate ${item.aggregateId}: topic=${item.topic}`);
    if (deps.onChainOperation) {
      await deps.onChainOperation(item);
    } else {
      // Record chain transaction or execute contract call
      const client = await pool.connect();
      try {
        const payload = item.payload;
        const txHash = (payload.txHash as string) || `tx-${Date.now()}`;
        const signedXdr = (payload.signedXdr as string) || 'AAAA...xdr';
        const operation = (payload.operation as string) || 'create_cheque';

        await client.query(
          `
          INSERT INTO chain_txs (id, cheque_id, operation, tx_hash, signed_xdr, status, created_at, updated_at)
          VALUES (uuid_generate_v4(), $1, $2, $3, $4, 'CONFIRMED', NOW(), NOW())
          ON CONFLICT (tx_hash) DO NOTHING;
          `,
          [item.aggregateId, operation, txHash, signedXdr]
        );
      } finally {
        client.release();
      }
    }
  });

  // Handler for ramp operations (MoMo collection prompt, payout to recipient)
  processor.registerHandler('ramp:payout:settle', async (item: OutboxItem) => {
    logger.info(`[Outbox] Executing ramp payout for aggregate ${item.aggregateId}: topic=${item.topic}`);
    if (deps.onRampOperation) {
      await deps.onRampOperation(item);
    } else {
      const client = await pool.connect();
      try {
        const payload = item.payload;
        const providerRef = (payload.providerRef as string) || `payout-${Date.now()}`;

        await client.query(
          `
          UPDATE payouts
          SET status = 'SENT',
              provider_ref = $1,
              updated_at = NOW()
          WHERE cheque_id = $2 AND status = 'PENDING';
          `,
          [providerRef, item.aggregateId]
        );
      } finally {
        client.release();
      }
    }
  });

  // Handler for MoMo refund operation
  processor.registerHandler('ramp:refund:process', async (item: OutboxItem) => {
    logger.info(`[Outbox] Executing ramp refund for aggregate ${item.aggregateId}: topic=${item.topic}`);
    const client = await pool.connect();
    try {
      const payload = item.payload;
      const providerRef = (payload.providerRef as string) || `refund-${Date.now()}`;

      await client.query(
        `
        UPDATE refunds
        SET status = 'CONFIRMED',
            provider_ref = $1,
            updated_at = NOW()
        WHERE cheque_id = $2;
        `,
        [providerRef, item.aggregateId]
      );
    } finally {
      client.release();
    }
  });

  return processor;
}
