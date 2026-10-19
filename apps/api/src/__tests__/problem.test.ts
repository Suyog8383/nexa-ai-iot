import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';

import { buildTestApp } from '../test/app';

const { app, logs } = buildTestApp();

beforeAll(async () => {
  // Test-only routes exercising each error path.
  app.post('/test/echo', { schema: { body: z.strictObject({ readings: z.array(z.object({ humidityPct: z.number().max(100) })) }), querystring: z.object({ limit: z.coerce.number().max(10).optional() }) } }, async (req) => req.body);
  app.get('/test/boom', async () => {
    throw new Error('internal detail: postgres://nexa:pw@db/nexa');
  });
  await app.ready();
});
afterAll(() => app.close());

const expectProblem = (res: { statusCode: number; headers: Record<string, unknown>; json: () => Record<string, unknown> }, status: number) => {
  expect(res.statusCode).toBe(status);
  expect(res.headers['content-type']).toBe('application/problem+json; charset=utf-8');
  const body = res.json();
  expect(body).toMatchObject({ status, type: expect.stringMatching(/^urn:nexa:problem:/), title: expect.any(String) });
  return body;
};

describe('problem+json errors', () => {
  it('404 for unknown routes, without echoing the query string', async () => {
    const body = expectProblem(await app.inject({ method: 'GET', url: '/v1/nope?token=abc' }), 404);
    expect(body.detail).toBe('No route for GET /v1/nope');
  });

  it('422 with dotted paths for body validation errors', async () => {
    const body = expectProblem(await app.inject({ method: 'POST', url: '/test/echo', payload: { readings: [{ humidityPct: 150 }] } }), 422);
    expect(body.type).toBe('urn:nexa:problem:validation');
    expect(body.errors).toEqual([{ path: 'readings.0.humidityPct', message: expect.any(String) }]);
  });

  it('422 with query-prefixed paths for query string errors', async () => {
    const body = expectProblem(await app.inject({ method: 'POST', url: '/test/echo?limit=99', payload: { readings: [] } }), 422);
    expect(body.errors).toEqual([{ path: 'query.limit', message: expect.any(String) }]);
  });

  it('422 for unknown body fields', async () => {
    expectProblem(await app.inject({ method: 'POST', url: '/test/echo', payload: { readings: [], deviceId: 'x' } }), 422);
  });

  it('400 for malformed JSON', async () => {
    expectProblem(await app.inject({ method: 'POST', url: '/test/echo', headers: { 'content-type': 'application/json' }, payload: '{"readings": [' }), 400);
  });

  it('413 for bodies over 64 KB', async () => {
    const payload = JSON.stringify({ readings: Array.from({ length: 5000 }, () => ({ humidityPct: 45.123456 })) });
    expect(payload.length).toBeGreaterThan(64 * 1024);
    expectProblem(await app.inject({ method: 'POST', url: '/test/echo', headers: { 'content-type': 'application/json' }, payload }), 413);
  });

  it('415 for unsupported content types', async () => {
    expectProblem(await app.inject({ method: 'POST', url: '/test/echo', headers: { 'content-type': 'text/csv' }, payload: 'a,b' }), 415);
  });

  it('500 hides internal details from the client but logs them', async () => {
    const body = expectProblem(await app.inject({ method: 'GET', url: '/test/boom' }), 500);
    expect(body).not.toHaveProperty('detail');
    expect(JSON.stringify(body)).not.toContain('postgres://');
    expect(logs.some((l) => l.includes('unhandled error'))).toBe(true);
  });
});
