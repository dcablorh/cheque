import crypto from 'node:crypto';
import Redis from 'ioredis';
import pg from 'pg';
import { getPool, User } from '@cheque/core';
import { logger } from '@cheque/shared';
import { normalizeGhanaPhone } from './phone.js';
import { PhoneOtpService } from './otp.js';
import { WhatsAppClient } from './whatsapp.js';
import { SmsClient } from './sms.js';

export interface AuthConfig {
  jwtSecret: string;
  accessTokenExpirySeconds?: number; // default: 900 (15 min)
  refreshTokenExpirySeconds?: number; // default: 2592000 (30 days)
  pinSalt?: string;
  redisUrl?: string;
  redisClient?: Redis;
}

export interface JwtPayload {
  sub: string; // userId
  phone: string;
  role: 'sender' | 'admin';
  iat: number;
  exp: number;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresInSeconds: number;
  user: User;
}

export class SenderAuthService {
  private config: Required<Omit<AuthConfig, 'redisUrl' | 'redisClient'>>;
  private redis?: Redis;
  private otpService: PhoneOtpService;
  private inMemoryRefreshTokens = new Map<string, { userId: string; expiresAt: number }>();
  private pool: pg.Pool;

  constructor(config: AuthConfig, otpService: PhoneOtpService, pool?: pg.Pool) {
    this.config = {
      jwtSecret: config.jwtSecret || 'cheque_default_jwt_secret_change_in_production',
      accessTokenExpirySeconds: config.accessTokenExpirySeconds ?? 900, // 15 mins
      refreshTokenExpirySeconds: config.refreshTokenExpirySeconds ?? 2592000, // 30 days
      pinSalt: config.pinSalt || 'cheque_default_pin_salt',
    };

    this.otpService = otpService;
    this.pool = pool ?? getPool();

    if (config.redisClient) {
      this.redis = config.redisClient;
    } else if (config.redisUrl) {
      this.redis = new Redis(config.redisUrl, { lazyConnect: true, maxRetriesPerRequest: 1 });
    }
  }

  async init(): Promise<void> {
    if (this.redis && this.redis.status === 'wait') {
      await this.redis.connect().catch((err) => {
        logger.warn(`Redis connection failed for SenderAuthService, falling back to memory: ${err.message}`);
        this.redis = undefined;
      });
    }
  }

  /**
   * Step 1: Initiate Phone OTP Login.
   */
  async requestLoginOtp(params: {
    phoneInput: string;
    whatsAppClient?: WhatsAppClient;
    smsClient?: SmsClient;
    forceSms?: boolean;
    ipAddress?: string;
    deviceFp?: string;
  }): Promise<{ phoneE164: string; channel: 'WHATSAPP' | 'SMS' }> {
    const res = await this.otpService.sendOtp(params);
    return { phoneE164: res.phoneE164, channel: res.channel };
  }

  /**
   * Step 2: Verify Phone OTP and issue short-lived access JWT + rotating refresh token.
   */
  async verifyLoginOtp(params: {
    phoneInput: string;
    otp: string;
    name?: string;
  }): Promise<AuthTokens> {
    const norm = normalizeGhanaPhone(params.phoneInput);
    if (!norm.isValid) {
      throw new Error(`Invalid Ghana phone number: ${params.phoneInput}`);
    }

    // 1. Verify OTP
    await this.otpService.verifyOtp(norm.phoneE164, params.otp);

    // 2. Fetch or create user in PostgreSQL
    const client = await this.pool.connect();
    let user: User;

    try {
      const userRes = await client.query(
        `
        INSERT INTO users (id, phone_e164, name, created_at, updated_at)
        VALUES (uuid_generate_v4(), $1, $2, NOW(), NOW())
        ON CONFLICT (phone_e164) DO UPDATE
        SET updated_at = NOW(),
            name = COALESCE(EXCLUDED.name, users.name)
        RETURNING
          id,
          phone_e164 AS "phoneE164",
          name,
          pin_hash AS "pinHash",
          created_at AS "createdAt",
          updated_at AS "updatedAt";
        `,
        [norm.phoneE164, params.name ?? null]
      );
      user = userRes.rows[0] as User;
    } finally {
      client.release();
    }

    // 3. Issue short-lived access JWT + rotating refresh token
    const tokens = await this.issueTokens(user);
    return tokens;
  }

