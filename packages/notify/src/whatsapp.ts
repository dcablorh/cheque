import crypto from 'node:crypto';
import { logger } from '@cheque/shared';
import { normalizePhone } from './phone.js';

export interface WhatsAppConfig {
  apiToken: string;
  phoneNumberId: string;
  businessAccountId?: string;
  appSecret?: string;
  webhookVerifyToken?: string;
}

export type WhatsAppTemplateName =
  | 'otp'
  | 'cheque_received'
  | 'cheque_claimed'
  | 'cheque_expiring'
  | 'payout_delivered';

export type WhatsAppMessageStatus = 'sent' | 'delivered' | 'read' | 'failed';

export interface WhatsAppDeliveryReceipt {
  messageId: string;
  recipientPhone: string;
  status: WhatsAppMessageStatus;
  timestamp: Date;
  errorCode?: number;
  errorMessage?: string;
}

export class WhatsAppApiError extends Error {
  public readonly statusCode: number;
  public readonly errorCode?: number;
  public readonly errorSubcode?: number;
  public readonly userGuidance: string;

  constructor(params: {
    message: string;
    statusCode: number;
    errorCode?: number;
    errorSubcode?: number;
    userGuidance: string;
  }) {
    super(params.message);
    this.name = 'WhatsAppApiError';
    this.statusCode = params.statusCode;
    this.errorCode = params.errorCode;
    this.errorSubcode = params.errorSubcode;
    this.userGuidance = params.userGuidance;
  }
}

export class WhatsAppClient {
  private config: WhatsAppConfig;

  constructor(config: WhatsAppConfig) {
    this.config = config;
  }

  /**
   * Checks if a user is within the 24-hour Customer Service Window.
   * Free-form messages can ONLY be sent within 24h of the user's last inbound message.
   * Outside this window, ONLY pre-approved template messages can be sent.
   */
  isWithin24hWindow(lastInboundTimestamp?: Date | null): boolean {
    if (!lastInboundTimestamp) return false;
    const diffMs = Date.now() - lastInboundTimestamp.getTime();
    return diffMs >= 0 && diffMs <= 24 * 60 * 60 * 1000;
  }

  /**
   * Sends an approved WhatsApp template message via Meta WhatsApp Business Cloud API.
   * Formats numbers and maps API errors.
   */
  async sendTemplate(params: {
    recipientPhoneE164: string;
    templateName: WhatsAppTemplateName;
    languageCode?: string;
    parameters?: string[];
    buttonPayload?: string;
  }): Promise<{ messageId: string }> {
    const { recipientPhoneE164, templateName, languageCode = 'en', parameters = [] } = params;

    const norm = normalizePhone(recipientPhoneE164);
    const to = norm.isValid ? norm.phoneE164.replace(/^\+/, '') : recipientPhoneE164.replace(/^\+/, '');

    const components: unknown[] = [];

    if (templateName === 'otp') {
      // Meta authentication templates format
      components.push({
        type: 'body',
        parameters: parameters.map((text) => ({ type: 'text', text })),
      });

      // One-Tap / Copy Code URL button for authentication template
      if (params.buttonPayload || parameters[0]) {
        components.push({
          type: 'button',
          sub_type: 'url',
          index: '0',
          parameters: [{ type: 'text', text: params.buttonPayload ?? parameters[0] }],
        });
      }
    } else if (parameters.length > 0) {
      components.push({
        type: 'body',
        parameters: parameters.map((text) => ({ type: 'text', text })),
      });
    }

    const payload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'template',
      template: {
        name: templateName,
        language: { code: languageCode },
        components,
      },
    };

    const url = `https://graph.facebook.com/v20.0/${this.config.phoneNumberId}/messages`;
    logger.info(`Sending WhatsApp template [${templateName}] to ${norm.phoneE164}`);

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.config.apiToken}`,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorJson = (await response.json().catch(() => null)) as any;
      const errorObj = errorJson?.error;
      const code = errorObj?.code;
      const subcode = errorObj?.error_subcode;
      const msg = errorObj?.message ?? (await response.text().catch(() => 'Unknown error'));

      const guidance = this.mapErrorCodeToGuidance(code, subcode);
      logger.error(`WhatsApp send failed (${response.status}): [Code ${code}] ${msg}`);

      throw new WhatsAppApiError({
        message: `WhatsApp API error (${response.status}): ${msg}`,
        statusCode: response.status,
        errorCode: code,
        errorSubcode: subcode,
        userGuidance: guidance,
      });
    }

    const data = (await response.json()) as { messages: { id: string }[] };
    return { messageId: data.messages[0]?.id ?? '' };
  }

  /**
   * Verifies the authenticity of incoming webhook requests using Meta's X-Hub-Signature-256.
   * Performs constant-time comparison against HMAC-SHA256 of raw body using appSecret.
   */
  verifyWebhookSignature(rawBody: string | Buffer, signatureHeader: string, appSecret?: string): boolean {
    const secret = appSecret ?? this.config.appSecret;
    if (!secret) {
      throw new Error('Meta App Secret is required for WhatsApp webhook signature verification');
    }

    if (!signatureHeader || !signatureHeader.startsWith('sha256=')) {
      return false;
    }

    const incomingHash = signatureHeader.slice(7);
    const expectedHash = crypto
      .createHmac('sha256', secret)
      .update(rawBody)
      .digest('hex');

    const incomingBuf = Buffer.from(incomingHash, 'hex');
    const expectedBuf = Buffer.from(expectedHash, 'hex');

    if (incomingBuf.length !== expectedBuf.length) {
      return false;
    }

    return crypto.timingSafeEqual(incomingBuf, expectedBuf);
  }

  /**
   * Parses delivery/read status updates from Meta WhatsApp Cloud API webhook payload.
   */
  parseDeliveryReceipts(webhookBody: any): WhatsAppDeliveryReceipt[] {
    const receipts: WhatsAppDeliveryReceipt[] = [];

    try {
      const entries = webhookBody?.entry ?? [];
      for (const entry of entries) {
        const changes = entry?.changes ?? [];
        for (const change of changes) {
          const value = change?.value;
          const statuses = value?.statuses ?? [];

          for (const s of statuses) {
            const messageId = s.id;
            const recipientPhone = s.recipient_id;
            const status = s.status as WhatsAppMessageStatus;
            const timestamp = s.timestamp ? new Date(parseInt(s.timestamp, 10) * 1000) : new Date();

            let errorCode: number | undefined;
            let errorMessage: string | undefined;

            if (s.errors && s.errors.length > 0) {
              errorCode = s.errors[0].code;
              errorMessage = s.errors[0].title || s.errors[0].message;
            }

            receipts.push({
              messageId,
              recipientPhone,
              status,
              timestamp,
              errorCode,
              errorMessage,
            });
          }
        }
      }
    } catch (err) {
      logger.error('Failed to parse WhatsApp delivery receipts from webhook:', err);
    }

    return receipts;
  }

  private mapErrorCodeToGuidance(code?: number, subcode?: number): string {
    switch (code) {
      case 131026:
        return 'The recipient phone number is not registered on WhatsApp or has opted out. Fall back to SMS.';
      case 131047:
        return 'The 24-hour customer service window has expired. Re-engagement requires an approved template message.';
      case 131042:
        return 'Business account payment issue. Verify payment method on Meta Business Manager.';
      case 100:
        return 'Invalid parameter format or missing template parameters.';
      case 190:
        return 'Meta API access token is expired or invalid. Refresh token via System User in Business Manager.';
      default:
        return 'WhatsApp message delivery failed. Recommend falling back to SMS.';
    }
  }
}
