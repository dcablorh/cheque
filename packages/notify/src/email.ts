import { logger } from '@cheque/shared';

export interface EmailConfig {
  provider: 'RESEND';
  apiKey: string;
  /** e.g. "Digital Cheque <no-reply@cheq.app>" */
  from: string;
  replyTo?: string;
}

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
}

/** Minimal transport seam so tests and other providers can be swapped in. */
export interface EmailTransport {
  send(message: EmailMessage): Promise<{ messageId?: string }>;
}

export class EmailApiError extends Error {
  public readonly statusCode: number;
  constructor(message: string, statusCode: number) {
    super(message);
    this.name = 'EmailApiError';
    this.statusCode = statusCode;
  }
}

export class ResendTransport implements EmailTransport {
  constructor(private readonly config: EmailConfig) {}

  async send(message: EmailMessage): Promise<{ messageId?: string }> {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify({
        from: this.config.from,
        to: [message.to],
        subject: message.subject,
        text: message.text,
        html: message.html,
        ...(this.config.replyTo ? { reply_to: this.config.replyTo } : {}),
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new EmailApiError(`Resend email failed (${response.status}): ${body}`, response.status);
    }
    const data = (await response.json()) as { id?: string };
    return { messageId: data.id };
  }
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export class EmailClient {
  constructor(private readonly transport: EmailTransport) {}

  static fromConfig(config: EmailConfig): EmailClient {
    return new EmailClient(new ResendTransport(config));
  }

  async sendOtp(params: { to: string; otp: string; expiryMinutes?: number }): Promise<{ messageId?: string }> {
    const minutes = params.expiryMinutes ?? 5;
    const otp = escapeHtml(params.otp);
    logger.info('Sending OTP email');
    return this.transport.send({
      to: params.to,
      subject: `Your Digital Cheque code: ${params.otp}`,
      text: `Your Digital Cheque verification code is ${params.otp}. It is valid for ${minutes} minutes. Do not share this code with anyone.`,
      html: `<p>Your Digital Cheque verification code is:</p><p style="font-size:28px;font-weight:700;letter-spacing:4px">${otp}</p><p>Valid for ${minutes} minutes. Do not share this code with anyone.</p>`,
    });
  }

  /** The "cheque received" notification carrying the claim link. */
  async sendChequeReceived(params: {
    to: string;
    payeeName: string;
    senderName: string;
    amountDisplay: string; // already formatted, e.g. "GHS 500.00"
    claimUrl: string;
    note?: string;
    expiresAtDisplay?: string;
  }): Promise<{ messageId?: string }> {
    const { payeeName, senderName, amountDisplay, claimUrl, note, expiresAtDisplay } = params;
    const lines = [
      `Hi ${payeeName},`,
      '',
      `${senderName} sent you a cheque for ${amountDisplay}.`,
      ...(note ? [`Note: "${note}"`] : []),
      '',
      `Open to claim: ${claimUrl}`,
      ...(expiresAtDisplay ? ['', `Valid until ${expiresAtDisplay}.`] : []),
      '',
      'You will be asked to verify with a one-time code before choosing where the money goes.',
    ];

    const html =
      `<p>Hi ${escapeHtml(payeeName)},</p>` +
      `<p><strong>${escapeHtml(senderName)}</strong> sent you a cheque for <strong>${escapeHtml(amountDisplay)}</strong>.</p>` +
      (note ? `<p>Note: &ldquo;${escapeHtml(note)}&rdquo;</p>` : '') +
      `<p><a href="${escapeHtml(claimUrl)}">Open to claim your cheque</a></p>` +
      (expiresAtDisplay ? `<p>Valid until ${escapeHtml(expiresAtDisplay)}.</p>` : '') +
      `<p>You will be asked to verify with a one-time code before choosing where the money goes.</p>`;

    logger.info('Sending cheque-received email');
    return this.transport.send({
      to: params.to,
      subject: `${senderName} sent you ${amountDisplay}`,
      text: lines.join('\n'),
      html,
    });
  }
}