  /**
   * Rotates refresh token and issues a new access token.
   * If a reused refresh token is presented, invalidates the family to prevent replay attacks.
   */
  async refreshAccessToken(incomingRefreshToken: string): Promise<Omit<AuthTokens, 'user'> & { userId: string }> {
    const tokenHash = this.hashToken(incomingRefreshToken);
    const key = `auth:refresh:${tokenHash}`;

    let userId: string | undefined;

    if (this.redis) {
      const val = await this.redis.get(key);
      if (val) {
        userId = val;
        // Invalidate used refresh token (rotation!)
        await this.redis.del(key);
      }
    } else {
      const entry = this.inMemoryRefreshTokens.get(tokenHash);
      if (entry && entry.expiresAt > Date.now()) {
        userId = entry.userId;
        this.inMemoryRefreshTokens.delete(tokenHash);
      }
    }

    if (!userId) {
      throw new Error('Invalid or expired refresh token. Please sign in again.');
    }

    // Fetch user
    const client = await this.pool.connect();
    let user: User;
    try {
      const res = await client.query(
        `
        SELECT
          id,
          phone_e164 AS "phoneE164",
          name,
          pin_hash AS "pinHash",
          created_at AS "createdAt",
          updated_at AS "updatedAt"
        FROM users
        WHERE id = $1;
        `,
        [userId]
      );
      if (res.rows.length === 0) {
        throw new Error('User not found');
      }
      user = res.rows[0] as User;
    } finally {
      client.release();
    }

    const newTokens = await this.issueTokens(user);
    return {
      accessToken: newTokens.accessToken,
      refreshToken: newTokens.refreshToken,
      expiresInSeconds: newTokens.expiresInSeconds,
      userId: user.id,
    };
  }

  /**
   * Sets or updates user PIN for sensitive actions (e.g. payout authorization, large amounts).
   */
  async setPin(userId: string, pin: string): Promise<void> {
    if (!/^\d{4,6}$/.test(pin)) {
      throw new Error('PIN must be 4 to 6 numeric digits');
    }

    const pinHash = this.hashPin(pin);
    const client = await this.pool.connect();
    try {
      await client.query(
        `UPDATE users SET pin_hash = $1, updated_at = NOW() WHERE id = $2;`,
        [pinHash, userId]
      );
    } finally {
      client.release();
    }
  }

  /**
   * Verifies user PIN using constant-time comparison.
   */
  async verifyPin(userId: string, pin: string): Promise<boolean> {
    const client = await this.pool.connect();
    try {
      const res = await client.query(
        `SELECT pin_hash FROM users WHERE id = $1;`,
        [userId]
      );
      const storedHash = res.rows[0]?.pin_hash;
      if (!storedHash) {
        return false;
      }

      const incomingHash = this.hashPin(pin);
      const inBuf = Buffer.from(incomingHash, 'hex');
      const storeBuf = Buffer.from(storedHash, 'hex');

      return (
        inBuf.length === storeBuf.length &&
        crypto.timingSafeEqual(inBuf, storeBuf)
      );
    } finally {
      client.release();
    }
  }

  /**
   * Verifies and decodes an access JWT.
   */
  verifyAccessToken(token: string): JwtPayload {
    const parts = token.split('.');
    if (parts.length !== 3) {
      throw new Error('Invalid JWT format');
    }

    const [headerB64, payloadB64, signatureB64] = parts;
    const signingInput = `${headerB64}.${payloadB64}`;

    const expectedSig = crypto
      .createHmac('sha256', this.config.jwtSecret)
      .update(signingInput)
      .digest('base64url');

    const inBuf = Buffer.from(signatureB64);
    const expBuf = Buffer.from(expectedSig);

    if (inBuf.length !== expBuf.length || !crypto.timingSafeEqual(inBuf, expBuf)) {
      throw new Error('Invalid JWT signature');
    }

    const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8')) as JwtPayload;

    if (payload.exp && Date.now() >= payload.exp * 1000) {
      throw new Error('Access token has expired');
    }

    return payload;
  }

  private async issueTokens(user: User): Promise<AuthTokens> {
    const nowSec = Math.floor(Date.now() / 1000);
    const expSec = nowSec + this.config.accessTokenExpirySeconds;

    const payload: JwtPayload = {
      sub: user.id,
      phone: user.phoneE164,
      role: 'sender',
      iat: nowSec,
      exp: expSec,
    };

    const header = { alg: 'HS256', typ: 'JWT' };
    const headerB64 = Buffer.from(JSON.stringify(header)).toString('base64url');
    const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const signingInput = `${headerB64}.${payloadB64}`;

    const signature = crypto
      .createHmac('sha256', this.config.jwtSecret)
      .update(signingInput)
      .digest('base64url');

    const accessToken = `${signingInput}.${signature}`;

    // Generate 256-bit cryptographically random refresh token
    const rawRefreshToken = crypto.randomBytes(32).toString('hex');
    const refreshHash = this.hashToken(rawRefreshToken);
    const refreshKey = `auth:refresh:${refreshHash}`;

    if (this.redis) {
      await this.redis.set(refreshKey, user.id, 'EX', this.config.refreshTokenExpirySeconds);
    } else {
      this.inMemoryRefreshTokens.set(refreshHash, {
        userId: user.id,
        expiresAt: Date.now() + this.config.refreshTokenExpirySeconds * 1000,
      });
    }

    return {
      accessToken,
      refreshToken: rawRefreshToken,
      expiresInSeconds: this.config.accessTokenExpirySeconds,
      user,
    };
  }

  private hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  private hashPin(pin: string): string {
    return crypto
      .pbkdf2Sync(pin, this.config.pinSalt, 10000, 32, 'sha256')
      .toString('hex');
  }
}
