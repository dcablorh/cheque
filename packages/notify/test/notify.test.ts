import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import crypto from 'node:crypto';
import {
  normalizeGhanaPhone,
  formatGhanaPhoneDisplay,
  WhatsAppClient,
  WhatsAppApiError,
  SmsClient,
  PhoneOtpService,
  OtpRateLimitError,
  OtpVerificationError,
  SenderAuthService,
} from '../src/index.js';

describe('Ghana Phone Normalization & Validation', () => {
  it('normalizes MTN prefixes accurately', () => {
    const numbers = [
      { input: '0241234567', expected: '+233241234567', prefix: '24' },
      { input: '0541234567', expected: '+233541234567', prefix: '54' },
      { input: '0551234567', expected: '+233551234567', prefix: '55' },
      { input: '0591234567', expected: '+233591234567', prefix: '59' },
      { input: '0531234567', expected: '+233531234567', prefix: '53' },
    ];

    for (const item of numbers) {
      const result = normalizeGhanaPhone(item.input);
      expect(result.isValid).toBe(true);
      expect(result.phoneE164).toBe(item.expected);
      expect(result.carrier).toBe('MTN');
      expect(result.carrierPrefix).toBe(item.prefix);
    }
  });

  it('normalizes Telecel (Vodafone) prefixes accurately', () => {
    const numbers = [
      { input: '0201234567', expected: '+233201234567', prefix: '20' },
      { input: '0501234567', expected: '+233501234567', prefix: '50' },
    ];

    for (const item of numbers) {
      const result = normalizeGhanaPhone(item.input);
      expect(result.isValid).toBe(true);
      expect(result.phoneE164).toBe(item.expected);
      expect(result.carrier).toBe('TELECEL');
      expect(result.carrierPrefix).toBe(item.prefix);
    }
  });

  it('normalizes AirtelTigo (AT) prefixes accurately', () => {
    const numbers = [
      { input: '0271234567', expected: '+233271234567', prefix: '27' },
      { input: '0571234567', expected: '+233571234567', prefix: '57' },
      { input: '0261234567', expected: '+233261234567', prefix: '26' },
      { input: '0561234567', expected: '+233561234567', prefix: '56' },
    ];

    for (const item of numbers) {
      const result = normalizeGhanaPhone(item.input);
      expect(result.isValid).toBe(true);
      expect(result.phoneE164).toBe(item.expected);
      expect(result.carrier).toBe('AIRTELTIGO');
      expect(result.carrierPrefix).toBe(item.prefix);
    }
  });

  it('handles variations in phone number formats (international, spaces, dashes)', () => {
    expect(normalizeGhanaPhone('+233 24 123 4567').phoneE164).toBe('+233241234567');
    expect(normalizeGhanaPhone('00233241234567').phoneE164).toBe('+233241234567');
    expect(normalizeGhanaPhone('233241234567').phoneE164).toBe('+233241234567');
    expect(normalizeGhanaPhone('241234567').phoneE164).toBe('+233241234567');
    expect(normalizeGhanaPhone('(024) 123-4567').phoneE164).toBe('+233241234567');
  });

  it('rejects invalid phone numbers and unknown carrier prefixes', () => {
    expect(normalizeGhanaPhone('0211234567').isValid).toBe(false); // Unknown prefix 21
    expect(normalizeGhanaPhone('024123456').isValid).toBe(false); // Too short (8 digits)
    expect(normalizeGhanaPhone('02412345678').isValid).toBe(false); // Too long (10 digits)
    expect(normalizeGhanaPhone('+1234567890').isValid).toBe(false); // Non-Ghana country code
    expect(normalizeGhanaPhone('').isValid).toBe(false);
  });

  it('formats display strings into clean readable Ghana phone format', () => {
    expect(formatGhanaPhoneDisplay('+233241234567')).toBe('+233 24 123 4567');
    expect(formatGhanaPhoneDisplay('0241234567')).toBe('+233 24 123 4567');
    expect(formatGhanaPhoneDisplay('invalid')).toBe('invalid');
  });
});

