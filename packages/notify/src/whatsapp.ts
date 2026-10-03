import { logger } from '@cheque/shared';

export interface WhatsAppConfig {
  apiToken: string;
  phoneNumberId: string;
  businessAccountId?: string;
}

export type WhatsAppTemplateName =
  | 'cheque_received'
  | 'otp'
  | 'cheque_claimed'
  | 'cheque_expiring'
  | 'payout_delivered';

export class WhatsAppClient {
  private config: WhatsAppConfig;

  constructor(config: WhatsAppConfig) {
    this.config = config;
  }

  /**
   * Sends an approved WhatsApp template message via Meta WhatsApp Business Cloud API.
   * Cites official Meta Cloud API reference: https://developers.facebook.com/docs/whatsapp/cloud-api/messages/template-messages
   */
  async sendTemplate(params: {
    recipientPhoneE164: string;
    templateName: WhatsAppTemplateName;
    languageCode?: string;
    parameters?: string[];
    buttonPayload?: string;
  }): Promise<{ messageId: string }> {
    const { recipientPhoneE164, templateName, languageCode = 'en', parameters = [] } = params;

    // Remove leading '+' for WhatsApp recipient format
    const to = recipientPhoneE164.replace(/^\+/, '');

    const components: unknown[] = [];

    if (templateName === 'otp') {
      // Meta authentication templates format
      components.push({
        type: 'body',
        parameters: parameters.map((text) => ({ type: 'text', text })),
      });
      if (params.buttonPayload || parameters[0]) {
        components.push({
          type: 'button',
          sub_type: 'url',
          index: '0',
          parameters: [{ type: 'text', text: parameters[0] }],
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
    logger.info(`Sending WhatsApp template ${templateName} to ${recipientPhoneE164}`);

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.config.apiToken}`,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.error(`WhatsApp send failed (${response.status}): ${errorText}`);
      throw new Error(`WhatsApp API error (${response.status}): ${errorText}`);
    }

    const data = (await response.json()) as { messages: { id: string }[] };
    return { messageId: data.messages[0]?.id ?? '' };
  }
}
