/**
 * Real testnet check of the wallet-signed deposit path: the API prepares an UNSIGNED
 * create_cheque / cancel transaction, a keypair stands in for the browser wallet and signs it,
 * and the API client relays it. Same calls the /cheques/:id/tx/* routes make.
 *
 * Usage: pnpm e2e:wallet
 */
import { Keypair, Transaction, TransactionBuilder } from '@stellar/stellar-sdk';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import dotenv from 'dotenv';
import { ChequeContractClient, OnChainChequeState, deriveChequeIdHex } from '../packages/chain/src/index.js';

const envLocalPath = path.resolve(process.cwd(), '.env.local');
dotenv.config(fs.existsSync(envLocalPath) ? { path: envLocalPath } : undefined);

const PASSPHRASE = process.env.STELLAR_NETWORK_PASSPHRASE || 'Test SDF Network ; September 2015';
const contractId = process.env.CHEQUE_CONTRACT_ID!;
const wallet = Keypair.fromSecret(process.env.FUNDING_ACCOUNT_SECRET!); // stands in for Freighter

const client = new ChequeContractClient({
  rpcUrl: process.env.STELLAR_SOROBAN_RPC_URL || 'https://soroban-testnet.stellar.org',
  networkPassphrase: PASSPHRASE,
  contractId,
});

let failed = 0;
const check = (ok: boolean, label: string) => {
  console.log(`   ${ok ? '✅' : '❌'} ${label}`);
  if (!ok) failed++;
};

/** What a wallet does: take the unsigned XDR, sign the envelope, hand back the signed XDR. */
function walletSign(xdr: string): string {
  const tx = TransactionBuilder.fromXDR(xdr, PASSPHRASE) as Transaction;
  tx.sign(wallet);
  return tx.toXDR();
}

async function main() {
  console.log('E2E: wallet-signed deposit + cancel (REAL TESTNET)');
  console.log(`Contract ${contractId}\nWallet   ${wallet.publicKey()}`);

  const id = deriveChequeIdHex(crypto.randomUUID());
  const expiresAt = Math.floor(Date.now() / 1000) + 3600;

  console.log('\nDeposit');
  const prep = await client.prepareCreateCheque({
    funderPublicKey: wallet.publicKey(),
    chequeIdHex: id,
    refundTo: wallet.publicKey(),
    amountStroops: 20_000_000n, // 2 USDC
    expiresAt,
  });
  check(prep.networkPassphrase === PASSPHRASE, 'prepared XDR carries the network passphrase');
  const created = await client.submitSignedTransaction(walletSign(prep.xdr), {
    source: wallet.publicKey(),
    functionName: 'create_cheque',
  });
  check(!!created.txHash, `deposit confirmed — ${created.txHash}`);
  const onChain = await client.getCheque(id);
  check(onChain.state === OnChainChequeState.Active, 'cheque is Active on-chain');
  check(onChain.funder === wallet.publicKey(), 'funder is the signing wallet');
  check(BigInt(onChain.amount) === 20_000_000n, 'escrowed amount is 2 USDC');

  console.log('\nGuard: the API only relays the call it asked for');
  const other = await client.prepareCancel(wallet.publicKey(), id);
  let rejected = false;
  try {
    await client.submitSignedTransaction(walletSign(other.xdr), {
      source: wallet.publicKey(),
      functionName: 'create_cheque', // wrong on purpose
    });
  } catch {
    rejected = true;
  }
  check(rejected, 'a cancel transaction is refused when a deposit was expected');

  console.log('\nCancel by the wallet');
  const cancelPrep = await client.prepareCancel(wallet.publicKey(), id);
  const cancelled = await client.submitSignedTransaction(walletSign(cancelPrep.xdr), {
    source: wallet.publicKey(),
    functionName: 'cancel',
  });
  check(!!cancelled.txHash, `cancel confirmed — ${cancelled.txHash}`);
  check((await client.getCheque(id)).state === OnChainChequeState.Cancelled, 'cheque is Cancelled on-chain');

  console.log(failed ? `\n❌ ${failed} check(s) failed` : '\n✅ ALL WALLET-FLOW CHECKS PASSED');
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
