import { logger } from '@cheque/shared';
import { normalizePhone } from './phone.js';

export interface SmsConfig {
  provider: 'HUBTEL' | 'ARKESEL' | 'TWILIO';
  apiKey?: string;
  apiSecret?: string;
  senderId: string;
}

export type SmsDeliveryStatus = 'DELIVERED' | 'SENT' | 'FAILED' | 'PENDING';

export interface SmsDeliveryReceipt {
  messageId: string;
  recipientPhone: string;
  status: SmsDeliveryStatus;
  provider: 'HUBTEL' | 'ARKESEL' | 'TWILIO';
  timestamp: Date;
  rawPayload?: unknown;
}

export class SmsClient {
  private config: SmsConfig;

  constructor(config: SmsConfig) {
    this.config = config;
  }

  async sendSms(phoneInput: string, message: string): Promise<{ success: boolean; messageId?: string }> {
    const norm = normalizePhone(phoneInput);
    const phoneE164 = norm.isValid ? norm.phoneE164 : phoneInput;

    // Hubtel and Arkesel only deliver to Ghana; Nigeria and US numbers need Twilio.
    if (this.config.provider !== 'TWILIO' && norm.country !== 'GH') {
      throw new Error(
        `${this.config.provider} SMS only reaches Ghana numbers. Set SMS_PROVIDER=TWILIO to text ${norm.country ?? 'international'} numbers.`
      );
    }

    logger.info(`Sending fallback SMS via ${this.config.provider} to ${phoneE164}`);

    if (this.config.provider === 'HUBTEL') {
      // Hubtel Ghana SMS API (https://developers.hubtel.com/docs/send-message-quickstart)
      const auth = Buffer.from(`${this.config.apiKey}:${this.config.apiSecret ?? ''}`).toString('base64');
      const response = await fetch('https://sms.hubtel.com/v1/messages/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Basic ${auth}`,
        },
        body: JSON.stringify({
          From: this.config.senderId,
          To: phoneE164,
          Content: message,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Hubtel SMS failed (${response.status}): ${errorText}`);
      }
      const data = (await response.json()) as { MessageId?: string };
      return { success: true, messageId: data.MessageId };
    }

    if (this.config.provider === 'ARKESEL') {
      // Arkesel Ghana SMS API (https://developers.arkesel.com)
      const response = await fetch('https://sms.arkesel.com/api/v2/sms/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'api-key': this.config.apiKey ?? '',
        },
        body: JSON.stringify({
          sender: this.config.senderId,
          message,
          recipients: [phoneE164],
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Arkesel SMS failed (${response.status}): ${errorText}`);
      }
      const data = (await response.json()) as { data?: { id?: string }[] };
      return { success: true, messageId: data?.data?.[0]?.id };
    }

    // Default Twilio
    const auth = Buffer.from(`${this.config.apiKey}:${this.config.apiSecret ?? ''}`).toString('base64');
    const params = new URLSearchParams();
    params.append('To', phoneE164);
    params.append('From', this.config.senderId);
    params.append('Body', message);

    const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${this.config.apiKey}/Messages.json`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Twilio SMS failed (${response.status}): ${errorText}`);
    }

    const data = (await response.json()) as { sid: string };
    return { success: true, messageId: data.sid };
  }

  /**
   * Parses delivery receipts (DLR) from SMS provider webhooks.
   */
  parseDeliveryReceipt(body: any, provider = this.config.provider): SmsDeliveryReceipt | null {
    try {
      if (provider === 'HUBTEL') {
        const statusMap: Record<string, SmsDeliveryStatus> = {
          Delivered: 'DELIVERED',
          Sent: 'SENT',
          Failed: 'FAILED',
          Undelivered: 'FAILED',
        };
        return {
          messageId: String(body?.MessageId || body?.messageId || ''),
          recipientPhone: String(body?.To || body?.recipient || ''),
          status: statusMap[body?.Status || body?.status] ?? 'PENDING',
          provider: 'HUBTEL',
          timestamp: new Date(),
          rawPayload: body,
        };
      }

      if (provider === 'ARKESEL') {
        const statusMap: Record<string, SmsDeliveryStatus> = {
          DELIVRD: 'DELIVERED',
          SENT: 'SENT',
          UNDELIV: 'FAILED',
          REJECTD: 'FAILED',
        };
        return {
          messageId: String(body?.id || body?.message_id || ''),
          recipientPhone: String(body?.recipient || body?.to || ''),
          status: statusMap[body?.status] ?? 'PENDING',
          provider: 'ARKESEL',
          timestamp: new Date(),
          rawPayload: body,
        };
      }

      // Twilio
      const twilioStatus = String(body?.MessageStatus || body?.SmsStatus || '').toLowerCase();
      const status: SmsDeliveryStatus =
        twilioStatus === 'delivered'
          ? 'DELIVERED'
          : twilioStatus === 'sent'
            ? 'SENT'
            : twilioStatus === 'failed' || twilioStatus === 'undelivered'
              ? 'FAILED'
              : 'PENDING';

      return {
        messageId: String(body?.MessageSid || body?.SmsSid || ''),
        recipientPhone: String(body?.To || ''),
        status,
        provider: 'TWILIO',
        timestamp: new Date(),
        rawPayload: body,
      };
    } catch (err) {
      logger.error('Failed to parse SMS delivery receipt:', err);
      return null;
    }
  }
}
