import type { DestinationChain } from './addresses.js';
import type { CorridorCode, FiatCurrency } from './corridors.js';

export type LedgerCurrency = FiatCurrency | 'USDC';

export type ChequeState =
  | 'DRAFT'
  | 'PENDING_FUNDING'
  | 'ACTIVE'
  | 'CLAIMING'
  | 'AUTHORIZED'
  | 'SETTLING'
  | 'SETTLED'
  | 'CANCELLED'
  | 'EXPIRED'
  | 'REFUNDING'
  | 'REFUNDED'
  | 'REFUND_REVIEW';

export type FundingMethod = 'MOMO' | 'USDC';

export type FundingStatus = 'PENDING' | 'CONFIRMED' | 'FAILED' | 'EXPIRED';

export type DestinationType = 'MOMO' | 'USDC' | 'BANK';

export type { DestinationChain };

export type MoMoNetwork = 'MTN' | 'TELECEL' | 'AIRTELTIGO';

export type PayoutStatus = 'PENDING' | 'SENT' | 'CONFIRMED' | 'FAILED';

export type RefundStatus = 'PENDING' | 'CONFIRMED' | 'FAILED' | 'REVIEW';

export type LedgerAccount =
  | 'sender_funds'
  | 'cheque_escrow_onchain'
  | 'payout_pending'
  | 'settled'
  | 'fees'
  | 'fx_buffer'
  | 'refunds_pending';

