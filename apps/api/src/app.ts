import rateLimit from '@fastify/rate-limit';
import { TELEMETRY_RATE_LIMIT } from '@nexa/contracts/limits';
import Fastify from 'fastify';
import { serializerCompiler, validatorCompiler, type ZodTypeProvider } from 'fastify-type-provider-zod';

import type { Config } from './config';
import type { Database } from './db/client';
import { alertRoutes } from './modules/alerts/routes';
import { deviceRoutes } from './modules/devices/routes';
import { healthRoutes } from './modules/health/routes';
import { telemetryRoutes, type TelemetryRateLimit } from './modules/telemetry/routes';
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
  config: Pick<Config, 'logLevel' | 'ownerToken'>;
  database: Database;
  /** Where log lines go (stdout by default). Tests pass a stream to inspect real, redacted output. */
  logStream?: { write: (line: string) => void };
  /** Per-device telemetry limit; tests lower it to exercise 429s deterministically. */
  telemetryRateLimit?: TelemetryRateLimit;
};

export function buildApp({ config, database, logStream, telemetryRateLimit = { max: TELEMETRY_RATE_LIMIT.max, timeWindowMs: TELEMETRY_RATE_LIMIT.windowMs } }: BuildOptions) {
  const app = Fastify({
    logger: { level: config.logLevel, redact: { paths: REDACTED_PATHS, censor: '[REDACTED]' }, ...(logStream && { stream: logStream }) },
    bodyLimit: 64 * 1024,
    // Behind no proxy yet; revisit `trustProxy` when deployed behind one.
  }).withTypeProvider<ZodTypeProvider>();

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  app.decorate('database', database);
  registerProblemHandlers(app);

  // Only routes that opt in via `config.rateLimit` are limited (telemetry, per device). Counters
  // live in this process's memory: fine for one local instance, needs a shared store if scaled out.
  app.register(rateLimit, { global: false });
  app.register(healthRoutes);
  app.register(deviceRoutes, { ownerToken: config.ownerToken });
  app.register(telemetryRoutes, { ownerToken: config.ownerToken, rateLimit: telemetryRateLimit });
  app.register(alertRoutes, { ownerToken: config.ownerToken });

  return app;
}

export type App = ReturnType<typeof buildApp>;
