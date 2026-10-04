import pg from 'pg';
import Redis from 'ioredis';
import { Queue, Worker, Job } from 'bullmq';
import { OutboxItem } from './types.js';
import { getPool } from './db.js';

export type OutboxHandler = (item: OutboxItem) => Promise<void>;

export interface OutboxProcessorConfig {
  pollIntervalMs?: number;
  batchSize?: number;
  lockTimeoutMs?: number;
  redisUrl?: string;
  redisClient?: Redis;
}

export class OutboxProcessor {
  private pool: pg.Pool;
  private handlers = new Map<string, OutboxHandler>();
  private isRunning = false;
  private timer?: NodeJS.Timeout;
  private config: OutboxProcessorConfig;
  private bullQueue?: Queue;
  private bullWorker?: Worker;

  constructor(pool?: pg.Pool, config: OutboxProcessorConfig = {}) {
    this.pool = pool ?? getPool();
    this.config = {
      pollIntervalMs: 1000,
      batchSize: 10,
      lockTimeoutMs: 30000,
      ...config,
    };

    // If Redis is configured, initialize BullMQ
    const redisConn = config.redisClient ?? (config.redisUrl ? new Redis(config.redisUrl, { maxRetriesPerRequest: null }) : undefined);
    if (redisConn) {
      this.bullQueue = new Queue('cheque-outbox', { connection: redisConn as any });
    }
  }

  registerHandler(topic: string, handler: OutboxHandler): void {
    this.handlers.set(topic, handler);
  }

  start(): void {
    if (this.isRunning) return;
    this.isRunning = true;
    this.scheduleNextPoll();

    // Start BullMQ worker if queue is active
    if (this.bullQueue && !this.bullWorker) {
      const conn = (this.bullQueue.opts.connection as any);
      this.bullWorker = new Worker(
        'cheque-outbox',
        async (job: Job) => {
          const item = job.data as OutboxItem;
          const handler = this.handlers.get(item.topic);
          if (handler) {
            await handler(item);
          }
        },
        { connection: conn }
      );
    }
  }

  stop(): void {
    this.isRunning = false;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }
    if (this.bullWorker) {
      this.bullWorker.close();
      this.bullWorker = undefined;
    }
  }

  private scheduleNextPoll(): void {
    if (!this.isRunning) return;
    this.timer = setTimeout(async () => {
      try {
        await this.pollAndProcess();
      } catch {
        // Poll error handling
      } finally {
        this.scheduleNextPoll();
      }
    }, this.config.pollIntervalMs);
  }

  /**
   * Polls pending outbox records using Postgres `FOR UPDATE SKIP LOCKED`.
   * Applies exponential backoff on retryable failures, and moves to DEAD_LETTER after max_attempts.
   */
  async pollAndProcess(limit = this.config.batchSize): Promise<number> {
    const client = await this.pool.connect();
    let processedCount = 0;

    try {
      await client.query('BEGIN');

      // Fetch pending items with row-level lock skipping locked rows
      const selectQuery = `
        SELECT
          id,
          topic,
          aggregate_type AS "aggregateType",
          aggregate_id AS "aggregateId",
          payload,
          status,
          attempts,
          max_attempts AS "maxAttempts",
          backoff_ms AS "backoffMs",
          next_run_at AS "nextRunAt",
          locked_at AS "lockedAt",
          locked_by AS "lockedBy",
          last_error AS "lastError",
          created_at AS "createdAt",
          updated_at AS "updatedAt"
        FROM outbox
        WHERE status IN ('PENDING', 'FAILED')
          AND next_run_at <= NOW()
        ORDER BY created_at ASC
        LIMIT $1
        FOR UPDATE SKIP LOCKED;
      `;

      const res = await client.query(selectQuery, [limit]);
      const items = res.rows as OutboxItem[];

      for (const item of items) {
        // Mark as PROCESSING
        await client.query(
          `
          UPDATE outbox
          SET status = 'PROCESSING',
              locked_at = NOW(),
              updated_at = NOW()
          WHERE id = $1;
          `,
          [item.id]
        );

        const handler = this.handlers.get(item.topic);

        if (!handler) {
          // If no handler is registered, mark as completed or enqueue to BullMQ
          if (this.bullQueue) {
            await this.bullQueue.add(item.topic, item, {
              attempts: item.maxAttempts,
              backoff: { type: 'exponential', delay: item.backoffMs },
            });
          }
          await client.query(
            `
            UPDATE outbox
            SET status = 'COMPLETED',
                updated_at = NOW()
            WHERE id = $1;
            `,
            [item.id]
          );
          processedCount++;
          continue;
        }

        try {
          await handler(item);

          // Success: Mark COMPLETED
          await client.query(
            `
            UPDATE outbox
            SET status = 'COMPLETED',
                locked_at = NULL,
                updated_at = NOW()
            WHERE id = $1;
            `,
            [item.id]
          );
          processedCount++;
        } catch (err: unknown) {
          const errMsg = err instanceof Error ? err.message : String(err);
          const nextAttempt = item.attempts + 1;

          if (nextAttempt >= item.maxAttempts) {
            // Dead-letter: max attempts exceeded
            await client.query(
              `
              UPDATE outbox
              SET status = 'DEAD_LETTER',
                  attempts = $1,
                  last_error = $2,
                  locked_at = NULL,
                  updated_at = NOW()
              WHERE id = $3;
              `,
              [nextAttempt, errMsg, item.id]
            );
          } else {
            // Exponential backoff
            const delayMs = item.backoffMs * Math.pow(2, item.attempts);
            await client.query(
              `
              UPDATE outbox
              SET status = 'FAILED',
                  attempts = $1,
                  last_error = $2,
                  next_run_at = NOW() + ($3 || ' milliseconds')::interval,
                  locked_at = NULL,
                  updated_at = NOW()
              WHERE id = $4;
              `,
              [nextAttempt, errMsg, delayMs, item.id]
            );
          }
        }
      }

      await client.query('COMMIT');
      return processedCount;
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  }
}
