import type pg from 'pg';

/**
 * The only database tests may touch. Refuses anything that could be the development database:
 * the name must end in `_test` and the URL must differ from DATABASE_URL.
 */
export function testDatabaseUrl(env: NodeJS.ProcessEnv = process.env): string {
  const url = env.TEST_DATABASE_URL;
  if (!url) {
    throw new Error('TEST_DATABASE_URL is not set. Copy apps/api/.env.example to apps/api/.env (see apps/api/README.md).');
  }
  const name = decodeURIComponent(new URL(url).pathname.slice(1));
  if (!name.endsWith('_test')) {
    throw new Error(`Refusing to run tests against database "${name}": test database names must end in "_test".`);
  }
  if (env.DATABASE_URL && new URL(env.DATABASE_URL).href === new URL(url).href) {
    throw new Error('Refusing to run tests: TEST_DATABASE_URL is the same as DATABASE_URL.');
  }
  return url;
}

/**
 * Runs `fn` inside a transaction that is always rolled back, so tests never leave data behind
 * and never need destructive cleanup.
 */
export async function inRolledBackTransaction<T>(pool: pg.Pool, fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('begin');
    return await fn(client);
  } finally {
    await client.query('rollback');
    client.release();
  }
}
