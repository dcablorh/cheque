import { ChequeState } from './types.js';

export const VALID_TRANSITIONS: Record<ChequeState, readonly ChequeState[]> = {
  DRAFT: ['PENDING_FUNDING', 'CANCELLED'],
  PENDING_FUNDING: ['ACTIVE', 'CANCELLED'],
  ACTIVE: ['CLAIMING', 'AUTHORIZED', 'CANCELLED', 'EXPIRED', 'REFUNDING'],
  CANCELLED: [],
  CLAIMING: ['AUTHORIZED', 'ACTIVE', 'REFUNDING', 'REFUND_REVIEW'],
  AUTHORIZED: ['SETTLING', 'ACTIVE', 'REFUND_REVIEW'],
  SETTLING: ['SETTLED', 'AUTHORIZED', 'REFUND_REVIEW'],
  SETTLED: [],
  EXPIRED: ['REFUNDING', 'REFUND_REVIEW'],
  REFUNDING: ['REFUNDED', 'REFUND_REVIEW'],
  REFUNDED: [],
  REFUND_REVIEW: ['REFUNDED', 'AUTHORIZED', 'REFUNDING'],
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

  // Guard 1: Sender can cancel only in PENDING_FUNDING or ACTIVE.
  if (context?.actor === 'SENDER' && (to === 'CANCELLED' || to === 'REFUNDING')) {
    if (from !== 'PENDING_FUNDING' && from !== 'ACTIVE') {
      return {
        allowed: false,
        reason: `Sender cannot cancel cheque in state ${from}. Once claiming starts, cancellation is blocked.`,
      };
    }
  }

  // Guard 2: Expiry never fires on AUTHORIZED or SETTLING.
  if (to === 'EXPIRED' || to === 'REFUNDING') {
    if (from === 'AUTHORIZED' || from === 'SETTLING') {
      return {
        allowed: false,
        reason: `Cheque in ${from} has an in-flight payout and cannot expire directly; must fallback to ACTIVE first.`,
      };
    }
  }

  // Guard 3: Cheque can only transition to EXPIRED if now >= expiresAt
  if (to === 'EXPIRED' && context?.expiresAt && context?.now) {
    if (context.now < context.expiresAt) {
      return {
        allowed: false,
        reason: 'Cannot transition to EXPIRED before expires_at timestamp has passed.',
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
