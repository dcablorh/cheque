import fastify from 'fastify';
import cors from '@fastify/cors';
import sensible from '@fastify/sensible';
import crypto from 'node:crypto';
import { loadEnv, logger } from '@cheque/shared';
import {
  getPool,
  closePool,
  runMigrations,
} from '@cheque/core';
import {
  SenderAuthService,
  OtpService,
  EmailClient,
  normalizeEmail,
} from '@cheque/notify';
import { createOutboxWorker } from './outbox-worker.js';
import { buildChainHandlerFromEnv } from './chain-runtime.js';
import { createChainAppliedHook, registerChequeRoutes, startSweeper } from './cheque-service.js';
import { buildCctpAdapterFromEnv, buildCctpHandlerFromEnv } from './cctp-runtime.js';
import { RateLimiter } from './rate-limit.js';

export async function buildApp() {
  const env = loadEnv();
  const app = fastify({
    logger: false, // Using our PII-masking logger
    bodyLimit: 256 * 1024,
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
  // Baseline security headers (defence in depth; no external dependency).
  app.addHook('onSend', async (_request, reply) => {
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('X-Frame-Options', 'DENY');
    reply.header('Referrer-Policy', 'no-referrer');
    reply.header('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    reply.header('X-XSS-Protection', '0');
    if (env.NODE_ENV === 'production') {
      reply.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    }
  });
  await app.register(cors, {
    origin: [env.NEXT_PUBLIC_APP_URL, 'http://localhost:3100'],
    credentials: true,
  });

  const rateLimiter = new RateLimiter(env.REDIS_URL);
  app.addHook('preHandler', async (request, reply) => {
    const ip = request.ip || 'unknown';
    const path = request.url.split('?')[0];
    let result: { allowed: boolean; retryAfter: number } | null = null;
    if (path === '/auth/email/otp/request')
      result = await rateLimiter.check(`rl:auth:req:${ip}`, 10, 60);
    else if (path === '/auth/email/otp/verify')
      result = await rateLimiter.check(`rl:auth:verify:${ip}`, 20, 60);
    else if (path.startsWith('/claim/') && (path.endsWith('/otp/send') || path.endsWith('/otp/verify')))
      result = await rateLimiter.check(`rl:claim:otp:${ip}`, 10, 60);
    else if (path.startsWith('/claim/') && path.endsWith('/redeem'))
      result = await rateLimiter.check(`rl:claim:redeem:${ip}`, 20, 60);
    else if (path.startsWith('/claim/') && path.includes('/payout-quote'))
      result = await rateLimiter.check(`rl:claim:quote:${ip}`, 30, 60);
    if (result && !result.allowed) {
      return reply.code(429).send({
        statusCode: 429,
        error: 'Too Many Requests',
        message: `Too many requests. Retry in ${result.retryAfter} seconds.`,
        retryAfter: result.retryAfter,
      });
    }
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

  // Notification & Auth Clients (email only; sender login and alerts go through Resend)
  const emailOtpService = new OtpService({
    salt: env.OTP_SALT,
    redisUrl: env.REDIS_URL,
    normalize: normalizeEmail,
  });
  await emailOtpService.init();

  // Local development/tests without Resend credentials: capture codes instead of failing.
  // Never active in production, and only when no email API key is configured.
  const devConsoleEmail = (env.NODE_ENV === 'development' || env.NODE_ENV === 'test') && !env.EMAIL_API_KEY;
  const outboundEmail: { to: string; subject: string; text: string }[] = [];
  const emailClient = devConsoleEmail
    ? ({
        async sendEmail(params: { to: string; subject: string; text: string }) {
          outboundEmail.push(params);
          if (env.NODE_ENV === 'development') {
            console.log(`
[DEV EMAIL -> ${params.to}] ${params.subject}
${params.text}
`);
          }
          return {};
        },
      } as unknown as EmailClient)
    : new EmailClient({ apiKey: env.EMAIL_API_KEY });

  const authService = new SenderAuthService(
    {
      jwtSecret: env.JWT_SECRET,
      redisUrl: env.REDIS_URL,
    },
    pool,
    emailOtpService
  );
  await authService.init();

  // Initialize and start BullMQ outbox worker
  const chain = await buildChainHandlerFromEnv(env, pool, createChainAppliedHook(pool, env.STELLAR_NETWORK));
  const cctpAdapter = buildCctpAdapterFromEnv(env);
  const outboxWorker = createOutboxWorker({
    redisUrl: env.REDIS_URL,
    onChainOperation: chain?.handler,
    onCctpOperation: buildCctpHandlerFromEnv(env, pool, cctpAdapter),
    emailClient,
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

  // --- SENDER AUTHENTICATION ROUTES (email OTP) ---

  // --- EMAIL SENDER AUTHENTICATION ROUTES (PRD v4) ---

  app.post<{ Body: { email: string } }>('/auth/email/otp/request', async (request, reply) => {
    const body = request.body as { email?: unknown } | undefined;
    if (!body || typeof body.email !== 'string' || body.email.trim() === '') {
      return reply.badRequest('email is required');
    }
    try {
      const res = await authService.requestEmailLoginOtp({
        email: body.email,
        ipAddress: request.ip,
        deviceFp: request.headers['x-device-fingerprint'] as string | undefined,
      });
      // Send the OTP via Resend
      await emailClient.sendEmail({
        to: res.email,
        subject: 'Your sencheq verification code',
        text: `Your verification code is ${res.otp}. It expires in 5 minutes. Do not share it.`,
      });
      return { success: true, email: res.email, channel: res.channel, message: 'Verification code sent via email.' };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('Too many requests') || msg.includes('Please wait')) {
        return reply.tooManyRequests(msg);
      }
      return reply.badRequest(msg);
    }
  });

  app.post<{ Body: { email: string; otp: string; name?: string } }>('/auth/email/otp/verify', async (request, reply) => {
    const body = request.body as { email?: unknown; otp?: unknown; name?: unknown } | undefined;
    if (!body || typeof body.email !== 'string' || typeof body.otp !== 'string' || body.otp.trim() === '') {
      return reply.badRequest('email and otp are required');
    }
    try {
      const tokens = await authService.verifyEmailLoginOtp({
        email: body.email,
        otp: body.otp,
        name: typeof body.name === 'string' ? body.name : undefined,
      });
      return tokens;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return reply.unauthorized(msg || 'verify failed');
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
  registerChequeRoutes({
    app,
    pool,
    env,
    authService,
    emailOtpService,
    emailClient,
    fundingPublicKey: chain?.fundingPublicKey,
    chainClient: chain?.client,
    chainEnabled: !!chain,
    settlementPublicKey: env.SETTLEMENT_ACCOUNT_PUBLIC,
    cctpAdapter,
  });

  return {
    app,
    env,
    outboxWorker,
    emailOtpService,
    emailClient,
    outboundEmail,
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
