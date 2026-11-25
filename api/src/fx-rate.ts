import type { FiatCurrency } from '@cheque/core';
import type { Env } from '@cheque/shared';
import { logger } from '@cheque/shared';

export interface FxQuote {
  /** Units of the currency per 1 USDC. */
  rate: string;
  source: string;
  updatedAt: Date;
}

interface CachedRates {
  rates: Record<string, number>;
  fetchedAt: number;
}

/**
 * Live FX rates with an in-memory cache and env fallback.
 * Provider returns USD-based rates: { rates: { GHS: 15.4, NGN: 1540, ... } }.
 */
export class FxRateService {
  private cache: CachedRates | null = null;
  private inflight: Promise<Record<string, number>> | null = null;
  private readonly ttlMs: number;
  private readonly providerUrl: string;
  private readonly fallbacks: Record<FiatCurrency, string>;

  constructor(env: Env, private readonly fetchFn: typeof fetch = fetch) {
    this.providerUrl = env.FX_PROVIDER_URL;
    this.ttlMs = env.FX_CACHE_TTL_SECONDS * 1000;
    this.fallbacks = {
      GHS: env.FX_GHS_PER_USDC,
      NGN: env.FX_NGN_PER_USDC,
      USD: env.FX_USD_PER_USDC,
    }; 
  }

  async getQuote(currency: FiatCurrency): Promise<FxQuote> {
    if (currency === 'USD') {
      return { rate: '1.000000', source: 'peg', updatedAt: new Date() };
    }

    try {
      const rates = await this.fetchRates();
      const value = rates[currency];
      if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
        return {
          rate: value.toFixed(6),
          source: new URL(this.providerUrl).host,
          updatedAt: new Date(this.cache!.fetchedAt),
        };
      }
      throw new Error(`Provider has no rate for ${currency}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.warn(`FX provider failed for ${currency} (${msg}); using env fallback`);
      return { rate: this.fallbacks[currency], source: 'env-fallback', updatedAt: new Date() };
    }
  }

  private async fetchRates(): Promise<Record<string, number>> {
    if (this.cache && Date.now() - this.cache.fetchedAt < this.ttlMs) {
      return this.cache.rates;
    }
    // Collapse concurrent fetches into one request.
    if (this.inflight) return this.inflight;

    this.inflight = (async () => {
      const res = await this.fetchFn(this.providerUrl, { signal: AbortSignal.timeout(5000) });
      if (!res.ok) throw new Error(`FX provider HTTP ${res.status}`);
      const body = (await res.json()) as { rates?: Record<string, number> };
      if (!body.rates || typeof body.rates !== 'object') {
        throw new Error('FX provider returned no rates');
      }
      this.cache = { rates: body.rates, fetchedAt: Date.now() };
      return body.rates;
    })();

    try {
      return await this.inflight;
    } finally {
      this.inflight = null;
    }
  }
}
