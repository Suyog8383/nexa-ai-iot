import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { buildTestApp } from '../test/app';

const SECRETS = ['nxd_0b9c3c1e-6f0a-4c51-9b5e-2f6f1d3a8e47.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA', 's3cret-db-pw', 'owner-token-123'];

const { app, logs } = buildTestApp();

beforeAll(async () => {
  app.get('/test/log', async (req) => {
    // What careless future code might log: these fields must be censored.
    req.log.info({ deviceToken: SECRETS[0], databaseUrl: `postgres://nexa:${SECRETS[1]}@db/nexa`, config: { password: SECRETS[1] }, token: SECRETS[2] }, 'context');
    req.log.info({ req: { headers: { authorization: `Bearer ${SECRETS[2]}` } } }, 'headers');
    return { ok: true };
  });
  await app.ready();
});
afterAll(() => app.close());

describe('log redaction', () => {
  it('never writes tokens, passwords or database URLs', async () => {
    const res = await app.inject({ method: 'GET', url: '/test/log', headers: { authorization: `Bearer ${SECRETS[0]}`, cookie: `session=${SECRETS[2]}` } });
    expect(res.statusCode).toBe(200);

    const output = logs.join('');
    expect(output).toContain('[REDACTED]');
    for (const secret of SECRETS) expect(output).not.toContain(secret);
  });

  it('logs requests (method, url, status) without headers', async () => {
    await app.inject({ method: 'GET', url: '/v1/nope', headers: { authorization: `Bearer ${SECRETS[0]}` } });
    const lines = logs.map((l) => JSON.parse(l) as Record<string, unknown>);
    expect(lines.some((l) => (l.req as { url?: string } | undefined)?.url === '/v1/nope')).toBe(true);
    expect(logs.join('')).not.toContain(SECRETS[0]);
  });
});
