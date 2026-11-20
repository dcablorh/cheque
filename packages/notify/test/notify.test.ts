import { describe, it, expect, beforeEach } from 'vitest';
import crypto from 'node:crypto';
import {
  OtpService,
  OtpRateLimitError,
  OtpVerificationError,
  SenderAuthService,
} from '../src/index.js';

describe('Email OTP Service', () => {
  let otpService: OtpService;

  beforeEach(() => {
    otpService = new OtpService({
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
      contact: 'Kojo@Example.com',
    });

    expect(session.contact).toBe('kojo@example.com');
    expect(session.otp).toMatch(/^\d{6}$/);
    expect(session.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it('rejects invalid contacts', async () => {
    await expect(otpService.createOtpSession({ contact: 'a' })).rejects.toThrow('Invalid contact');
  });

  it('enforces 30s resend cooldown before allowing another code', async () => {
    await otpService.createOtpSession({ contact: 'kojo@example.com' });

    // Immediate second attempt should trigger cooldown error
    await expect(
      otpService.createOtpSession({ contact: 'kojo@example.com' })
    ).rejects.toThrow(OtpRateLimitError);
  });

  it('enforces maximum 3 sends per window', async () => {
    const rapidService = new OtpService({
      salt: 'test_otp_salt_secret_123',
      resendCooldownSeconds: 0, // Disable cooldown to test sends limit
      maxSendsPerWindow: 3,
    });

    // 1st, 2nd, 3rd sends succeed
    await rapidService.createOtpSession({ contact: 'kojo@example.com' });
    await rapidService.createOtpSession({ contact: 'kojo@example.com' });
    await rapidService.createOtpSession({ contact: 'kojo@example.com' });

    // 4th send fails due to max 3 sends limit
    await expect(
      rapidService.createOtpSession({ contact: 'kojo@example.com' })
    ).rejects.toThrow(OtpRateLimitError);
  });

  it('enforces IP and device rate limits', async () => {
    const rapidService = new OtpService({
      salt: 'test_otp_salt_secret_123',
      resendCooldownSeconds: 0,
      maxSendsPerWindow: 100,
    });

    // Test IP limit (max 10)
    for (let i = 0; i < 10; i++) {
      await rapidService.createOtpSession({
        contact: `user${i}@example.com`,
        ipAddress: '192.168.1.50',
      });
    }

    await expect(
      rapidService.createOtpSession({
        contact: 'last@example.com',
        ipAddress: '192.168.1.50',
      })
    ).rejects.toThrow(OtpRateLimitError);

    // Test Device Fingerprint limit (max 5)
    for (let i = 0; i < 5; i++) {
      await rapidService.createOtpSession({
        contact: `device${i}@example.com`,
        deviceFp: 'device-fingerprint-abc',
      });
    }

    await expect(
      rapidService.createOtpSession({
        contact: 'devicelast@example.com',
        deviceFp: 'device-fingerprint-abc',
      })
    ).rejects.toThrow(OtpRateLimitError);
  });

  it('verifies correct OTP with constant-time compare and cleans up session', async () => {
    const session = await otpService.createOtpSession({
      contact: 'kojo@example.com',
    });

    const isVerified = await otpService.verifyOtp('kojo@example.com', session.otp);
    expect(isVerified).toBe(true);

    // Re-verifying should fail because session was cleared
    await expect(otpService.verifyOtp('kojo@example.com', session.otp)).rejects.toThrow(
      'No active OTP found'
    );
  });

  it('tracks verification attempts and invalidates session after 5 failed attempts', async () => {
    const session = await otpService.createOtpSession({
      contact: 'kojo@example.com',
    });

    const wrongOtp = session.otp === '111111' ? '222222' : '111111';

    // 1st wrong attempt
    await expect(otpService.verifyOtp('kojo@example.com', wrongOtp)).rejects.toThrowError(
      /4 attempts remaining/
    );

    // 2nd wrong attempt
    await expect(otpService.verifyOtp('kojo@example.com', wrongOtp)).rejects.toThrowError(
      /3 attempts remaining/
    );

    // 3rd wrong attempt
    await expect(otpService.verifyOtp('kojo@example.com', wrongOtp)).rejects.toThrowError(
      /2 attempts remaining/
    );

    // 4th wrong attempt
    await expect(otpService.verifyOtp('kojo@example.com', wrongOtp)).rejects.toThrowError(
      /1 attempt remaining/
    );

    // 5th wrong attempt -> lockout and session invalidated
    await expect(otpService.verifyOtp('kojo@example.com', wrongOtp)).rejects.toThrowError(
      /Maximum verification attempts reached/
    );

    // Subsequent verify fails because session was cleared
    await expect(otpService.verifyOtp('kojo@example.com', session.otp)).rejects.toThrow(
      'No active OTP found'
    );
  });

  it('rejects expired OTP', async () => {
    const expiredService = new OtpService({
      salt: 'test_otp_salt_secret_123',
      expirySeconds: -1, // Expired immediately
    });

    const session = await expiredService.createOtpSession({
      contact: 'kojo@example.com',
    });

    await expect(expiredService.verifyOtp('kojo@example.com', session.otp)).rejects.toThrow(
      'Verification code has expired'
    );
  });
});

describe('Sender Auth Service (JWT & Refresh Tokens)', () => {
  let authService: SenderAuthService;

  beforeEach(() => {
    authService = new SenderAuthService(
      {
        jwtSecret: 'test_jwt_secret_must_be_very_secure_123',
        accessTokenExpirySeconds: 900,
        refreshTokenExpirySeconds: 2592000,
        pinSalt: 'test_pin_salt_456',
      },
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
        contact: 'kojo@example.com',
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
    expect(decoded.contact).toBe('kojo@example.com');
    expect(decoded.role).toBe('sender');
  });

  it('rejects tampered or expired JWT token', () => {
    const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
    const nowSec = Math.floor(Date.now() / 1000);

    // Expired payload
    const expiredPayload = Buffer.from(
      JSON.stringify({
        sub: 'user-uuid-1234',
        contact: 'kojo@example.com',
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
        contact: 'kojo@example.com',
        role: 'admin',
        iat: nowSec,
        exp: nowSec + 900,
      })
    ).toString('base64url');

    const tamperedToken = `${header}.${tamperedPayload}.${signature}`;
    expect(() => authService.verifyAccessToken(tamperedToken)).toThrow('Invalid JWT signature');
  });
});
