import { Health } from '@nexa/contracts';
import { afterAll, describe, expect, it } from 'vitest';

import pkg from '../../../package.json' with { type: 'json' };
import { buildTestApp } from '../../test/app';
import { testDatabaseUrl } from '../../test/db';

const { app } = buildTestApp({ databaseUrl: testDatabaseUrl() });
afterAll(() => app.close());

describe('GET /v1/health with the test database', () => {
  it('reports ok with the API version', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/health' });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toMatch(/^application\/json/);
    expect(Health.parse(res.json())).toEqual({ status: 'ok', db: 'ok', version: pkg.version });
  });
});
