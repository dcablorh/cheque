export enum OnChainChequeState {
  Active = 1,
  Locked = 2,
  Redeemed = 3,
  Cancelled = 4,
  Refunded = 5,
}

export interface OnChainLockInfo {
  to: string;
  lockedAt: number;
  unlockAfter: number;
  executableAfter: number;
}

export interface OnChainCheque {
  funder: string;
  refundTo: string;
  amount: bigint;
  expiresAt: number;
  state: OnChainChequeState;
  lock?: OnChainLockInfo;
}

export interface OnChainConfig {
  minAmount: bigint;
  maxAmount: bigint;
  maxLockSecs: number;
  delayThreshold: bigint;
  delaySecs: number;
  paused: boolean;
}

export type ContractEventTopic =
  | 'created'
  | 'locked'
  | 'unlocked'
  | 'vetoed'
  | 'redeemed'
  | 'cancelled'
  | 'refunded';

export interface CreatedEventPayload {
  funder: string;
  refundTo: string;
  amount: bigint;
  expiresAt: number;
}

export interface LockedEventPayload {
  to: string;
  unlockAfter: number;
  executableAfter: number;
}

export interface RedeemedEventPayload {
  to: string;
  amount: bigint;
}

export interface CancelledEventPayload {
  refundTo: string;
  amount: bigint;
}

export interface RefundedEventPayload {
  refundTo: string;
  amount: bigint;
}

export interface DecodedContractEvent<T = unknown> {
  id: string; // `${txHash}:${eventIndex}`
  topic: ContractEventTopic;
  chequeIdHex: string;
  payload: T;
  ledger: number;
  txHash: string;
  eventIndex: number;
  timestamp: string;
}
