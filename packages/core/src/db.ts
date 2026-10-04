import pg from 'pg';
const { Pool } = pg;

let pool: pg.Pool | null = null;

export interface DbConfig {
  connectionString?: string;
  max?: number;
  idleTimeoutMillis?: number;
  connectionTimeoutMillis?: number;
}

export function getPool(config?: DbConfig): pg.Pool {
  if (!pool) {
    const connectionString =
      config?.connectionString ||
      process.env.DATABASE_URL ||
      'postgresql://cheque_user:cheque_password@localhost:5432/cheque_db';

    pool = new Pool({
      connectionString,
      max: config?.max ?? 20,
      idleTimeoutMillis: config?.idleTimeoutMillis ?? 30000,
      connectionTimeoutMillis: config?.connectionTimeoutMillis ?? 5000,
    });
  }
  return pool;
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

/**
 * Executes a callback within a managed PostgreSQL transaction (BEGIN ... COMMIT / ROLLBACK).
 */
export async function withTransaction<T>(
  callback: (client: pg.PoolClient) => Promise<T>,
  existingClient?: pg.PoolClient
): Promise<T> {
  if (existingClient) {
    return callback(existingClient);
  }

  const p = getPool();
  const client = await p.connect();

  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}
