import { describe, expect, it } from 'vitest';

import { ConfigError, loadConfig } from '../config';

const DATABASE_URL = 'postgres://nexa:s3cret-pw@127.0.0.1:5432/nexa';
const OWNER_TOKEN = 'owner-secret-0123456789abcdefghijkl';
const base = { DATABASE_URL, OWNER_TOKEN };

describe('loadConfig', () => {
  it('applies safe defaults', () => {
    expect(loadConfig(base)).toEqual({ env: 'development', host: '127.0.0.1', port: 4000, logLevel: 'info', databaseUrl: DATABASE_URL, ownerToken: OWNER_TOKEN });
  });

  it('coerces PORT from the environment string', () => {
    expect(loadConfig({ ...base, PORT: '8080' }).port).toBe(8080);
  });

  it.each([
    ['DATABASE_URL is missing', { OWNER_TOKEN }],
    ['DATABASE_URL is not postgres', { OWNER_TOKEN, DATABASE_URL: 'mysql://nexa:s3cret-pw@127.0.0.1/nexa' }],
    ['OWNER_TOKEN is missing', { DATABASE_URL }],
    ['OWNER_TOKEN is shorter than 32 characters', { DATABASE_URL, OWNER_TOKEN: 'short-token' }],
    ['PORT is out of range', { ...base, PORT: '70000' }],
    ['LOG_LEVEL is unknown', { ...base, LOG_LEVEL: 'verbose' }],
    ['NODE_ENV is unknown', { ...base, NODE_ENV: 'staging' }],
    ['NODE_ENV is production (owner-token auth is development-only)', { ...base, NODE_ENV: 'production' }],
  ])('fails when %s', (_label, env) => {
    expect(() => loadConfig(env)).toThrow(ConfigError);
  });

  it('names the bad variable without echoing its value', () => {
    let message = '';
    try {
      loadConfig({ DATABASE_URL: 'mysql://nexa:s3cret-pw@127.0.0.1/nexa', OWNER_TOKEN: 'too-short-owner-secret' });
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toContain('DATABASE_URL');
    expect(message).toContain('OWNER_TOKEN');
    expect(message).not.toContain('s3cret-pw');
    expect(message).not.toContain('too-short-owner-secret');
  });
});
