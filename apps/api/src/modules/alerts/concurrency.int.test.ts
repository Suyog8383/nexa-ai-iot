import { AlertEventList, AlertRule, DeviceWithToken } from '@nexa/contracts';
import pg from 'pg';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import type { App } from '../../app';
import { buildTestApp, ownerAuth } from '../../test/app';
import { testDatabaseUrl } from '../../test/db';

/**
 * Concurrency needs several connections and committed data, so unlike the other suites these
 * tests don't run in one rolled-back transaction. Each test registers its own device and deletes
 * it afterwards (rules, readings and events go with it), leaving the database as it found it.
 */
const url = testDatabaseUrl();
const pool = new pg.Pool({ connectionString: url });
let app: App;
const created: string[] = [];

beforeAll(async () => {
  app = buildTestApp({ databaseUrl: url }).app;
  await app.ready();
});

afterEach(async () => {
  await pool.query('delete from devices where id = any($1::uuid[])', [created.splice(0)]);
});

afterAll(async () => {
  await app.close();
  const { rows } = await pool.query<{ devices: number; events: number }>('select (select count(*)::int from devices) as devices, (select count(*)::int from alert_events) as events');
  expect(rows[0]).toEqual({ devices: 0, events: 0 });
  await pool.end();
});

const SECOND = 1000;
const fromNow = (offsetMs: number) => new Date(Date.now() + offsetMs).toISOString();

async function setup() {
  const reg = await app.inject({ method: 'POST', url: '/v1/devices', headers: ownerAuth, payload: { name: 'Concurrency', room: 'Lab', board: 'ESP32', sensor: 'BME280' } });
  const { device, deviceToken } = DeviceWithToken.parse(reg.json());
  created.push(device.id);
  const res = await app.inject({
    method: 'POST',
    url: '/v1/alert-rules',
    headers: ownerAuth,
    payload: { deviceId: device.id, name: 'Hot', metric: 'temperature', condition: 'above', threshold: 30, durationS: 0, notify: { push: true, inApp: true, sound: false } },
  });
  const rule = AlertRule.parse(res.json());
  // Readings in these tests are recorded up to a minute ago; let the rule evaluate them.
  await pool.query(`update alert_rules set evaluate_from = now() - interval '1 hour' where id = $1`, [rule.id]);
  return { deviceId: device.id, token: deviceToken, rule };
}

const send = (token: string, readings: { recordedAt: string; temperatureC: number }[]) =>
  app.inject({ method: 'POST', url: '/v1/telemetry', headers: { authorization: `Bearer ${token}` }, payload: { readings: readings.map((r) => ({ ...r, humidityPct: 50 })) } });

async function events(deviceId: string) {
  const res = await app.inject({ method: 'GET', url: `/v1/alert-events?deviceId=${deviceId}`, headers: ownerAuth });
  return AlertEventList.parse(res.json()).items;
}

/** Waits until `n` backends of this database are blocked on a lock. */
async function waitForLockWaiters(n: number) {
  for (let i = 0; i < 200; i++) {
    const { rows } = await pool.query<{ n: number }>(`select count(*)::int as n from pg_stat_activity where datname = current_database() and wait_event_type = 'Lock'`);
    if ((rows[0]?.n ?? 0) >= n) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`expected ${n} lock waiters`);
}

/** Events are non-overlapping and only the newest may be open. */
function expectConsistentHistory(list: { triggeredAt: string; resolvedAt: string | null }[]) {
  const oldestFirst = [...list].reverse();
  oldestFirst.forEach((event, i) => {
    const next = oldestFirst[i + 1];
    if (next) {
      expect(event.resolvedAt).not.toBeNull();
      expect(next.triggeredAt >= event.resolvedAt!).toBe(true);
    }
  });
}

