import { drizzle } from 'drizzle-orm/node-postgres';
import type pg from 'pg';

import { buildApp, type App } from '../app';
import { createDatabase, type Database } from '../db/client';
import * as schema from '../db/schema';

/** A port nothing listens on: the pool is created but every query fails fast. */
export const UNREACHABLE_DATABASE_URL = 'postgres://nexa:unused@127.0.0.1:1/nexa_test';

/** Fixed, obviously-fake owner token for tests. */
export const TEST_OWNER_TOKEN = 'test-owner-token-0123456789abcdefghijklmnop';
export const ownerAuth = { authorization: `Bearer ${TEST_OWNER_TOKEN}` };

const config = { logLevel: 'info', ownerToken: TEST_OWNER_TOKEN } as const;

function collectLogs() {
  const logs: string[] = [];
  return { logs, logStream: { write: (line: string) => void logs.push(line) } };
}

/** An app with its own pool. Closing the app ends the pool. */
export function buildTestApp({ databaseUrl = UNREACHABLE_DATABASE_URL } = {}) {
  const { logs, logStream } = collectLogs();
  const database = createDatabase(databaseUrl);
  const app = buildApp({ config, database, logStream });
  app.addHook('onClose', async () => {
    await database.pool.end();
  });
  return { app, logs, database };
}

type TxContext = { app: App; client: pg.PoolClient; database: Database; logs: string[] };

/**
 * Runs `fn` against a real app whose queries all go through one connection inside a
 * transaction that is always rolled back: tests see their own writes, and nothing persists.
 */
export async function withRolledBackApp<T>(pool: pg.Pool, fn: (ctx: TxContext) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  const { logs, logStream } = collectLogs();
  await client.query('begin');
  const database: Database = { pool, db: drizzle({ client, schema }) };
  const app = buildApp({ config, database, logStream });
  try {
    await app.ready();
    return await fn({ app, client, database, logs });
  } finally {
    await app.close();
    await client.query('rollback');
    client.release();
  }
}
