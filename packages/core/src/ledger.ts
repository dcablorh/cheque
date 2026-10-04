import crypto from 'node:crypto';
import { LedgerTransaction, LedgerAccount } from './types.js';
import { assertIntegerNonNegative } from './money.js';

export const VALID_LEDGER_ACCOUNTS: readonly LedgerAccount[] = [
  'sender_funds',
  'cheque_escrow_onchain',
  'payout_pending',
  'settled',
  'fees',
  'fx_buffer',
  'refunds_pending',
] as const;

/**
 * Validates that every ledger transaction balances:
 * total debits must equal total credits exactly, and all amounts must be non-negative integers.
 */
export function validateLedgerTransaction(tx: LedgerTransaction): void {
  let totalDebit = 0;
  let totalCredit = 0;

  for (const entry of tx.entries) {
    if (!VALID_LEDGER_ACCOUNTS.includes(entry.account)) {
      throw new Error(`Invalid ledger account: ${entry.account}`);
    }
    assertIntegerNonNegative(entry.debitMinor, `Debit for ${entry.account}`);
    assertIntegerNonNegative(entry.creditMinor, `Credit for ${entry.account}`);

    // An entry should be either a debit or credit, not both
    if (entry.debitMinor > 0 && entry.creditMinor > 0) {
      throw new Error(`Entry on account ${entry.account} cannot have both debit and credit > 0`);
    }

    totalDebit += entry.debitMinor;
    totalCredit += entry.creditMinor;
  }

  if (totalDebit !== totalCredit) {
    throw new Error(
      `Ledger transaction ${tx.txId} does not balance: Debits=${totalDebit}, Credits=${totalCredit}`
    );
  }

  if (totalDebit === 0) {
    throw new Error(`Ledger transaction ${tx.txId} has 0 total amount`);
  }
}

/**
 * 1. Funding transaction:
 * Sender funds deposited into contract escrow and fee collected.
 * Debit: sender_funds (total paid)
 * Credit: cheque_escrow_onchain (face amount)
 * Credit: fees (fee amount)
 */
export function createFundingTransaction(params: {
  chequeId: string;
  faceAmountMinor: number;
  feeMinor: number;
  currency: 'GHS' | 'USDC';
}): LedgerTransaction {
  const { chequeId, faceAmountMinor, feeMinor, currency } = params;
  assertIntegerNonNegative(faceAmountMinor, 'faceAmountMinor');
  assertIntegerNonNegative(feeMinor, 'feeMinor');

  const totalSenderPaid = faceAmountMinor + feeMinor;
  const entries: { account: LedgerAccount; debitMinor: number; creditMinor: number }[] = [
    { account: 'sender_funds', debitMinor: totalSenderPaid, creditMinor: 0 },
    { account: 'cheque_escrow_onchain', debitMinor: 0, creditMinor: faceAmountMinor },
  ];

  if (feeMinor > 0) {
    entries.push({ account: 'fees', debitMinor: 0, creditMinor: feeMinor });
  }

  const tx: LedgerTransaction = {
    txId: crypto.randomUUID(),
    chequeId,
    currency,
    description: `Cheque funded: face=${faceAmountMinor}, fee=${feeMinor}`,
    entries,
    createdAt: new Date(),
  };

  validateLedgerTransaction(tx);
  return tx;
}

/**
 * 2. Settlement Pending:
 * Escrow funds moved to payout_pending while off-ramp / MoMo payout is in flight.
 * Debit: cheque_escrow_onchain
 * Credit: payout_pending
 */
export function createSettlementPendingTransaction(params: {
  chequeId: string;
  amountMinor: number;
  currency: 'GHS' | 'USDC';
}): LedgerTransaction {
  const { chequeId, amountMinor, currency } = params;
  assertIntegerNonNegative(amountMinor, 'amountMinor');

  const tx: LedgerTransaction = {
    txId: crypto.randomUUID(),
    chequeId,
    currency,
    description: `Settlement initiated: escrow -> payout_pending (${amountMinor})`,
    entries: [
      { account: 'cheque_escrow_onchain', debitMinor: amountMinor, creditMinor: 0 },
      { account: 'payout_pending', debitMinor: 0, creditMinor: amountMinor },
    ],
    createdAt: new Date(),
  };

  validateLedgerTransaction(tx);
  return tx;
}

/**
 * 3. Settlement Confirmed:
 * Funds cleared and delivered to recipient.
 * Debit: payout_pending
 * Credit: settled
 */
