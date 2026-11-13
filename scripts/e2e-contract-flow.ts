/**
 * Real end-to-end test of the deployed cheque escrow contract on Stellar testnet,
 * driven through the same ChequeContractClient the API uses.
 *
 * Scenarios:
 *   A. create -> lock(to settlement) -> redeem   (funds really move; 2nd redeem rejected)
 *   B. create -> cancel                          (funds return; 2nd cancel rejected)
 *   C. create (short expiry) -> wait -> refund   (anyone can refund after expiry)
 *
 * Usage: pnpm e2e:contract [--skip-expiry]
 */
import {
  Keypair,
  Horizon,
  Asset,
  Operation,
  TransactionBuilder,
  BASE_FEE,
} from '@stellar/stellar-sdk';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import dotenv from 'dotenv';
import {
  ChequeContractClient,
  EnvKeypairSigner,
  ContractError,
  ContractErrorCode,
  OnChainChequeState,
  deriveChequeIdHex,
} from '../packages/chain/src/index.js';

const envLocalPath = path.resolve(process.cwd(), '.env.local');
dotenv.config(fs.existsSync(envLocalPath) ? { path: envLocalPath } : undefined);

const HORIZON_URL = process.env.STELLAR_HORIZON_URL || 'https://horizon-testnet.stellar.org';
const RPC_URL = process.env.STELLAR_SOROBAN_RPC_URL || 'https://soroban-testnet.stellar.org';
const PASSPHRASE = process.env.STELLAR_NETWORK_PASSPHRASE || 'Test SDF Network ; September 2015';
const USDC = new Asset(
  process.env.USDC_ASSET_CODE || 'USDC',
  process.env.USDC_ISSUER_ADDRESS || 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5'
);

const STROOPS = 10_000_000n;
const horizon = new Horizon.Server(HORIZON_URL);

function req(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is missing. Run pnpm bootstrap:testnet and pnpm deploy:contract first.`);
  return v;
}

async function usdcBalance(pub: string): Promise<bigint> {
  const acc = await horizon.loadAccount(pub);
  const line = acc.balances.find(
    (b) => b.asset_type !== 'native' && 'asset_code' in b && b.asset_code === USDC.code && b.asset_issuer === USDC.issuer
  );
  if (!line) return 0n;
  const [whole, frac = ''] = line.balance.split('.');
  return BigInt(whole) * STROOPS + BigInt(frac.padEnd(7, '0').slice(0, 7));
}

const fmt = (s: bigint) => `${s / STROOPS}.${(s % STROOPS).toString().padStart(7, '0')} USDC`;

let failures = 0;
function check(label: string, ok: boolean, detail = '') {
  console.log(`   ${ok ? '✅' : '❌'} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
}

async function expectContractError(label: string, code: ContractErrorCode, fn: () => Promise<unknown>) {
  try {
    await fn();
    check(label, false, 'expected failure but call succeeded');
  } catch (err) {
    const matched = err instanceof ContractError && err.code === code;
    check(label, matched, matched ? `rejected with ${ContractErrorCode[code]}` : `got: ${String((err as Error).message).slice(0, 140)}`);
  }
}

async function classicPayment(from: Keypair, to: string, amountStroops: bigint) {
  const acc = await horizon.loadAccount(from.publicKey());
  const tx = new TransactionBuilder(acc, { fee: BASE_FEE, networkPassphrase: PASSPHRASE })
    .addOperation(
      Operation.payment({
        destination: to,
        asset: USDC,
        amount: `${amountStroops / STROOPS}.${(amountStroops % STROOPS).toString().padStart(7, '0')}`,
      })
    )
    .setTimeout(60)
    .build();
  tx.sign(from);
  await horizon.submitTransaction(tx);
}

function newCheque() {
  // Off-chain id is a UUID; on-chain id is its canonical sha256 (see packages/chain/src/cheque-id.ts)
  const uuid = crypto.randomUUID();
  return { uuid, idHex: deriveChequeIdHex(uuid) };
}

