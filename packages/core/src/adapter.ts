import crypto from 'node:crypto';
import {
  SettlementAdapter,
  Cheque,
  Destination,
  Quote,
  FundingRef,
  PayoutRef,
  PayoutStatusResult,
  RefundRef,
  FundingMethod,
  MoMoNetwork,
  AccountNameLookupResult,
} from './types.js';

export interface MockAdapterOptions {
  mockRate?: string;
  mockPayoutSuccess?: boolean;
  failAsRetryable?: boolean;
  failureReason?: string;
  simulatedDelayMs?: number;
}

export class MockAdapter implements SettlementAdapter {
  public readonly name = 'MockAdapter';
  private payouts = new Map<string, PayoutStatusResult>();
  private options: MockAdapterOptions;

  constructor(options: MockAdapterOptions = {}) {
    this.options = {
      mockRate: '15.500000',
      mockPayoutSuccess: true,
      failAsRetryable: true,
      failureReason: 'Temporary network timeout',
      simulatedDelayMs: 0,
      ...options,
    };
  }

  setOptions(options: Partial<MockAdapterOptions>): void {
    this.options = { ...this.options, ...options };
  }

  async quote(cheque: Cheque): Promise<Quote> {
    const rateNum = parseFloat(this.options.mockRate ?? '15.5');
    // GHS pesewas to USDC stroops (1 GHS = 100 pesewas; 1 USDC = 10,000,000 stroops)
    // usdcAmount = (faceAmountGhs / rate)
    const faceGhs = cheque.faceAmountGhsMinor / 100;
    const usdc = faceGhs / rateNum;
    const usdcStroops = Math.round(usdc * 10_000_000);

    return {
      quoteId: `mock-quote-${crypto.randomUUID()}`,
      fromAsset: 'GHS',
      toAsset: 'USDC',
      fromAmountMinor: cheque.faceAmountGhsMinor,
      toAmountMinor: usdcStroops,
      rate: this.options.mockRate ?? '15.500000',
      expiresAt: new Date(Date.now() + 15 * 60 * 1000), // 15 min quote
      bufferMinor: Math.round(cheque.faceAmountGhsMinor * 0.02), // 2% FX buffer
    };
  }

  async fund(cheque: Cheque, method: FundingMethod): Promise<FundingRef> {
    const providerRef = `mock-fund-${crypto.randomUUID()}`;
    if (method === 'MOMO') {
      return {
        providerRef,
        status: 'PENDING',
        paymentInstructions: {
          momoPromptSent: true,
          exactAmount: (cheque.faceAmountGhsMinor / 100).toFixed(2),
        },
      };
    }

    return {
      providerRef,
      status: 'PENDING',
      paymentInstructions: {
        stellarAddress: 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN',
        stellarMemo: cheque.publicCode,
        exactAmount: ((cheque.usdcAmountStroops ?? 0) / 10_000_000).toFixed(7),
      },
    };
  }

  async settle(
    cheque: Cheque,
    destination: Destination,
    idempotencyKey: string
  ): Promise<PayoutRef> {
    const providerRef = `mock-payout-${idempotencyKey}`;

    if (this.options.mockPayoutSuccess) {
      this.payouts.set(providerRef, {
        status: 'SUCCESS',
        providerRef,
      });
      return {
        providerRef,
        status: 'CONFIRMED',
      };
    }

    const isRetryable = this.options.failAsRetryable ?? true;
    this.payouts.set(providerRef, {
      status: 'FAILED',
      reason: this.options.failureReason ?? 'Settlement failed',
      retryable: isRetryable,
      providerRef,
    });

    return {
      providerRef,
      status: 'FAILED',
    };
  }

  async status(payoutRef: string): Promise<PayoutStatusResult> {
    const result = this.payouts.get(payoutRef);
    if (!result) {
      return {
        status: 'PENDING',
        providerRef: payoutRef,
      };
    }
    return result;
  }

  async refund(cheque: Cheque): Promise<RefundRef> {
    return {
      providerRef: `mock-refund-${cheque.id}`,
      status: 'CONFIRMED',
    };
  }

  async lookupAccountName(phoneE164: string, network: MoMoNetwork): Promise<AccountNameLookupResult> {
    // Mock Ghana registered MoMo account lookup
    return {
      accountName: 'Kojo Mensah',
      network,
      isRegistered: true,
      nameMatchWithPayee: true,
    };
  }
}
