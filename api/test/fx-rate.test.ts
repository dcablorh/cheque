import { describe, it, expect, vi } from 'vitest';
import { FxRateService } from '../src/fx-rate.js';
import type { Env } from '@cheque/shared';

function makeEnv(overrides: Partial<Env> = {}): Env {
  return {
    FX_PROVIDER_URL: 'https://fx.test/latest/USD',
    FX_CACHE_TTL_SECONDS: 300,
    FX_GHS_PER_USDC: '15.500000',
    FX_NGN_PER_USDC: '1550.000000',
    FX_USD_PER_USDC: '1.000000',
    ...overrides,
  } as Env;
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('FxRateService', () => {
  it('returns provider rates for GHS and NGN', async () => {
    const fetchFn = vi.fn(async () =>
      jsonResponse({ rates: { GHS: 15.4, NGN: 1540.25, USD: 1 } })
    ) as unknown as typeof fetch;
    const fx = new FxRateService(makeEnv(), fetchFn);

    const ghs = await fx.getQuote('GHS');
    const ngn = await fx.getQuote('NGN');

    expect(ghs.rate).toBe('15.400000');
    expect(ghs.source).toBe('fx.test');
    expect(ngn.rate).toBe('1540.250000');
  });

  it('always returns 1.000000 for USD without calling the provider', async () => {
    const fetchFn = vi.fn() as unknown as typeof fetch;
    const fx = new FxRateService(makeEnv(), fetchFn);

    const usd = await fx.getQuote('USD');

    expect(usd.rate).toBe('1.000000');
    expect(usd.source).toBe('peg');
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('caches rates within the TTL', async () => {
    const fetchFn = vi.fn(async () =>
      jsonResponse({ rates: { GHS: 15.4, NGN: 1540 } })
    ) as unknown as typeof fetch;
    const fx = new FxRateService(makeEnv(), fetchFn);

    await fx.getQuote('GHS');
    await fx.getQuote('NGN');

    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('falls back to env when the provider fails', async () => {
    const fetchFn = vi.fn(async () => {
      throw new Error('network down');
    }) as unknown as typeof fetch;
    const fx = new FxRateService(makeEnv(), fetchFn);

    const ghs = await fx.getQuote('GHS');

    expect(ghs.rate).toBe('15.500000');
    expect(ghs.source).toBe('env-fallback');
  });

  it('falls back to env on a non-2xx response', async () => {
    const fetchFn = vi.fn(
      async () => new Response('nope', { status: 503 })
    ) as unknown as typeof fetch;
    const fx = new FxRateService(makeEnv(), fetchFn);

    const ngn = await fx.getQuote('NGN');

    expect(ngn.rate).toBe('1550.000000');
    expect(ngn.source).toBe('env-fallback');
  });

  it('falls back when the provider omits a currency', async () => {
    const fetchFn = vi.fn(async () => jsonResponse({ rates: { EUR: 0.9 } })) as unknown as typeof fetch;
    const fx = new FxRateService(makeEnv(), fetchFn);

    const ghs = await fx.getQuote('GHS');

    expect(ghs.rate).toBe('15.500000');
    expect(ghs.source).toBe('env-fallback');
  });

  it('collapses concurrent requests into one fetch', async () => {
    let resolveFetch!: (r: Response) => void;
    const fetchFn = vi.fn(
      () => new Promise<Response>((resolve) => (resolveFetch = resolve))
    ) as unknown as typeof fetch;
    const fx = new FxRateService(makeEnv(), fetchFn);

    const pending = Promise.all([fx.getQuote('GHS'), fx.getQuote('NGN')]);
    resolveFetch(jsonResponse({ rates: { GHS: 15.4, NGN: 1540 } }));
    const [ghs, ngn] = await pending;

    expect(ghs.rate).toBe('15.400000');
    expect(ngn.rate).toBe('1540.000000');
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });
});
