import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import pg from 'pg';

import * as schema from './schema';

export type Database = {
  pool: pg.Pool;
  db: NodePgDatabase<typeof schema>;
};

/** One pool per process. All queries go through Drizzle or parameterized `pool.query`. */
export function createDatabase(connectionString: string): Database {
  const pool = new pg.Pool({ connectionString, max: 10, connectionTimeoutMillis: 2_000, idleTimeoutMillis: 30_000 });
  // An idle client losing its connection must not crash the process; the next query reconnects.
  pool.on('error', () => {});
  return { pool, db: drizzle({ client: pool, schema }) };
}

/** True if the database answers within `timeoutMs`. */
export async function isDatabaseReachable(pool: pg.Pool, timeoutMs = 2_000): Promise<boolean> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<false>((resolve) => {
    timer = setTimeout(() => resolve(false), timeoutMs);
  });
  try {
    return await Promise.race([pool.query('select 1').then(() => true), timeout]);
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}
