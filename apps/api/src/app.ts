import Fastify from 'fastify';
import { serializerCompiler, validatorCompiler, type ZodTypeProvider } from 'fastify-type-provider-zod';

import type { Config } from './config';
import type { Database } from './db/client';
import { healthRoutes } from './modules/health/routes';
import { registerProblemHandlers } from './shared/problem';

declare module 'fastify' {
  interface FastifyInstance {
    database: Database;
  }
}

/** Anything matching these paths is replaced before a log line is written. */
export const REDACTED_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'req.headers["x-device-token"]',
  'headers.authorization',
  'password',
  'token',
  'deviceToken',
  'databaseUrl',
  '*.password',
  '*.token',
  '*.deviceToken',
  '*.databaseUrl',
  '*.connectionString',
];

type BuildOptions = {
  config: Pick<Config, 'logLevel'>;
  database: Database;
  /** Where log lines go (stdout by default). Tests pass a stream to inspect real, redacted output. */
  logStream?: { write: (line: string) => void };
};

export function buildApp({ config, database, logStream }: BuildOptions) {
  const app = Fastify({
    logger: { level: config.logLevel, redact: { paths: REDACTED_PATHS, censor: '[REDACTED]' }, ...(logStream && { stream: logStream }) },
    bodyLimit: 64 * 1024,
    // Behind no proxy yet; revisit `trustProxy` when deployed behind one.
  }).withTypeProvider<ZodTypeProvider>();

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  app.decorate('database', database);
  registerProblemHandlers(app);

  app.register(healthRoutes);

  return app;
}

export type App = ReturnType<typeof buildApp>;
