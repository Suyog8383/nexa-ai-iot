import { randomUUID } from 'node:crypto';

import { AlertEvent, AlertEventList, AlertRule, DeviceWithToken, Problem } from '@nexa/contracts';
import pg from 'pg';
import { afterAll, describe, expect, it } from 'vitest';

import type { App } from '../../app';
import { ownerAuth, withRolledBackApp } from '../../test/app';
import { testDatabaseUrl } from '../../test/db';

const pool = new pg.Pool({ connectionString: testDatabaseUrl() });

afterAll(async () => {
  const { rows } = await pool.query<{ events: number }>('select count(*)::int as events from alert_events');
  expect(rows[0]?.events).toBe(0);
  await pool.end();
});

const MINUTE = 60 * 1000;
const base = new Date('2026-10-01T00:00:00.000Z').getTime();

async function deviceWithRule(app: App, name: string) {
  const reg = await app.inject({ method: 'POST', url: '/v1/devices', headers: ownerAuth, payload: { name, room: 'Room', board: 'ESP32', sensor: 'BME280' } });
  const deviceId = DeviceWithToken.parse(reg.json()).device.id;
  const res = await app.inject({
    method: 'POST',
    url: '/v1/alert-rules',
    headers: ownerAuth,
    payload: { deviceId, name: 'Hot', metric: 'temperature', condition: 'above', threshold: 30, durationS: 0, notify: { push: true, inApp: true, sound: false } },
  });
  return { deviceId, ruleId: AlertRule.parse(res.json()).id };
}

/**
 * Seeds `count` events directly, one a minute, all resolved except optionally the newest. History
 * tests need exact times and volume that ingestion would take far longer to produce.
 */
async function seed(client: pg.PoolClient, { deviceId, ruleId }: { deviceId: string; ruleId: string }, count: number, { offsetMs = 0, newestOpen = false } = {}) {
  const times = Array.from({ length: count }, (_, i) => new Date(base + offsetMs + i * MINUTE));
  await client.query(
    `insert into alert_events (rule_id, device_id, metric, condition, threshold, trigger_value, triggered_at, resolved_at)
     select $1, $2, 'temperature', 'above', 30, 31, t, case when $4 and t = (select max(x) from unnest($3::timestamptz[]) x) then null else t + interval '30 seconds' end
     from unnest($3::timestamptz[]) as t`,
    [ruleId, deviceId, times, newestOpen],
  );
}

async function list(app: App, query: string) {
  const res = await app.inject({ method: 'GET', url: `/v1/alert-events${query}`, headers: ownerAuth });
  expect(res.statusCode, res.body).toBe(200);
  return AlertEventList.parse(res.json());
}

async function all(app: App, query: string) {
  const items: AlertEvent[] = [];
  let cursor: string | null = null;
  let pages = 0;
  do {
    const page = await list(app, `${query}${query ? '&' : '?'}limit=100${cursor ? `&cursor=${cursor}` : ''}`);
    items.push(...page.items);
    cursor = page.nextCursor;
    pages++;
  } while (cursor);
  return { items, pages };
}

const newestFirst = (items: AlertEvent[]) =>
  items.every((e, i) => i === 0 || items[i - 1]!.triggeredAt > e.triggeredAt || (items[i - 1]!.triggeredAt === e.triggeredAt && items[i - 1]!.id > e.id));

