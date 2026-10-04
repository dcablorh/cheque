import { rpc, Horizon } from '@stellar/stellar-sdk';
import { ChannelPool } from './channel-pool.js';
import { ContractEventIndexer } from './indexer.js';

export interface ChainHealthStatus {
  status: 'HEALTHY' | 'DEGRADED' | 'DOWN';
  rpcLatencyMs: number;
  horizonLatencyMs: number;
  latestLedger: number;
  lastIndexedLedger: number;
  indexerLagLedgers: number;
  channelPool: {
    total: number;
    available: number;
    leased: number;
  };
  details?: string;
}

export async function checkChainHealth(params: {
  rpcServer: rpc.Server;
  horizonServer: Horizon.Server;
  channelPool?: ChannelPool;
  indexer?: ContractEventIndexer;
  timeoutMs?: number;
}): Promise<ChainHealthStatus> {
  const { rpcServer, horizonServer, channelPool, indexer, timeoutMs = 4000 } = params;

  let rpcLatencyMs = -1;
  let horizonLatencyMs = -1;
  let latestLedger = 0;
  let isRpcOk = false;
  let isHorizonOk = false;

  const withTimeout = <T>(promise: Promise<T>, ms: number): Promise<T> => {
    return Promise.race([
      promise,
      new Promise<T>((_, reject) =>
        setTimeout(() => reject(new Error(`Timeout after ${ms}ms`)), ms)
      ),
    ]);
  };

  // 1. Measure Soroban RPC Latency
  const rpcStart = Date.now();
  try {
    const ledger = await withTimeout(rpcServer.getLatestLedger(), timeoutMs);
    rpcLatencyMs = Date.now() - rpcStart;
    latestLedger = ledger.sequence;
    isRpcOk = true;
  } catch {
    rpcLatencyMs = -1;
  }

  // 2. Measure Horizon Latency
  const horizonStart = Date.now();
  try {
    await withTimeout(horizonServer.fetchBaseFee(), timeoutMs);
    horizonLatencyMs = Date.now() - horizonStart;
    isHorizonOk = true;
  } catch {
    horizonLatencyMs = -1;
  }

  // 3. Channel Pool Stats
  const poolStats = channelPool
    ? await channelPool.getPoolStats().catch(() => ({
        total: channelPool.getChannelCount(),
        available: channelPool.getChannelCount(),
        leased: 0,
      }))
    : { total: 0, available: 0, leased: 0 };

  // 4. Indexer Progress
  const lastIndexed = indexer?.getCursor() ?? latestLedger;
  const lag = latestLedger > 0 && lastIndexed > 0 ? Math.max(0, latestLedger - lastIndexed) : 0;

  const isHealthy = isRpcOk && isHorizonOk && rpcLatencyMs < 2000;
  const isDown = !isRpcOk && !isHorizonOk;

  return {
    status: isHealthy ? 'HEALTHY' : isDown ? 'DOWN' : 'DEGRADED',
    rpcLatencyMs,
    horizonLatencyMs,
    latestLedger,
    lastIndexedLedger: lastIndexed,
    indexerLagLedgers: lag,
    channelPool: poolStats,
  };
}
