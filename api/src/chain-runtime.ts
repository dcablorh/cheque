import type { Pool } from 'pg';
import {
  ChequeContractClient,
  ChannelPool,
  EnvKeypairSigner,
  SubmissionIdempotencyStore,
} from '@cheque/chain';
import type { Env } from '@cheque/shared';
import { logger } from '@cheque/shared';
import { createChainOperationHandler, createPgChainTxStore, type ChainOperationPayload } from './chain-handler.js';
import type { OutboxItem } from '@cheque/core';

/**
 * Builds the real outbox handler for `chain:contract:submit` from environment config.
 * Returns undefined (and logs why) when the chain is not fully configured, so the outbox
 * fails items visibly instead of pretending they succeeded.
 */
export async function buildChainHandlerFromEnv(
  env: Env,
  pool: Pool,
  onApplied?: (item: OutboxItem, payload: ChainOperationPayload) => Promise<void>
): Promise<{ handler: (item: OutboxItem) => Promise<void>; fundingPublicKey: string; client: ChequeContractClient } | undefined> {
  const contractId = env.CHEQUE_CONTRACT_ID;
  if (!contractId || !contractId.startsWith('C')) {
    logger.warn('CHEQUE_CONTRACT_ID is not a deployed contract id; chain operations are DISABLED (run pnpm deploy:contract).');
    return undefined;
  }
  if (!env.FUNDING_ACCOUNT_SECRET || !env.CLAIM_AUTHORITY_SECRET) {
    logger.warn('FUNDING_ACCOUNT_SECRET / CLAIM_AUTHORITY_SECRET missing; chain operations are DISABLED.');
    return undefined;
  }

  // Disable the channel pool for now: its leased signer caused tx_bad_auth_extra on Soroban.
  // Transactions are signed directly by the funder/authority accounts.
  const channelSecrets: string[] = [];

  const idempotencyStore = new SubmissionIdempotencyStore({ redisUrl: env.REDIS_URL });
  await idempotencyStore.init();

  let channelPool: ChannelPool | undefined;

  const client = new ChequeContractClient({
    rpcUrl: env.STELLAR_SOROBAN_RPC_URL,
    networkPassphrase: env.STELLAR_NETWORK_PASSPHRASE,
    contractId,
    channelPool,
    idempotencyStore,
  });

  const funder = new EnvKeypairSigner(env.FUNDING_ACCOUNT_SECRET);
  const handler = createChainOperationHandler({
    client,
    funder,
    authority: new EnvKeypairSigner(env.CLAIM_AUTHORITY_SECRET),
    store: createPgChainTxStore(pool),
    onApplied,
  });
  return { handler, fundingPublicKey: await funder.getPublicKey(), client };
}