export function createSettlementConfirmedTransaction(params: {
  chequeId: string;
  amountMinor: number;
  currency: 'GHS' | 'USDC';
}): LedgerTransaction {
  const { chequeId, amountMinor, currency } = params;
  assertIntegerNonNegative(amountMinor, 'amountMinor');

  const tx: LedgerTransaction = {
    txId: crypto.randomUUID(),
    chequeId,
    currency,
    description: `Settlement confirmed: payout_pending -> settled (${amountMinor})`,
    entries: [
      { account: 'payout_pending', debitMinor: amountMinor, creditMinor: 0 },
      { account: 'settled', debitMinor: 0, creditMinor: amountMinor },
    ],
    createdAt: new Date(),
  };

  validateLedgerTransaction(tx);
  return tx;
}

/**
 * 4. Settlement Failed Rollback:
 * If MoMo payout fails, funds revert from payout_pending back to on-chain escrow.
 * Debit: payout_pending (0 credit, amount debit or vice versa)
 * Credit: cheque_escrow_onchain
 */
export function createSettlementFailedRollbackTransaction(params: {
  chequeId: string;
  amountMinor: number;
  currency: 'GHS' | 'USDC';
}): LedgerTransaction {
  const { chequeId, amountMinor, currency } = params;
  assertIntegerNonNegative(amountMinor, 'amountMinor');

  const tx: LedgerTransaction = {
    txId: crypto.randomUUID(),
    chequeId,
    currency,
    description: `Settlement failed rollback: payout_pending -> escrow (${amountMinor})`,
    entries: [
      { account: 'payout_pending', debitMinor: 0, creditMinor: amountMinor },
      { account: 'cheque_escrow_onchain', debitMinor: amountMinor, creditMinor: 0 },
    ],
    createdAt: new Date(),
  };

  validateLedgerTransaction(tx);
  return tx;
}

/**
 * 5. Refund Pending:
 * When cancellation or expiry triggers refunding.
 * Debit: cheque_escrow_onchain
 * Credit: refunds_pending
 */
export function createRefundPendingTransaction(params: {
  chequeId: string;
  amountMinor: number;
  currency: 'GHS' | 'USDC';
}): LedgerTransaction {
  const { chequeId, amountMinor, currency } = params;
  assertIntegerNonNegative(amountMinor, 'amountMinor');

  const tx: LedgerTransaction = {
    txId: crypto.randomUUID(),
    chequeId,
    currency,
    description: `Refund pending: escrow -> refunds_pending (${amountMinor})`,
    entries: [
      { account: 'cheque_escrow_onchain', debitMinor: amountMinor, creditMinor: 0 },
      { account: 'refunds_pending', debitMinor: 0, creditMinor: amountMinor },
    ],
    createdAt: new Date(),
  };

  validateLedgerTransaction(tx);
  return tx;
}

/**
 * 6. Refund Confirmed:
 * Funds returned to sender.
 * Debit: refunds_pending
 * Credit: sender_funds
 */
export function createRefundConfirmedTransaction(params: {
  chequeId: string;
  amountMinor: number;
  currency: 'GHS' | 'USDC';
}): LedgerTransaction {
  const { chequeId, amountMinor, currency } = params;
  assertIntegerNonNegative(amountMinor, 'amountMinor');

  const tx: LedgerTransaction = {
    txId: crypto.randomUUID(),
    chequeId,
    currency,
    description: `Refund confirmed: refunds_pending -> sender_funds (${amountMinor})`,
    entries: [
      { account: 'refunds_pending', debitMinor: amountMinor, creditMinor: 0 },
      { account: 'sender_funds', debitMinor: 0, creditMinor: amountMinor },
    ],
    createdAt: new Date(),
  };

  validateLedgerTransaction(tx);
  return tx;
}

/**
 * 7. FX Buffer Adjustment:
 * Absorbs FX shortfall buffer.
 * Debit: fx_buffer
 * Credit: payout_pending
 */
export function createFxBufferAdjustmentTransaction(params: {
  chequeId: string;
  shortfallMinor: number;
  currency: 'GHS' | 'USDC';
}): LedgerTransaction {
  const { chequeId, shortfallMinor, currency } = params;
  assertIntegerNonNegative(shortfallMinor, 'shortfallMinor');

  const tx: LedgerTransaction = {
    txId: crypto.randomUUID(),
    chequeId,
    currency,
    description: `FX Buffer adjustment: fx_buffer -> payout_pending (${shortfallMinor})`,
    entries: [
      { account: 'fx_buffer', debitMinor: shortfallMinor, creditMinor: 0 },
      { account: 'payout_pending', debitMinor: 0, creditMinor: shortfallMinor },
    ],
    createdAt: new Date(),
  };

  validateLedgerTransaction(tx);
  return tx;
}