export interface User {
  id: string;
  phoneE164?: string;
  email?: string;
  name?: string;
  pinHash?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface Cheque {
  id: string;
  publicCode: string; // e.g. CHQ-82F91K (display only)
  claimTokenHash: string; // SHA-256 of the 128-bit secret URL token
  senderId: string;
  payeeName: string;
  payeeContactType?: 'PHONE' | 'EMAIL' | null;
  payeeContact?: string | null;
  corridor: CorridorCode; // Where the cheque is issued and paid out (see corridors.ts)
  currency: FiatCurrency; // Currency of faceAmountMinor and feeMinor
  faceAmountMinor: number; // Integer minor units of `currency` (pesewas for GHS, kobo for NGN, cents for USD)
  feeMinor: number; // Integer minor units of `currency`
  note?: string; // Max 80 chars
  signature?: string | null; // PNG data URL drawn by the sender
  funderAddress?: string | null; // Stellar G... address that deposited, when funded from a wallet
  state: ChequeState;
  expiresAt: Date;
  quoteId?: string;
  usdcAmountStroops?: number; // Integer stroops (1 USDC = 10,000,000 stroops)
  fxRate?: string; // Decimal string e.g. "15.420000"
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface FundingRecord {
  id: string;
  chequeId: string;
  method: FundingMethod;
  status: FundingStatus;
  providerRef?: string;
  amountMinor: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface ClaimSession {
  id: string;
  chequeId: string;
  otpHash: string;
  attempts: number;
  maxAttempts: number;
  verifiedAt?: Date;
  expiresAt: Date;
  deviceFp?: string;
  sessionToken?: string;
  createdAt: Date;
}

export interface Destination {
  id: string;
  chequeId: string;
  type: DestinationType;
  network?: MoMoNetwork;
  accountRef: string; // Phone number or Stellar public key or Bank account number
  accountName?: string;
  verifiedNameMatch: boolean;
  memo?: string; // Optional Stellar memo
  /** For type USDC: stellar (default), base, or solana. */
  chain?: DestinationChain;
  createdAt: Date;
}

export interface Payout {
  id: string;
  chequeId: string;
  destinationId: string;
  status: PayoutStatus;
  providerRef?: string;
  idempotencyKey: string;
  amountMinor: number;
  attempts: number;
  lastError?: string;
  destChain?: DestinationChain;
  feeQuoteMinor?: number; // micro-USDC (6 decimals) forwarding fee quoted at redeem/burn
  netAmountMinor?: number; // micro-USDC expected/received after the fee
  cctpMaxFeeMinor?: number;
  cctpBurnTx?: string;
  irisMessage?: Record<string, unknown>;
  cctpForwardTx?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface Refund {
  id: string;
  chequeId: string;
  method: FundingMethod;
  status: RefundStatus;
  providerRef?: string;
  amountMinor: number;
  reason?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface LedgerEntry {
  id: string;
  txId: string;
  account: LedgerAccount;
  debitMinor: number; // integer minor units
  creditMinor: number; // integer minor units
  chequeId?: string;
  currency: LedgerCurrency;
  description?: string;
  createdAt: Date;
}

export interface LedgerTransaction {
  txId: string;
  chequeId?: string;
  currency: LedgerCurrency;
  description: string;
  entries: {
    account: LedgerAccount;
    debitMinor: number;
    creditMinor: number;
  }[];
  createdAt: Date;
}

export interface AuditEvent {
  id: string;
  chequeId?: string;
  eventType: string;
  fromState?: string;
  toState?: string;
  actor: string;
  payload: Record<string, unknown>;
  createdAt: Date;
}

export interface WebhookEvent {
  id: string;
  provider: string;
  eventId: string;
  payload: Record<string, unknown>;
  processed: boolean;
  processedAt?: Date;
  createdAt: Date;
}

export interface OutboxItem {
  id: string;
  topic: string;
  aggregateType: string;
  aggregateId: string;
  payload: Record<string, unknown>;
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'DEAD_LETTER';
  attempts: number;
  maxAttempts: number;
  backoffMs: number;
  nextRunAt: Date;
  lockedAt?: Date;
  lockedBy?: string;
  lastError?: string;
  destChain?: DestinationChain;
  feeQuoteMinor?: number; // micro-USDC (6 decimals) forwarding fee quoted at redeem/burn
  netAmountMinor?: number; // micro-USDC expected/received after the fee
  cctpMaxFeeMinor?: number;
  cctpBurnTx?: string;
  irisMessage?: Record<string, unknown>;
  cctpForwardTx?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface IdempotencyKeyRecord {
  key: string;
  scope: string;
  requestHash?: string;
  responseCode?: number;
  responseBody?: Record<string, unknown>;
  status: 'IN_PROGRESS' | 'COMPLETED' | 'FAILED';
  createdAt: Date;
  expiresAt: Date;
}

export interface ChainTxRecord {
  id: string;
  chequeId?: string;
  operation: string;
  txHash: string;
  signedXdr: string;
  status: 'SUBMITTED' | 'CONFIRMED' | 'FAILED' | 'EXPIRED';
  ledger?: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface ChainEventEntity {
  id: string; // `${txHash}:${eventIndex}`
  txHash: string;
  eventIndex: number;
  ledger: number;
  contractId: string;
  topic: string;
  chequeIdHex: string;
  payload: Record<string, unknown>;
  createdAt: Date;
}

export interface AnchorTxRecord {
  id: string;
  chequeId?: string;
  anchorProvider: string;
  txType: 'DEPOSIT' | 'WITHDRAWAL';
  stellarTxId?: string;
  externalTxId?: string;
  amount: string;
  assetCode: string;
  status: string;
  rawDetails?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

// Settlement Adapter types
export interface Quote {
  quoteId: string;
  fromAsset: LedgerCurrency;
  toAsset: LedgerCurrency;
  fromAmountMinor: number;
  toAmountMinor: number;
  rate: string;
  expiresAt: Date;
  bufferMinor: number;
}

export interface FundingRef {
  providerRef: string;
  status: FundingStatus;
  paymentInstructions?: {
    momoPromptSent?: boolean;
    stellarAddress?: string;
    stellarMemo?: string;
    exactAmount?: string;
  };
}

export interface PayoutRef {
  providerRef: string;
  status: PayoutStatus;
}

export interface PayoutStatusResult {
  status: 'PENDING' | 'SUCCESS' | 'FAILED';
  reason?: string;
  retryable?: boolean;
  providerRef?: string;
}

export interface RefundRef {
  providerRef: string;
  status: RefundStatus;
}

export interface AccountNameLookupResult {
  accountName: string;
  network: MoMoNetwork;
  isRegistered: boolean;
  nameMatchWithPayee: boolean;
}

export interface SettlementAdapter {
  name: string;
  quote(cheque: Cheque): Promise<Quote>;
  /** `payer.phoneE164` is the SENDER's phone (MoMo prompt target); the payee contact is never used for funding. */
  fund(cheque: Cheque, method: FundingMethod, payer?: { phoneE164?: string }): Promise<FundingRef>;
  settle(cheque: Cheque, destination: Destination, idempotencyKey: string): Promise<PayoutRef>;
  status(payoutRef: string): Promise<PayoutStatusResult>;
  refund(cheque: Cheque): Promise<RefundRef>;
  lookupAccountName?(phoneE164: string, network: MoMoNetwork): Promise<AccountNameLookupResult>;
}
