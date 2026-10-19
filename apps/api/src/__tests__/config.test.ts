import { describe, expect, it } from 'vitest';

import { ConfigError, loadConfig } from '../config';

const DATABASE_URL = 'postgres://nexa:s3cret-pw@127.0.0.1:5432/nexa';

describe('loadConfig', () => {
  it('applies safe defaults', () => {
    expect(loadConfig({ DATABASE_URL })).toEqual({ env: 'development', host: '127.0.0.1', port: 4000, logLevel: 'info', databaseUrl: DATABASE_URL });
  });

  it('coerces PORT from the environment string', () => {
    expect(loadConfig({ DATABASE_URL, PORT: '8080' }).port).toBe(8080);
  });

  it.each([
    ['DATABASE_URL is missing', {}],
    ['DATABASE_URL is not postgres', { DATABASE_URL: 'mysql://nexa:s3cret-pw@127.0.0.1/nexa' }],
    ['PORT is out of range', { DATABASE_URL, PORT: '70000' }],
    ['LOG_LEVEL is unknown', { DATABASE_URL, LOG_LEVEL: 'verbose' }],
    ['NODE_ENV is unknown', { DATABASE_URL, NODE_ENV: 'staging' }],
  ])('fails when %s', (_label, env) => {
    expect(() => loadConfig(env)).toThrow(ConfigError);
  });

  it('names the bad variable without echoing its value', () => {
    let message = '';
    try {
      loadConfig({ DATABASE_URL: 'mysql://nexa:s3cret-pw@127.0.0.1/nexa' });
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toContain('DATABASE_URL');
    expect(message).not.toContain('s3cret-pw');
  });
});
