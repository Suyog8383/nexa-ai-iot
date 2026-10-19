import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

const here = path.dirname(fileURLToPath(import.meta.url));

// Local secrets (TEST_DATABASE_URL) come from the gitignored .env; real env vars take precedence.
try {
  process.loadEnvFile(path.join(here, '.env'));
} catch {
  // No .env: rely on the environment (e.g. CI).
}

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'unit',
          include: ['src/**/*.test.ts'],
          exclude: ['src/**/*.int.test.ts'],
        },
      },
      {
        test: {
          name: 'integration',
          include: ['src/**/*.int.test.ts'],
          // Migrates the *test* database; fails the run if it isn't reachable.
          globalSetup: ['./src/test/global-setup.ts'],
          fileParallelism: false,
        },
      },
    ],
  },
});
