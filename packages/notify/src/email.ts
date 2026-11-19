import { logger } from '@cheque/shared';

export interface EmailClientConfig {
  apiKey?: string;
  from?: string;
}

export class EmailClient {
  private apiKey: string;
  private from: string;

  constructor(config: EmailClientConfig = {}) {
    this.apiKey = config.apiKey || process.env.EMAIL_API_KEY || '';
    this.from = config.from || 'sencheq <onboarding@resend.dev>';
  }

  async sendEmail(params: { to: string; subject: string; text: string; html?: string }): Promise<{ id?: string }> {
    if (!this.apiKey) {
      logger.warn('EMAIL_API_KEY not configured; email not sent.');
      return {};
    }
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: this.from,
        to: [params.to],
        subject: params.subject,
        text: params.text,
        html: params.html,
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Resend email failed: ${res.status} ${body}`);
    }
    const data = (await res.json()) as { id?: string };
    return { id: data.id };
  }
}

export function normalizeEmail(input: string): { isValid: boolean; value: string } {
  const trimmed = input.trim().toLowerCase();
  const ok = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed);
  return { isValid: ok, value: trimmed };
}
