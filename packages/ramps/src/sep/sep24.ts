import { logger } from '@cheque/shared';
import { fetchWithRetry } from './http.js';
import { Sep24InteractiveResponse } from './types.js';

export interface Sep24Config {
  transferServerUrl: string;
}

export class Sep24Client {
  private transferServerUrl: string;

  constructor(config: Sep24Config) {
    this.transferServerUrl = config.transferServerUrl.replace(/\/$/, '');
  }

  /**
   * Initiates a hosted interactive deposit flow.
   * Returns interactive URL to display to the user in an iframe/popup.
   */
  async interactiveDeposit(
    params: {
      asset_code: string;
      destination_account: string;
      amount?: string;
      extraFields?: Record<string, string>;
    },
    authToken: string
  ): Promise<Sep24InteractiveResponse> {
    const url = `${this.transferServerUrl}/transactions/deposit/interactive`;
    logger.info(`Requesting SEP-24 interactive deposit URL for ${params.destination_account.slice(0, 4)}...`);

    const formData = new URLSearchParams();
    formData.append('asset_code', params.asset_code);
    formData.append('destination_account', params.destination_account);
    if (params.amount) formData.append('amount', params.amount);

    if (params.extraFields) {
      for (const [key, value] of Object.entries(params.extraFields)) {
        if (value !== undefined) formData.append(key, value);
      }
    }

    return fetchWithRetry<Sep24InteractiveResponse>(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${authToken}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body: formData.toString(),
    });
  }

  /**
   * Initiates a hosted interactive withdrawal flow.
   * Returns interactive URL to display to the user in an iframe/popup.
   */
  async interactiveWithdraw(
    params: {
      asset_code: string;
      account?: string;
      amount?: string;
      extraFields?: Record<string, string>;
    },
    authToken: string
  ): Promise<Sep24InteractiveResponse> {
    const url = `${this.transferServerUrl}/transactions/withdraw/interactive`;
    logger.info(`Requesting SEP-24 interactive withdraw URL for asset ${params.asset_code}`);

    const formData = new URLSearchParams();
    formData.append('asset_code', params.asset_code);
    if (params.account) formData.append('account', params.account);
    if (params.amount) formData.append('amount', params.amount);

    if (params.extraFields) {
      for (const [key, value] of Object.entries(params.extraFields)) {
        if (value !== undefined) formData.append(key, value);
      }
    }

    return fetchWithRetry<Sep24InteractiveResponse>(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${authToken}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body: formData.toString(),
    });
  }
}
