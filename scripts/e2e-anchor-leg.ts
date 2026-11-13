/**
 * Anchor leg, end to end on testnet:
 *
 *   cheque (contract) --lock/redeem--> settlement account
 *        --SEP-6 /withdraw (memo)--> anchor instructions
 *        --classic USDC payment + memo--> anchor distribution account
 *        --poll SEP-6 /transaction--> mobile money payout status
 *
 * This is the path SEEVCASH_FINDINGS.md identified as the risk: the anchor only attributes
 * *classic* payments carrying its memo, so the escrow releases to a settlement account first.
 *
 * Usage:
 *   pnpm e2e:anchor                 full chain (creates a real 1 USDC cheque)
 *   pnpm e2e:anchor --dry-run       auth + KYC + SEP-6 withdraw initiation only; no funds move
 *   pnpm e2e:anchor --skip-contract pay the anchor straight from the settlement balance
 *
 * Env overrides: ANCHOR_HOME_DOMAIN, ANCHOR_TEST_MOMO (default 0244123456), ANCHOR_TEST_NETWORK (MTN),
 *                ANCHOR_AMOUNT_USDC (default 1)
 */
import {
  Keypair,
  Horizon,
  Asset,
  Operation,
  Memo,
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
  deriveChequeIdHex,
  OnChainChequeState,
} from '../packages/chain/src/index.js';
import { SepAnchorClient } from '../packages/ramps/src/index.js';

const envLocalPath = path.resolve(process.cwd(), '.env.local');
dotenv.config(fs.existsSync(envLocalPath) ? { path: envLocalPath } : undefined);

const DRY_RUN = process.argv.includes('--dry-run');
const SKIP_CONTRACT = process.argv.includes('--skip-contract');

const HORIZON_URL = process.env.STELLAR_HORIZON_URL || 'https://horizon-testnet.stellar.org';
const RPC_URL = process.env.STELLAR_SOROBAN_RPC_URL || 'https://soroban-testnet.stellar.org';
const PASSPHRASE = process.env.STELLAR_NETWORK_PASSPHRASE || 'Test SDF Network ; September 2015';
const HOME_DOMAIN = process.env.ANCHOR_HOME_DOMAIN || 'anchor.seevcash.com';
const MOMO_NUMBER = process.env.ANCHOR_TEST_MOMO || '0244123456';
const MOMO_NETWORK = process.env.ANCHOR_TEST_NETWORK || 'MTN';
const AMOUNT_USDC = process.env.ANCHOR_AMOUNT_USDC || '1';
const USDC = new Asset(
  process.env.USDC_ASSET_CODE || 'USDC',
  process.env.USDC_ISSUER_ADDRESS || 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5'
);

const STROOPS = 10_000_000n;
const horizon = new Horizon.Server(HORIZON_URL);