describe('Phone OTP Service', () => {
  let otpService: PhoneOtpService;

  beforeEach(() => {
    otpService = new PhoneOtpService({
      salt: 'test_otp_salt_secret_123',
      expirySeconds: 300, // 5 min
      resendCooldownSeconds: 30,
      maxSendsPerWindow: 3,
      maxVerifyAttempts: 5,
    });
  });

  it('generates 6-digit numeric OTP and hashes it at rest with HMAC-SHA256', () => {
    const { otp, otpHash } = otpService.generateOtp();
    expect(otp).toMatch(/^\d{6}$/);
    expect(otp.length).toBe(6);

    const expectedHash = crypto
      .createHmac('sha256', 'test_otp_salt_secret_123')
      .update(otp)
      .digest('hex');

    expect(otpHash).toBe(expectedHash);
  });

  it('creates an OTP session and stores hashed code', async () => {
    const session = await otpService.createOtpSession({
      phoneInput: '0241234567',
    });

    expect(session.phoneE164).toBe('+233241234567');
    expect(session.otp).toMatch(/^\d{6}$/);
    expect(session.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it('enforces 30s resend cooldown before allowing another code', async () => {
    await otpService.createOtpSession({ phoneInput: '0241234567' });

    // Immediate second attempt should trigger cooldown error
    await expect(
      otpService.createOtpSession({ phoneInput: '0241234567' })
    ).rejects.toThrow(OtpRateLimitError);
  });

  it('enforces maximum 3 sends per window', async () => {
    const rapidService = new PhoneOtpService({
      salt: 'test_otp_salt_secret_123',
      resendCooldownSeconds: 0, // Disable cooldown to test sends limit
      maxSendsPerWindow: 3,
    });

    // 1st, 2nd, 3rd sends succeed
    await rapidService.createOtpSession({ phoneInput: '0241234567' });
    await rapidService.createOtpSession({ phoneInput: '0241234567' });
    await rapidService.createOtpSession({ phoneInput: '0241234567' });

    // 4th send fails due to max 3 sends limit
    await expect(
      rapidService.createOtpSession({ phoneInput: '0241234567' })
    ).rejects.toThrow(OtpRateLimitError);
  });

  it('enforces IP and device rate limits', async () => {
    const rapidService = new PhoneOtpService({
      salt: 'test_otp_salt_secret_123',
      resendCooldownSeconds: 0,
      maxSendsPerWindow: 100,
    });

    // Test IP limit (max 10)
    for (let i = 0; i < 10; i++) {
      await rapidService.createOtpSession({
        phoneInput: `024123456${i}`,
        ipAddress: '192.168.1.50',
      });
    }

    await expect(
      rapidService.createOtpSession({
        phoneInput: '0249999999',
        ipAddress: '192.168.1.50',
      })
    ).rejects.toThrow(OtpRateLimitError);

    // Test Device Fingerprint limit (max 5)
    for (let i = 0; i < 5; i++) {
      await rapidService.createOtpSession({
        phoneInput: `050123456${i}`,
        deviceFp: 'device-fingerprint-abc',
      });
    }

    await expect(
      rapidService.createOtpSession({
        phoneInput: '0509999999',
        deviceFp: 'device-fingerprint-abc',
      })
    ).rejects.toThrow(OtpRateLimitError);
  });

  it('verifies correct OTP with constant-time compare and cleans up session', async () => {
    const session = await otpService.createOtpSession({
      phoneInput: '0241234567',
    });

    const isVerified = await otpService.verifyOtp('0241234567', session.otp);
    expect(isVerified).toBe(true);

    // Re-verifying should fail because session was cleared
    await expect(otpService.verifyOtp('0241234567', session.otp)).rejects.toThrow(
      'No active OTP found'
    );
  });

  it('tracks verification attempts and invalidates session after 5 failed attempts', async () => {
    const session = await otpService.createOtpSession({
      phoneInput: '0241234567',
    });

    const wrongOtp = session.otp === '111111' ? '222222' : '111111';

    // 1st wrong attempt
    await expect(otpService.verifyOtp('0241234567', wrongOtp)).rejects.toThrowError(
      /4 attempts remaining/
    );

    // 2nd wrong attempt
    await expect(otpService.verifyOtp('0241234567', wrongOtp)).rejects.toThrowError(
      /3 attempts remaining/
    );

    // 3rd wrong attempt
    await expect(otpService.verifyOtp('0241234567', wrongOtp)).rejects.toThrowError(
      /2 attempts remaining/
    );

    // 4th wrong attempt
    await expect(otpService.verifyOtp('0241234567', wrongOtp)).rejects.toThrowError(
      /1 attempt remaining/
    );

    // 5th wrong attempt -> lockout and session invalidated
    await expect(otpService.verifyOtp('0241234567', wrongOtp)).rejects.toThrowError(
      /Maximum verification attempts reached/
    );

    // Subsequent verify fails because session was cleared
    await expect(otpService.verifyOtp('0241234567', session.otp)).rejects.toThrow(
      'No active OTP found'
    );
  });

  it('rejects expired OTP', async () => {
    const expiredService = new PhoneOtpService({
      salt: 'test_otp_salt_secret_123',
      expirySeconds: -1, // Expired immediately
    });

    const session = await expiredService.createOtpSession({
      phoneInput: '0241234567',
    });

    await expect(expiredService.verifyOtp('0241234567', session.otp)).rejects.toThrow(
      'Verification code has expired'
    );
  });
});

describe('WhatsApp Cloud API Client', () => {
  const config = {
    apiToken: 'EAAG_fake_meta_token',
    phoneNumberId: '10987654321',
    appSecret: 'test_meta_app_secret_999',
    webhookVerifyToken: 'cheque_webhook_verify_secret',
  };

  const client = new WhatsAppClient(config);

  it('correctly determines 24-hour customer service window', () => {
    const now = new Date();
    const withinWindow = new Date(now.getTime() - 23 * 60 * 60 * 1000); // 23h ago
    const outsideWindow = new Date(now.getTime() - 25 * 60 * 60 * 1000); // 25h ago

    expect(client.isWithin24hWindow(withinWindow)).toBe(true);
    expect(client.isWithin24hWindow(outsideWindow)).toBe(false);
    expect(client.isWithin24hWindow(null)).toBe(false);
    expect(client.isWithin24hWindow(undefined)).toBe(false);
  });

  it('verifies Meta HMAC-SHA256 signature using constant-time compare', () => {
    const payload = JSON.stringify({ entry: [{ id: '123' }] });
    const hmac = crypto
      .createHmac('sha256', config.appSecret)
      .update(payload)
      .digest('hex');

    const validHeader = `sha256=${hmac}`;
    expect(client.verifyWebhookSignature(payload, validHeader)).toBe(true);

    // Tampered payload
    expect(client.verifyWebhookSignature(payload + 'x', validHeader)).toBe(false);

    // Bad signature format
    expect(client.verifyWebhookSignature(payload, 'bad_signature')).toBe(false);

    // Wrong secret
    const wrongHmac = crypto.createHmac('sha256', 'wrong_secret').update(payload).digest('hex');
    expect(client.verifyWebhookSignature(payload, `sha256=${wrongHmac}`)).toBe(false);
  });

  it('parses delivery and read receipts from Meta webhook payload', () => {
    const webhookPayload = {
      object: 'whatsapp_business_account',
      entry: [
        {
          id: 'WHATSAPP_BUSINESS_ACCOUNT_ID',
          changes: [
            {
              value: {
                messaging_product: 'whatsapp',
                metadata: {
                  display_phone_number: '15550241234',
                  phone_number_id: '10987654321',
                },
                statuses: [
                  {
                    id: 'wamid.HBgLMjMzMjQxMjM0NTY3FQIAERgSRjQ2Qzg1NTI5MEZERTNBMjc3AA==',
                    status: 'delivered',
                    timestamp: '1728043200',
                    recipient_id: '233241234567',
                    conversation: {
                      id: 'conv_123',
                      origin: { type: 'business_initiated' },
                    },
                  },
                  {
                    id: 'wamid.failed_msg_001',
                    status: 'failed',
                    timestamp: '1728043205',
                    recipient_id: '233241234567',
                    errors: [
                      {
                        code: 131026,
                        title: 'Message Undeliverable',
                        message: 'Recipient is not registered on WhatsApp',
                      },
                    ],
                  },
                ],
              },
              field: 'messages',
            },
          ],
        },
      ],
    };

    const receipts = client.parseDeliveryReceipts(webhookPayload);
    expect(receipts).toHaveLength(2);

    expect(receipts[0]).toMatchObject({
      messageId: 'wamid.HBgLMjMzMjQxMjM0NTY3FQIAERgSRjQ2Qzg1NTI5MEZERTNBMjc3AA==',
      recipientPhone: '233241234567',
      status: 'delivered',
    });

    expect(receipts[1]).toMatchObject({
      messageId: 'wamid.failed_msg_001',
      recipientPhone: '233241234567',
      status: 'failed',
      errorCode: 131026,
      errorMessage: 'Message Undeliverable',
    });
  });

  it('maps WhatsApp API errors to clear actionable user guidance', async () => {
    // Mock global fetch to return Meta error
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({
        error: {
          message: 'Recipient is not a valid WhatsApp user',
          type: 'OAuthException',
          code: 131026,
          error_subcode: 0,
        },
      }),
    } as any);

    try {
      await client.sendTemplate({
        recipientPhoneE164: '+233241234567',
        templateName: 'otp',
        parameters: ['123456'],
      });
      expect.fail('Should have thrown WhatsAppApiError');
    } catch (err: any) {
      expect(err).toBeInstanceOf(WhatsAppApiError);
      expect(err.errorCode).toBe(131026);
      expect(err.userGuidance).toContain('Fall back to SMS');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

describe('SMS Provider Client & Delivery Receipts', () => {
  it('parses Hubtel delivery receipt correctly', () => {
    const client = new SmsClient({
      provider: 'HUBTEL',
      apiKey: 'key',
      apiSecret: 'secret',
      senderId: 'CHEQUE',
    });

    const receipt = client.parseDeliveryReceipt({
      MessageId: 'hubtel_msg_001',
      To: '+233241234567',
      Status: 'Delivered',
    });

    expect(receipt).not.toBeNull();
    expect(receipt?.messageId).toBe('hubtel_msg_001');
    expect(receipt?.recipientPhone).toBe('+233241234567');
    expect(receipt?.status).toBe('DELIVERED');
    expect(receipt?.provider).toBe('HUBTEL');
  });

  it('parses Arkesel delivery receipt correctly', () => {
    const client = new SmsClient({
      provider: 'ARKESEL',
      apiKey: 'arkesel_key',
      senderId: 'CHEQUE',
    });

    const receipt = client.parseDeliveryReceipt({
      id: 'arkesel_msg_002',
      recipient: '233241234567',
      status: 'DELIVRD',
    });

    expect(receipt).not.toBeNull();
    expect(receipt?.messageId).toBe('arkesel_msg_002');
    expect(receipt?.status).toBe('DELIVERED');
    expect(receipt?.provider).toBe('ARKESEL');
  });

  it('parses Twilio delivery receipt correctly', () => {
    const client = new SmsClient({
      provider: 'TWILIO',
      apiKey: 'twilio_sid',
      apiSecret: 'twilio_token',
      senderId: '+1234567890',
    });

    const receipt = client.parseDeliveryReceipt({
      MessageSid: 'SM123456789',
      To: '+233241234567',
      MessageStatus: 'delivered',
    });

    expect(receipt).not.toBeNull();
    expect(receipt?.messageId).toBe('SM123456789');
    expect(receipt?.status).toBe('DELIVERED');
    expect(receipt?.provider).toBe('TWILIO');
  });
});

describe('Sender Auth Service (JWT & Refresh Tokens)', () => {
  let authService: SenderAuthService;
  let otpService: PhoneOtpService;

  beforeEach(() => {
    otpService = new PhoneOtpService({
      salt: 'auth_test_salt',
    });
    authService = new SenderAuthService(
      {
        jwtSecret: 'test_jwt_secret_must_be_very_secure_123',
        accessTokenExpirySeconds: 900,
        refreshTokenExpirySeconds: 2592000,
        pinSalt: 'test_pin_salt_456',
      },
      otpService,
      {
        connect: async () =>
          ({
            query: async () => ({ rows: [] }),
            release: () => {},
          } as any),
      } as any
    );
  });

  it('verifies and decodes valid JWT access token', () => {
    const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
    const nowSec = Math.floor(Date.now() / 1000);
    const payload = Buffer.from(
      JSON.stringify({
        sub: 'user-uuid-1234',
        phone: '+233241234567',
        role: 'sender',
        iat: nowSec,
        exp: nowSec + 900,
      })
    ).toString('base64url');

    const signature = crypto
      .createHmac('sha256', 'test_jwt_secret_must_be_very_secure_123')
      .update(`${header}.${payload}`)
      .digest('base64url');

    const token = `${header}.${payload}.${signature}`;

    const decoded = authService.verifyAccessToken(token);
    expect(decoded.sub).toBe('user-uuid-1234');
    expect(decoded.phone).toBe('+233241234567');
    expect(decoded.role).toBe('sender');
  });

  it('rejects tampered or expired JWT token', () => {
    const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
    const nowSec = Math.floor(Date.now() / 1000);

    // Expired payload
    const expiredPayload = Buffer.from(
      JSON.stringify({
        sub: 'user-uuid-1234',
        phone: '+233241234567',
        role: 'sender',
        iat: nowSec - 1000,
        exp: nowSec - 100,
      })
    ).toString('base64url');

    const signature = crypto
      .createHmac('sha256', 'test_jwt_secret_must_be_very_secure_123')
      .update(`${header}.${expiredPayload}`)
      .digest('base64url');

    const expiredToken = `${header}.${expiredPayload}.${signature}`;

    expect(() => authService.verifyAccessToken(expiredToken)).toThrow('Access token has expired');

    // Tampered payload
    const tamperedPayload = Buffer.from(
      JSON.stringify({
        sub: 'admin-hacker',
        phone: '+233241234567',
        role: 'admin',
        iat: nowSec,
        exp: nowSec + 900,
      })
    ).toString('base64url');

    const tamperedToken = `${header}.${tamperedPayload}.${signature}`;
    expect(() => authService.verifyAccessToken(tamperedToken)).toThrow('Invalid JWT signature');
  });
});
