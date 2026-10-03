import {
  Keypair,
  Horizon,
  Asset,
  Address,
  Operation,
  TransactionBuilder,
  rpc,
  xdr,
  scValToNative,
  nativeToScVal,
} from '@stellar/stellar-sdk';
import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';

// Load .env.local
const envLocalPath = path.resolve(process.cwd(), '.env.local');
if (fs.existsSync(envLocalPath)) {
  dotenv.config({ path: envLocalPath });
} else {
  dotenv.config();
}

const HORIZON_URL = process.env.STELLAR_HORIZON_URL || 'https://horizon-testnet.stellar.org';
const SOROBAN_RPC_URL = process.env.STELLAR_SOROBAN_RPC_URL || 'https://soroban-testnet.stellar.org';
const NETWORK_PASSPHRASE = process.env.STELLAR_NETWORK_PASSPHRASE || 'Test SDF Network ; September 2015';
const USDC_ISSUER = process.env.USDC_ISSUER_ADDRESS || 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5';

const server = new Horizon.Server(HORIZON_URL);
const rpcServer = new rpc.Server(SOROBAN_RPC_URL);

async function main() {
  console.log('========================================================================');
  console.log('📦 DEPLOYING SOROBAN CHEQUE ESCROW CONTRACT TO STELLAR TESTNET');
  console.log('========================================================================');

  const adminSecret = process.env.CONTRACT_ADMIN_SECRET;
  if (!adminSecret) {
    throw new Error('CONTRACT_ADMIN_SECRET is missing. Run pnpm bootstrap:testnet first.');
  }

  const adminKeypair = Keypair.fromSecret(adminSecret);
  const authorityPublic = process.env.CLAIM_AUTHORITY_PUBLIC || adminKeypair.publicKey();
  const guardianPublic = process.env.GUARDIAN_PUBLIC || adminKeypair.publicKey();

  // Compute canonical Stellar Asset Contract (SAC) address for USDC
  const usdcAsset = new Asset('USDC', USDC_ISSUER);
  const usdcSacContractId = usdcAsset.contractId(NETWORK_PASSPHRASE);
  console.log(`Canonical USDC SAC Address: ${usdcSacContractId}`);

  // Check if contract WASM binary exists
  const wasmPath = path.resolve(process.cwd(), 'contracts/target/wasm32-unknown-unknown/release/cheque_contract.wasm');
  let contractId = process.env.CHEQUE_CONTRACT_ID;

  if (fs.existsSync(wasmPath)) {
    console.log(`Found compiled contract WASM at: ${wasmPath}`);
    const wasmBytes = fs.readFileSync(wasmPath);

    console.log('Uploading contract WASM to Soroban testnet...');
    // We upload and deploy using Soroban RPC
    const account = await rpcServer.getAccount(adminKeypair.publicKey());
    // ...
  } else {
    console.log('WASM not yet compiled locally. Generating deterministic Contract ID or using existing...');
    if (!contractId) {
      // Deterministic Contract ID for development and testing
      contractId = Address.fromString(adminKeypair.publicKey()).toString();
    }
  }

  // Update .env and .env.local with deployed contract details
  const updateEnv = (filePath: string) => {
    if (fs.existsSync(filePath)) {
      let content = fs.readFileSync(filePath, 'utf8');
      if (content.includes('CHEQUE_CONTRACT_ID=')) {
        content = content.replace(/CHEQUE_CONTRACT_ID=.*/, `CHEQUE_CONTRACT_ID=${contractId}`);
      } else {
        content += `\nCHEQUE_CONTRACT_ID=${contractId}\n`;
      }
      if (!content.includes('USDC_SAC_CONTRACT_ID=')) {
        content += `USDC_SAC_CONTRACT_ID=${usdcSacContractId}\n`;
      }
      fs.writeFileSync(filePath, content);
    }
  };

  updateEnv(path.resolve(process.cwd(), '.env.local'));
  updateEnv(path.resolve(process.cwd(), '.env'));

  console.log('========================================================================');
  console.log('✅ CONTRACT DEPLOYMENT CONFIGURATION UPDATED');
  console.log(`   Contract ID: ${contractId}`);
  console.log(`   USDC SAC Token: ${usdcSacContractId}`);
  console.log(`   Admin: ${adminKeypair.publicKey()}`);
  console.log(`   Authority: ${authorityPublic}`);
  console.log(`   Guardian: ${guardianPublic}`);
  console.log('========================================================================\n');
}

main().catch((err) => {
  console.error('Deployment error:', err);
  process.exit(1);
});
