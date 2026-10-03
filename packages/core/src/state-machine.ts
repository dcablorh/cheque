import { ChequeState } from './types.js';

export const VALID_TRANSITIONS: Record<ChequeState, readonly ChequeState[]> = {
  DRAFT: ['PENDING_FUNDING', 'CANCELLED'],
  PENDING_FUNDING: ['ACTIVE', 'CANCELLED'],
  ACTIVE: ['CLAIMING', 'REFUNDING'],
  CANCELLED: [],
  CLAIMING: ['AUTHORIZED', 'ACTIVE', 'REFUNDING'],
  AUTHORIZED: ['SETTLING', 'ACTIVE', 'REFUND_REVIEW'],
  SETTLING: ['SETTLED', 'AUTHORIZED', 'REFUND_REVIEW'],
  SETTLED: [],
  EXPIRED: ['REFUNDING', 'REFUND_REVIEW'],
  REFUNDING: ['REFUNDED', 'REFUND_REVIEW'],
  REFUNDED: [],
  REFUND_REVIEW: ['REFUNDED', 'AUTHORIZED'], // Ops can re-authorize or complete refund
};

export interface TransitionCheckContext {
  now?: Date;
  expiresAt?: Date;
  actor?: 'SENDER' | 'RECIPIENT' | 'SYSTEM' | 'ADMIN';
  claimSessionExpiresAt?: Date;
}

export function isValidTransition(
  from: ChequeState,
  to: ChequeState,
  context?: TransitionCheckContext
): { allowed: boolean; reason?: string } {
  const allowedNext = VALID_TRANSITIONS[from];
  if (!allowedNext || !allowedNext.includes(to)) {
    return {
      allowed: false,
      reason: `Illegal state transition from ${from} to ${to}`,
    };
  }

  // Rule: Sender can cancel only in PENDING_FUNDING or ACTIVE.
  if (context?.actor === 'SENDER' && (to === 'CANCELLED' || to === 'REFUNDING')) {
    if (from !== 'PENDING_FUNDING' && from !== 'ACTIVE') {
      return {
        allowed: false,
        reason: `Sender cannot cancel cheque in state ${from}`,
      };
    }
  }

  // Rule: Expiry never fires on AUTHORIZED or SETTLING.
  if (to === 'REFUNDING' || to === 'EXPIRED') {
    if (from === 'AUTHORIZED' || from === 'SETTLING') {
      return {
        allowed: false,
        reason: `Cheque in ${from} cannot expire directly; must fallback to ACTIVE first`,
      };
    }
  }

  return { allowed: true };
}

export function canSenderCancel(state: ChequeState): boolean {
  return state === 'PENDING_FUNDING' || state === 'ACTIVE';
}

export function isTerminalState(state: ChequeState): boolean {
  return state === 'SETTLED' || state === 'CANCELLED' || state === 'REFUNDED';
}