describe('GET /v1/alert-events', () => {
  it('[AC-9] returns an empty page when there are no events', () =>
    withRolledBackApp(pool, async ({ app }) => {
      expect(await list(app, '')).toEqual({ items: [], nextCursor: null });
    }));

  it('[AC-9] pages through ~250 events across two devices newest first, each exactly once', () =>
    withRolledBackApp(pool, async ({ app, client }) => {
      const a = await deviceWithRule(app, 'A');
      const b = await deviceWithRule(app, 'B');
      await seed(client, a, 150, { newestOpen: true });
      await seed(client, b, 100, { offsetMs: 30 * 1000, newestOpen: true });

      const { items, pages } = await all(app, '');
      expect(pages).toBe(3);
      expect(items).toHaveLength(250);
      expect(new Set(items.map((e) => e.id)).size).toBe(250);
      expect(newestFirst(items)).toBe(true);
    }));

  it('[AC-9] filters by device and status, and combines both', () =>
    withRolledBackApp(pool, async ({ app, client }) => {
      const a = await deviceWithRule(app, 'A');
      const b = await deviceWithRule(app, 'B');
      await seed(client, a, 120, { newestOpen: true });
      await seed(client, b, 30, { newestOpen: true });

      const forB = await all(app, `?deviceId=${b.deviceId}`);
      expect(forB.items).toHaveLength(30);
      expect(forB.items.every((e) => e.deviceId === b.deviceId)).toBe(true);

      const open = await list(app, '?status=open');
      expect(open.items.map((e) => e.deviceId).sort()).toEqual([a.deviceId, b.deviceId].sort());
      expect(open.items.every((e) => e.resolvedAt === null)).toBe(true);

      const resolvedA = await all(app, `?deviceId=${a.deviceId}&status=resolved`);
      expect(resolvedA.items).toHaveLength(119);
      expect(resolvedA.pages).toBe(2);
      expect(resolvedA.items.every((e) => e.deviceId === a.deviceId && e.resolvedAt !== null)).toBe(true);
    }));

  it('[AC-9] a page of exactly `limit` items has no next cursor', () =>
    withRolledBackApp(pool, async ({ app, client }) => {
      await seed(client, await deviceWithRule(app, 'A'), 100);
      const page = await list(app, '?limit=100');
      expect(page.items).toHaveLength(100);
      expect(page.nextCursor).toBeNull();
    }));

  it('[AC-9] breaks ties on trigger time by id, so paging never skips or repeats', () =>
    withRolledBackApp(pool, async ({ app, client }) => {
      // Five rules on one device, all triggered at the same instant.
      const first = await deviceWithRule(app, 'A');
      const rules = [first.ruleId];
      for (let i = 0; i < 4; i++) {
        const res = await app.inject({
          method: 'POST',
          url: '/v1/alert-rules',
          headers: ownerAuth,
          payload: { deviceId: first.deviceId, name: `R${i}`, metric: 'humidity', condition: 'above', threshold: 60, durationS: 0, notify: { push: true, inApp: true, sound: false } },
        });
        rules.push(AlertRule.parse(res.json()).id);
      }
      for (const ruleId of rules) await seed(client, { deviceId: first.deviceId, ruleId }, 1);

      const seen: string[] = [];
      let cursor: string | null = null;
      do {
        const page = await list(app, `?limit=2${cursor ? `&cursor=${cursor}` : ''}`);
        seen.push(...page.items.map((e) => e.id));
        cursor = page.nextCursor;
      } while (cursor);
      expect(seen).toHaveLength(5);
      expect(seen).toEqual([...seen].sort().reverse());
    }));

  it.each([
    ['a limit over 500', '?limit=501', 'query.limit'],
    ['an unknown status', '?status=active', 'query.status'],
    ['a deviceId that is not a uuid', '?deviceId=abc', 'query.deviceId'],
    ['a cursor that was not issued by this endpoint', `?cursor=${Buffer.from('{"b":"raw","t":"2026-10-01T00:00:00.000Z"}').toString('base64url')}`, 'query.cursor'],
    ['an unknown parameter', '?sort=asc', 'query'],
    ['a cursor whose id is not a uuid', `?cursor=${Buffer.from(JSON.stringify({ t: '2026-10-01T00:00:00.000Z', id: '-'.repeat(36) })).toString('base64url')}`, 'query.cursor'],
  ])('[AC-2] rejects %s with 422', (_label, query, path) =>
    withRolledBackApp(pool, async ({ app }) => {
      const res = await app.inject({ method: 'GET', url: `/v1/alert-events${query}`, headers: ownerAuth });
      expect(res.statusCode).toBe(422);
      expect((Problem.parse(res.json()).errors ?? []).map((e) => e.path).some((p) => p.startsWith(path))).toBe(true);
    }));
});

describe('POST /v1/alert-events/:id/acknowledge', () => {
  it('[AC-10] sets acknowledgedAt once; acknowledging again keeps the first time', () =>
    withRolledBackApp(pool, async ({ app, client }) => {
      await seed(client, await deviceWithRule(app, 'A'), 1, { newestOpen: true });
      const [event] = (await list(app, '')).items;
      if (!event) throw new Error('no event seeded');

      const first = await app.inject({ method: 'POST', url: `/v1/alert-events/${event.id}/acknowledge`, headers: ownerAuth });
      expect(first.statusCode).toBe(200);
      const acked = AlertEvent.parse(first.json());
      expect(acked).toMatchObject({ ...event, acknowledgedAt: expect.any(String) });
      // Acknowledging doesn't resolve: the condition may still hold.
      expect(acked.resolvedAt).toBeNull();

      const again = AlertEvent.parse((await app.inject({ method: 'POST', url: `/v1/alert-events/${event.id}/acknowledge`, headers: ownerAuth })).json());
      expect(again.acknowledgedAt).toBe(acked.acknowledgedAt);
    }));

  it('404s an unknown event', () =>
    withRolledBackApp(pool, async ({ app }) => {
      const res = await app.inject({ method: 'POST', url: `/v1/alert-events/${randomUUID()}/acknowledge`, headers: ownerAuth });
      expect(res.statusCode).toBe(404);
      expect(res.headers['content-type']).toMatch(/^application\/problem\+json/);
    }));
});
