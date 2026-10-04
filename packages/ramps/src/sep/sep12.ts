import { logger } from '@cheque/shared';
import { fetchWithRetry } from './http.js';
import { Sep12CustomerInfo, Sep12CustomerData } from './types.js';

export interface Sep12Config {
  kycServerUrl: string;
}

export class Sep12Client {
  private kycServerUrl: string;

  constructor(config: Sep12Config) {
    this.kycServerUrl = config.kycServerUrl.replace(/\/$/, '');
  }

  /**
   * Retrieves customer KYC status and required/provided fields.
   */
  async getCustomer(
    params: {
      id?: string;
      account?: string;
      memo?: string;
      type?: string;
      lang?: string;
    },
    authToken: string
  ): Promise<Sep12CustomerInfo> {
    const url = new URL(`${this.kycServerUrl}/customer`);
    if (params.id) url.searchParams.set('id', params.id);
    if (params.account) url.searchParams.set('account', params.account);
    if (params.memo) url.searchParams.set('memo', params.memo);
    if (params.type) url.searchParams.set('type', params.type);
    if (params.lang) url.searchParams.set('lang', params.lang);

    logger.debug(`Fetching SEP-12 customer info from ${url.toString()}`);

    const res = await fetchWithRetry<{ data?: Sep12CustomerInfo } & Sep12CustomerInfo>(
      url.toString(),
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${authToken}`,
          Accept: 'application/json',
        },
      }
    );

    // Support both direct SEP-12 format and { data: ... } wrapper
    return res.data ?? res;
  }

  /**
   * Submits or updates customer KYC details.
   * Returns customer ID. Per SEP-12, status should be queried via getCustomer().
   */
  async putCustomer(data: Sep12CustomerData, authToken: string): Promise<{ id: string }> {
    const url = `${this.kycServerUrl}/customer`;
    logger.info(`Submitting SEP-12 customer details for ${data.first_name || ''} ${data.last_name || ''}`);

    const res = await fetchWithRetry<{ data?: { id: string }; id?: string }>(url, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${authToken}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(data),
    });

    const customerId = res.data?.id ?? res.id;
    if (!customerId) {
      throw new Error('SEP-12 PUT /customer response missing customer id');
    }

    return { id: customerId };
  }

  /**
   * Deletes a customer's KYC data (Right to be Forgotten).
   */
  async deleteCustomer(customerId: string, authToken: string): Promise<boolean> {
    const url = `${this.kycServerUrl}/customer/${encodeURIComponent(customerId)}`;
    logger.info(`Deleting SEP-12 customer: ${customerId}`);

    try {
      await fetchWithRetry(url, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${authToken}`,
          Accept: 'application/json',
        },
      });
      return true;
    } catch (err: unknown) {
      logger.warn(`SEP-12 DELETE customer failed: ${(err as Error).message}`);
      return false;
    }
  }
}
