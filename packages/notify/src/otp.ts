import crypto from 'node:crypto';
import Redis from 'ioredis';
import { logger } from '@cheque/shared';

export interface OtpNormalizerResult {
  isValid: boolean;
  value: string;
}

export type OtpNormalizer = (input: string) => OtpNormalizerResult;

export interface OtpConfig {
  salt: string;
  expirySeconds?: number; // default: 300 (5 min)
  resendCooldownSeconds?: number; // default: 30
  maxSendsPerWindow?: number; // default: 3
  maxVerifyAttempts?: number; // default: 5
  redisUrl?: string;
  redisClient?: Redis;
  normalize?: OtpNormalizer;
}

export interface StoredOtpRecord {
  contact: string;
  otpHash: string;
  sendsCount: number;
  verifyAttempts: number;
  expiresAt: number; // Unix timestamp ms
  lastSentAt: number;
  deviceFp?: string;
  ipAddress?: string;
}

export class OtpRateLimitError extends Error {
  public readonly retryAfterSeconds: number;
  constructor(message: string, retryAfterSeconds: number) {
    super(message);
    this.name = 'OtpRateLimitError';
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export class OtpVerificationError extends Error {
  public readonly remainingAttempts: number;
  constructor(message: string, remainingAttempts: number) {
    super(message);
    this.name = 'OtpVerificationError';
    this.remainingAttempts = remainingAttempts;
  }
}

/**
 * Contact-agnostic one-time-code service. Codes are keyed by a normalised contact
 * identifier (today: an email address) and stored hashed in Redis, with an
 * in-memory fallback for development.
 */
export class OtpService {
  private config: Required<Omit<OtpConfig, 'redisUrl' | 'redisClient' | 'normalize'>>;
  private redis?: Redis;
  private inMemoryStore = new Map<string, StoredOtpRecord>();
  private inMemoryRateLimits = new Map<string, { count: number; resetAt: number }>();
  private normalize: OtpNormalizer;

  constructor(config: OtpConfig) {
    this.config = {
      salt: config.salt || 'cheque_default_otp_salt',
      expirySeconds: config.expirySeconds ?? 300, // 5 minutes
      resendCooldownSeconds: config.resendCooldownSeconds ?? 30, // 30s cooldown
      maxSendsPerWindow: config.maxSendsPerWindow ?? 3, // max 3 sends
      maxVerifyAttempts: config.maxVerifyAttempts ?? 5, // max 5 attempts
    };
    this.normalize =
      config.normalize ??
      ((input: string) => ({ isValid: input.trim().length > 3, value: input.trim().toLowerCase() }));

    if (config.redisClient) {
      this.redis = config.redisClient;
    } else if (config.redisUrl) {
      this.redis = new Redis(config.redisUrl, { lazyConnect: true, maxRetriesPerRequest: 1 });
    }
  }

  async init(): Promise<void> {
    if (this.redis && this.redis.status === 'wait') {
      await this.redis.connect().catch((err) => {
        logger.warn(`Redis connection failed for OtpService, falling back to memory: ${err.message}`);
        this.redis = undefined;
      });
    }
  }

  /**
   * Generates a secure 6-digit numeric OTP and its HMAC-SHA256 hash.
   */
  generateOtp(): { otp: string; otpHash: string } {
    // Cryptographically secure 6-digit number [100000, 999999]
    const otp = crypto.randomInt(100000, 1000000).toString();
    const otpHash = this.hashOtp(otp);
    return { otp, otpHash };
  }

  hashOtp(otp: string): string {
    return crypto
      .createHmac('sha256', this.config.salt)
      .update(otp)
      .digest('hex');
  }

  /**
   * Enforces rate limits per contact, IP, and Device fingerprint.
   * Checks 30s resend cooldown and max sends limit.
   */
  async checkRateLimits(params: {
    contact: string;
    ipAddress?: string;
    deviceFp?: string;
  }): Promise<void> {
    const { contact, ipAddress, deviceFp } = params;
    const now = Date.now();

    // 1. Check Resend Cooldown (30s)
    const cooldownKey = `otp:cooldown:${contact}`;
    if (this.redis) {
      const ttl = await this.redis.ttl(cooldownKey);
      if (ttl > 0) {
        throw new OtpRateLimitError(
          `Please wait ${ttl} seconds before requesting another code.`,
          ttl
        );
      }
    } else {
      const existing = this.inMemoryStore.get(contact);
      if (existing) {
        const elapsedSec = Math.floor((now - existing.lastSentAt) / 1000);
        if (elapsedSec < this.config.resendCooldownSeconds) {
          const waitSec = this.config.resendCooldownSeconds - elapsedSec;
          throw new OtpRateLimitError(
            `Please wait ${waitSec} seconds before requesting another code.`,
            waitSec
          );
        }
      }
    }

    // 2. Check Contact Rate Limit (max 3 sends per 10-minute window)
    await this.enforceRateLimit(`otp:rl:contact:${contact}`, this.config.maxSendsPerWindow, 600);

    // 3. Check IP Rate Limit (max 10 requests per 10-minute window)
    if (ipAddress) {
      await this.enforceRateLimit(`otp:rl:ip:${ipAddress}`, 10, 600);
    }

    // 4. Check Device Rate Limit (max 5 requests per 10-minute window)
    if (deviceFp) {
      await this.enforceRateLimit(`otp:rl:device:${deviceFp}`, 5, 600);
    }
  }

  /**
   * Generates and stores an OTP for a contact (email), enforcing rate limits and cooldown.
   */
  async createOtpSession(params: {
    contact: string;
    ipAddress?: string;
    deviceFp?: string;
  }): Promise<{ contact: string; otp: string; otpHash: string; expiresAt: Date }> {
    const norm = this.normalize(params.contact);
    if (!norm.isValid) {
      throw new Error(`Invalid contact: ${params.contact}.`);
    }

    const contact = norm.value;
    const session = await this.createSessionForKey(contact, params);
    return { contact, ...session };
  }

  private async createSessionForKey(
    key: string,
    params: { ipAddress?: string; deviceFp?: string }
  ): Promise<{ otp: string; otpHash: string; expiresAt: Date }> {
    await this.checkRateLimits({ contact: key, ipAddress: params.ipAddress, deviceFp: params.deviceFp });

    const { otp, otpHash } = this.generateOtp();
    const expiresAtMs = Date.now() + this.config.expirySeconds * 1000;

    const recordKey = `otp:session:${key}`;
    const cooldownKey = `otp:cooldown:${key}`;

    if (this.redis) {
      try {
        const current = await this.redis.get(recordKey);
        let sendsCount = 1;
        if (current) {
          const parsed = JSON.parse(current) as StoredOtpRecord;
          sendsCount = parsed.sendsCount + 1;
        }

        const record: StoredOtpRecord = {
          contact: key,
          otpHash,
          sendsCount,
          verifyAttempts: 0,
          expiresAt: expiresAtMs,
          lastSentAt: Date.now(),
          deviceFp: params.deviceFp,
          ipAddress: params.ipAddress,
        };

        await this.redis.set(recordKey, JSON.stringify(record), 'EX', this.config.expirySeconds);
        await this.redis.set(cooldownKey, '1', 'EX', this.config.resendCooldownSeconds);
      } catch {
        this.redis = undefined;
      }
    }
    if (!this.redis) {
      const existing = this.inMemoryStore.get(key);
      const record: StoredOtpRecord = {
        contact: key,
        otpHash,
        sendsCount: (existing?.sendsCount ?? 0) + 1,
        verifyAttempts: 0,
        expiresAt: expiresAtMs,
        lastSentAt: Date.now(),
        deviceFp: params.deviceFp,
        ipAddress: params.ipAddress,
      };
      this.inMemoryStore.set(key, record);
    }

    return { otp, otpHash, expiresAt: new Date(expiresAtMs) };
  }

  /**
   * Verifies OTP using constant-time string comparison.
   * Tracks attempts and enforces 5 attempts max before invalidation.
   */
  async verifyOtp(contactInput: string, incomingOtp: string): Promise<boolean> {
    const norm = this.normalize(contactInput);
    return this.verifyForKey(norm.isValid ? norm.value : contactInput, incomingOtp);
  }

  private async verifyForKey(contact: string, incomingOtp: string): Promise<boolean> {
    const recordKey = `otp:session:${contact}`;

    let record: StoredOtpRecord | undefined;

    if (this.redis) {
      try {
        const raw = await this.redis.get(recordKey);
        if (raw) record = JSON.parse(raw) as StoredOtpRecord;
      } catch {
        this.redis = undefined;
        record = this.inMemoryStore.get(contact);
      }
    } else {
      record = this.inMemoryStore.get(contact);
    }

    if (!record) {
      throw new Error('No active OTP found. Please request a new code.');
    }

    // Check expiration
    if (Date.now() > record.expiresAt) {
      await this.clearOtpSession(contact);
      throw new Error('Verification code has expired. Please request a new one.');
    }

    // Check max attempts
    if (record.verifyAttempts >= this.config.maxVerifyAttempts) {
      await this.clearOtpSession(contact);
      throw new Error('Maximum verification attempts exceeded. Code has been invalidated.');
    }

    // Hash incoming OTP and compare in constant time
    const incomingHash = this.hashOtp(incomingOtp);
    const incomingBuf = Buffer.from(incomingHash, 'hex');
    const storedBuf = Buffer.from(record.otpHash, 'hex');

    const isValid =
      incomingBuf.length === storedBuf.length &&
      crypto.timingSafeEqual(incomingBuf, storedBuf);

    if (isValid) {
      // Clear session on successful verify
      await this.clearOtpSession(contact);
      return true;
    }

    // Increment attempts on failure
    record.verifyAttempts += 1;
    const remaining = this.config.maxVerifyAttempts - record.verifyAttempts;

    if (remaining <= 0) {
      await this.clearOtpSession(contact);
      throw new OtpVerificationError(
        'Incorrect code. Maximum verification attempts reached. Code has been invalidated.',
        0
      );
    }

    if (this.redis) {
      try {
        const remainingTtl = Math.max(1, Math.floor((record.expiresAt - Date.now()) / 1000));
        await this.redis.set(recordKey, JSON.stringify(record), 'EX', remainingTtl);
      } catch {
        this.redis = undefined;
        this.inMemoryStore.set(contact, record);
      }
    } else {
      this.inMemoryStore.set(contact, record);
    }

    throw new OtpVerificationError(
      `Incorrect verification code. ${remaining} attempt${remaining === 1 ? '' : 's'} remaining.`,
      remaining
    );
  }

  private async clearOtpSession(contact: string): Promise<void> {
    const recordKey = `otp:session:${contact}`;
    if (this.redis) {
      try { await this.redis.del(recordKey); } catch { this.redis = undefined; }
    }
    this.inMemoryStore.delete(contact);
  }

  private async enforceRateLimit(key: string, limit: number, windowSeconds: number): Promise<void> {
    if (this.redis) {
      try {
        const current = await this.redis.incr(key);
        if (current === 1) {
          await this.redis.expire(key, windowSeconds);
        }
        if (current > limit) {
          const ttl = await this.redis.ttl(key);
          throw new OtpRateLimitError(
            `Too many requests. Please try again in ${Math.max(1, ttl)} seconds.`,
            ttl
          );
        }
        return;
      } catch (err) {
        if (err instanceof OtpRateLimitError) throw err;
        this.redis = undefined;
      }
    }
    if (!this.redis) {
      const now = Date.now();
      const existing = this.inMemoryRateLimits.get(key);
      if (!existing || existing.resetAt <= now) {
        this.inMemoryRateLimits.set(key, { count: 1, resetAt: now + windowSeconds * 1000 });
        return;
      }

      existing.count += 1;
      if (existing.count > limit) {
        const waitSec = Math.ceil((existing.resetAt - now) / 1000);
        throw new OtpRateLimitError(
          `Too many requests. Please try again in ${waitSec} seconds.`,
          waitSec
        );
      }
    }
  }
}
