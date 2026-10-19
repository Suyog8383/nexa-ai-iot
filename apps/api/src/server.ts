import { buildApp } from './app';
import { ConfigError, loadConfig } from './config';
import { createDatabase } from './db/client';

let config;
try {
  config = loadConfig();
} catch (error) {
  // Before the logger exists. The message lists variable names only, never values.
  console.error(error instanceof ConfigError ? error.message : error);
  process.exit(1);
}

const database = createDatabase(config.databaseUrl);
const app = buildApp({ config, database });

async function shutdown(signal: string) {
  app.log.info({ signal }, 'shutting down');
  await app.close();
  await database.pool.end();
  process.exit(0);
}
process.once('SIGINT', () => void shutdown('SIGINT'));
process.once('SIGTERM', () => void shutdown('SIGTERM'));

try {
  await app.listen({ host: config.host, port: config.port });
} catch (error) {
  app.log.error({ err: error }, 'failed to start');
  await database.pool.end();
  process.exit(1);
}