async function main() {
  console.log('========================================================================');
  console.log('🧪 E2E: CHEQUE ESCROW CONTRACT VIA ChequeContractClient (REAL TESTNET)');
  console.log('========================================================================');

  const contractId = req('CHEQUE_CONTRACT_ID');
  if (!contractId.startsWith('C')) throw new Error(`CHEQUE_CONTRACT_ID is not a contract id: ${contractId}`);

  const funderKp = Keypair.fromSecret(req('FUNDING_ACCOUNT_SECRET'));
  const settlementKp = Keypair.fromSecret(req('SETTLEMENT_ACCOUNT_SECRET'));
  const funder = new EnvKeypairSigner(funderKp.secret());
  const authority = new EnvKeypairSigner(req('CLAIM_AUTHORITY_SECRET'));
  const settlementPub = settlementKp.publicKey();

  const client = new ChequeContractClient({ rpcUrl: RPC_URL, networkPassphrase: PASSPHRASE, contractId });

  console.log(`Contract   : ${contractId}`);
  const cfg = await client.getConfig();
  console.log(`Config     : min=${fmt(cfg.minAmount)} max=${fmt(cfg.maxAmount)} delayThreshold=${fmt(cfg.delayThreshold)} paused=${cfg.paused}`);
  check('contract is initialised and not paused', !cfg.paused);

  // Make sure the funder has enough USDC to run the three scenarios (2 + 1 + 1 USDC).
  const need = 4n * STROOPS;
  const have = await usdcBalance(funderKp.publicKey());
  if (have < need) {
    console.log(`\nTop-up: funder has ${fmt(have)}, moving ${fmt(need - have)} from settlement account`);
    await classicPayment(settlementKp, funderKp.publicKey(), need - have);
  }

  // ---------------------------------------------------------------- A
  console.log('\nA. create -> lock -> redeem');
  const A = newCheque();
  const amountA = 2n * STROOPS;
  const expiresA = Math.floor(Date.now() / 1000) + 3600;
  const settleBefore = await usdcBalance(settlementPub);

  const createA = await client.createCheque(funder, {
    chequeIdHex: A.idHex,
    refundTo: funderKp.publicKey(),
    amountStroops: amountA,
    expiresAt: expiresA,
  });
  check('create_cheque confirmed', !!createA.txHash, createA.txHash);

  let onChain = await client.getCheque(A.idHex);
  check('state is Active', onChain.state === OnChainChequeState.Active);
  check('amount escrowed matches', onChain.amount === amountA, fmt(onChain.amount));
  check('refund_to decoded (snake_case -> camelCase)', onChain.refundTo === funderKp.publicKey());

  await expectContractError('duplicate create_cheque rejected', ContractErrorCode.ChequeAlreadyExists, () =>
    client.createCheque(funder, {
      chequeIdHex: A.idHex,
      refundTo: funderKp.publicKey(),
      amountStroops: amountA,
      expiresAt: expiresA,
    })
  );

  await expectContractError('redeem before lock rejected', ContractErrorCode.InvalidState, () =>
    client.redeem(authority, A.idHex)
  );

  const lockA = await client.lock(authority, { chequeIdHex: A.idHex, to: settlementPub, lockSecs: 600 });
  check('lock confirmed', !!lockA.txHash, lockA.txHash);
  onChain = await client.getCheque(A.idHex);
  check('state is Locked', onChain.state === OnChainChequeState.Locked);
  const lockInfo = await client.getLock(A.idHex);
  check('get_lock returns settlement as recipient', lockInfo?.to === settlementPub, lockInfo?.to);

  await expectContractError('cancel blocked while locked', ContractErrorCode.InvalidState, () =>
    client.cancel(funder, A.idHex)
  );

  const redeemA = await client.redeem(authority, A.idHex);
  check('redeem confirmed', !!redeemA.txHash, redeemA.txHash);
  onChain = await client.getCheque(A.idHex);
  check('state is Redeemed', onChain.state === OnChainChequeState.Redeemed);
  check('lock cleared after redeem', (await client.getLock(A.idHex)) === undefined);
  const settleAfter = await usdcBalance(settlementPub);
  check('settlement account received exactly the escrowed amount', settleAfter - settleBefore === amountA, `+${fmt(settleAfter - settleBefore)}`);

  await expectContractError('second redeem rejected (single redemption)', ContractErrorCode.InvalidState, () =>
    client.redeem(authority, A.idHex)
  );

  // ---------------------------------------------------------------- B
  console.log('\nB. create -> cancel');
  const B = newCheque();
  const amountB = 1n * STROOPS;
  const funderBeforeB = await usdcBalance(funderKp.publicKey());
  await client.createCheque(funder, {
    chequeIdHex: B.idHex,
    refundTo: funderKp.publicKey(),
    amountStroops: amountB,
    expiresAt: Math.floor(Date.now() / 1000) + 3600,
  });
  const funderMidB = await usdcBalance(funderKp.publicKey());
  check('funds left the funder on create', funderBeforeB - funderMidB === amountB);
  const cancelB = await client.cancel(funder, B.idHex);
  check('cancel confirmed', !!cancelB.txHash, cancelB.txHash);
  check('state is Cancelled', (await client.getCheque(B.idHex)).state === OnChainChequeState.Cancelled);
  check('funds returned to funder', (await usdcBalance(funderKp.publicKey())) === funderBeforeB);
  await expectContractError('second cancel rejected', ContractErrorCode.InvalidState, () =>
    client.cancel(funder, B.idHex)
  );

  // ---------------------------------------------------------------- C
  if (process.argv.includes('--skip-expiry')) {
    console.log('\nC. skipped (--skip-expiry)');
  } else {
    console.log('\nC. create (30s expiry) -> early refund rejected -> wait -> refund by anyone');
    const C = newCheque();
    const amountC = 1n * STROOPS;
    const funderBeforeC = await usdcBalance(funderKp.publicKey());
    const expiresC = Math.floor(Date.now() / 1000) + 30;
    await client.createCheque(funder, {
      chequeIdHex: C.idHex,
      refundTo: funderKp.publicKey(),
      amountStroops: amountC,
      expiresAt: expiresC,
    });
    await expectContractError('refund before expiry rejected', ContractErrorCode.ChequeNotExpired, () =>
      client.refund(authority, C.idHex)
    );
    const waitMs = Math.max(0, (expiresC - Math.floor(Date.now() / 1000) + 12) * 1000);
    console.log(`   waiting ${Math.ceil(waitMs / 1000)}s for ledger time to pass expiry…`);
    await new Promise((r) => setTimeout(r, waitMs));
    // Any account may trigger the refund; use the authority key as an unrelated caller.
    const refundC = await client.refund(authority, C.idHex);
    check('refund confirmed', !!refundC.txHash, refundC.txHash);
    check('state is Refunded', (await client.getCheque(C.idHex)).state === OnChainChequeState.Refunded);
    check('funds returned to refund_to', (await usdcBalance(funderKp.publicKey())) === funderBeforeC);
  }

  console.log('\n========================================================================');
  if (failures === 0) {
    console.log('✅ ALL CONTRACT E2E CHECKS PASSED');
  } else {
    console.log(`❌ ${failures} CHECK(S) FAILED`);
    process.exitCode = 1;
  }
  console.log('========================================================================\n');
}

main().catch((err) => {
  console.error('E2E error:', err);
  process.exit(1);
});
