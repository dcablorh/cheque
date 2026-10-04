import crypto from 'node:crypto';
import { logger } from '@cheque/shared';
import { fetchWithRetry } from './http.js';
import {
  Sep6Info,
  Sep6DepositResponse,
  Sep6WithdrawResponse,
  Sep6Transaction,
  AnchorWebhookEvent,
} from './types.js';

export interface Sep6Config {
  transferServerUrl: string;
  webhookSecret?: string;
}

export class Sep6Client {
  private transferServerUrl: string;
  private webhookSecret?: string;
  private processedEvents = new Set<string>();

  constructor(config: Sep6Config) {
    this.transferServerUrl = config.transferServerUrl.replace(/\/$/, '');
    this.webhookSecret = config.webhookSecret;
  }

  /**
   * Fetches anchor SEP-6 capabilities and parameter schemas.
   */
  async getInfo(): Promise<Sep6Info> {
    const url = `${this.transferServerUrl}/info`;
    return fetchWithRetry<Sep6Info>(url, { method: 'GET' });
  }

  /**
   * Initiates a programmatic deposit (e.g. Mobile Money GHS -> USDC on Stellar).
   */
  async deposit(
    params: {
      asset_code: string;
      account: string;
      amount?: string;
      memo_type?: 'text' | 'id' | 'hash';
      memo?: string;
      type?: string;
      funding_method?: string;
      extraFields?: Record<string, string>;
    },
    authToken: string
  ): Promise<Sep6DepositResponse> {
    const url = new URL(`${this.transferServerUrl}/deposit`);
    url.searchParams.set('asset_code', params.asset_code);
    url.searchParams.set('account', params.account);
    if (params.amount) url.searchParams.set('amount', params.amount);
    if (params.memo_type) url.searchParams.set('memo_type', params.memo_type);
    if (params.memo) url.searchParams.set('memo', params.memo);
    if (params.type) url.searchParams.set('type', params.type);
    if (params.funding_method) url.searchParams.set('funding_method', params.funding_method);

    if (params.extraFields) {
      for (const [key, value] of Object.entries(params.extraFields)) {
        if (value !== undefined) url.searchParams.set(key, value);
      }
    }

    logger.info(`Initiating SEP-6 deposit for asset ${params.asset_code} to account ${params.account.slice(0, 4)}...`);

    return fetchWithRetry<Sep6DepositResponse>(url.toString(), {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${authToken}`,
        Accept: 'application/json',
      },
    });
  }

  /**
   * Initiates a programmatic withdrawal (e.g. USDC on Stellar -> Ghana Mobile Money GHS).
   */
  async withdraw(
    params: {
      asset_code: string;
      type: string; // e.g. "mobile" or "bank_account"
      dest: string; // Mobile money phone number or bank account
      dest_extra?: string; // Network operator (MTN, Vodafone, AirtelTigo)
      amount?: string;
      account?: string;
      memo?: string;
      memo_type?: 'text' | 'id' | 'hash';
      extraFields?: Record<string, string>;
    },
    authToken: string
  ): Promise<Sep6WithdrawResponse> {
    const url = new URL(`${this.transferServerUrl}/withdraw`);
    url.searchParams.set('asset_code', params.asset_code);
    url.searchParams.set('type', params.type);
    url.searchParams.set('dest', params.dest);
    if (params.dest_extra) url.searchParams.set('dest_extra', params.dest_extra);
    if (params.amount) url.searchParams.set('amount', params.amount);
    if (params.account) url.searchParams.set('account', params.account);
    if (params.memo) url.searchParams.set('memo', params.memo);
    if (params.memo_type) url.searchParams.set('memo_type', params.memo_type);

    if (params.extraFields) {
      for (const [key, value] of Object.entries(params.extraFields)) {
        if (value !== undefined) url.searchParams.set(key, value);
      }
    }

    logger.info(`Initiating SEP-6 withdraw to ${params.type}:${params.dest_extra || ''}`);

    return fetchWithRetry<Sep6WithdrawResponse>(url.toString(), {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${authToken}`,
        Accept: 'application/json',
      },
    });
  }

  /**
   * Queries status of an existing transaction by ID.
   */
  async getTransaction(
    params: {
      id?: string;
      stellar_transaction_id?: string;
      external_transaction_id?: string;
    },
    authToken: string
  ): Promise<{ transaction: Sep6Transaction }> {
    const url = new URL(`${this.transferServerUrl}/transaction`);
    if (params.id) url.searchParams.set('id', params.id);
    if (params.stellar_transaction_id) url.searchParams.set('stellar_transaction_id', params.stellar_transaction_id);
    if (params.external_transaction_id) url.searchParams.set('external_transaction_id', params.external_transaction_id);

    return fetchWithRetry<{ transaction: Sep6Transaction }>(url.toString(), {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${authToken}`,
        Accept: 'application/json',
      },
    });
  }

  /**
   * Polls transaction until it reaches a terminal status or target status.
   */
  async pollTransaction(
    transactionId: string,
    authToken: string,
    options: {
      maxAttempts?: number;
      intervalMs?: number;
      targetStatuses?: string[];
    } = {}
  ): Promise<Sep6Transaction> {
    const maxAttempts = options.maxAttempts ?? 20;
    const intervalMs = options.intervalMs ?? 2000;
    const targetStatuses = options.targetStatuses ?? ['completed', 'failed', 'refunded', 'expired'];

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const res = await this.getTransaction({ id: transactionId }, authToken);
      const tx = res.transaction;

      logger.debug(`[Poll ${attempt}/${maxAttempts}] Transaction ${transactionId} status: ${tx.status}`);

      if (targetStatuses.includes(tx.status)) {
        return tx;
      }

      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }

    throw new Error(`Transaction ${transactionId} polling timed out after ${maxAttempts} attempts`);
  }

  /**
   * Ingests, verifies HMAC signature, and deduplicates incoming anchor webhooks.
   */
  ingestWebhook(
    rawBody: string | Buffer,
    signatureHeader?: string,
    secret = this.webhookSecret
  ): { event: AnchorWebhookEvent; isDuplicate: boolean } {
    if (secret && signatureHeader) {
      const incomingHash = signatureHeader.replace(/^sha256=/, '');
      const expectedHash = crypto
        .createHmac('sha256', secret)
        .update(rawBody)
        .digest('hex');

      const incomingBuf = Buffer.from(incomingHash, 'hex');
      const expectedBuf = Buffer.from(expectedHash, 'hex');

      if (incomingBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(incomingBuf, expectedBuf)) {
        throw new Error('Invalid anchor webhook HMAC signature');
      }
    }

    const payloadString = typeof rawBody === 'string' ? rawBody : rawBody.toString('utf8');
    const event = JSON.parse(payloadString) as AnchorWebhookEvent;

    // Deduplication check based on order_id + event + status
    const dedupeKey = `${event.order_id}:${event.event}:${event.type}`;
    const isDuplicate = this.processedEvents.has(dedupeKey);

    if (!isDuplicate) {
      this.processedEvents.add(dedupeKey);
      // Evict older entries if cache grows past 10,000
      if (this.processedEvents.size > 10000) {
        const first = this.processedEvents.values().next().value;
        if (first) this.processedEvents.delete(first);
      }
    }

    return { event, isDuplicate };
  }
}
