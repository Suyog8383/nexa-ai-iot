import { createDatabase, isDatabaseReachable } from '../db/client';
import { runMigrations } from '../db/migrate';

import { testDatabaseUrl } from './db';

/**
 * Applies migrations to the test database (a no-op when already applied). The test database is
 * in-memory in Docker, so it starts empty whenever its container is (re)started.
 */
export default async function setup() {
  const url = testDatabaseUrl();
  const database = createDatabase(url);
  try {
    if (!(await isDatabaseReachable(database.pool, 3_000))) {
      throw new Error(
        `Integration tests need the test database, which is not reachable on port ${new URL(url).port}.\n` +
          'Start Docker Desktop, then run: npm run db:up -w @nexa/api',
      );
    }
    await runMigrations(database);
  } finally {
    await database.pool.end();
  }
}
