import {
  Horizon,
  rpc,
  Asset,
  Operation,
  TransactionBuilder,
  Networks,
  Keypair,
} from '@stellar/stellar-sdk';
import { KeySigner } from './signer.js';
import { logger } from '@cheque/shared';

export interface StellarConfig {
  networkPassphrase: string;
  horizonUrl: string;
  sorobanRpcUrl: string;
  usdcIssuer: string;
  usdcAssetCode?: string;
}

export interface PreparedSubmission {
  txHash: string;
  signedXdr: string;
}

export class StellarClient {
  public readonly horizon: Horizon.Server;
  public readonly rpcServer: rpc.Server;
  public readonly usdcAsset: Asset;
  public readonly config: StellarConfig;

  constructor(config: StellarConfig) {
    this.config = config;
    this.horizon = new Horizon.Server(config.horizonUrl);
    this.rpcServer = new rpc.Server(config.sorobanRpcUrl);
    this.usdcAsset = new Asset(config.usdcAssetCode ?? 'USDC', config.usdcIssuer);
  }

  /**
   * Funds an account via Stellar Testnet Friendbot.
   */
  async fundWithFriendbot(publicKey: string): Promise<boolean> {
    try {
      const response = await fetch(`https://friendbot.stellar.org?addr=${encodeURIComponent(publicKey)}`);
      if (!response.ok) {
        const text = await response.text();
        throw new Error(`Friendbot failed with status ${response.status}: ${text}`);
      }
      return true;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`Friendbot funding error for ${publicKey}: ${msg}`);
    }
  }

  /**
   * Checks XLM and USDC balances and trustline status for an account.
   */
  async getAccountBalances(publicKey: string): Promise<{
    exists: boolean;
    xlmBalance: string;
    usdcBalance: string;
    hasUsdcTrustline: boolean;
  }> {
    try {
      const account = await this.horizon.loadAccount(publicKey);
      let xlmBalance = '0';
      let usdcBalance = '0';
      let hasUsdcTrustline = false;

      for (const balance of account.balances) {
        if (balance.asset_type === 'native') {
          xlmBalance = balance.balance;
        } else if (
          'asset_code' in balance &&
          balance.asset_code === this.usdcAsset.getCode() &&
          balance.asset_issuer === this.usdcAsset.getIssuer()
        ) {
          hasUsdcTrustline = true;
          usdcBalance = balance.balance;
        }
      }

      return {
        exists: true,
        xlmBalance,
        usdcBalance,
        hasUsdcTrustline,
      };
    } catch (err: unknown) {
      if (typeof err === 'object' && err !== null && 'response' in err) {
        const res = (err as { response?: { status?: number } }).response;
        if (res?.status === 404) {
          return {
            exists: false,
            xlmBalance: '0',
            usdcBalance: '0',
            hasUsdcTrustline: false,
          };
        }
      }
      throw err;
    }
  }

  /**
   * Establishes a USDC trustline for an account.
   * Signed by the account's signer, with transaction fee paid by source or feeAccount.
   */
  async establishUsdcTrustline(
    signer: KeySigner,
    feeSigner?: KeySigner
  ): Promise<{ txHash: string; signedXdr: string }> {
    const publicKey = await signer.getPublicKey();
    const account = await this.horizon.loadAccount(publicKey);

    const fee = await this.horizon.fetchBaseFee();

    const txBuilder = new TransactionBuilder(account, {
      fee: fee.toString(),
      networkPassphrase: this.config.networkPassphrase,
    })
      .addOperation(
        Operation.changeTrust({
          asset: this.usdcAsset,
        })
      )
      .setTimeout(60);

    const tx = txBuilder.build();
    await signer.signTransaction(tx);
    if (feeSigner && (await feeSigner.getPublicKey()) !== publicKey) {
      await feeSigner.signTransaction(tx);
    }

    const signedXdr = tx.toXDR();
    const txHash = tx.hash().toString('hex');

    // Rule 5: store/log signed XDR & hash BEFORE submitting to Horizon
    logger.info(`Submitting trustline transaction for ${publicKey} with hash ${txHash}`);
    await this.horizon.submitTransaction(tx);

    return { txHash, signedXdr };
  }

  /**
   * Submits a pre-signed transaction XDR, handling idempotency and duplicate checking.
   */
  async submitTransactionXdr(signedXdr: string): Promise<{ txHash: string; ledger: number }> {
    const tx = TransactionBuilder.fromXDR(signedXdr, this.config.networkPassphrase);
    const txHash = tx.hash().toString('hex');

    try {
      const res = await this.horizon.submitTransaction(tx as any);
      return {
        txHash: res.hash,
        ledger: res.ledger,
      };
    } catch (err: unknown) {
      // Check if already included in a ledger
      const existing = await this.horizon.transactions().transaction(txHash).call().catch(() => null);
      if (existing) {
        return {
          txHash: existing.hash,
          ledger: existing.ledger_attr,
        };
      }
      throw err;
    }
  }
}
