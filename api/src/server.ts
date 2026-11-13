import fastify from 'fastify';
import cors from '@fastify/cors';
import sensible from '@fastify/sensible';
import crypto from 'node:crypto';
import { loadEnv, logger } from '@cheque/shared';
import {
  getPool,
  closePool,
  runMigrations,
  getReconciliationReport,
  checkChequeReconciliation,
} from '@cheque/core';
import {
  WhatsAppClient,
  SmsClient,
  PhoneOtpService,
  SenderAuthService,
  normalizePhone,
  PHONE_ERROR,
  WhatsAppDeliveryReceipt,
  SmsDeliveryReceipt,
  EmailClient,
} from '@cheque/notify';
import { createOutboxWorker } from './outbox-worker.js';
import { buildChainHandlerFromEnv } from './chain-runtime.js';
import { createChainAppliedHook, registerChequeRoutes, startSweeper } from './cheque-service.js';

export async function buildApp() {
  const env = loadEnv();
  const app = fastify({
    logger: false, // Using our PII-masking logger
  });

  // Preserve raw request body string for HMAC signature verification
  app.addContentTypeParser('application/json', { parseAs: 'buffer' }, (req, body, done) => {
    try {
      const rawString = body.toString('utf8');
      (req as any).rawBody = rawString;
      const parsed = JSON.parse(rawString);
      done(null, parsed);
    } catch (err: any) {
      done(err, undefined);
    }
  });

  await app.register(sensible);
  await app.register(cors, {
    origin: [env.NEXT_PUBLIC_APP_URL, 'http://localhost:3100'],
    credentials: true,
  });

  const pool = getPool({
    connectionString: env.DATABASE_URL,
  });

  // Automatically ensure database schema & reconciliation view are migrated
  try {
    await runMigrations(pool);
    logger.info('Database migrations verified and up-to-date.');
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error(`Database migration error on startup: ${msg}`);
  }

  // Notification & Auth Clients (Real Meta & Real SMS clients)
  const whatsAppClient = new WhatsAppClient({
    apiToken: env.WHATSAPP_API_TOKEN || 'test_token',
    phoneNumberId: env.WHATSAPP_PHONE_NUMBER_ID || 'test_phone_id',
    businessAccountId: env.WHATSAPP_BUSINESS_ACCOUNT_ID,
    appSecret: env.WHATSAPP_APP_SECRET || env.WHATSAPP_WEBHOOK_VERIFY_TOKEN || 'test_secret',
    webhookVerifyToken: env.WHATSAPP_WEBHOOK_VERIFY_TOKEN || 'cheque_verify_token',
  });

  // Local development without messaging credentials: print codes to the API console instead of
  // failing. Never active outside NODE_ENV=development, and only when no SMS key is configured.
  const devConsoleDelivery = env.NODE_ENV === 'development' && !env.SMS_API_KEY;

  const smsClient = devConsoleDelivery
    ? ({
        async sendSms(to: string, body: string) {
          console.log(`
[DEV SMS -> ${to}] ${body}
`);
          return { messageId: 'dev-console' };
        },
      } as unknown as SmsClient)
    : new SmsClient({
        provider: (env.SMS_PROVIDER as 'HUBTEL' | 'ARKESEL' | 'TWILIO') || 'HUBTEL',
        apiKey: env.SMS_API_KEY,
        apiSecret: env.SMS_API_SECRET,
        senderId: env.SMS_SENDER_ID || 'CHEQUE',
      });

  const emailClient = env.EMAIL_API_KEY
    ? EmailClient.fromConfig({ provider: 'RESEND', apiKey: env.EMAIL_API_KEY, from: env.EMAIL_FROM })
    : devConsoleDelivery
      ? ({
          async sendOtp(p: { to: string; otp: string }) {
            console.log(`
[DEV EMAIL -> ${p.to}] verification code ${p.otp}
`);
            return { messageId: 'dev-console' };
          },
        } as unknown as EmailClient)
      : undefined;

  const otpService = new PhoneOtpService({
    salt: env.OTP_SALT || 'cheque_otp_salt_secret',
    redisUrl: env.REDIS_URL,
  });
  await otpService.init();

  const authService = new SenderAuthService(
    {
      jwtSecret: env.JWT_SECRET || 'cheque_jwt_secret_change_for_production',
      redisUrl: env.REDIS_URL,
    },
    otpService,
    pool
  );
  await authService.init();

  // Initialize and start BullMQ outbox worker
  const chain = await buildChainHandlerFromEnv(env, pool, createChainAppliedHook(pool));
  const outboxWorker = createOutboxWorker({
    redisUrl: env.REDIS_URL,
    onChainOperation: chain?.handler,
  });
  outboxWorker.start();

  const stopSweeper = env.NODE_ENV === 'test' ? () => undefined : startSweeper(pool);

  // Clean shutdown hook
  app.addHook('onClose', async () => {
    stopSweeper();
    outboxWorker.stop();
    await closePool();
  });

  // Health check endpoint
  app.get('/health', async () => {
    let dbOk = false;
    try {
      await pool.query('SELECT 1');
      dbOk = true;
    } catch {
      dbOk = false;
    }

    return {
      status: dbOk ? 'ok' : 'degraded',
      service: 'digital-cheques-ghana-api',
      stellarNetwork: env.STELLAR_NETWORK,
      usdcIssuer: env.USDC_ISSUER_ADDRESS,
      database: dbOk ? 'connected' : 'disconnected',
      timestamp: new Date().toISOString(),
    };
  });

  // --- SENDER AUTHENTICATION ROUTES ---

  // Request Phone Login OTP
  app.post<{
    Body: {
      phone: string;
      forceSms?: boolean;
    };
  }>('/auth/otp/request', async (request, reply) => {
    const { phone, forceSms } = request.body;
    const ip = request.ip;
    const deviceFp = request.headers['x-device-fingerprint'] as string | undefined;

    const norm = normalizePhone(phone);
    if (!norm.isValid) {
      return reply.badRequest(`Invalid phone number: ${phone}. ${PHONE_ERROR}`);
    }

    try {
      const res = await authService.requestLoginOtp({
        phoneInput: norm.phoneE164,
        whatsAppClient,
        smsClient,
        forceSms,
        ipAddress: ip,
        deviceFp,
      });

      return {
        success: true,
        phone: res.phoneE164,
        channel: res.channel,
        message: `Verification code sent via ${res.channel}.`,
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('Too many requests') || msg.includes('Please wait')) {
        return reply.tooManyRequests(msg);
      }
      return reply.badRequest(msg);
    }
  });

  // Verify Phone Login OTP -> Returns JWT + Refresh Token
  app.post<{
    Body: {
      phone: string;
      otp: string;
      name?: string;
    };
  }>('/auth/otp/verify', async (request, reply) => {
    const { phone, otp, name } = request.body;
    try {
      const tokens = await authService.verifyLoginOtp({
        phoneInput: phone,
        otp,
        name,
      });
      return tokens;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return reply.unauthorized(msg);
    }
  });

  // Rotate Refresh Token -> Returns new Access Token + Rotating Refresh Token
  app.post<{
    Body: {
      refreshToken: string;
    };
  }>('/auth/refresh', async (request, reply) => {
    const { refreshToken } = request.body;
    try {
      const newTokens = await authService.refreshAccessToken(refreshToken);
      return newTokens;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return reply.unauthorized(msg);
    }
  });

  // Set Optional PIN for Sensitive Actions
  app.post<{
    Body: {
      userId: string;
      pin: string;
    };
  }>('/auth/pin/set', async (request, reply) => {
    const { userId, pin } = request.body;
    try {
      await authService.setPin(userId, pin);
      return { success: true, message: 'PIN set successfully' };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return reply.badRequest(msg);
    }
  });

  // Verify PIN
  app.post<{
    Body: {
      userId: string;
      pin: string;
    };
  }>('/auth/pin/verify', async (request, reply) => {
    const { userId, pin } = request.body;
    const isValid = await authService.verifyPin(userId, pin);
    if (!isValid) {
      return reply.unauthorized('Invalid PIN');
    }
    return { success: true, verified: true };
  });

  // --- WEBHOOKS ---

  // Meta WhatsApp Webhook Verification (Hub Challenge)
  app.get<{
    Querystring: {
      'hub.mode'?: string;
      'hub.verify_token'?: string;
      'hub.challenge'?: string;
    };
  }>('/webhooks/whatsapp', async (request, reply) => {
    const mode = request.query['hub.mode'];
    const token = request.query['hub.verify_token'];
    const challenge = request.query['hub.challenge'];

    const expectedToken = env.WHATSAPP_WEBHOOK_VERIFY_TOKEN || 'cheque_verify_token';

    if (mode === 'subscribe' && token === expectedToken) {
      logger.info('WhatsApp webhook verified successfully');
      return reply.send(challenge);
    }

    return reply.forbidden('Verification token mismatch');
  });

  // Meta WhatsApp Webhook Event Receiver (Delivery & Read receipts)
  app.post('/webhooks/whatsapp', async (request, reply) => {
    const signature = request.headers['x-hub-signature-256'] as string;
    const rawBody = (request as any).rawBody || JSON.stringify(request.body);

    const appSecret = env.WHATSAPP_APP_SECRET || env.WHATSAPP_WEBHOOK_VERIFY_TOKEN || 'test_secret';

    // Verify signature if secret provided
    if (signature && !whatsAppClient.verifyWebhookSignature(rawBody, signature, appSecret)) {
      logger.warn('WhatsApp webhook signature verification failed');
      return reply.unauthorized('Invalid webhook signature');
    }

    const receipts: WhatsAppDeliveryReceipt[] = whatsAppClient.parseDeliveryReceipts(request.body);
    const client = await pool.connect();

    try {
      for (const r of receipts) {
        const eventId = `wa-${r.messageId}-${r.status}`;
        await client.query(
          `
          INSERT INTO webhook_events (id, provider, event_id, payload, processed, processed_at, created_at)
          VALUES (uuid_generate_v4(), 'WHATSAPP', $1, $2, TRUE, NOW(), NOW())
          ON CONFLICT (provider, event_id) DO NOTHING;
          `,
          [eventId, JSON.stringify(r)]
        );
        logger.info(`Recorded WhatsApp receipt for ${r.messageId}: status=${r.status}`);
      }
    } finally {
      client.release();
    }

    return { status: 'received', receiptsCount: receipts.length };
  });

  // SMS Delivery Receipts Webhook
  app.post<{
    Params: { provider: string };
  }>('/webhooks/sms/:provider', async (request, reply) => {
    const provider = request.params.provider.toUpperCase() as 'HUBTEL' | 'ARKESEL' | 'TWILIO';
    const receipt: SmsDeliveryReceipt | null = smsClient.parseDeliveryReceipt(request.body, provider);

    if (receipt) {
      const client = await pool.connect();
      try {
        const eventId = `sms-${provider}-${receipt.messageId}-${receipt.status}`;
        await client.query(
          `
          INSERT INTO webhook_events (id, provider, event_id, payload, processed, processed_at, created_at)
          VALUES (uuid_generate_v4(), $1, $2, $3, TRUE, NOW(), NOW())
          ON CONFLICT (provider, event_id) DO NOTHING;
          `,
          [provider, eventId, JSON.stringify(receipt)]
        );
        logger.info(`Recorded SMS delivery receipt for ${receipt.messageId}: status=${receipt.status}`);
      } finally {
        client.release();
      }
    }

    return { status: 'received' };
  });

  // --- RECONCILIATION & TRANSITIONS ---

  // Reconciliation report endpoint comparing off-chain state with on-chain events
  app.get('/reconciliation', async (request, reply) => {
    try {
      const rows = await getReconciliationReport(pool);
      return {
        total: rows.length,
        reconciled: rows.filter((r) => r.isReconciled).length,
        discrepancies: rows.filter((r) => !r.isReconciled).length,
        data: rows,
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return reply.internalServerError(`Failed to fetch reconciliation report: ${msg}`);
    }
  });

  app.get<{ Params: { id: string } }>('/reconciliation/:id', async (request, reply) => {
    try {
      const row = await checkChequeReconciliation(request.params.id, pool);
      if (!row) {
        return reply.notFound('Cheque not found');
      }
      return row;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return reply.internalServerError(`Failed to fetch cheque reconciliation: ${msg}`);
    }
  });

  registerChequeRoutes({
    app,
    pool,
    env,
    authService,
    otpService,
    whatsAppClient,
    smsClient,
    emailClient,
    fundingPublicKey: chain?.fundingPublicKey,
    chainEnabled: !!chain,
  });

  return {
    app,
    env,
    outboxWorker,
    whatsAppClient,
    smsClient,
    otpService,
    authService,
  };
}

async function start() {
  try {
    const { app, env } = await buildApp();
    const address = await app.listen({ port: env.PORT, host: env.HOST });
    logger.info(`🚀 Cheque API server running at ${address} on ${env.STELLAR_NETWORK}`);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error(`Failed to start API server: ${msg}`);
    process.exit(1);
  }
}

if (process.env.NODE_ENV !== 'test') {
  start();
}
