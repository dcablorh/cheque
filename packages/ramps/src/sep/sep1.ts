import { StellarToml } from '@stellar/stellar-sdk';
import { logger } from '@cheque/shared';
import { Sep1Toml } from './types.js';

export interface Sep1Config {
  domain: string;
  cacheTtlMs?: number; // default: 3,600,000 (1 hour)
  allowHttp?: boolean;
}

export class Sep1Client {
  private domain: string;
  private cacheTtlMs: number;
  private allowHttp: boolean;
  private cachedToml?: Sep1Toml;
  private cachedAt?: number;

  constructor(config: Sep1Config) {
    this.domain = config.domain.replace(/^https?:\/\//, '').replace(/\/.*$/, '');
    this.cacheTtlMs = config.cacheTtlMs ?? 3600 * 1000;
    this.allowHttp = config.allowHttp ?? false;
  }

  /**
   * Fetches and parses the anchor's stellar.toml file.
   * Caches response in-memory according to TTL.
   */
  async getToml(forceRefresh = false): Promise<Sep1Toml> {
    const now = Date.now();
    if (!forceRefresh && this.cachedToml && this.cachedAt && now - this.cachedAt < this.cacheTtlMs) {
      return this.cachedToml;
    }

    logger.info(`Fetching SEP-1 stellar.toml for domain: ${this.domain}`);
    try {
      const rawToml = await StellarToml.Resolver.resolve(this.domain, {
        allowHttp: this.allowHttp,
      });

      const toml: Sep1Toml = {
        NETWORK_PASSPHRASE: rawToml.NETWORK_PASSPHRASE,
        TRANSFER_SERVER: rawToml.TRANSFER_SERVER,
        TRANSFER_SERVER_SEP0024: rawToml.TRANSFER_SERVER_SEP0024,
        WEB_AUTH_ENDPOINT: rawToml.WEB_AUTH_ENDPOINT,
        KYC_SERVER: rawToml.KYC_SERVER,
        DIRECT_PAYMENT_SERVER: rawToml.DIRECT_PAYMENT_SERVER,
        ANCHOR_QUOTE_SERVER: rawToml.ANCHOR_QUOTE_SERVER,
        SIGNING_KEY: rawToml.SIGNING_KEY,
        CURRENCIES: rawToml.CURRENCIES,
        DOCUMENTATION: rawToml.DOCUMENTATION,
        ...rawToml,
      };

      this.cachedToml = toml;
      this.cachedAt = now;
      return toml;
    } catch (err: unknown) {
      logger.error(`Failed to resolve SEP-1 stellar.toml for ${this.domain}: ${(err as Error).message}`);
      throw err;
    }
  }

  /**
   * Clears the in-memory TOML cache.
   */
  clearCache(): void {
    this.cachedToml = undefined;
    this.cachedAt = undefined;
  }
}
