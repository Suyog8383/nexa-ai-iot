import { z } from 'zod';

const Env = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().min(1).default('127.0.0.1'),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/, error: 'must be a postgres:// URL' }),
  /** Development-only shared secret for the app/owner endpoints, until real user accounts exist. */
  OWNER_TOKEN: z.string().min(32, 'must be at least 32 characters'),
});

export type Config = {
  env: z.infer<typeof Env>['NODE_ENV'];
  host: string;
  port: number;
  logLevel: z.infer<typeof Env>['LOG_LEVEL'];
  databaseUrl: string;
  ownerToken: string;
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
  if (e.NODE_ENV === 'production') {
    // One shared token is not real authentication. See docs/architecture.md: no deployment until user accounts exist.
    throw new ConfigError('Refusing to start with NODE_ENV=production: OWNER_TOKEN auth is for local development only.');
  }
  return { env: e.NODE_ENV, host: e.HOST, port: e.PORT, logLevel: e.LOG_LEVEL, databaseUrl: e.DATABASE_URL, ownerToken: e.OWNER_TOKEN };
}
