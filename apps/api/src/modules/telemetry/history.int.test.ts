import { randomUUID } from 'node:crypto';

import { DeviceWithToken, Problem, ReadingHistory } from '@nexa/contracts';
import pg from 'pg';
import { afterAll, describe, expect, it } from 'vitest';

import type { App } from '../../app';
import { ownerAuth, withRolledBackApp } from '../../test/app';
import { testDatabaseUrl } from '../../test/db';

const pool = new pg.Pool({ connectionString: testDatabaseUrl() });

afterAll(async () => {
  const { rows } = await pool.query<{ n: number }>('select count(*)::int as n from readings');
  expect(rows[0]?.n).toBe(0);
  await pool.end();
});

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** A UTC hour boundary a few hours ago, so explicit ranges never depend on the current minute. */
const base = new Date(Math.floor((Date.now() - 6 * HOUR) / HOUR) * HOUR);
const t = (offsetMs: number) => new Date(base.getTime() + offsetMs);
const iso = (offsetMs: number) => t(offsetMs).toISOString();

type Seed = { at: Date; temperatureC: number; humidityPct: number };

async function register(app: App, name = 'Living Room Monitor') {
  const res = await app.inject({ method: 'POST', url: '/v1/devices', headers: ownerAuth, payload: { name, room: 'Living Room', board: 'ESP32', sensor: 'BME280' } });
  return DeviceWithToken.parse(res.json()).device.id;
}

/** Inserts readings directly (history tests control exact times, including ones ingestion would reject as too old). */
async function seed(client: pg.PoolClient, deviceId: string, rows: Seed[]) {
  await client.query(
    `insert into readings (device_id, recorded_at, received_at, temperature_c, humidity_pct)
     select $1, r.at, r.at, r.t, r.h from unnest($2::timestamptz[], $3::float8[], $4::float8[]) as r(at, t, h)`,
    [deviceId, rows.map((r) => r.at), rows.map((r) => r.temperatureC), rows.map((r) => r.humidityPct)],
  );
}

/** One reading a minute for `minutes` minutes from `base`; temperature 20 + (minute % 5), humidity 40 + minute. */
const everyMinute = (minutes: number): Seed[] => Array.from({ length: minutes }, (_, m) => ({ at: t(m * MINUTE), temperatureC: 20 + (m % 5), humidityPct: 40 + (m % 60) }));

async function history(app: App, deviceId: string, query: Record<string, string | number> = {}) {
  const qs = new URLSearchParams(Object.entries(query).map(([k, v]) => [k, String(v)])).toString();
  return app.inject({ method: 'GET', url: `/v1/devices/${deviceId}/readings${qs ? `?${qs}` : ''}`, headers: ownerAuth });
}

async function ok(app: App, deviceId: string, query: Record<string, string | number> = {}) {
  const res = await history(app, deviceId, query);
  expect(res.statusCode).toBe(200);
  return ReadingHistory.parse(res.json());
}

/** `recordedAt` of a raw item, `bucketStart` of a bucket. */
const startOf = (item: ReadingHistory['items'][number]) => ('recordedAt' in item ? item.recordedAt : item.bucketStart);

const errorPaths = (res: { json: () => unknown }) => (Problem.parse(res.json()).errors ?? []).map((e) => e.path);

