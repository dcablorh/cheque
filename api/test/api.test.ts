import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import crypto from 'node:crypto';
import { FastifyInstance } from 'fastify';
import { buildApp } from '../src/server.js';
import { getPool } from '@cheque/core';

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
      url: '/health',
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.service).toBe('digital-cheques-ghana-api');
    expect(body.status).toBe('ok');
    expect(body.database).toBe('connected');
  });

  describe('Sender Auth Routes (/auth/otp/*, /auth/refresh, /auth/pin/*)', () => {
    // Generate unique phone numbers for test run isolation
    const randomSuffix = Math.floor(100000 + Math.random() * 900000);
    const testPhone = `0241${randomSuffix}`; // MTN Ghana number
    const expectedE164 = `+233241${randomSuffix}`;

    it('POST /auth/otp/request rejects invalid Ghana phone numbers', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/auth/otp/request',
        payload: {
          phone: '0211234567', // Invalid prefix
        },
      });

      expect(res.statusCode).toBe(400);
      const body = JSON.parse(res.body);
      expect(body.message).toContain('Invalid phone number');
    });

    it('POST /auth/otp/request creates an OTP session successfully', async () => {
      // Mock WhatsApp sendTemplate so we don't hit external API during this test
      serverInstance.whatsAppClient.sendTemplate = async () => ({ messageId: 'wa-mock-123' });

      const res = await app.inject({
        method: 'POST',
        url: '/auth/otp/request',
        payload: {
          phone: testPhone,
        },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.success).toBe(true);
      expect(body.phone).toBe(expectedE164);
      expect(body.channel).toBe('WHATSAPP');
    });

    it('POST /auth/otp/request enforces resend cooldown', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/auth/otp/request',
        payload: {
          phone: testPhone,
        },
      });

      // Should be rejected with 429 Too Many Requests due to 30s cooldown
      expect(res.statusCode).toBe(429);
      const body = JSON.parse(res.body);
      expect(body.message).toMatch(/Please wait \d+ seconds/);
    });

    it('POST /auth/otp/verify fails on incorrect OTP', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/auth/otp/verify',
        payload: {
          phone: testPhone,
          otp: '000000',
        },
      });

      expect(res.statusCode).toBe(401);
      const body = JSON.parse(res.body);
      expect(body.message).toMatch(/Incorrect verification code/);
    });

    it('POST /auth/otp/verify succeeds with correct code and returns JWT + Refresh Token', async () => {
      // Create fresh OTP session directly through otpService to capture the generated code
      const freshSuffix = Math.floor(100000 + Math.random() * 900000);
      const freshPhone = `0502${freshSuffix}`; // Telecel
      const freshE164 = `+233502${freshSuffix}`;

      const { otp } = await serverInstance.otpService.createOtpSession({
        phoneInput: freshPhone,
      });

      const res = await app.inject({
        method: 'POST',
        url: '/auth/otp/verify',
        payload: {
          phone: freshPhone,
          otp,
          name: 'Kwame Mensah',
        },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.accessToken).toBeDefined();
      expect(body.refreshToken).toBeDefined();
      expect(body.user).toBeDefined();
      expect(body.user.phoneE164).toBe(freshE164);
      expect(body.user.name).toBe('Kwame Mensah');

      // Verify Access Token signature & claims
      const decoded = serverInstance.authService.verifyAccessToken(body.accessToken);
      expect(decoded.sub).toBe(body.user.id);
      expect(decoded.phone).toBe(freshE164);
      expect(decoded.role).toBe('sender');

      // Test Token Refresh
      const refreshRes = await app.inject({
        method: 'POST',
        url: '/auth/refresh',
        payload: {
          refreshToken: body.refreshToken,
        },
      });

      expect(refreshRes.statusCode).toBe(200);
      const refreshBody = JSON.parse(refreshRes.body);
      expect(refreshBody.accessToken).toBeDefined();
      expect(refreshBody.refreshToken).toBeDefined();
      expect(refreshBody.refreshToken).not.toBe(body.refreshToken); // Must be rotated!

      // Setting and verifying PIN
      const pinSetRes = await app.inject({
        method: 'POST',
        url: '/auth/pin/set',
        payload: {
          userId: body.user.id,
          pin: '1234',
        },
      });
      expect(pinSetRes.statusCode).toBe(200);

      const pinVerifyRes = await app.inject({
        method: 'POST',
        url: '/auth/pin/verify',
        payload: {
          userId: body.user.id,
          pin: '1234',
        },
      });
      expect(pinVerifyRes.statusCode).toBe(200);
      expect(JSON.parse(pinVerifyRes.body).verified).toBe(true);

      const pinVerifyWrong = await app.inject({
        method: 'POST',
        url: '/auth/pin/verify',
        payload: {
          userId: body.user.id,
          pin: '9999',
        },
      });
      expect(pinVerifyWrong.statusCode).toBe(401);
    });
  });

  describe('WhatsApp Webhook Handlers', () => {
    it('GET /webhooks/whatsapp verifies challenge with valid token', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/webhooks/whatsapp',
        query: {
          'hub.mode': 'subscribe',
          'hub.verify_token': serverInstance.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN || 'cheque_verify_token',
          'hub.challenge': 'challenge_code_12345',
        },
      });

      expect(res.statusCode).toBe(200);
      expect(res.body).toBe('challenge_code_12345');
    });

    it('GET /webhooks/whatsapp rejects invalid verify token', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/webhooks/whatsapp',
        query: {
          'hub.mode': 'subscribe',
          'hub.verify_token': 'wrong_token',
          'hub.challenge': 'challenge_code_12345',
        },
      });

      expect(res.statusCode).toBe(403);
    });

    it('POST /webhooks/whatsapp receives delivery receipts and records into webhook_events', async () => {
      const secret =
        serverInstance.env.WHATSAPP_APP_SECRET ||
        serverInstance.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN ||
        'test_secret';

      const payload = {
        object: 'whatsapp_business_account',
        entry: [
          {
            id: 'wa_biz_acc_1',
            changes: [
              {
                value: {
                  messaging_product: 'whatsapp',
                  statuses: [
                    {
                      id: 'wamid.HBgLMjMzMjQxMjM0NTY3',
                      status: 'delivered',
                      timestamp: '1728043200',
                      recipient_id: '233241234567',
                    },
                  ],
                },
                field: 'messages',
              },
            ],
          },
        ],
      };

      const rawBody = JSON.stringify(payload);
      const signature =
        'sha256=' +
        crypto.createHmac('sha256', secret).update(rawBody).digest('hex');

      const res = await app.inject({
        method: 'POST',
        url: '/webhooks/whatsapp',
        headers: {
          'content-type': 'application/json',
          'x-hub-signature-256': signature,
        },
        payload: rawBody,
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.status).toBe('received');
      expect(body.receiptsCount).toBe(1);

      // Verify event recorded into PostgreSQL webhook_events table
      const pool = getPool();
      const eventRes = await pool.query(
        `SELECT * FROM webhook_events WHERE provider = 'WHATSAPP' AND event_id = $1`,
        ['wa-wamid.HBgLMjMzMjQxMjM0NTY3-delivered']
      );
      expect(eventRes.rows.length).toBe(1);
      expect(eventRes.rows[0].processed).toBe(true);
    });
  });

  describe('SMS Webhook Handlers', () => {
    it('POST /webhooks/sms/hubtel records delivery receipt into webhook_events', async () => {
      const payload = {
        MessageId: 'hubtel_msg_receipt_999',
        To: '+233241234567',
        Status: 'Delivered',
      };

      const res = await app.inject({
        method: 'POST',
        url: '/webhooks/sms/hubtel',
        headers: {
          'content-type': 'application/json',
        },
        payload,
      });

      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body).status).toBe('received');

      // Verify event recorded in PostgreSQL
      const pool = getPool();
      const eventRes = await pool.query(
        `SELECT * FROM webhook_events WHERE provider = 'HUBTEL' AND event_id = $1`,
        ['sms-HUBTEL-hubtel_msg_receipt_999-DELIVERED']
      );
      expect(eventRes.rows.length).toBe(1);
      expect(eventRes.rows[0].processed).toBe(true);
    });
  });
});
