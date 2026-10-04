import { logger } from '@cheque/shared';
import { Sep1Client } from './sep1.js';
import { Sep10Client } from './sep10.js';
import { Sep12Client } from './sep12.js';
import { Sep38Client } from './sep38.js';
import { Sep6Client } from './sep6.js';
import { Sep24Client } from './sep24.js';
import {
  Sep1Toml,
  Sep38Quote,
  Sep38PricesResponse,
  Sep6DepositResponse,
  Sep6WithdrawResponse,
  Sep6Transaction,
  Sep24InteractiveResponse,
  AnchorWebhookEvent,
  Sep12CustomerInfo,
  Sep12CustomerData,
} from './types.js';

export interface SepAnchorClientConfig {
  homeDomain: string;
  signerSecret: string;
  networkPassphrase?: string;
  useHostedSep24?: boolean; // Hosted interactive fallback behind flag
  webhookSecret?: string;
  cacheTtlMs?: number;
}

export class SepAnchorClient {
  public readonly config: SepAnchorClientConfig;
  public sep1: Sep1Client;
  public sep10?: Sep10Client;
  public sep12?: Sep12Client;
  public sep38?: Sep38Client;
  public sep6?: Sep6Client;
  public sep24?: Sep24Client;

  private toml?: Sep1Toml;
  private isInitialized = false;

  constructor(config: SepAnchorClientConfig) {
    this.config = config;
    this.sep1 = new Sep1Client({
      domain: config.homeDomain,
      cacheTtlMs: config.cacheTtlMs,
    });
  }

  /**
   * Initializes endpoints dynamically from SEP-1 stellar.toml.
   */
  async init(): Promise<Sep1Toml> {
    if (this.isInitialized && this.toml) {
      return this.toml;
    }

    logger.info(`Bootstrapping SEP Anchor Client for ${this.config.homeDomain}...`);
    this.toml = await this.sep1.getToml();

    if (!this.toml.SIGNING_KEY) {
      throw new Error(`Anchor ${this.config.homeDomain} stellar.toml is missing SIGNING_KEY`);
    }

    // 1. Initialize SEP-10 Auth Client
    const webAuthEndpoint = this.toml.WEB_AUTH_ENDPOINT || `https://${this.config.homeDomain}/auth`;
    this.sep10 = new Sep10Client({
      webAuthEndpoint,
      anchorSigningKey: this.toml.SIGNING_KEY,
      networkPassphrase: this.toml.NETWORK_PASSPHRASE || this.config.networkPassphrase,
      homeDomain: this.config.homeDomain,
    });

    // 2. Initialize SEP-12 KYC Client if available
    const kycServer = this.toml.KYC_SERVER || `https://${this.config.homeDomain}/sep12`;
    this.sep12 = new Sep12Client({ kycServerUrl: kycServer });

    // 3. Initialize SEP-38 Quote Client if available
    const quoteServer = this.toml.ANCHOR_QUOTE_SERVER || `https://${this.config.homeDomain}/sep38`;
    this.sep38 = new Sep38Client({ quoteServerUrl: quoteServer });

    // 4. Initialize SEP-6 Programmatic Client if available
    const transferServer = this.toml.TRANSFER_SERVER || `https://${this.config.homeDomain}/sep6`;
    this.sep6 = new Sep6Client({
      transferServerUrl: transferServer,
      webhookSecret: this.config.webhookSecret,
    });

    // 5. Initialize SEP-24 Hosted Client if available
    const sep24Server = this.toml.TRANSFER_SERVER_SEP0024 || `https://${this.config.homeDomain}`;
    this.sep24 = new Sep24Client({ transferServerUrl: sep24Server });

    this.isInitialized = true;
    logger.info(`SEP Anchor Client successfully initialized for ${this.config.homeDomain}`);
    return this.toml;
  }

  /**
   * Returns a valid SEP-10 JWT, caching and refreshing as needed.
   */
  async getAuthToken(forceRefresh = false): Promise<string> {
    await this.ensureInitialized();
    return this.sep10!.authenticate(this.config.signerSecret, forceRefresh);
  }

  /**
   * Queries prices across pairs (e.g. USDC -> GHS).
   */
  async getPrices(sellAsset: string): Promise<Sep38PricesResponse> {
    await this.ensureInitialized();
    const token = await this.getAuthToken().catch(() => undefined);
    return this.sep38!.getPrices(sellAsset, token);
  }

