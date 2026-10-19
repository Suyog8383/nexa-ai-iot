import { Health } from '@nexa/contracts';
import { afterAll, describe, expect, it } from 'vitest';

import { buildTestApp } from '../../test/app';

const { app } = buildTestApp();
afterAll(() => app.close());

describe('GET /v1/health without a database', () => {
  it('reports degraded with 503 instead of failing', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/health' });
    expect(res.statusCode).toBe(503);
    expect(Health.parse(res.json())).toMatchObject({ status: 'degraded', db: 'unavailable' });
  });
});
