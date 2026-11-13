import {
  Keypair,
  Asset,
  Address,
  Operation,
  TransactionBuilder,
  Transaction,
  rpc,
} from '@stellar/stellar-sdk';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import dotenv from 'dotenv';
import { ChequeContractClient, EnvKeypairSigner } from '../packages/chain/src/index.js';

const envLocalPath = path.resolve(process.cwd(), '.env.local');
if (fs.existsSync(envLocalPath)) {
  dotenv.config({ path: envLocalPath });
} else {
  dotenv.config();
}

const SOROBAN_RPC_URL = process.env.STELLAR_SOROBAN_RPC_URL || 'https://soroban-testnet.stellar.org';
const NETWORK_PASSPHRASE = process.env.STELLAR_NETWORK_PASSPHRASE || 'Test SDF Network ; September 2015';
const USDC_ISSUER = process.env.USDC_ISSUER_ADDRESS || 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5';
const USDC_CODE = process.env.USDC_ASSET_CODE || 'USDC';
const WASM_PATH = path.resolve(
  process.cwd(),
  'contract/target/wasm32v1-none/release/cheque_contract.wasm'
);

const rpcServer = new rpc.Server(SOROBAN_RPC_URL);

/** Mirrors the contract defaults documented in docs/CONTRACT.md. */
const DEFAULT_CONFIG = {
  minAmount: 10_000_000n, // 1 USDC
  maxAmount: 20_000_000_000n, // 2,000 USDC
  maxLockSecs: 3600,
  delayThreshold: 500_000_000n, // 50 USDC
  delaySecs: 900,
  paused: false,
};

async function submit(admin: Keypair, build: (b: TransactionBuilder) => TransactionBuilder) {
  const account = await rpcServer.getAccount(admin.publicKey());
  const builder = new TransactionBuilder(account, {
    fee: '100000',
    networkPassphrase: NETWORK_PASSPHRASE,
  });
  const tx: Transaction = build(builder).setTimeout(60).build();
  const prepared = await rpcServer.prepareTransaction(tx);
  prepared.sign(admin);

  const sent = await rpcServer.sendTransaction(prepared);
  if (sent.status === 'ERROR') {
    throw new Error(`Transaction rejected: ${JSON.stringify(sent.errorResult ?? sent)}`);
  }
  const result = await rpcServer.pollTransaction(sent.hash, { attempts: 40 });
  if (result.status !== rpc.Api.GetTransactionStatus.SUCCESS) {
    throw new Error(`Transaction ${sent.hash} did not succeed: ${result.status}`);
  }
  return { hash: sent.hash, returnValue: result.returnValue };
}

function setEnvVar(filePath: string, key: string, value: string) {
  if (!fs.existsSync(filePath)) return;
  let content = fs.readFileSync(filePath, 'utf8');
  const line = `${key}=${value}`;
  const re = new RegExp(`^${key}=.*$`, 'm');
  content = re.test(content) ? content.replace(re, line) : `${content.trimEnd()}\n${line}\n`;
  fs.writeFileSync(filePath, content);
}

async function existingContractIsLive(contractId: string | undefined): Promise<boolean> {
  if (!contractId || !contractId.startsWith('C')) return false;
  try {
    const client = new ChequeContractClient({
      rpcUrl: SOROBAN_RPC_URL,
      networkPassphrase: NETWORK_PASSPHRASE,
      contractId,
    });
    await client.getConfig();
    return true;
  } catch {
    return false;
  }
}

