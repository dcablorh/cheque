import { describe, it, expect, vi } from 'vitest';
import {
  parsePayeeContact,
  maskContact,
  contactKey,
  EmailClient,
  OtpService,
  OtpVerificationError,
  type EmailTransport,
  type EmailMessage,
} from '../src/index.js';

function fakeTransport() {
  const sent: EmailMessage[] = [];
  const transport: EmailTransport = {
    send: vi.fn(async (m: EmailMessage) => {
      sent.push(m);
      return { messageId: 'msg_1' };
    }),
  };
  return { transport, sent };
}

describe('parsePayeeContact', () => {
  it('normalizes emails to lowercase and trims', () => {
    expect(parsePayeeContact('  Kojo.Mensah@Gmail.COM ')).toEqual({ type: 'EMAIL', value: 'kojo.mensah@gmail.com' });
  });

  it('normalizes Ghana phones to E.164', () => {
    expect(parsePayeeContact('024 123 4567')).toEqual({ type: 'PHONE', value: '+233241234567' });
  });

  it('rejects invalid emails and phones', () => {
    expect(parsePayeeContact('not-an-email@')).toBeNull();
    expect(parsePayeeContact('a@b')).toBeNull();
    expect(parsePayeeContact('0211234567')).toBeNull();
    expect(parsePayeeContact('')).toBeNull();
  });

  it('honours the type hint', () => {
    expect(parsePayeeContact('0241234567', 'EMAIL')).toBeNull();
  });
});

describe('maskContact', () => {
  it('masks emails and phones', () => {
    expect(maskContact({ type: 'EMAIL', value: 'kojo@gmail.com' })).toBe('k***@gmail.com');
    expect(maskContact({ type: 'PHONE', value: '+233241234567' })).toBe('+233 24 XXX 4567');
  });
});

describe('EmailClient', () => {
  it('sends the OTP email', async () => {
    const { transport, sent } = fakeTransport();
    await new EmailClient(transport).sendOtp({ to: 'a@b.co', otp: '123456' });
    expect(sent[0].to).toBe('a@b.co');
    expect(sent[0].text).toContain('123456');
  });

  it('escapes HTML in the cheque-received email', async () => {
    const { transport, sent } = fakeTransport();
    await new EmailClient(transport).sendChequeReceived({
      to: 'a@b.co',
      payeeName: 'Kojo',
      senderName: '<script>alert(1)</script>',
      amountDisplay: 'GHS 500.00',
      claimUrl: 'https://cheq.app/c/abc',
      note: 'rent & food',
    });
    expect(sent[0].html).not.toContain('<script>');
    expect(sent[0].html).toContain('&lt;script&gt;');
    expect(sent[0].html).toContain('rent &amp; food');
    expect(sent[0].text).toContain('https://cheq.app/c/abc');
  });
});

describe('contact OTP via email', () => {
  const email = { type: 'EMAIL', value: 'kojo@gmail.com' } as const;

  it('sends by email and verifies the same code', async () => {
    const { transport, sent } = fakeTransport();
    const svc = new OtpService({ salt: 'test_salt_value' });

    const res = await svc.sendContactOtp({ contact: email, emailClient: new EmailClient(transport) });
    expect(res.channel).toBe('EMAIL');

    const code = /(\d{6})/.exec(sent[0].text)![1];
    await expect(svc.verifyContactOtp(email, '000000')).rejects.toBeInstanceOf(OtpVerificationError);
    await expect(svc.verifyContactOtp(email, code)).resolves.toBe(true);
    // single use
    await expect(svc.verifyContactOtp(email, code)).rejects.toThrow();
  });

  it('fails clearly without an email provider', async () => {
    const svc = new OtpService({ salt: 'test_salt_value' });
    await expect(svc.sendContactOtp({ contact: email })).rejects.toThrow(/email provider/);
  });

  it('enforces the resend cooldown per contact', async () => {
    const { transport } = fakeTransport();
    const svc = new OtpService({ salt: 'test_salt_value' });
    const client = new EmailClient(transport);
    await svc.sendContactOtp({ contact: email, emailClient: client });
    await expect(svc.sendContactOtp({ contact: email, emailClient: client })).rejects.toThrow(/wait/i);
  });

  it('verifies a phone contact OTP sent via SMS under the contact key', async () => {
    const svc = new OtpService({ salt: 'test_salt_value' });
    let code = '';
    const smsClient = {
      sendSms: async (_to: string, body: string) => {
        code = /(\d{6})/.exec(body)![1];
        return { success: true, messageId: 's1' };
      },
    } as any;
    const phone = { type: 'PHONE', value: '+233241234567' } as const;
    const res = await svc.sendContactOtp({ contact: phone, smsClient });
    expect(res.channel).toBe('SMS');
    expect(contactKey(phone)).toBe('phone:+233241234567');
    await expect(svc.verifyContactOtp(phone, code)).resolves.toBe(true);
  });
});
