export interface EmailClientConfig {
  apiKey?: string;
  from?: string;
  fromName?: string;
}

export class EmailClient {
  private apiKey: string;
  private from: string;
  private fromName: string;

  constructor(config: EmailClientConfig = {}) {
    this.apiKey = config.apiKey || process.env.EMAIL_API_KEY || '';
    this.from = config.from || process.env.EMAIL_FROM || 'noreply@sencheq.com';
    this.fromName = config.fromName || process.env.EMAIL_FROM_NAME || 'Sencheq';
  }

  async sendEmail(params: { to: string; subject: string; text: string; html?: string }): Promise<{ id?: string }> {
    if (!this.apiKey) {
      throw new Error('EMAIL_API_KEY is not configured; email not sent.');
    }
    const res = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'api-key': this.apiKey,
        'Content-Type': 'application/json',
        accept: 'application/json',
      },
      body: JSON.stringify({
        sender: { email: this.from, name: this.fromName },
        to: [{ email: params.to }],
        subject: params.subject,
        textContent: params.text,
        htmlContent: params.html,
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Brevo email failed: ${res.status} ${body}`);
    }
    const data = (await res.json()) as { messageId?: string; id?: string };
    return { id: data.messageId ?? data.id };
  }
}

export function normalizeEmail(input: string): { isValid: boolean; value: string } {
  const trimmed = input.trim().toLowerCase();
  const ok = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed);
  return { isValid: ok, value: trimmed };
}
