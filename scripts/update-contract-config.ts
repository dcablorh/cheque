/**
 * Updates the on-chain config of the DEPLOYED cheque escrow contract (admin-only
 * `set_config`). Fetches the live config, overrides min/max amounts, submits, and
 * verifies by reading back.
 *
 * Usage: pnpm tsx scripts/update-contract-config.ts
 * Requires CONTRACT_ADMIN_SECRET and CHEQUE_CONTRACT_ID (from .env.local).
 */
import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';
import { Keypair } from '@stellar/stellar-sdk';
import { ChequeContractClient, EnvKeypairSigner } from '../packages/chain/src/index.js';

const envLocalPath = path.resolve(process.cwd(), '.env.local');
if (fs.existsSync(envLocalPath)) {
  dotenv.config({ path: envLocalPath });
} else {
  dotenv.config();
}

const SOROBAN_RPC_URL = process.env.STELLAR_SOROBAN_RPC_URL || 'https://soroban-testnet.stellar.org';
const NETWORK_PASSPHRASE = process.env.STELLAR_NETWORK_PASSPHRASE || 'Test SDF Network ; September 2015';

// New limits: per-currency fiat minimums (1.5 in each currency) are enforced app-side;
// the on-chain floor is just a sanity bound. Max covers a 1,000,000 cheque in any currency.
const NEW_MIN_STROOPS = 1_000n; // 0.0001 USDC
const NEW_MAX_STROOPS = 10_000_000_000_000n; // 1,000,000 USDC

async function main() {
  const adminSecret = process.env.CONTRACT_ADMIN_SECRET;
  const contractId = process.env.CHEQUE_CONTRACT_ID;
  if (!adminSecret) throw new Error('CONTRACT_ADMIN_SECRET is missing. Run pnpm bootstrap:testnet first.');
  if (!contractId) throw new Error('CHEQUE_CONTRACT_ID is missing.');

  const client = new ChequeContractClient({
    rpcUrl: SOROBAN_RPC_URL,
    networkPassphrase: NETWORK_PASSPHRASE,
    contractId,
  });

  const current = await client.getConfig();
  console.log('Current on-chain config:');
  console.log(`  minAmount     : ${current.minAmount} stroops`);
  console.log(`  maxAmount     : ${current.maxAmount} stroops`);
  console.log(`  maxLockSecs   : ${current.maxLockSecs}`);
  console.log(`  delayThreshold: ${current.delayThreshold} stroops`);
  console.log(`  delaySecs     : ${current.delaySecs}`);
  console.log(`  paused        : ${current.paused}`);

  if (current.minAmount === NEW_MIN_STROOPS && current.maxAmount === NEW_MAX_STROOPS) {
    console.log('\nConfig already up to date; nothing to do.');
    return;
  }

  const next = { ...current, minAmount: NEW_MIN_STROOPS, maxAmount: NEW_MAX_STROOPS };
  console.log('\nSubmitting set_config (admin)…');
  const admin = Keypair.fromSecret(adminSecret);
  const result = await client.setConfig(new EnvKeypairSigner(adminSecret), next);
  console.log(`   set_config tx: ${result.txHash} (ledger ${result.ledger})`);

  const after = await client.getConfig();
  if (after.minAmount !== NEW_MIN_STROOPS || after.maxAmount !== NEW_MAX_STROOPS) {
    throw new Error(`On-chain config mismatch after update: ${JSON.stringify(after)}`);
  }
  console.log('\n✅ Verified: min/max amounts updated on-chain.');
  console.log(`   minAmount: ${after.minAmount} stroops (0.0001 USDC floor)`);
  console.log(`   maxAmount: ${after.maxAmount} stroops (1,000,000 USDC)`);
}

main().catch((e) => {
  console.error(`\n❌ ${String((e as Error).message ?? e)}`);
  process.exit(1);
});
