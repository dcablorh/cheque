/**
 * Real Stellar testnet e2e: create a USDC cheque (Soroban escrow), claim via email OTP,
 * and redeem through Circle CCTP to Base Sepolia and (if budget allows) Solana Devnet.
 *
 * Usage (from the repo root, with untracked .env.local): pnpm e2e:cctp
 * Never merge, never push, never commit .env.local.
 */
process.env.NODE_ENV = 'test';

import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';
import {
  Asset,
  Horizon,
  Keypair,
  Operation,
  TransactionBuilder,
} from '@stellar/stellar-sdk';

const envPath = path.resolve(process.cwd(), '.env.local');
if (fs.existsSync(envPath)) dotenv.config({ path: envPath });

const HORIZON = process.env.STELLAR_HORIZON_URL || 'https://horizon-testnet.stellar.org';
const PASSPHRASE = process.env.STELLAR_NETWORK_PASSPHRASE || 'Test SDF Network ; September 2015';
const USDC_ISSUER = process.env.USDC_ISSUER_ADDRESS || 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5';
const SETTLEMENT_PUBLIC = process.env.SETTLEMENT_ACCOUNT_PUBLIC!;
const FUNDING_PUBLIC = process.env.FUNDING_ACCOUNT_PUBLIC!;
const BASE_ADDR = process.env.BASE_SEPOLIA_RECIPIENT_ADDRESS!;
const SOL_OWNER = process.env.SOLANA_DEVNET_RECIPIENT_PUBLIC!;
const FACE_USD = 5; // US corridor minimum
const USDC_PER_CHEQUE = 5; // 1:1 with face USD
const TRANSFER_BUFFER = 1; // extra USDC left on the funding account

const USDC = new Asset('USDC', USDC_ISSUER);
const horizon = new Horizon.Server(HORIZON);

type Json = Record<string, unknown>;

function otpFromMailbox(
  box: Array<{ to: string; subject: string; text: string }>,
  to: string,
): string {
  const mail = [...box].reverse().find((m) => m.to === to);
  if (!mail) throw new Error(`No captured email to ${to}`);
  const match = mail.text.match(/\b(\d{6})\b/);
  if (!match) throw new Error(`No 6-digit code in email to ${to}`);
  return match[1];
}

async function usdcBalance(accountId: string): Promise<number> {
  const acct = await horizon.loadAccount(accountId);
  const row = acct.balances.find(
    (b) =>
      'asset_code' in b &&
      b.asset_code === 'USDC' &&
      'asset_issuer' in b &&
      b.asset_issuer === USDC_ISSUER,
  );
  return row ? Number(row.balance) : 0;
}

async function transferUsdcToFunding(amount: number): Promise<string> {
  const secret = process.env.SETTLEMENT_ACCOUNT_SECRET;
  if (!secret) throw new Error('SETTLEMENT_ACCOUNT_SECRET missing');
  const source = Keypair.fromSecret(secret);
  if (source.publicKey() !== SETTLEMENT_PUBLIC) {
    throw new Error('SETTLEMENT_ACCOUNT_SECRET does not match SETTLEMENT_ACCOUNT_PUBLIC');
  }
  const account = await horizon.loadAccount(source.publicKey());
  const tx = new TransactionBuilder(account, { fee: '100000', networkPassphrase: PASSPHRASE })
    .addOperation(
      Operation.payment({
        destination: FUNDING_PUBLIC,
        asset: USDC,
        amount: amount.toFixed(7),
      }),
    )
    .setTimeout(60)
    .build();
  tx.sign(source);
  const res = await horizon.submitTransaction(tx);
  return res.hash;
}

