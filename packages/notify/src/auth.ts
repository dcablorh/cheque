import crypto from 'node:crypto';
import Redis from 'ioredis';
import pg from 'pg';
import { getPool, User } from '@cheque/core';
import { logger } from '@cheque/shared';
import { OtpService } from './otp.js';

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
  contact: string; // email
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
  private emailOtpService?: OtpService;
  private inMemoryRefreshTokens = new Map<string, { userId: string; expiresAt: number }>();
  private pool: pg.Pool;

  constructor(config: AuthConfig, pool?: pg.Pool, emailOtpService?: OtpService) {
    this.config = {
      jwtSecret: config.jwtSecret || 'cheque_default_jwt_secret_change_in_production',
      accessTokenExpirySeconds: config.accessTokenExpirySeconds ?? 900, // 15 mins
      refreshTokenExpirySeconds: config.refreshTokenExpirySeconds ?? 2592000, // 30 days
      pinSalt: config.pinSalt || 'cheque_default_pin_salt',
    };

    this.emailOtpService = emailOtpService;
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
   * Step 1: initiate email OTP login.
   */
  async requestEmailLoginOtp(params: {
    email: string;
    ipAddress?: string;
    deviceFp?: string;
  }): Promise<{ email: string; otp: string; channel: 'EMAIL' }> {
    if (!this.emailOtpService) throw new Error('Email OTP service is not configured.');
    const norm = params.email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(norm)) {
      throw new Error('Invalid email address.');
    }
    const { otp } = await this.emailOtpService.createOtpSession({ contact: norm, ipAddress: params.ipAddress, deviceFp: params.deviceFp });
    return { email: norm, otp, channel: 'EMAIL' };
  }

  /**
   * Step 2 (email): verify OTP and issue tokens.
   */
  async verifyEmailLoginOtp(params: { email: string; otp: string; name?: string }): Promise<AuthTokens> {
    if (!this.emailOtpService) throw new Error('Email OTP service is not configured.');
    const email = params.email.trim().toLowerCase();
    const verified = await this.emailOtpService.verifyOtp(email, params.otp);
    if (!verified) throw new Error('Invalid verification code.');

    const client = await this.pool.connect();
    let user: User;
    try {
      const userRes = await client.query(
        `
        INSERT INTO users (id, email, name, created_at, updated_at)
        VALUES (uuid_generate_v4(), $1, $2, NOW(), NOW())
        ON CONFLICT (email) DO UPDATE
        SET updated_at = NOW(),
            name = COALESCE(EXCLUDED.name, users.name)
        RETURNING
          id,
          email,
          name,
          pin_hash AS "pinHash",
          created_at AS "createdAt",
          updated_at AS "updatedAt";
        `,
        [email, params.name ?? null]
      );
      user = userRes.rows[0] as User;
    } finally {
      client.release();
    }

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
          email,
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
      contact: user.email ?? '',
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
}