describe('GET /v1/devices/:id/readings: raw', () => {
  it('returns readings in [from, to), newest first, for this device only', () =>
    withRolledBackApp(pool, async ({ app, client }) => {
      const id = await register(app);
      const other = await register(app, 'Other');
      await seed(client, id, everyMinute(10));
      await seed(client, other, everyMinute(10));

      const page = await ok(app, id, { from: iso(2 * MINUTE), to: iso(5 * MINUTE) });
      expect(page.deviceId).toBe(id);
      expect(page.bucket).toBe('raw');
      expect(page.items.map(startOf)).toEqual([iso(4 * MINUTE), iso(3 * MINUTE), iso(2 * MINUTE)]);
      expect(page.items[0]).toEqual({ recordedAt: iso(4 * MINUTE), receivedAt: iso(4 * MINUTE), temperatureC: 24, humidityPct: 44 });
      expect(page.nextCursor).toBeNull();
    }));

  it('pages with a cursor without gaps or overlaps', () =>
    withRolledBackApp(pool, async ({ app, client }) => {
      const id = await register(app);
      await seed(client, id, everyMinute(25));
      const range = { from: iso(0), to: iso(HOUR) };

      const seen: string[] = [];
      let cursor: string | null = null;
      let pages = 0;
      do {
        const page: ReadingHistory = await ok(app, id, { ...range, limit: 10, ...(cursor && { cursor }) });
        seen.push(...page.items.map(startOf));
        cursor = page.nextCursor;
        pages++;
      } while (cursor);

      expect(pages).toBe(3);
      expect(seen).toEqual(everyMinute(25).map((r) => r.at.toISOString()).reverse());
    }));

  it('returns no cursor when the last page is exactly full', () =>
    withRolledBackApp(pool, async ({ app, client }) => {
      const id = await register(app);
      await seed(client, id, everyMinute(10));
      const page = await ok(app, id, { from: iso(0), to: iso(HOUR), limit: 10 });
      expect(page.items).toHaveLength(10);
      expect(page.nextCursor).toBeNull();
    }));

  it('defaults to the last 24 hours and 100 items', () =>
    withRolledBackApp(pool, async ({ app, client }) => {
      const id = await register(app);
      const now = Date.now();
      await seed(client, id, [
        { at: new Date(now - 25 * HOUR), temperatureC: 10, humidityPct: 10 },
        { at: new Date(now - HOUR), temperatureC: 20, humidityPct: 20 },
        ...Array.from({ length: 120 }, (_, i) => ({ at: new Date(now - 2 * HOUR - i * MINUTE), temperatureC: 21, humidityPct: 40 })),
      ]);
      const page = await ok(app, id);
      expect(page.items).toHaveLength(100);
      expect(page.items[0]).toMatchObject({ temperatureC: 20 });
      expect(page.nextCursor).not.toBeNull();
      // Everything but the 25-hour-old reading.
      expect((await ok(app, id, { limit: 500 })).items).toHaveLength(121);
    }));

  it('returns an empty page for a device without readings', () =>
    withRolledBackApp(pool, async ({ app }) => {
      const id = await register(app);
      expect(await ok(app, id)).toEqual({ deviceId: id, bucket: 'raw', items: [], nextCursor: null });
    }));
});

describe('GET /v1/devices/:id/readings: 5-minute and hourly buckets', () => {
  it('aggregates min/avg/max per UTC 5-minute bucket, newest first', () =>
    withRolledBackApp(pool, async ({ app, client }) => {
      const id = await register(app);
      await seed(client, id, everyMinute(15));

      const page = await ok(app, id, { from: iso(0), to: iso(HOUR), bucket: '5m' });
      expect(page.bucket).toBe('5m');
      expect(page.items).toEqual([
        { bucketStart: iso(10 * MINUTE), temperatureC: { min: 20, avg: 22, max: 24 }, humidityPct: { min: 50, avg: 52, max: 54 }, count: 5 },
        { bucketStart: iso(5 * MINUTE), temperatureC: { min: 20, avg: 22, max: 24 }, humidityPct: { min: 45, avg: 47, max: 49 }, count: 5 },
        { bucketStart: iso(0), temperatureC: { min: 20, avg: 22, max: 24 }, humidityPct: { min: 40, avg: 42, max: 44 }, count: 5 },
      ]);
    }));

  it('omits empty periods instead of returning zero buckets', () =>
    withRolledBackApp(pool, async ({ app, client }) => {
      const id = await register(app);
      await seed(client, id, [
        { at: t(MINUTE), temperatureC: 20, humidityPct: 40 },
        { at: t(31 * MINUTE), temperatureC: 22, humidityPct: 42 },
      ]);
      const page = await ok(app, id, { from: iso(0), to: iso(HOUR), bucket: '5m' });
      expect(page.items.map(startOf)).toEqual([iso(30 * MINUTE), iso(0)]);
    }));

  it('aggregates only the part of a bucket inside the range', () =>
    withRolledBackApp(pool, async ({ app, client }) => {
      const id = await register(app);
      await seed(client, id, everyMinute(10));
      // [2 min, 7 min): the 0–5 bucket keeps minutes 2–4, the 5–10 bucket minutes 5–6.
      const page = await ok(app, id, { from: iso(2 * MINUTE), to: iso(7 * MINUTE), bucket: '5m' });
      expect(page.items).toEqual([
        { bucketStart: iso(5 * MINUTE), temperatureC: { min: 20, avg: 20.5, max: 21 }, humidityPct: { min: 45, avg: 45.5, max: 46 }, count: 2 },
        { bucketStart: iso(0), temperatureC: { min: 22, avg: 23, max: 24 }, humidityPct: { min: 42, avg: 43, max: 44 }, count: 3 },
      ]);
    }));

  it('aggregates by UTC hour', () =>
    withRolledBackApp(pool, async ({ app, client }) => {
      const id = await register(app);
      await seed(client, id, everyMinute(90));
      const page = await ok(app, id, { from: iso(0), to: iso(2 * HOUR), bucket: '1h' });
      expect(page.items.map((b) => ('count' in b ? [b.bucketStart, b.count] : []))).toEqual([
        [iso(HOUR), 30],
        [iso(0), 60],
      ]);
      const first = page.items[1];
      expect(first && 'humidityPct' in first && first.humidityPct).toEqual({ min: 40, avg: 69.5, max: 99 });
    }));

  it('pages buckets with a cursor', () =>
    withRolledBackApp(pool, async ({ app, client }) => {
      const id = await register(app);
      await seed(client, id, everyMinute(30));
      const range = { from: iso(0), to: iso(HOUR), bucket: '5m', limit: 4 };
      const first = await ok(app, id, range);
      expect(first.items).toHaveLength(4);
      expect(first.nextCursor).not.toBeNull();
      const second = await ok(app, id, { ...range, cursor: first.nextCursor ?? '' });
      const starts = [...first.items, ...second.items].map(startOf);
      expect(starts).toEqual([25, 20, 15, 10, 5, 0].map((m) => iso(m * MINUTE)));
      expect(second.nextCursor).toBeNull();
    }));
});

