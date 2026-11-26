import { defineConfig } from 'vitest/config';
import dotenv from 'dotenv';
import fs from 'node:fs';
import path from 'node:path';

// Root `pnpm test` runs every package's suites in one process. Load the
// workspace env files here so tests that never import @cheque/shared
// (packages/core hits the DB directly) still see DATABASE_URL / REDIS_URL.
const root = process.cwd();
for (const file of ['.env.local', '.env']) {
  const envPath = path.join(root, file);
  if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath });
  }
}
// .env ships NODE_ENV=development; tests must always run as test.
process.env.NODE_ENV = 'test';

export default defineConfig({
  test: {
    // .env ships NODE_ENV=development; tests must always run as test.
    env: {
      NODE_ENV: 'test',
    },
    // Migrations retry on lock contention (see runMigrations), which can add
    // a few seconds to beforeAll hooks while a dev API holds outbox locks.
    hookTimeout: 30_000,
    testTimeout: 15_000,
  },
});
