import fastify from 'fastify';
import cors from '@fastify/cors';
import sensible from '@fastify/sensible';
import { loadEnv, logger } from '@cheque/shared';

export async function buildApp() {
  const env = loadEnv();
  const app = fastify({
    logger: false, // Using our PII-masking logger
  });

  await app.register(sensible);
  await app.register(cors, {
    origin: [env.NEXT_PUBLIC_APP_URL, 'http://localhost:3000'],
    credentials: true,
  });

  // Health check endpoint
  app.get('/health', async () => {
    return {
      status: 'ok',
      service: 'digital-cheques-ghana-api',
      stellarNetwork: env.STELLAR_NETWORK,
      usdcIssuer: env.USDC_ISSUER_ADDRESS,
      timestamp: new Date().toISOString(),
    };
  });

  return { app, env };
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
