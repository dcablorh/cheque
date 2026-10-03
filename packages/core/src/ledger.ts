import crypto from 'node:crypto';
import { LedgerTransaction, LedgerAccount } from './types.js';
import { assertIntegerNonNegative } from './money.js';

/**
 * Validates that every ledger transaction balances:
 * total debits must equal total credits exactly, and all amounts must be non-negative integers.
 */
export function validateLedgerTransaction(tx: LedgerTransaction): void {
  let totalDebit = 0;
  let totalCredit = 0;

  for (const entry of tx.entries) {
    assertIntegerNonNegative(entry.debitMinor, `Debit for ${entry.account}`);
    assertIntegerNonNegative(entry.creditMinor, `Credit for ${entry.account}`);

    // An entry should typically be either a debit or credit, not both
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
    { account: 'cheque_escrow', debitMinor: 0, creditMinor: faceAmountMinor },
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
      { account: 'cheque_escrow', debitMinor: amountMinor, creditMinor: 0 },
      { account: 'payout_pending', debitMinor: 0, creditMinor: amountMinor },
    ],
    createdAt: new Date(),
  };

  validateLedgerTransaction(tx);
  return tx;
}

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
      { account: 'cheque_escrow', debitMinor: amountMinor, creditMinor: 0 },
    ],
    createdAt: new Date(),
  };

  validateLedgerTransaction(tx);
  return tx;
}

export function createRefundTransaction(params: {
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
    description: `Cheque refunded to sender: escrow -> sender_funds (${amountMinor})`,
    entries: [
      { account: 'cheque_escrow', debitMinor: amountMinor, creditMinor: 0 },
      { account: 'sender_funds', debitMinor: 0, creditMinor: amountMinor },
    ],
    createdAt: new Date(),
  };

  validateLedgerTransaction(tx);
  return tx;
}

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
    description: `FX Buffer covered shortfall: fx_buffer -> payout_pending (${shortfallMinor})`,
    entries: [
      { account: 'fx_buffer', debitMinor: shortfallMinor, creditMinor: 0 },
      { account: 'payout_pending', debitMinor: 0, creditMinor: shortfallMinor },
    ],
    createdAt: new Date(),
  };

  validateLedgerTransaction(tx);
  return tx;
}