async function main() {
  const force = process.argv.includes('--redeploy');

  console.log('========================================================================');
  console.log('📦 DEPLOYING SOROBAN CHEQUE ESCROW CONTRACT');
  console.log(`   Network: ${NETWORK_PASSPHRASE}`);
  console.log('========================================================================');

  const adminSecret = process.env.CONTRACT_ADMIN_SECRET;
  if (!adminSecret) {
    throw new Error('CONTRACT_ADMIN_SECRET is missing. Run pnpm bootstrap:testnet first.');
  }
  if (NETWORK_PASSPHRASE.startsWith('Public Global') && !process.argv.includes('--mainnet')) {
    throw new Error('Refusing to deploy to the public network without --mainnet.');
  }
  if (!fs.existsSync(WASM_PATH)) {
    throw new Error(
      `Contract WASM not found at ${WASM_PATH}.\n` +
        'Build it first: pnpm build:contract'
    );
  }

  const admin = Keypair.fromSecret(adminSecret);
  const authorityPublic = process.env.CLAIM_AUTHORITY_PUBLIC;
  const guardianPublic = process.env.GUARDIAN_PUBLIC;
  if (!authorityPublic || !guardianPublic) {
    throw new Error('CLAIM_AUTHORITY_PUBLIC and GUARDIAN_PUBLIC are required (run pnpm bootstrap:testnet).');
  }

  if (!force && (await existingContractIsLive(process.env.CHEQUE_CONTRACT_ID))) {
    console.log(`Contract ${process.env.CHEQUE_CONTRACT_ID} is already deployed and responding.`);
    console.log('Use --redeploy to deploy a fresh instance.');
    return;
  }

  // 1. USDC Stellar Asset Contract (SAC) must exist before it can be used as the escrow token.
  const usdc = new Asset(USDC_CODE, USDC_ISSUER);
  const sacId = usdc.contractId(NETWORK_PASSPHRASE);
  console.log(`\n1. Ensuring USDC SAC exists: ${sacId}`);
  try {
    const { hash } = await submit(admin, (b) =>
      b.addOperation(Operation.createStellarAssetContract({ asset: usdc }))
    );
    console.log(`   Deployed SAC (tx ${hash})`);
  } catch (err) {
    // Simulation fails when the SAC is already deployed, which is the normal case on testnet.
    console.log(`   SAC already deployed or not deployable here: ${String((err as Error).message).slice(0, 120)}`);
  }

  // 2. Upload WASM
  const wasm = fs.readFileSync(WASM_PATH);
  const wasmHash = crypto.createHash('sha256').update(wasm).digest();
  console.log(`\n2. Uploading WASM (${wasm.length} bytes, sha256 ${wasmHash.toString('hex').slice(0, 16)}…)`);
  const upload = await submit(admin, (b) => b.addOperation(Operation.uploadContractWasm({ wasm })));
  console.log(`   Uploaded (tx ${upload.hash})`);

  // 3. Instantiate
  console.log('\n3. Creating contract instance');
  const create = await submit(admin, (b) =>
    b.addOperation(
      Operation.createCustomContract({
        address: Address.fromString(admin.publicKey()),
        wasmHash,
        salt: crypto.randomBytes(32),
      })
    )
  );
  if (!create.returnValue) throw new Error('Contract creation returned no contract address');
  const contractId = Address.fromScVal(create.returnValue).toString();
  console.log(`   Contract ID: ${contractId} (tx ${create.hash})`);

  // 4. Initialise via the same client the API will use.
  console.log('\n4. Initialising contract (admin, authority, guardian, token, config)');
  const client = new ChequeContractClient({
    rpcUrl: SOROBAN_RPC_URL,
    networkPassphrase: NETWORK_PASSPHRASE,
    contractId,
  });
  const init = await client.init(new EnvKeypairSigner(adminSecret), {
    authority: authorityPublic,
    guardian: guardianPublic,
    token: sacId,
    config: DEFAULT_CONFIG,
  });
  console.log(`   Initialised (tx ${init.txHash})`);

  // 5. Verify by reading back through the typed decoder.
  const onChain = await client.getConfig();
  if (onChain.minAmount !== DEFAULT_CONFIG.minAmount || onChain.maxAmount !== DEFAULT_CONFIG.maxAmount) {
    throw new Error(`On-chain config mismatch: ${JSON.stringify(onChain, (_, v) => (typeof v === 'bigint' ? v.toString() : v))}`);
  }
  console.log('\n5. Verified on-chain config round-trips through the TS client');

  for (const file of ['.env.local', '.env']) {
    const p = path.resolve(process.cwd(), file);
    setEnvVar(p, 'CHEQUE_CONTRACT_ID', contractId);
    setEnvVar(p, 'USDC_SAC_CONTRACT_ID', sacId);
  }

  console.log('\n========================================================================');
  console.log('✅ CONTRACT DEPLOYED AND INITIALISED');
  console.log(`   Contract ID : ${contractId}`);
  console.log(`   USDC SAC    : ${sacId}`);
  console.log(`   Admin       : ${admin.publicKey()}`);
  console.log(`   Authority   : ${authorityPublic}`);
  console.log(`   Guardian    : ${guardianPublic}`);
  console.log('========================================================================\n');
}

main().catch((err) => {
  console.error('Deployment error:', err);
  process.exit(1);
});