describe('concurrent ingestion for one device', () => {
  it('[L3] ten parallel retries of the same hot batch store it once and open exactly one event', async () => {
    const { token, deviceId } = await setup();
    const batch = [-30, -20, -10].map((s) => ({ recordedAt: fromNow(s * SECOND), temperatureC: 35 }));

    const responses = await Promise.all(Array.from({ length: 10 }, () => send(token, batch)));
    expect(responses.map((r) => r.statusCode)).toEqual(Array(10).fill(202));
    const totals = responses.map((r) => r.json() as { accepted: number; duplicates: number }).reduce((a, b) => ({ accepted: a.accepted + b.accepted, duplicates: a.duplicates + b.duplicates }));
    expect(totals).toEqual({ accepted: 3, duplicates: 27 });

    const list = await events(deviceId);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ triggerValue: 35, resolvedAt: null });
  });

  it('[L3] parallel reports alternating hot and cool leave a consistent, non-overlapping event history', async () => {
    const { token, deviceId } = await setup();
    const reports = Array.from({ length: 12 }, (_, i) => [{ recordedAt: fromNow((-60 + i * 5) * SECOND), temperatureC: i % 2 ? 25 : 35 }]);

    const responses = await Promise.all(reports.map((r) => send(token, r)));
    expect(responses.map((r) => r.statusCode)).toEqual(Array(12).fill(202));

    const list = await events(deviceId);
    expect(list.filter((e) => e.resolvedAt === null).length).toBeLessThanOrEqual(1);
    expectConsistentHistory(list);
    const { rows } = await pool.query<{ n: number }>('select count(*)::int as n from readings where device_id = $1', [deviceId]);
    expect(rows[0]?.n).toBe(12);
  });
});

describe('rule changes racing evaluation', () => {
  /**
   * Holds the rule's row lock in a separate transaction, queues the two requests behind it in the
   * given order, then releases it, so both orders of "report vs. rule change" are exercised.
   */
  async function race(ruleId: string, first: () => Promise<{ statusCode: number }>, second: () => Promise<{ statusCode: number }>) {
    const blocker = await pool.connect();
    try {
      await blocker.query('begin');
      await blocker.query('select 1 from alert_rules where id = $1 for update', [ruleId]);
      const a = first();
      await waitForLockWaiters(1);
      const b = second();
      await waitForLockWaiters(2);
      await blocker.query('commit');
      return await Promise.all([a, b]);
    } finally {
      blocker.release();
    }
  }

  const hot = (token: string) => () => send(token, [{ recordedAt: fromNow(60 * SECOND), temperatureC: 35 }]);
  const patch = (ruleId: string, payload: object) => () => app.inject({ method: 'PATCH', url: `/v1/alert-rules/${ruleId}`, headers: ownerAuth, payload });

  it.each(['report first', 'change first'] as const)('[L3] a threshold change racing a hot report never leaves an event open under the old threshold (%s)', async (order) => {
    const { token, deviceId, rule } = await setup();
    const [report, change] = [hot(token), patch(rule.id, { threshold: 36 })];
    const statuses = (order === 'report first' ? await race(rule.id, report, change) : await race(rule.id, change, report)).map((r) => r.statusCode).sort();
    expect(statuses).toEqual([200, 202]);

    const list = await events(deviceId);
    expect(list.filter((e) => e.resolvedAt === null)).toEqual([]);
    // Report first: opened under 30, then resolved by the change. Change first: 35 isn't above 36.
    expect(list.map((e) => e.threshold)).toEqual(order === 'report first' ? [30] : []);
  });

  it.each(['report first', 'disable first'] as const)('[L3] disabling a rule racing a hot report leaves no open event (%s)', async (order) => {
    const { token, deviceId, rule } = await setup();
    const [report, disable] = [hot(token), patch(rule.id, { enabled: false })];
    const responses = order === 'report first' ? await race(rule.id, report, disable) : await race(rule.id, disable, report);
    expect(responses.map((r) => r.statusCode).sort()).toEqual([200, 202]);

    const list = await events(deviceId);
    expect(list.filter((e) => e.resolvedAt === null)).toEqual([]);
    // A report that waited for the lock re-checks the rule and skips it once disabled.
    expect(list).toHaveLength(order === 'report first' ? 1 : 0);
  });
});
