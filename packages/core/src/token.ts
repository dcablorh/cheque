import crypto from 'node:crypto';

export interface GeneratedClaimToken {
  /** 128-bit (16-byte) random token in url-safe base64 or hex format for the URL */
  rawToken: string;
  /** SHA-256 hex hash of the raw token, stored in Postgres */
  claimTokenHash: string;
  /** Human-readable short code for display only, e.g. CHQ-82F91K */
  publicCode: string;
}

/**
 * Generates a 128-bit random token for the claim URL, its SHA-256 hash for DB storage,
 * and a 6-character alphanumeric public code (display only).
 */
export function generateClaimToken(): GeneratedClaimToken {
  // 16 bytes = 128 bits of cryptographic randomness
  const randomBytes = crypto.randomBytes(16);
  // Base64url (22 characters) is compact and safe for URLs
  const rawToken = randomBytes.toString('base64url');
  const claimTokenHash = hashClaimToken(rawToken);

  // Short public code: CHQ- + 6 characters from a non-ambiguous uppercase alphabet
  const charset = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'; // excludes 0, 1, I, O to avoid visual confusion
  let code = '';
  const codeBytes = crypto.randomBytes(6);
  for (let i = 0; i < 6; i++) {
    code += charset[codeBytes[i] % charset.length];
  }
  const publicCode = `CHQ-${code}`;

  return {
    rawToken,
    claimTokenHash,
    publicCode,
  };
}

/**
 * Hashes the raw URL claim token using SHA-256.
 */
export function hashClaimToken(rawToken: string): string {
  return crypto.createHash('sha256').update(rawToken).digest('hex');
}

/**
 * Generates a cryptographically secure 6-digit OTP string.
 */
export function generateOtp(): string {
  // 000000 - 999999
  const num = crypto.randomInt(0, 1000000);
  return num.toString().padStart(6, '0');
}

/**
 * Hashes an OTP with a salt for secure storage in claim_sessions.
 */
export function hashOtp(otp: string, salt: string): string {
  return crypto.createHmac('sha256', salt).update(otp).digest('hex');
}

/**
 * Verifies a provided OTP against the stored hash in constant time.
 */
export function verifyOtp(providedOtp: string, salt: string, storedHash: string): boolean {
  const calculated = hashOtp(providedOtp, salt);
  const a = Buffer.from(calculated, 'hex');
  const b = Buffer.from(storedHash, 'hex');
  if (a.length !== b.length) {
    return false;
  }
  return crypto.timingSafeEqual(a, b);
}

/**
 * Generates a signed or random claim session token after OTP verification.
 */
export function generateSessionToken(): string {
  return crypto.randomBytes(32).toString('base64url');
}

/**
 * SHA-256 hex hash of a claim session token, stored in Postgres instead of the raw token.
 * Same construction as hashClaimToken.
 */
export function hashSessionToken(rawToken: string): string {
  return hashClaimToken(rawToken);
}

/**
 * Computes a deterministic hash of request payloads for idempotency key verification.
 */
export function hashRequestPayload(payload: unknown): string {
  const serialized = typeof payload === 'string' ? payload : JSON.stringify(payload ?? {});
  return crypto.createHash('sha256').update(serialized).digest('hex');
}
