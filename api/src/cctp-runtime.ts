import type { Pool } from 'pg';
import type { Env } from '@cheque/shared';
import type { OutboxItem } from '@cheque/core';
import { CctpAdapter, defaultCctpContracts, irisUrlForNetwork } from '@cheque/chain';
import { logger } from '@cheque/shared';
import { createCctpOperationHandler } from './cctp-handler.js';

export function buildCctpAdapterFromEnv(env: Env): CctpAdapter | undefined {
  if (!env.SETTLEMENT_ACCOUNT_SECRET) {
    logger.warn('SETTLEMENT_ACCOUNT_SECRET missing; Stellar→Base/Solana CCTP claims are DISABLED.');
    return undefined;
  }
  const defaults = defaultCctpContracts(env.STELLAR_NETWORK);
  return new CctpAdapter(
    {
      irisUrl: env.IRIS_API_URL ?? irisUrlForNetwork(env.STELLAR_NETWORK),
      rpcUrl: env.STELLAR_SOROBAN_RPC_URL,
      networkPassphrase: env.STELLAR_NETWORK_PASSPHRASE,
      usdcSac: env.USDC_SAC_CONTRACT_ID ?? defaults.usdcSac,
      tokenMessengerMinter: env.CCTP_TOKEN_MESSENGER_MINTER ?? defaults.tokenMessengerMinter,
      solanaRpcUrl:
        env.SOLANA_RPC_URL ??
        (env.STELLAR_NETWORK === 'PUBLIC' ? 'https://api.mainnet-beta.solana.com' : 'https://api.devnet.solana.com'),
      solanaUsdcMint: env.SOLANA_USDC_MINT ?? defaults.solanaUsdcMint,
    },
    env.SETTLEMENT_ACCOUNT_SECRET,
  );
}

export function buildCctpHandlerFromEnv(
  env: Env,
  pool: Pool,
  adapter?: CctpAdapter,
): ((item: OutboxItem) => Promise<void>) | undefined {
  const cctp = adapter ?? buildCctpAdapterFromEnv(env);
  if (!cctp) return undefined;
  return createCctpOperationHandler({ pool, adapter: cctp });
}
