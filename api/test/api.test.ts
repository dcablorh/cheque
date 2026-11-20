import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import crypto from 'node:crypto';
import { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { getPool, generateClaimToken, hashSessionToken } from '@cheque/core';

describe('Apps/API Authentication & Webhooks Integration Tests', () => {
  let app: FastifyInstance;
  let serverInstance: any;

  beforeAll(async () => {
    serverInstance = await buildApp();
    app = serverInstance.app;
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /health returns healthy database and service info', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/health',
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.service).toBe('digital-cheques-ghana-api');
    expect(body.status).toBe('ok');
    expect(body.database).toBe('connected');
  });

  describe('Email sender auth (/auth/email/otp/*)', () => {
    const testEmail = `sender-${crypto.randomBytes(6).toString('hex')}@example.com`;

    it('POST /auth/email/otp/request rejects an invalid email', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/auth/email/otp/request',
        payload: { email: 'not-an-email' },
      });
      expect(res.statusCode).toBe(400);
      expect(JSON.parse(res.body).message).toMatch(/invalid email/i);
    });

    it('POST /auth/email/otp/request sends a verification code', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/auth/email/otp/request',
        payload: { email: testEmail },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.success).toBe(true);
      expect(body.email).toBe(testEmail);
      expect(body.channel).toBe('EMAIL');
      const sent = serverInstance.outboundEmail.filter((m: { to: string }) => m.to === testEmail);
      expect(sent.length).toBeGreaterThanOrEqual(1);
      expect(sent[0].text).toMatch(/\d{6}/);
    });

    it('POST /auth/email/otp/request enforces resend cooldown', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/auth/email/otp/request',
        payload: { email: testEmail },
      });
      expect(res.statusCode).toBe(429);
      expect(JSON.parse(res.body).message).toMatch(/Please wait \d+ seconds/);
    });

    it('POST /auth/email/otp/verify fails on an incorrect OTP', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/auth/email/otp/verify',
        payload: { email: testEmail, otp: '000000' },
      });
      expect(res.statusCode).toBe(401);
      expect(JSON.parse(res.body).message).toMatch(/Incorrect verification code/);
    });

    it('POST /auth/email/otp/verify issues tokens for the correct code', async () => {
      const fresh = `sender-${crypto.randomBytes(6).toString('hex')}@example.com`;
      const { otp } = await serverInstance.emailOtpService.createOtpSession({ contact: fresh });

      const res = await app.inject({
        method: 'POST',
        url: '/api/auth/email/otp/verify',
        payload: { email: fresh, otp, name: 'Ama Owusu' },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.accessToken).toBeDefined();
      expect(body.refreshToken).toBeDefined();
      expect(body.user.email).toBe(fresh);
      expect(body.user.name).toBe('Ama Owusu');

      const decoded = serverInstance.authService.verifyAccessToken(body.accessToken);
      expect(decoded.sub).toBe(body.user.id);
      expect(decoded.contact).toBe(fresh);
      expect(decoded.role).toBe('sender');
    });

    it('POST /auth/refresh rotates the refresh token', async () => {
      const fresh = `sender-${crypto.randomBytes(6).toString('hex')}@example.com`;
      const { otp } = await serverInstance.emailOtpService.createOtpSession({ contact: fresh });

      const res = await app.inject({
        method: 'POST',
        url: '/api/auth/email/otp/verify',
        payload: { email: fresh, otp },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);

      const refreshRes = await app.inject({
        method: 'POST',
        url: '/api/auth/refresh',
        payload: { refreshToken: body.refreshToken },
      });
      expect(refreshRes.statusCode).toBe(200);
      const refreshBody = JSON.parse(refreshRes.body);
      expect(refreshBody.accessToken).toBeDefined();
      expect(refreshBody.refreshToken).toBeDefined();
      expect(refreshBody.refreshToken).not.toBe(body.refreshToken); // Must be rotated!
    });
  });

  describe('Claim email OTP and session', () => {
    const pool = getPool();
    const stellarAddress = 'G' + 'A'.repeat(55);

    async function insertCheque(opts: { payeeEmail?: string; state?: string }) {
      const userId = crypto.randomUUID();
      const chequeId = crypto.randomUUID();
      const { rawToken, claimTokenHash, publicCode } = generateClaimToken();
      const email = `sender-${crypto.randomUUID()}@example.com`;
      await pool.query(
        `INSERT INTO users (id, email, name) VALUES ($1, $2, $3)`,
        [userId, email, 'Test Sender']
      );
      await pool.query(
        `INSERT INTO cheques (
            id, public_code, claim_token_hash, sender_id, payee_name,
            payee_contact_type, payee_contact, face_amount_minor, fee_minor,
            state, expires_at, corridor, currency
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'GH','GHS')`,
        [
          chequeId,
          publicCode,
          claimTokenHash,
          userId,
          'Kojo Mensah',
          opts.payeeEmail ? 'EMAIL' : null,
          opts.payeeEmail ?? null,
          5000,
          50,
          opts.state ?? 'PENDING_FUNDING',
          new Date(Date.now() + 48 * 3600 * 1000),
        ]
      );
      return { userId, chequeId, rawToken, publicCode };
    }

    function redeemPayload(sessionToken?: string) {
      return {
        destination: { type: 'USDC', accountRef: stellarAddress },
        idempotencyKey: crypto.randomBytes(8).toString('hex'),
        ...(sessionToken ? { sessionToken } : {}),
      };
    }

    it('lets a cheque without a recipient email be claimed without OTP', async () => {
      const { rawToken } = await insertCheque({});

      const send = await app.inject({
        method: 'POST',
        url: `/claim/${rawToken}/otp/send`,
        payload: {},
      });
      expect(send.statusCode).toBe(200);
      expect(JSON.parse(send.body).skipped).toBe(true);

      const redeem = await app.inject({
        method: 'POST',
        url: `/claim/${rawToken}/redeem`,
        payload: redeemPayload(),
      });
      // Must not demand email verification; this cheque is not yet funded.
      expect(redeem.statusCode).not.toBe(401);
      expect(JSON.parse(redeem.body).message).toMatch(/pending funding|can't be redeemed/i);
    });

    it('requires email verification before redeeming a cheque with a payee email', async () => {
      const payee = `payee-${crypto.randomBytes(6).toString('hex')}@example.com`;
      const { rawToken } = await insertCheque({ payeeEmail: payee });

      const redeem = await app.inject({
        method: 'POST',
        url: `/claim/${rawToken}/redeem`,
        payload: redeemPayload(),
      });
      expect(redeem.statusCode).toBe(401);
      expect(JSON.parse(redeem.body).message).toMatch(/email verification required/i);
    });


    it('sends a claim OTP to the payee email', async () => {
      const payee = `payee-${crypto.randomBytes(6).toString('hex')}@example.com`;
      const { rawToken } = await insertCheque({ payeeEmail: payee });

      const send = await app.inject({
        method: 'POST',
        url: `/claim/${rawToken}/otp/send`,
        payload: {},
      });
      expect(send.statusCode).toBe(200);
      expect(JSON.parse(send.body).success).toBe(true);
      expect(JSON.parse(send.body).skipped).toBeUndefined();
      const mailed = serverInstance.outboundEmail.filter((m: { to: string }) => m.to === payee);
      expect(mailed.length).toBeGreaterThanOrEqual(1);
      expect(mailed[mailed.length - 1].text).toMatch(/\d{6}/);
    });

    it('rejects wrong claim OTP codes and invalidates the session after 5 attempts', async () => {
      const payee = `payee-${crypto.randomBytes(6).toString('hex')}@example.com`;
      const { rawToken } = await insertCheque({ payeeEmail: payee });
      const { otp } = await serverInstance.emailOtpService.createOtpSession({ contact: payee });
      const wrong = otp === '111111' ? '222222' : '111111';

      for (let left = 4; left >= 1; left--) {
        const fail = await app.inject({
          method: 'POST',
          url: `/claim/${rawToken}/otp/verify`,
          payload: { otp: wrong },
        });
        expect(fail.statusCode).toBe(401);
        expect(JSON.parse(fail.body).message).toMatch(new RegExp(`${left} attempt`));
      }
      const locked = await app.inject({
        method: 'POST',
        url: `/claim/${rawToken}/otp/verify`,
        payload: { otp: wrong },
      });
      expect(locked.statusCode).toBe(401);
      expect(JSON.parse(locked.body).message).toMatch(/Maximum verification attempts/);

      const tooLate = await app.inject({
        method: 'POST',
        url: `/claim/${rawToken}/otp/verify`,
        payload: { otp },
      });
      expect(tooLate.statusCode).toBe(401);
      expect(JSON.parse(tooLate.body).message).toMatch(/No active OTP found/);
    });

    it('stores a hashed session token and lets a verified session past email checks', async () => {
      const payee = `payee-${crypto.randomBytes(6).toString('hex')}@example.com`;
      const { rawToken, chequeId } = await insertCheque({ payeeEmail: payee });
      const { otp } = await serverInstance.emailOtpService.createOtpSession({ contact: payee });

      const verify = await app.inject({
        method: 'POST',
        url: `/claim/${rawToken}/otp/verify`,
        payload: { otp },
      });
      expect(verify.statusCode).toBe(200);
      const body = JSON.parse(verify.body);
      expect(body.sessionToken).toBeDefined();
      expect(body.sessionToken.length).toBeGreaterThanOrEqual(16);

      const stored = await pool.query(
        `SELECT session_token, otp_hash FROM claim_sessions WHERE cheque_id = $1`,
        [chequeId]
      );
      expect(stored.rows).toHaveLength(1);
      expect(stored.rows[0].session_token).toBe(hashSessionToken(body.sessionToken));
      expect(stored.rows[0].session_token).not.toBe(body.sessionToken);
      expect(stored.rows[0].otp_hash).not.toBe('verified');
      expect(stored.rows[0].otp_hash).toMatch(/^[0-9a-f]{64}$/);

      const redeem = await app.inject({
        method: 'POST',
        url: `/claim/${rawToken}/redeem`,
        payload: redeemPayload(body.sessionToken),
      });
      expect(redeem.statusCode).not.toBe(401);
      expect(JSON.parse(redeem.body).message).toMatch(/pending funding|can't be redeemed/i);
    });

  });
});
