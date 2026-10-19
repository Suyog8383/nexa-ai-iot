import { z } from 'zod';

const Env = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().min(1).default('127.0.0.1'),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/, error: 'must be a postgres:// URL' }),
});

export type Config = {
  env: z.infer<typeof Env>['NODE_ENV'];
  host: string;
  port: number;
  logLevel: z.infer<typeof Env>['LOG_LEVEL'];
  databaseUrl: string;
};

export class ConfigError extends Error {
  override name = 'ConfigError';
}

/**
 * Reads and validates the environment once at startup. Error messages name the offending
 * variables but never echo their values, which may contain credentials.
 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = Env.safeParse(env);
  if (!parsed.success) {
    const problems = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`);
    throw new ConfigError(`Invalid environment configuration:\n  ${problems.join('\n  ')}`);
  }
  const e = parsed.data;
  return { env: e.NODE_ENV, host: e.HOST, port: e.PORT, logLevel: e.LOG_LEVEL, databaseUrl: e.DATABASE_URL };
}
