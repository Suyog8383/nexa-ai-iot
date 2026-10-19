import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { migrate } from 'drizzle-orm/node-postgres/migrator';

import { loadConfig } from '../config';

import { createDatabase, type Database } from './client';

export const migrationsFolder = path.join(path.dirname(fileURLToPath(import.meta.url)), 'migrations');

/** Applies every pending migration in `src/db/migrations`, in order, inside Drizzle's migration lock. */
export async function runMigrations({ db }: Database): Promise<void> {
  await migrate(db, { migrationsFolder });
}

// `npm run db:migrate`
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const database = createDatabase(loadConfig().databaseUrl);
  try {
    await runMigrations(database);
    console.log('Migrations applied.');
  } finally {
    await database.pool.end();
  }
}
