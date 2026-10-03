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
} from '@cheque/core';
import { logger } from '@cheque/shared';

export interface SeevCashConfig {
  baseUrl: string;
  apiKey: string;
  webhookSecret?: string;
  anchorDomain?: string;
}

export class SeevCashAdapter implements SettlementAdapter {
  public readonly name = 'SeevCashAdapter';
  private config: SeevCashConfig;

  constructor(config: SeevCashConfig) {
    if (!config.baseUrl) {
      throw new Error('SeevCashAdapter requires baseUrl');
    }
    this.config = config;
  }

  async quote(cheque: Cheque): Promise<Quote> {
    const url = `${this.config.baseUrl}/v1/quotes`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify({
        sell_asset: 'GHS',
        buy_asset: 'USDC',
        sell_amount_minor: cheque.faceAmountGhsMinor,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`SeevCash quote failed (${response.status}): ${errorText}`);
    }

    const data = (await response.json()) as {
      quote_id: string;
      rate: string;
      buy_amount_stroops: number;
      expires_at: string;
      buffer_minor: number;
    };

    return {
      quoteId: data.quote_id,
      fromAsset: 'GHS',
      toAsset: 'USDC',
      fromAmountMinor: cheque.faceAmountGhsMinor,
      toAmountMinor: data.buy_amount_stroops,
      rate: data.rate,
      expiresAt: new Date(data.expires_at),
      bufferMinor: data.buffer_minor,
    };
  }

  async fund(cheque: Cheque, method: FundingMethod): Promise<FundingRef> {
    const url = `${this.config.baseUrl}/v1/deposits`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify({
        cheque_id: cheque.id,
        method,
        amount_minor: cheque.faceAmountGhsMinor + cheque.feeMinor,
        sender_phone: cheque.payeePhoneE164, // sender's phone
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`SeevCash fund initiation failed (${response.status}): ${errorText}`);
    }

    const data = (await response.json()) as {
      deposit_id: string;
      status: 'PENDING' | 'CONFIRMED' | 'FAILED';
      payment_instructions?: {
        momo_prompt_sent?: boolean;
        stellar_address?: string;
        stellar_memo?: string;
        exact_amount?: string;
      };
    };

    return {
      providerRef: data.deposit_id,
      status: data.status,
      paymentInstructions: {
        momoPromptSent: data.payment_instructions?.momo_prompt_sent,
        stellarAddress: data.payment_instructions?.stellar_address,
        stellarMemo: data.payment_instructions?.stellar_memo,
        exactAmount: data.payment_instructions?.exact_amount,
      },
    };
  }

  async settle(
    cheque: Cheque,
    destination: Destination,
    idempotencyKey: string
  ): Promise<PayoutRef> {
    const url = `${this.config.baseUrl}/v1/withdrawals`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': idempotencyKey,
        Authorization: `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify({
        cheque_id: cheque.id,
        destination_type: destination.type,
        network: destination.network,
        account_ref: destination.accountRef,
        account_name: destination.accountName,
        amount_minor: cheque.faceAmountGhsMinor,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`SeevCash withdrawal initiation failed (${response.status}): ${errorText}`);
    }

    const data = (await response.json()) as {
      withdrawal_id: string;
      status: 'PENDING' | 'SENT' | 'CONFIRMED' | 'FAILED';
    };

    return {
      providerRef: data.withdrawal_id,
      status: data.status,
    };
  }

  async status(payoutRef: string): Promise<PayoutStatusResult> {
    const url = `${this.config.baseUrl}/v1/withdrawals/${encodeURIComponent(payoutRef)}`;
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${this.config.apiKey}`,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`SeevCash status query failed (${response.status}): ${errorText}`);
    }

    const data = (await response.json()) as {
      status: 'PENDING' | 'SUCCESS' | 'FAILED';
      reason?: string;
      retryable?: boolean;
    };

    return {
      status: data.status,
      reason: data.reason,
      retryable: data.retryable ?? true,
      providerRef: payoutRef,
    };
  }

  async refund(cheque: Cheque): Promise<RefundRef> {
    const url = `${this.config.baseUrl}/v1/refunds`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify({
        cheque_id: cheque.id,
        amount_minor: cheque.faceAmountGhsMinor,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`SeevCash refund initiation failed (${response.status}): ${errorText}`);
    }

    const data = (await response.json()) as {
      refund_id: string;
      status: 'PENDING' | 'CONFIRMED' | 'FAILED' | 'REVIEW';
    };

    return {
      providerRef: data.refund_id,
      status: data.status,
    };
  }

  /**
   * Rule 6: MoMo account-name lookup is informational only.
   * Never blocks a payout because the name differs from the cheque payee.
   */
  async lookupAccountName(phoneE164: string, network: MoMoNetwork): Promise<AccountNameLookupResult> {
    const url = `${this.config.baseUrl}/v1/lookup?phone=${encodeURIComponent(phoneE164)}&network=${network}`;
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${this.config.apiKey}`,
      },
    });

    if (!response.ok) {
      logger.warn(`Account name lookup unavailable for ${phoneE164}: status ${response.status}`);
      return {
        accountName: '',
        network,
        isRegistered: false,
        nameMatchWithPayee: false,
      };
    }

    const data = (await response.json()) as {
      account_name: string;
      is_registered: boolean;
    };

    return {
      accountName: data.account_name,
      network,
      isRegistered: data.is_registered,
      nameMatchWithPayee: true,
    };
  }
}
