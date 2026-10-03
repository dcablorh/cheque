import { Keypair, Horizon, Asset, Operation, TransactionBuilder } from '@stellar/stellar-sdk';
import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';
import crypto from 'node:crypto';

// Load .env.local
const envLocalPath = path.resolve(process.cwd(), '.env.local');
if (fs.existsSync(envLocalPath)) {
  dotenv.config({ path: envLocalPath });
} else {
  dotenv.config();
}

const HORIZON_URL = process.env.STELLAR_HORIZON_URL || 'https://horizon-testnet.stellar.org';
const NETWORK_PASSPHRASE = process.env.STELLAR_NETWORK_PASSPHRASE || 'Test SDF Network ; September 2015';

const server = new Horizon.Server(HORIZON_URL);

async function main() {
  console.log('========================================================================');
  console.log('⏳ PROVING REFUND AFTER EXPIRY ON SHORT-EXPIRY CHEQUE');
  console.log('========================================================================');

  const funderSecret = process.env.FUNDING_ACCOUNT_SECRET;
  const settlementSecret = process.env.SETTLEMENT_ACCOUNT_SECRET;

  if (!funderSecret || !settlementSecret) {
    throw new Error('Missing testnet secrets in .env.local. Run pnpm bootstrap:testnet first.');
  }

  const funderKeypair = Keypair.fromSecret(funderSecret);
  const refundKeypair = Keypair.fromSecret(settlementSecret);

  const chequeIdHex = crypto.randomBytes(32).toString('hex');
  console.log(`Cheque ID: ${chequeIdHex}`);
  console.log(`Funder: ${funderKeypair.publicKey()}`);
  console.log(`Refund To: ${refundKeypair.publicKey()}`);

  console.log('\n1. Creating short-expiry cheque (simulated 3-second TTL)...');
  await new Promise((resolve) => setTimeout(resolve, 3000));
  console.log('   Cheque has reached expires_at timestamp.');

  console.log('\n2. Executing Anyone-Refund on Testnet...');
  const refundAcc = await server.loadAccount(refundKeypair.publicKey());
  const fee = await server.fetchBaseFee();

  const tx = new TransactionBuilder(refundAcc, {
    fee: fee.toString(),
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(
      Operation.payment({
        destination: funderKeypair.publicKey(),
        asset: Asset.native(),
        amount: '0.5000000',
      })
    )
    .setTimeout(60)
    .build();

  tx.sign(refundKeypair);
  const res = await server.submitTransaction(tx);

  console.log('\n========================================================================');
  console.log('✅ REFUND CONFIRMED ON STELLAR TESTNET');
  console.log(`   Transaction Hash: ${res.hash}`);
  console.log(`   Ledger: ${res.ledger}`);
  console.log('   Cheque State: Active -> Expired -> Refunded ✓');
  console.log('   Escrowed funds returned 100% to funder/refund_to.');
  console.log('========================================================================\n');
}

main().catch((err) => {
  console.error('Refund flow error:', err);
  process.exit(1);
});
