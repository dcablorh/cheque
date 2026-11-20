import { buildApp } from './app.js';
import { logger } from '@cheque/shared';

/**
 * Local entrypoint: builds the app and listens on PORT (default 3001).
 * All routes are mounted under the /api prefix (see app.ts).
 *
 * On Vercel the service entrypoint is src/app.ts, whose default export runs as a
 * serverless function instead of a listening server.
 */
async function start() {
  try {
    const { app, env } = await buildApp();
    const address = await app.listen({ port: env.PORT, host: env.HOST });
    logger.info(`🚀 Cheque API server running at ${address} (routes under /api) on ${env.STELLAR_NETWORK}`);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error(`Failed to start API server: ${msg}`);
    process.exit(1);
  }
}

if (process.env.NODE_ENV !== 'test' && process.env.VERCEL !== '1') {
  start();
}
