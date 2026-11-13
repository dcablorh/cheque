import { xdr, nativeToScVal } from '@stellar/stellar-sdk';

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
  /** Populated by `getCheque` callers via `getLock`; the contract stores locks separately. */
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

// --- Decoders: scValToNative yields the contract's snake_case field names ---

const asBig = (v: unknown): bigint => BigInt(v as bigint | number | string);
const asNum = (v: unknown): number => Number(v as bigint | number | string);

export function decodeOnChainLock(raw: unknown): OnChainLockInfo | undefined {
  if (raw === null || raw === undefined) return undefined;
  const r = raw as Record<string, unknown>;
  return {
    to: String(r.to),
    lockedAt: asNum(r.locked_at),
    unlockAfter: asNum(r.unlock_after),
    executableAfter: asNum(r.executable_after),
  };
}

export function decodeOnChainCheque(raw: unknown): OnChainCheque {
  const r = raw as Record<string, unknown>;
  const state = asNum(r.state);
  if (!(state in OnChainChequeState)) {
    throw new Error(`Unknown on-chain cheque state: ${String(r.state)}`);
  }
  return {
    funder: String(r.funder),
    refundTo: String(r.refund_to),
    amount: asBig(r.amount),
    expiresAt: asNum(r.expires_at),
    state: state as OnChainChequeState,
  };
}

export function decodeOnChainConfig(raw: unknown): OnChainConfig {
  const r = raw as Record<string, unknown>;
  return {
    minAmount: asBig(r.min_amount),
    maxAmount: asBig(r.max_amount),
    maxLockSecs: asNum(r.max_lock_secs),
    delayThreshold: asBig(r.delay_threshold),
    delaySecs: asNum(r.delay_secs),
    paused: Boolean(r.paused),
  };
}

/**
 * Encodes the contract's `Config` struct. Soroban structs are ScMaps with symbol keys
 * in sorted order, and field widths must match exactly (u64 secs, i128 amounts) — letting
 * nativeToScVal infer numbers would produce u32 and the host would reject the call.
 */
export function encodeOnChainConfig(config: OnChainConfig): xdr.ScVal {
  const entry = (key: string, val: xdr.ScVal) =>
    new xdr.ScMapEntry({ key: xdr.ScVal.scvSymbol(key), val });

  return xdr.ScVal.scvMap([
    entry('delay_secs', nativeToScVal(BigInt(config.delaySecs), { type: 'u64' })),
    entry('delay_threshold', nativeToScVal(config.delayThreshold, { type: 'i128' })),
    entry('max_amount', nativeToScVal(config.maxAmount, { type: 'i128' })),
    entry('max_lock_secs', nativeToScVal(BigInt(config.maxLockSecs), { type: 'u64' })),
    entry('min_amount', nativeToScVal(config.minAmount, { type: 'i128' })),
    entry('paused', xdr.ScVal.scvBool(config.paused)),
  ]);
}