function req(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is missing. Run pnpm bootstrap:testnet / pnpm deploy:contract first.`);
  return v;
}

function toStroops(amount: string): bigint {
  const [w, f = ''] = amount.split('.');
  return BigInt(w) * STROOPS + BigInt(f.padEnd(7, '0').slice(0, 7));
}

async function usdcBalance(pub: string): Promise<bigint> {
  const acc = await horizon.loadAccount(pub);
  const line = acc.balances.find(
    (b) => b.asset_type !== 'native' && 'asset_code' in b && b.asset_code === USDC.code && b.asset_issuer === USDC.issuer
  );
  return line ? toStroops(line.balance) : 0n;
}

function memoFor(type: string | undefined, value: string): Memo {
  switch (type) {
    case 'id':
      return Memo.id(value);
    case 'hash':
      // SEP-6 specifies hash memos are base64-encoded
      return Memo.hash(Buffer.from(value, 'base64').toString('hex'));
    case 'text':
    default:
      return Memo.text(value);
  }
}

function step(n: string, title: string) {
  console.log(`\n${n}. ${title}`);
}

async function main() {
  console.log('========================================================================');
  console.log(`🌉 ANCHOR LEG ON TESTNET → ${HOME_DOMAIN}${DRY_RUN ? '  [DRY RUN]' : ''}`);
  console.log('========================================================================');

  const settlementKp = Keypair.fromSecret(req('SETTLEMENT_ACCOUNT_SECRET'));
  const settlementPub = settlementKp.publicKey();
  const amount = toStroops(AMOUNT_USDC);

  // ------------------------------------------------------------ 1. anchor discovery + auth
  step('1', 'SEP-1 discovery + SEP-10 authentication (settlement account)');
  const anchor = new SepAnchorClient({
    homeDomain: HOME_DOMAIN,
    signerSecret: settlementKp.secret(),
    networkPassphrase: PASSPHRASE,
  });
  const toml = await anchor.init();
  console.log(`   Anchor signing key : ${toml.SIGNING_KEY}`);
  console.log(`   Transfer server    : ${toml.TRANSFER_SERVER}`);
  await anchor.getAuthToken();
  console.log('   ✅ SEP-10 JWT issued');

  const info = await anchor.sep6!.getInfo();
  if (!info.withdraw?.USDC?.enabled) throw new Error('Anchor does not advertise USDC withdrawal');
  console.log(`   ✅ SEP-6 withdraw USDC enabled (min ${info.withdraw.USDC.min_amount ?? '?'}, fee ${info.withdraw.USDC.fee_percent ?? 0}%)`);

  // ------------------------------------------------------------ 2. KYC
  step('2', 'SEP-12 customer registration (test data)');
  const kyc = await anchor.submitKyc({
    first_name: 'Kwame',
    last_name: 'Mensah',
    email_address: 'kwame.mensah@example.com',
    mobile_number: '+233244123456',
  });
  const kycStatus = await anchor.checkKycStatus(kyc.id);
  console.log(`   Customer ${kyc.id}: ${kycStatus.status}`);
  if (kycStatus.status !== 'ACCEPTED') throw new Error(`KYC not accepted: ${kycStatus.status}`);

  // ------------------------------------------------------------ 3. initiate withdraw
  step('3', `SEP-6 withdraw initiation: ${AMOUNT_USDC} USDC → ${MOMO_NETWORK} ${MOMO_NUMBER}`);
  const withdraw = (await anchor.withdraw({
    assetCode: 'USDC',
    type: 'mobile',
    dest: MOMO_NUMBER,
    destExtra: MOMO_NETWORK,
    amount: AMOUNT_USDC,
    account: settlementPub,
  })) as Awaited<ReturnType<NonNullable<typeof anchor.sep6>['withdraw']>>;

  if (!withdraw.account_id || !withdraw.memo) {
    throw new Error(`Anchor did not return payment instructions: ${JSON.stringify(withdraw)}`);
  }
  console.log(`   Anchor tx id   : ${withdraw.id}`);
  console.log(`   Pay to         : ${withdraw.account_id}`);
  console.log(`   Memo           : ${withdraw.memo} (${withdraw.memo_type ?? 'text'})`);
  console.log(`   Fee            : ${withdraw.fee_percent ?? 0}% + ${withdraw.fee_fixed ?? 0}`);

  if (DRY_RUN) {
    console.log('\n✅ DRY RUN COMPLETE: anchor accepted the withdrawal request and returned memo instructions.');
    return;
  }

  // ------------------------------------------------------------ 4. release escrow to settlement
  const before = await usdcBalance(settlementPub);
  if (SKIP_CONTRACT) {
    step('4', 'Skipping contract (using existing settlement balance)');
    if (before < amount) throw new Error(`Settlement holds ${before} stroops, need ${amount}`);
  } else {
    step('4', 'Cheque escrow → settlement (create, lock, redeem on the deployed contract)');
    const funder = new EnvKeypairSigner(req('FUNDING_ACCOUNT_SECRET'));
    const authority = new EnvKeypairSigner(req('CLAIM_AUTHORITY_SECRET'));
    const client = new ChequeContractClient({
      rpcUrl: RPC_URL,
      networkPassphrase: PASSPHRASE,
      contractId: req('CHEQUE_CONTRACT_ID'),
    });

    const funderPub = await funder.getPublicKey();
    if ((await usdcBalance(funderPub)) < amount) {
      // Top up the funder from settlement with a classic payment (both hold the trustline).
      console.log('   Funder short on USDC; topping up from settlement');
      const acc = await horizon.loadAccount(settlementPub);
      const tx = new TransactionBuilder(acc, { fee: BASE_FEE, networkPassphrase: PASSPHRASE })
        .addOperation(
          Operation.payment({
            destination: funderPub,
            asset: USDC,
            amount: (Number(amount) / 1e7).toFixed(7),
          })
        )
        .setTimeout(60)
        .build();
      tx.sign(settlementKp);
      await horizon.submitTransaction(tx);
    }

    const uuid = crypto.randomUUID();
    const idHex = deriveChequeIdHex(uuid);
    const create = await client.createCheque(funder, {
      chequeIdHex: idHex,
      refundTo: funderPub,
      amountStroops: amount,
      expiresAt: Math.floor(Date.now() / 1000) + 3600,
    });
    console.log(`   create_cheque ${create.txHash}`);
    const lock = await client.lock(authority, { chequeIdHex: idHex, to: settlementPub, lockSecs: 600 });
    console.log(`   lock          ${lock.txHash}`);
    const redeem = await client.redeem(authority, idHex);
    console.log(`   redeem        ${redeem.txHash}`);
    const state = (await client.getCheque(idHex)).state;
    if (state !== OnChainChequeState.Redeemed) throw new Error(`Unexpected on-chain state ${state}`);
    console.log(`   ✅ cheque ${uuid} redeemed to settlement account`);
  }

  // ------------------------------------------------------------ 5. classic payment with memo
  step('5', 'Settlement → anchor: classic USDC payment with the anchor memo');
  const settlementAcc = await horizon.loadAccount(settlementPub);
  const payTx = new TransactionBuilder(settlementAcc, { fee: BASE_FEE, networkPassphrase: PASSPHRASE })
    .addOperation(
      Operation.payment({
        destination: withdraw.account_id,
        asset: USDC,
        amount: (Number(amount) / 1e7).toFixed(7),
      })
    )
    .addMemo(memoFor(withdraw.memo_type, withdraw.memo))
    .setTimeout(120)
    .build();
  payTx.sign(settlementKp);
  const paid = await horizon.submitTransaction(payTx);
  console.log(`   ✅ payment submitted: ${paid.hash}`);
  console.log(`      https://stellar.expert/explorer/testnet/tx/${paid.hash}`);

  // ------------------------------------------------------------ 6. poll anchor
  step('6', 'Polling the anchor for payout status (up to ~3 minutes)');
  const token = await anchor.getAuthToken();
  const terminal = new Set(['completed', 'error', 'refunded', 'expired', 'no_market', 'too_small', 'too_large']);
  let last = '';
  let final = '';
  for (let i = 0; i < 36; i++) {
    const { transaction } = await anchor.sep6!.getTransaction({ id: withdraw.id }, token);
    if (transaction.status !== last) {
      last = transaction.status;
      console.log(
        `   [${new Date().toISOString().slice(11, 19)}] status=${transaction.status}` +
          (transaction.amount_out ? ` amount_out=${transaction.amount_out}` : '') +
          (transaction.external_transaction_id ? ` momo_ref=${transaction.external_transaction_id}` : '') +
          (transaction.message ? ` msg="${transaction.message}"` : '')
      );
    }
    final = transaction.status;
    if (terminal.has(transaction.status)) break;
    await new Promise((r) => setTimeout(r, 5000));
  }

  const after = await usdcBalance(settlementPub);
  console.log(`\n   Settlement USDC: before=${before / STROOPS} after=${after / STROOPS}`);

  console.log('\n========================================================================');
  if (final === 'completed') {
    console.log('✅ ANCHOR LEG COMPLETE: cheque → settlement → anchor → mobile money payout');
  } else {
    console.log(`⚠️  Payment landed on Stellar but anchor status is "${final}" (not completed within the window).`);
    console.log('   Check the transaction later with the SEP-6 /transaction endpoint using id:', withdraw.id);
    process.exitCode = 2;
  }
  console.log('========================================================================\n');
}

main().catch((err) => {
  console.error('Anchor leg error:', err);
  process.exit(1);
});
