import { logger } from '@cheque/shared';
import { fetchWithRetry } from './http.js';
import { Sep38Info, Sep38PricesResponse, Sep38QuoteRequest, Sep38Quote } from './types.js';

export interface Sep38Config {
  quoteServerUrl: string;
}

export class Sep38Client {
  private quoteServerUrl: string;

  constructor(config: Sep38Config) {
    this.quoteServerUrl = config.quoteServerUrl.replace(/\/$/, '');
  }

  /**
   * Fetches supported assets, delivery methods, and country codes.
   */
  async getInfo(authToken?: string): Promise<Sep38Info> {
    const url = `${this.quoteServerUrl}/info`;
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (authToken) headers['Authorization'] = `Bearer ${authToken}`;

    return fetchWithRetry<Sep38Info>(url, { method: 'GET', headers });
  }

  /**
   * Gets indicative prices for all buy assets given a sell asset.
   */
  async getPrices(sellAsset: string, authToken?: string): Promise<Sep38PricesResponse> {
    const url = new URL(`${this.quoteServerUrl}/prices`);
    url.searchParams.set('sell_asset', sellAsset);

    const headers: Record<string, string> = { Accept: 'application/json' };
    if (authToken) headers['Authorization'] = `Bearer ${authToken}`;

    return fetchWithRetry<Sep38PricesResponse>(url.toString(), { method: 'GET', headers });
  }

  /**
   * Gets an indicative price for a specific pair and amount.
   */
  async getPrice(
    params: {
      sell_asset: string;
      buy_asset: string;
      sell_amount?: string;
      buy_amount?: string;
      context?: string;
    },
    authToken?: string
  ): Promise<{ price: string; total_price: string; sell_amount: string; buy_amount: string }> {
    const url = new URL(`${this.quoteServerUrl}/price`);
    url.searchParams.set('sell_asset', params.sell_asset);
    url.searchParams.set('buy_asset', params.buy_asset);
    if (params.sell_amount) url.searchParams.set('sell_amount', params.sell_amount);
    if (params.buy_amount) url.searchParams.set('buy_amount', params.buy_amount);
    if (params.context) url.searchParams.set('context', params.context);

    const headers: Record<string, string> = { Accept: 'application/json' };
    if (authToken) headers['Authorization'] = `Bearer ${authToken}`;

    return fetchWithRetry<{ price: string; total_price: string; sell_amount: string; buy_amount: string }>(
      url.toString(),
      { method: 'GET', headers }
    );
  }

  /**
   * Requests a firm, binding quote with fixed validity window.
   */
  async requestQuote(request: Sep38QuoteRequest, authToken: string): Promise<Sep38Quote> {
    const url = `${this.quoteServerUrl}/quote`;
    logger.info(`Requesting SEP-38 firm quote: ${request.sell_asset} -> ${request.buy_asset}`);

    return fetchWithRetry<Sep38Quote>(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${authToken}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(request),
    });
  }

  /**
   * Fetches an existing quote by ID.
   */
  async getQuote(quoteId: string, authToken: string): Promise<Sep38Quote> {
    const url = `${this.quoteServerUrl}/quote/${encodeURIComponent(quoteId)}`;
    return fetchWithRetry<Sep38Quote>(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${authToken}`,
        Accept: 'application/json',
      },
    });
  }
}