  /**
   * Requests a firm quote from the anchor.
   */
  async getQuote(params: {
    sellAsset: string;
    buyAsset: string;
    sellAmount?: string;
    buyAmount?: string;
    deliveryMethod?: string;
  }): Promise<Sep38Quote> {
    await this.ensureInitialized();
    const token = await this.getAuthToken();

    return this.sep38!.requestQuote(
      {
        context: this.config.useHostedSep24 ? 'sep24' : 'sep6',
        sell_asset: params.sellAsset,
        buy_asset: params.buyAsset,
        sell_amount: params.sellAmount,
        buy_amount: params.buyAmount,
        sell_delivery_method: params.deliveryMethod,
        buy_delivery_method: params.deliveryMethod,
      },
      token
    );
  }

  /**
   * Manages customer KYC (SEP-12).
   */
  async submitKyc(data: Sep12CustomerData): Promise<{ id: string }> {
    await this.ensureInitialized();
    const token = await this.getAuthToken();
    return this.sep12!.putCustomer(data, token);
  }

  async checkKycStatus(customerId?: string): Promise<Sep12CustomerInfo> {
    await this.ensureInitialized();
    const token = await this.getAuthToken();
    return this.sep12!.getCustomer({ id: customerId }, token);
  }

  /**
   * Deposits fiat/momo to receive crypto.
   * If useHostedSep24 is true, returns interactive URL. Otherwise programmatic SEP-6.
   */
  async deposit(params: {
    assetCode: string;
    account: string;
    amount?: string;
    fundingMethod?: string;
    type?: string;
    extraFields?: Record<string, string>;
  }): Promise<Sep6DepositResponse | Sep24InteractiveResponse> {
    await this.ensureInitialized();
    const token = await this.getAuthToken();

    if (this.config.useHostedSep24) {
      return this.sep24!.interactiveDeposit(
        {
          asset_code: params.assetCode,
          destination_account: params.account,
          amount: params.amount,
          extraFields: params.extraFields,
        },
        token
      );
    }

    return this.sep6!.deposit(
      {
        asset_code: params.assetCode,
        account: params.account,
        amount: params.amount,
        type: params.type,
        funding_method: params.fundingMethod,
        extraFields: params.extraFields,
      },
      token
    );
  }

  /**
   * Withdraws crypto to payout fiat/momo.
   * If useHostedSep24 is true, returns interactive URL. Otherwise programmatic SEP-6.
   */
  async withdraw(params: {
    assetCode: string;
    type: 'mobile' | 'bank_account';
    dest: string;
    destExtra?: string; // Network: MTN, Vodafone, AirtelTigo
    amount?: string;
    account?: string;
    extraFields?: Record<string, string>;
  }): Promise<Sep6WithdrawResponse | Sep24InteractiveResponse> {
    await this.ensureInitialized();
    const token = await this.getAuthToken();

    if (this.config.useHostedSep24) {
      return this.sep24!.interactiveWithdraw(
        {
          asset_code: params.assetCode,
          account: params.account,
          amount: params.amount,
          extraFields: params.extraFields,
        },
        token
      );
    }

    return this.sep6!.withdraw(
      {
        asset_code: params.assetCode,
        type: params.type,
        dest: params.dest,
        dest_extra: params.destExtra,
        amount: params.amount,
        account: params.account,
        extraFields: params.extraFields,
      },
      token
    );
  }

  /**
   * Polls a transfer transaction until complete or failed.
   */
  async pollTransaction(transactionId: string): Promise<Sep6Transaction> {
    await this.ensureInitialized();
    const token = await this.getAuthToken();
    return this.sep6!.pollTransaction(transactionId, token);
  }

  /**
   * Verifies and deduplicates incoming anchor webhook notifications.
   */
  ingestWebhook(
    rawBody: string | Buffer,
    signatureHeader?: string
  ): { event: AnchorWebhookEvent; isDuplicate: boolean } {
    if (!this.sep6) {
      throw new Error('Anchor client not initialized');
    }
    return this.sep6.ingestWebhook(rawBody, signatureHeader, this.config.webhookSecret);
  }

  private async ensureInitialized(): Promise<void> {
    if (!this.isInitialized) {
      await this.init();
    }
  }
}
