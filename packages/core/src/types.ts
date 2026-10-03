export type ChequeState =
  | 'DRAFT'
  | 'PENDING_FUNDING'
  | 'ACTIVE'
  | 'CANCELLED'
  | 'CLAIMING'
  | 'AUTHORIZED'
  | 'SETTLING'
  | 'SETTLED'
  | 'EXPIRED'
  | 'REFUNDING'
  | 'REFUNDED'
  | 'REFUND_REVIEW';

export type FundingMethod = 'MOMO' | 'USDC';

export type FundingStatus = 'PENDING' | 'CONFIRMED' | 'FAILED' | 'EXPIRED';

export type DestinationType = 'MOMO' | 'USDC' | 'BANK';

export type MoMoNetwork = 'MTN' | 'TELECEL' | 'AIRTELTIGO';

export type PayoutStatus = 'PENDING' | 'SENT' | 'CONFIRMED' | 'FAILED';

export type RefundStatus = 'PENDING' | 'CONFIRMED' | 'FAILED' | 'REVIEW';

export type LedgerAccount =
  | 'sender_funds'
  | 'cheque_escrow'
  | 'payout_pending'
  | 'settled'
  | 'fees'
  | 'fx_buffer';

export interface Cheque {
  id: string;
  publicCode: string; // e.g. CHQ-82F91K (display only)
  claimTokenHash: string; // SHA-256 of the 128-bit secret URL token
  senderId: string;
  payeeName: string;
  payeePhoneE164: string; // +233XXXXXXXXX
  faceAmountGhsMinor: number; // Integer pesewas
  feeMinor: number; // Integer pesewas
  note?: string; // Max 80 chars
  state: ChequeState;
  expiresAt: Date;
  quoteId?: string;
  usdcAmountStroops?: number; // Integer stroops (1 USDC = 10,000,000 stroops)
  fxRate?: string; // Stored as decimal string e.g. "15.420000" to preserve precision
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
}

export interface ClaimSession {
  id: string;
  chequeId: string;
  otpHash: string;
  attempts: number;
  verifiedAt?: Date;
  expiresAt: Date;
  deviceFp?: string;
  sessionToken?: string;
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
}

export interface Payout {
  id: string;
  chequeId: string;
  destinationId: string;
  status: PayoutStatus;
  providerRef?: string;
  idempotencyKey: string;
  attempts: number;
  lastError?: string;
  createdAt: Date;
}

export interface Refund {
  id: string;
  chequeId: string;
  method: FundingMethod;
  status: RefundStatus;
  providerRef?: string;
  amountMinor: number;
  createdAt: Date;
}

export interface LedgerEntry {
  id: string;
  txId: string;
  account: LedgerAccount;
  debitMinor: number; // integer minor units
  creditMinor: number; // integer minor units
  chequeId?: string;
  currency: 'GHS' | 'USDC';
  createdAt: Date;
}

export interface LedgerTransaction {
  txId: string;
  chequeId?: string;
  currency: 'GHS' | 'USDC';
  description: string;
  entries: {
    account: LedgerAccount;
    debitMinor: number;
    creditMinor: number;
  }[];
  createdAt: Date;
}

// Settlement Adapter types
export interface Quote {
  quoteId: string;
  fromAsset: 'GHS' | 'USDC';
  toAsset: 'GHS' | 'USDC';
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
  fund(cheque: Cheque, method: FundingMethod): Promise<FundingRef>;
  settle(cheque: Cheque, destination: Destination, idempotencyKey: string): Promise<PayoutRef>;
  status(payoutRef: string): Promise<PayoutStatusResult>;
  refund(cheque: Cheque): Promise<RefundRef>;
  lookupAccountName?(phoneE164: string, network: MoMoNetwork): Promise<AccountNameLookupResult>;
}
