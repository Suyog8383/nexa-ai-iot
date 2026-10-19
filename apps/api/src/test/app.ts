import { buildApp } from '../app';
import { createDatabase } from '../db/client';

/** A port nothing listens on: the pool is created but every query fails fast. */
export const UNREACHABLE_DATABASE_URL = 'postgres://nexa:unused@127.0.0.1:1/nexa_test';

/** An app whose database is unreachable, for tests that don't need one. Collects log lines. */
export function buildTestApp({ databaseUrl = UNREACHABLE_DATABASE_URL } = {}) {
  const logs: string[] = [];
  const database = createDatabase(databaseUrl);
  const app = buildApp({ config: { logLevel: 'info' }, database, logStream: { write: (line) => void logs.push(line) } });
  app.addHook('onClose', async () => {
    await database.pool.end();
  });
  return { app, logs, database };
}
