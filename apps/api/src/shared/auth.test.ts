import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { buildTestApp, ownerAuth, TEST_OWNER_TOKEN } from '../test/app';

import { matchesHash, sha256 } from './auth';

describe('matchesHash', () => {
  it('matches only the exact secret', () => {
    const digest = sha256('correct horse battery staple');
    expect(matchesHash('correct horse battery staple', digest)).toBe(true);
    expect(matchesHash('correct horse battery stapl', digest)).toBe(false);
    expect(matchesHash('', digest)).toBe(false);
    expect(matchesHash('x', Buffer.alloc(0))).toBe(false);
  });
});

describe('owner authentication (no database needed)', () => {
  const { app, logs } = buildTestApp();
  beforeAll(() => app.ready());
  afterAll(() => app.close());

  it.each([
    ['no Authorization header', {}],
    ['a wrong token', { authorization: 'Bearer wrong-token-0123456789abcdefghijk' }],
    ['the right token with the wrong scheme', { authorization: `Basic ${TEST_OWNER_TOKEN}` }],
    ['an empty bearer token', { authorization: 'Bearer ' }],
    ['a device-style token', { authorization: `Bearer nxd_${'0'.repeat(8)}-0000-0000-0000-${'0'.repeat(12)}.${'A'.repeat(43)}` }],
  ])('rejects %s with 401 problem+json', async (_label, headers) => {
    const res = await app.inject({ method: 'GET', url: '/v1/devices', headers });
    expect(res.statusCode).toBe(401);
    expect(res.headers['www-authenticate']).toBe('Bearer');
    expect(res.headers['content-type']).toBe('application/problem+json; charset=utf-8');
    expect(res.json()).toMatchObject({ type: 'urn:nexa:problem:unauthorized', status: 401 });
  });

  it('checks auth before validating the body, so the schema is not revealed', async () => {
    const res = await app.inject({ method: 'POST', url: '/v1/devices', payload: { nonsense: true } });
    expect(res.statusCode).toBe(401);
  });

  it('accepts a case-insensitive Bearer scheme (then fails on the unreachable database, not on auth)', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/devices', headers: { authorization: `bearer ${TEST_OWNER_TOKEN}` } });
    expect(res.statusCode).toBe(500);
    expect(JSON.stringify(res.json())).not.toContain('127.0.0.1');
  });

  it('keeps the health check public', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/health' });
    expect(res.statusCode).toBe(503); // unreachable database, but not 401
  });

  it('never logs the owner token', async () => {
    await app.inject({ method: 'GET', url: '/v1/devices', headers: ownerAuth });
    expect(logs.join('')).not.toContain(TEST_OWNER_TOKEN);
  });
});