async function main() {
  if (!process.env.CHEQUE_CONTRACT_ID) throw new Error('CHEQUE_CONTRACT_ID missing');
  if (!SETTLEMENT_PUBLIC || !FUNDING_PUBLIC || !BASE_ADDR || !SOL_OWNER) {
    throw new Error('Missing settlement/funding/recipient public addresses in .env.local');
  }

  const settlementStart = await usdcBalance(SETTLEMENT_PUBLIC);
  const fundingStart = await usdcBalance(FUNDING_PUBLIC);
  console.log(`Stellar testnet USDC before:`);
  console.log(`  settlement ${SETTLEMENT_PUBLIC}: ${settlementStart.toFixed(7)}`);
  console.log(`  funding    ${FUNDING_PUBLIC}: ${fundingStart.toFixed(7)}`);

  const needed = USDC_PER_CHEQUE * 2 + TRANSFER_BUFFER;
  if (fundingStart < needed) {
    const topUp = Number((needed - fundingStart).toFixed(7));
    if (settlementStart < topUp) {
      throw new Error(`Settlement has ${settlementStart} USDC; need ${topUp} to fund two ${FACE_USD} USD cheques`);
    }
    console.log(`\nMoving ${topUp} USDC from the Stellar settlement account to the funding account…`);
    const hash = await transferUsdcToFunding(topUp);
    console.log(`  payment tx: https://stellar.expert/explorer/testnet/tx/${hash}`);
    const fundingNow = await usdcBalance(FUNDING_PUBLIC);
    console.log(`  funding USDC now ${fundingNow.toFixed(7)}`);
  }

  // Defer leftover PENDING outbox rows from unit tests so this process cannot
  // accidentally submit a real CCTP burn for them.
  const { default: pg } = await import('pg');
  const cleanup = new pg.Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://cheque_user:cheque_password@127.0.0.1:5432/cheque_db',
  });
  const deferred = await cleanup.query(
    `UPDATE outbox SET next_run_at = NOW() + interval '7 days'
      WHERE status IN ('PENDING', 'FAILED') AND next_run_at <= NOW()
      RETURNING id`,
  );
  await cleanup.end();
  if (deferred.rowCount) {
    console.log(`Deferred ${deferred.rowCount} leftover outbox item(s) so they are not burned on testnet.`);
  }

  const { buildApp } = await import('../api/src/server.ts');
  const server = await buildApp();
  const app = server.app;
  await app.ready();
  const mailbox = server.outboundEmail as Array<{ to: string; subject: string; text: string }>;

  const inject = async (method: string, url: string, payload?: unknown, token?: string) => {
    const res = await app.inject({
      method,
      url,
      payload,
      headers: token ? { authorization: `Bearer ${token}` } : undefined,
    });
    let body: Json = {};
    try {
      body = res.body ? (JSON.parse(res.body) as Json) : {};
    } catch {
      body = { raw: res.body };
    }
    if (res.statusCode >= 400) {
      throw new Error(`${method} ${url} -> ${res.statusCode}: ${JSON.stringify(body)}`);
    }
    return { status: res.statusCode, body };
  };

  const stamp = Date.now().toString(36);
  const senderEmail = `sender-e2e-${stamp}@example.com`;
  const payeeEmail = `payee-e2e-${stamp}@example.com`;

  console.log('\nSender email OTP…');
  await inject('POST', '/auth/email/otp/request', { email: senderEmail });
  const senderOtp = otpFromMailbox(mailbox, senderEmail);
  const auth = await inject('POST', '/auth/email/otp/verify', {
    email: senderEmail,
    otp: senderOtp,
    name: 'E2E Sender',
  });
  const accessToken = String(auth.body.accessToken);

  const results: Array<{
    chain: 'base' | 'solana';
    chequeId: string;
    publicCode: string;
    burnTx?: string;
    forwardTx?: string;
    explorerUrl?: string;
    feeUsdc?: string;
    netUsdc?: string;
    state: string;
  }> = [];

  async function runClaim(chain: 'base' | 'solana', address: string) {
    console.log(`\n=== ${chain} claim ($${FACE_USD} US cheque, source = Stellar Soroban escrow) ===`);
    const created = await inject(
      'POST',
      '/cheques',
      {
        payeeName: 'E2E Payee',
        payeeEmail,
        corridor: 'US',
        amount: FACE_USD,
        note: `CCTP e2e to ${chain}`,
        expiryHours: 48,
      },
      accessToken,
    );
    const chequeId = String(created.body.id);
    const claimToken = String(created.body.claimToken);
    const publicCode = String(created.body.publicCode);
    console.log(`  created ${publicCode} (${chequeId}) amountStroops=${created.body.usdcAmountStroops}`);
    console.log(`  claim token issued (not logged)`);

    const deadline = Date.now() + 3 * 60_000;
    let state = 'PENDING_FUNDING';
    while (Date.now() < deadline) {
      const status = await inject('GET', `/claim/${claimToken}/status`);
      state = String(status.body.state);
      if (state === 'ACTIVE') break;
      if (['CANCELLED', 'EXPIRED', 'REFUNDING', 'REFUNDED'].includes(state)) {
        throw new Error(`Cheque ${publicCode} entered ${state} while waiting for Stellar funding`);
      }
      await new Promise((r) => setTimeout(r, 2000));
    }
    if (state !== 'ACTIVE') throw new Error(`Cheque ${publicCode} still ${state} after waiting for escrow`);
    console.log('  Soroban escrow is Active');

    const quote = await inject('GET', `/claim/${claimToken}/payout-quote?chain=${chain}&address=${address}`);
    console.log(
      `  quote: amount=${quote.body.amountUsdc} fee=${quote.body.feeUsdc} net=${quote.body.netUsdc} sufficient=${quote.body.sufficient}`,
    );
    if (quote.body.sufficient === false) {
      throw new Error(`Quote net USDC is below the minimum for ${chain}`);
    }

    console.log('  claimant email OTP…');
    await inject('POST', `/claim/${claimToken}/otp/send`, {});
    const claimOtp = otpFromMailbox(mailbox, payeeEmail);
    const session = await inject('POST', `/claim/${claimToken}/otp/verify`, { otp: claimOtp });
    const sessionToken = String(session.body.sessionToken);

    const redeem = await inject('POST', `/claim/${claimToken}/redeem`, {
      destination: { type: 'USDC', chain, accountRef: address },
      idempotencyKey: `e2e-${chain}-${stamp}`,
      sessionToken,
    });
    console.log(`  redeem accepted: state=${redeem.body.state} fee=${redeem.body.feeUsdc} net=${redeem.body.netUsdc}`);

    const settleDeadline = Date.now() + 5 * 60_000;
    let last: Json = {};
    while (Date.now() < settleDeadline) {
      const status = await inject('GET', `/claim/${claimToken}/status`);
      last = status.body;
      const s = String(last.state);
      const payout = String(last.payoutStatus ?? '');
      if (s === 'SETTLED') break;
      if (payout === 'FAILED') {
        throw new Error(`CCTP payout failed; cheque left ${s}: ${last.payoutError ?? 'unknown'}`);
      }
      await new Promise((r) => setTimeout(r, 3000));
    }
    if (String(last.state) !== 'SETTLED') {
      throw new Error(`Timed out waiting for ${chain} mint; last state=${last.state} payout=${last.payoutStatus}`);
    }
    console.log(`  SETTLED on ${chain}`);
    console.log(`  Stellar burn: https://stellar.expert/explorer/testnet/tx/${last.burnTxHash}`);
    console.log(`  destination:  ${last.explorerUrl}`);
    console.log(`  fee ${last.feeUsdc} USDC, received ${last.netUsdc} USDC`);
    results.push({
      chain,
      chequeId,
      publicCode,
      burnTx: last.burnTxHash as string | undefined,
      forwardTx: last.forwardTxHash as string | undefined,
      explorerUrl: last.explorerUrl as string | undefined,
      feeUsdc: last.feeUsdc as string | undefined,
      netUsdc: last.netUsdc as string | undefined,
      state: String(last.state),
    });
  }

  try {
    await runClaim('base', BASE_ADDR);
    const fundingLeft = await usdcBalance(FUNDING_PUBLIC);
    const settlementLeft = await usdcBalance(SETTLEMENT_PUBLIC);
    console.log(`\nBalances after Base: funding=${fundingLeft.toFixed(7)} settlement=${settlementLeft.toFixed(7)}`);
    if (fundingLeft + 0.0000001 < USDC_PER_CHEQUE) {
      const topUp = Number((USDC_PER_CHEQUE + TRANSFER_BUFFER - fundingLeft).toFixed(7));
      if (settlementLeft >= topUp) {
        console.log(`Topping funding up by ${topUp} USDC for the Solana claim…`);
        const hash = await transferUsdcToFunding(topUp);
        console.log(`  payment tx: https://stellar.expert/explorer/testnet/tx/${hash}`);
      } else {
        console.log('Skipping Solana: not enough remaining testnet USDC.');
        return;
      }
    }
    await runClaim('solana', SOL_OWNER);
  } finally {
    await app.close();
    const settlementEnd = await usdcBalance(SETTLEMENT_PUBLIC).catch(() => NaN);
    const fundingEnd = await usdcBalance(FUNDING_PUBLIC).catch(() => NaN);
    console.log(`\nStellar testnet USDC after:`);
    console.log(`  settlement: ${settlementEnd}`);
    console.log(`  funding:    ${fundingEnd}`);
    console.log('\nE2E results');
    console.log(JSON.stringify(results, null, 2));
  }
  process.exit(0);
}

main().catch((err) => {
  console.error('\nE2E failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
