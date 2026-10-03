import { logger } from '@cheque/shared';

export interface SmsConfig {
  provider: 'HUBTEL' | 'ARKESEL' | 'TWILIO';
  apiKey?: string;
  apiSecret?: string;
  senderId: string;
}

export class SmsClient {
  private config: SmsConfig;

  constructor(config: SmsConfig) {
    this.config = config;
  }

  async sendSms(phoneE164: string, message: string): Promise<{ success: boolean; messageId?: string }> {
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
      return { success: true };
    }

    // Default Twilio fallback
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
}