describe('GET /v1/devices/:id/readings: validation and access', () => {
  it.each([
    ['from after to', { from: iso(HOUR), to: iso(0) }, 'query.from'],
    ['from equal to to', { from: iso(0), to: iso(0) }, 'query.from'],
    ['from in the future with the default to', { from: new Date(Date.now() + HOUR).toISOString() }, 'query.from'],
    ['a range over 31 days', { from: iso(-32 * DAY), to: iso(0) }, 'query.from'],
    ['a non-UTC timestamp', { from: '2026-10-19T10:00:00+05:30' }, 'query.from'],
    ['an unknown bucket', { bucket: '1d' }, 'query.bucket'],
    ['limit 0', { limit: 0 }, 'query.limit'],
    ['limit above 500', { limit: 501 }, 'query.limit'],
    ['a non-numeric limit', { limit: 'ten' }, 'query.limit'],
    ['a garbage cursor', { cursor: 'not-a-cursor' }, 'query.cursor'],
    ['an unknown parameter', { deviceId: randomUUID() }, 'query'],
  ])('rejects %s with 422', (_label, query, path) =>
    withRolledBackApp(pool, async ({ app }) => {
      const id = await register(app);
      const res = await history(app, id, query);
      expect(res.statusCode).toBe(422);
      expect(errorPaths(res)).toContain(path);
    }));

  it('rejects a cursor issued for a different bucket mode', () =>
    withRolledBackApp(pool, async ({ app, client }) => {
      const id = await register(app);
      await seed(client, id, everyMinute(5));
      const raw = await ok(app, id, { from: iso(0), to: iso(HOUR), limit: 2 });
      const res = await history(app, id, { from: iso(0), to: iso(HOUR), bucket: '5m', cursor: raw.nextCursor ?? '' });
      expect(res.statusCode).toBe(422);
      expect(errorPaths(res)).toEqual(['query.cursor']);
    }));

  it('404s for an unknown device and 422s for a malformed id', () =>
    withRolledBackApp(pool, async ({ app }) => {
      expect((await history(app, randomUUID())).statusCode).toBe(404);
      const malformed = await history(app, 'not-a-uuid');
      expect(malformed.statusCode).toBe(422);
      expect(errorPaths(malformed)).toEqual(['params.id']);
    }));

  it('requires the owner token; a device token is not enough', () =>
    withRolledBackApp(pool, async ({ app }) => {
      const res = await app.inject({ method: 'POST', url: '/v1/devices', headers: ownerAuth, payload: { name: 'M', room: 'R', board: 'ESP32', sensor: 'BME280' } });
      const { device, deviceToken } = DeviceWithToken.parse(res.json());
      const url = `/v1/devices/${device.id}/readings`;
      for (const headers of [{}, { authorization: `Bearer ${deviceToken}` }, { authorization: 'Bearer wrong-owner-token-0123456789abcdef' }]) {
        const denied = await app.inject({ method: 'GET', url, headers });
        expect(denied.statusCode).toBe(401);
        expect(denied.headers['www-authenticate']).toBe('Bearer');
      }
    }));
});
