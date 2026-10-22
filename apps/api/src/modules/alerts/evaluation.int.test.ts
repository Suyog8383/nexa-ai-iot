import { AlertEvent, AlertEventList, AlertRule, DeviceWithToken } from '@nexa/contracts';
import { sql } from 'drizzle-orm';
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

const SECOND = 1000;
const MINUTE = 60 * SECOND;

/** Readings are placed relative to a fixed point 30 minutes ago, inside the 24 h ingestion window. */
const base = Date.now() - 30 * MINUTE;
const at = (offsetMs: number) => new Date(base + offsetMs).toISOString();
/** An ISO timestamp `offsetMs` from the real current time (for readings that must follow a rule change). */
const fromNow = (offsetMs: number) => new Date(Date.now() + offsetMs).toISOString();

/**
 * Rules only evaluate readings recorded from when they were created (or last re-enabled or
 * changed). Most tests send readings from `base`, so they pretend the rule has existed for longer.
 */
async function backdate(app: App, ruleId: string) {
  await app.database.db.execute(sql`update alert_rules set evaluate_from = ${new Date(base - 60 * MINUTE).toISOString()}::timestamptz where id = ${ruleId}`);
}

async function setup(app: App, rule: Record<string, unknown> = {}, { backdated = true } = {}) {
  const reg = await app.inject({ method: 'POST', url: '/v1/devices', headers: ownerAuth, payload: { name: 'Living Room Monitor', room: 'Living Room', board: 'ESP32', sensor: 'BME280' } });
  const { device, deviceToken } = DeviceWithToken.parse(reg.json());
  const res = await app.inject({
    method: 'POST',
    url: '/v1/alert-rules',
    headers: ownerAuth,
    payload: { deviceId: device.id, name: 'Hot', metric: 'temperature', condition: 'above', threshold: 30, durationS: 0, notify: { push: true, inApp: true, sound: false }, ...rule },
  });
  expect(res.statusCode).toBe(201);
  const created = AlertRule.parse(res.json());
  if (backdated) await backdate(app, created.id);
  return { deviceId: device.id, token: deviceToken, rule: created };
}

/** A reading: offset from `base` in ms, or an ISO timestamp. */
type R = [offsetMs: number | string, temperatureC: number, humidityPct?: number];

async function send(app: App, token: string, readings: R[]) {
  const res = await app.inject({
    method: 'POST',
    url: '/v1/telemetry',
    headers: { authorization: `Bearer ${token}` },
    payload: { readings: readings.map(([offset, temperatureC, humidityPct = 50]) => ({ recordedAt: typeof offset === 'string' ? offset : at(offset), temperatureC, humidityPct })) },
  });
  expect(res.statusCode).toBe(202);
  return res.json() as { accepted: number; duplicates: number; conflicts: number };
}

async function events(app: App, query = '') {
  const res = await app.inject({ method: 'GET', url: `/v1/alert-events${query}`, headers: ownerAuth });
  expect(res.statusCode).toBe(200);
  return AlertEventList.parse(res.json()).items;
}

const patchRule = (app: App, id: string, payload: object) => app.inject({ method: 'PATCH', url: `/v1/alert-rules/${id}`, headers: ownerAuth, payload });

describe('immediate rules', () => {
  it('[AC-4] opens one event when a reading crosses above the threshold, and resolves it when one is back under', () =>
    withRolledBackApp(pool, async ({ app }) => {
      const { token, rule, deviceId } = await setup(app);
      await send(app, token, [[0, 29.5], [30 * SECOND, 31]]);

      const [open, ...rest] = await events(app);
      expect(rest).toEqual([]);
      expect(AlertEvent.parse(open)).toMatchObject({
        ruleId: rule.id,
        deviceId,
        metric: 'temperature',
        condition: 'above',
        threshold: 30,
        triggerValue: 31,
        triggeredAt: at(30 * SECOND),
        resolvedAt: null,
        acknowledgedAt: null,
      });

      // Still above: same event, nothing new.
      await send(app, token, [[60 * SECOND, 32]]);
      expect(await events(app)).toEqual([open]);

      await send(app, token, [[90 * SECOND, 29]]);
      expect(await events(app)).toEqual([{ ...open, resolvedAt: at(90 * SECOND) }]);
    }));

  it('[AC-4] treats the threshold itself as not crossed', () =>
    withRolledBackApp(pool, async ({ app }) => {
      const { token } = await setup(app);
      await send(app, token, [[0, 30]]);
      expect(await events(app)).toEqual([]);
    }));

  it('[AC-4] evaluates humidity "below" rules on humidity', () =>
    withRolledBackApp(pool, async ({ app }) => {
      const { token } = await setup(app, { metric: 'humidity', condition: 'below', threshold: 30 });
      await send(app, token, [[0, 35, 29]]);
      const [event] = await events(app);
      expect(event).toMatchObject({ metric: 'humidity', condition: 'below', threshold: 30, triggerValue: 29, resolvedAt: null });

      await send(app, token, [[30 * SECOND, 35, 31]]);
      expect((await events(app))[0]?.resolvedAt).toBe(at(30 * SECOND));
    }));

  it('[AC-4] opens and resolves several events from one batch, in time order, whatever the batch order', () =>
    withRolledBackApp(pool, async ({ app }) => {
      const { token } = await setup(app);
      await send(app, token, [[90 * SECOND, 31], [0, 31], [60 * SECOND, 29], [30 * SECOND, 32]]);
      const list = await events(app);
      expect(list.map((e) => [e.triggeredAt, e.resolvedAt, e.triggerValue])).toEqual([
        [at(90 * SECOND), null, 31],
        [at(0), at(60 * SECOND), 31],
      ]);
    }));

  it('[AC-5] ignores disabled rules, and evaluates other rules on the same device independently', () =>
    withRolledBackApp(pool, async ({ app }) => {
      const { token, rule, deviceId } = await setup(app, { enabled: false });
      const humid = await app.inject({
        method: 'POST',
        url: '/v1/alert-rules',
        headers: ownerAuth,
        payload: { deviceId, name: 'Humid', metric: 'humidity', condition: 'above', threshold: 60, durationS: 0, notify: { push: false, inApp: true, sound: false } },
      });
      const humidRule = AlertRule.parse(humid.json());
      await backdate(app, humidRule.id);

      await send(app, token, [[0, 35, 70]]);
      const list = await events(app);
      expect(list.map((e) => e.ruleId)).toEqual([humidRule.id]);
      expect(list.some((e) => e.ruleId === rule.id)).toBe(false);
    }));
});

describe('idempotency', () => {
  it('[AC-6] resending the same batch creates no second event', () =>
    withRolledBackApp(pool, async ({ app }) => {
      const { token } = await setup(app);
      const batch: R[] = [[0, 31], [30 * SECOND, 32]];
      await send(app, token, batch);
      const first = await events(app);
      expect(first).toHaveLength(1);

      expect(await send(app, token, batch)).toEqual({ accepted: 0, duplicates: 2, conflicts: 0 });
      expect(await events(app)).toEqual(first);
    }));

  it('[AC-6] a resent batch after the event resolved does not reopen it', () =>
    withRolledBackApp(pool, async ({ app }) => {
      const { token } = await setup(app);
      await send(app, token, [[0, 31]]);
      await send(app, token, [[30 * SECOND, 29]]);
      const resolved = await events(app);

      await send(app, token, [[0, 31]]);
      expect(await events(app)).toEqual(resolved);
    }));

  it('[AC-6] a late reading older than the newest stored one does not open or resolve events', () =>
    withRolledBackApp(pool, async ({ app }) => {
      const { token } = await setup(app);
      await send(app, token, [[60 * SECOND, 31]]);
      const open = await events(app);

      await send(app, token, [[30 * SECOND, 25]]);
      expect(await events(app)).toEqual(open);
    }));
});

describe('sustained rules', () => {
  const FIVE_MIN = 5 * MINUTE;

  it('[AC-7] fires only once the condition has held for the whole duration', () =>
    withRolledBackApp(pool, async ({ app }) => {
      const { token } = await setup(app, { durationS: 300 });
      // 4.5 minutes above: not yet.
      await send(app, token, Array.from({ length: 10 }, (_, i): R => [i * 30 * SECOND, 31 + i / 10]));
      expect(await events(app)).toEqual([]);

      // The reading at 5:00 completes the duration.
      await send(app, token, [[FIVE_MIN, 33]]);
      const [event, ...rest] = await events(app);
      expect(rest).toEqual([]);
      expect(event).toMatchObject({ triggeredAt: at(FIVE_MIN), triggerValue: 33, resolvedAt: null });
    }));

  it('[AC-7] a reading back under the threshold restarts the duration', () =>
    withRolledBackApp(pool, async ({ app }) => {
      const { token } = await setup(app, { durationS: 300 });
      const readings: R[] = Array.from({ length: 11 }, (_, i): R => [i * 30 * SECOND, i === 5 ? 29 : 31]);
      await send(app, token, readings);
      // Above again from 3:00, so 5 minutes are reached at 8:00, not 5:00.
      expect(await events(app)).toEqual([]);

      await send(app, token, Array.from({ length: 6 }, (_, i): R => [(11 + i) * 30 * SECOND, 31]));
      expect((await events(app)).map((e) => e.triggeredAt)).toEqual([at(16 * 30 * SECOND)]);
    }));

  it('[AC-7] a gap longer than 3 reporting intervals restarts the duration', () =>
    withRolledBackApp(pool, async ({ app }) => {
      const { token } = await setup(app, { durationS: 300 });
      // Default 30 s interval: a gap over 90 s breaks the streak.
      await send(app, token, [[0, 31], [30 * SECOND, 31], [3 * MINUTE, 31], [FIVE_MIN, 31], [5.5 * MINUTE, 31]]);
      expect(await events(app)).toEqual([]);
    }));

  it('[AC-7] counts readings stored by earlier reports towards the duration', () =>
    withRolledBackApp(pool, async ({ app }) => {
      const { token } = await setup(app, { durationS: 300 });
      for (let i = 0; i <= 10; i++) await send(app, token, [[i * 30 * SECOND, 31]]);
      expect((await events(app)).map((e) => e.triggeredAt)).toEqual([at(FIVE_MIN)]);
    }));
});

describe('rule changes', () => {
  it('[AC-8] disabling a rule resolves its open event, and it no longer fires', () =>
    withRolledBackApp(pool, async ({ app }) => {
      const { token, rule } = await setup(app);
      await send(app, token, [[0, 31]]);
      expect((await patchRule(app, rule.id, { enabled: false })).statusCode).toBe(200);

      const [event] = await events(app);
      expect(event?.resolvedAt).not.toBeNull();

      await send(app, token, [[30 * SECOND, 35]]);
      expect(await events(app)).toHaveLength(1);
    }));

  it('[AC-8] changing the threshold resolves the open event and later readings use the new threshold', () =>
    withRolledBackApp(pool, async ({ app }) => {
      const { token, rule } = await setup(app);
      await send(app, token, [[0, 31]]);
      await patchRule(app, rule.id, { threshold: 33 });

      await send(app, token, [[fromNow(1 * SECOND), 32]]);
      expect(await events(app, '?status=open')).toEqual([]);

      const later = fromNow(2 * SECOND);
      await send(app, token, [[later, 34]]);
      const [open] = await events(app, '?status=open');
      expect(open).toMatchObject({ threshold: 33, triggerValue: 34, triggeredAt: later });
      // The first event keeps the threshold it opened with.
      expect((await events(app, '?status=resolved'))[0]?.threshold).toBe(30);
    }));

  it.each([
    ['metric', { metric: 'humidity', threshold: 40 }],
    ['condition', { condition: 'below', threshold: 35 }],
    ['duration', { durationS: 300 }],
  ])('[AC-8] changing the %s resolves the open event', (_label, payload) =>
    withRolledBackApp(pool, async ({ app }) => {
      const { token, rule } = await setup(app);
      await send(app, token, [[0, 31]]);
      expect((await patchRule(app, rule.id, payload)).statusCode).toBe(200);
      expect(await events(app, '?status=open')).toEqual([]);
      expect(await events(app, '?status=resolved')).toHaveLength(1);
    }));

  it('[AC-8] renaming a rule or changing notify settings leaves its open event open', () =>
    withRolledBackApp(pool, async ({ app }) => {
      const { token, rule } = await setup(app);
      await send(app, token, [[0, 31]]);
      await patchRule(app, rule.id, { name: 'Renamed', notify: { push: false, inApp: true, sound: true } });
      expect(await events(app, '?status=open')).toHaveLength(1);
    }));

  it('[AC-8] deleting a rule resolves its open event, keeps its history, and stops evaluation', () =>
    withRolledBackApp(pool, async ({ app }) => {
      const { token, rule } = await setup(app);
      await send(app, token, [[0, 31]]);
      expect((await app.inject({ method: 'DELETE', url: `/v1/alert-rules/${rule.id}`, headers: ownerAuth })).statusCode).toBe(204);

      const [event, ...rest] = await events(app);
      expect(rest).toEqual([]);
      expect(event).toMatchObject({ ruleId: rule.id });
      expect(event?.resolvedAt).not.toBeNull();

      await send(app, token, [[30 * SECOND, 29], [60 * SECOND, 35]]);
      expect(await events(app)).toHaveLength(1);
    }));
});

describe('evaluation window', () => {
  const HOUR = 60 * MINUTE;

  it('[M1] ignores readings recorded before the rule was created, e.g. a flushed offline buffer', () =>
    withRolledBackApp(pool, async ({ app }) => {
      const { token } = await setup(app, {}, { backdated: false });
      expect(await send(app, token, [[fromNow(-2 * HOUR), 31], [fromNow(-1 * HOUR), 29], [fromNow(-30 * SECOND), 32]])).toMatchObject({ accepted: 3 });
      expect(await events(app)).toEqual([]);

      // Readings from after creation are evaluated as usual.
      const now = fromNow(1 * SECOND);
      await send(app, token, [[now, 31]]);
      expect((await events(app)).map((e) => e.triggeredAt)).toEqual([now]);
    }));

  it('[M1] a duration only counts readings recorded since the rule was created', () =>
    withRolledBackApp(pool, async ({ app }) => {
      // Hot for the 10 minutes before the rule existed.
      const { token, deviceId } = await setup(app, { enabled: false }, { backdated: false });
      await send(app, token, Array.from({ length: 20 }, (_, i): R => [fromNow(-(20 - i) * 30 * SECOND), 31]));
      const res = await app.inject({
        method: 'POST',
        url: '/v1/alert-rules',
        headers: ownerAuth,
        payload: { deviceId, name: 'Hot 5 min', metric: 'temperature', condition: 'above', threshold: 30, durationS: 300, notify: { push: true, inApp: true, sound: false } },
      });
      expect(res.statusCode).toBe(201);

      await send(app, token, [[fromNow(1 * SECOND), 31]]);
      expect(await events(app)).toEqual([]);
    }));

  it('[M1] ignores readings recorded while the rule was disabled that arrive after it is re-enabled', () =>
    withRolledBackApp(pool, async ({ app }) => {
      const { token, rule } = await setup(app);
      await patchRule(app, rule.id, { enabled: false });
      const whileDisabled = fromNow(-10 * SECOND);
      await patchRule(app, rule.id, { enabled: true });

      await send(app, token, [[whileDisabled, 35]]);
      expect(await events(app)).toEqual([]);
    }));

  it('[M2] an event opened by a reading from a clock running ahead still cannot overlap the next one', () =>
    withRolledBackApp(pool, async ({ app }) => {
      const { token, rule } = await setup(app);
      const ahead = fromNow(90 * SECOND);
      await send(app, token, [[ahead, 31]]);
      // Resolved at its trigger time, since that is later than now.
      await patchRule(app, rule.id, { threshold: 30.5 });
      expect((await events(app))[0]?.resolvedAt).toBe(ahead);

      await send(app, token, [[fromNow(100 * SECOND), 31]]);
      const [open, previous] = await events(app);
      expect(open?.resolvedAt).toBeNull();
      expect(open!.triggeredAt >= previous!.resolvedAt!).toBe(true);
    }));

  it('[M2] after an edit, a late reading from before the edit cannot open an event overlapping the resolved one', () =>
    withRolledBackApp(pool, async ({ app }) => {
      const { token, rule } = await setup(app);
      await send(app, token, [[0, 31]]);
      await patchRule(app, rule.id, { threshold: 30.5 });

      // Recorded before the edit, delivered after it.
      await send(app, token, [[10 * MINUTE, 31]]);
      const [resolved, ...rest] = await events(app);
      expect(rest).toEqual([]);
      expect(resolved?.resolvedAt).not.toBeNull();

      const after = fromNow(1 * SECOND);
      await send(app, token, [[after, 31]]);
      const [open, previous] = await events(app);
      expect(open).toMatchObject({ triggeredAt: after, threshold: 30.5, resolvedAt: null });
      expect(open!.triggeredAt >= previous!.resolvedAt!).toBe(true);
    }));
});

describe('device clock running ahead (documented limitation)', () => {
  it('[L1] a reading behind an earlier, clock-skewed one is stored but not evaluated; the next reading past it is', () =>
    withRolledBackApp(pool, async ({ app, client }) => {
      const { token, deviceId } = await setup(app);
      // Clock 90 s ahead (inside the 2-minute skew allowance), then corrected by NTP.
      await send(app, token, [[fromNow(90 * SECOND), 25]]);
      expect(await send(app, token, [[fromNow(0), 35]])).toMatchObject({ accepted: 1 });
      expect(await events(app)).toEqual([]);
      const { rowCount } = await client.query('select 1 from readings where device_id = $1', [deviceId]);
      expect(rowCount).toBe(2);

      // Once readings pass the skewed one again, evaluation resumes: at most a 2-minute delay.
      const next = fromNow(100 * SECOND);
      await send(app, token, [[next, 35]]);
      expect((await events(app)).map((e) => e.triggeredAt)).toEqual([next]);
    }));
});

describe('evaluation failures', () => {
  /** Makes every alert event insert fail inside the test transaction (rolled back with it). */
  async function breakEventInserts(client: pg.PoolClient) {
    await client.query(`create function nexa_test_fail_event() returns trigger language plpgsql as $$ begin raise exception 'simulated evaluation failure'; end $$`);
    await client.query('create trigger nexa_test_fail_event before insert on alert_events for each row execute function nexa_test_fail_event()');
  }

  it('[L2] reject the whole report: no readings, no last-seen update, no events, and a 500', () =>
    withRolledBackApp(pool, async ({ app, client, logs }) => {
      const { token, deviceId } = await setup(app);
      await breakEventInserts(client);

      const res = await app.inject({ method: 'POST', url: '/v1/telemetry', headers: { authorization: `Bearer ${token}` }, payload: { readings: [{ recordedAt: at(0), temperatureC: 35, humidityPct: 50 }] } });
      expect(res.statusCode).toBe(500);
      expect(res.headers['content-type']).toMatch(/^application\/problem\+json/);
      expect(res.body).not.toContain('simulated');

      const { rows } = await client.query<{ readings: number; events: number; last_seen_at: Date | null }>(
        'select (select count(*)::int from readings where device_id = $1) as readings, (select count(*)::int from alert_events) as events, (select last_seen_at from devices where id = $1) as last_seen_at',
        [deviceId],
      );
      expect(rows[0]).toEqual({ readings: 0, events: 0, last_seen_at: null });
      // Logged for the operator, without the device token.
      expect(logs.join('\n')).toContain('simulated evaluation failure');
      expect(logs.join('\n')).not.toContain(token);
    }));

  it('[L2] the device retrying the same batch once evaluation works stores it and raises the alert', () =>
    withRolledBackApp(pool, async ({ app, client }) => {
      const { token } = await setup(app);
      await breakEventInserts(client);
      const batch = { readings: [{ recordedAt: at(0), temperatureC: 35, humidityPct: 50 }] };
      const send = () => app.inject({ method: 'POST', url: '/v1/telemetry', headers: { authorization: `Bearer ${token}` }, payload: batch });

      expect((await send()).statusCode).toBe(500);
      await client.query('alter table alert_events disable trigger nexa_test_fail_event');

      const retry = await send();
      expect(retry.statusCode).toBe(202);
      expect(retry.json()).toEqual({ accepted: 1, duplicates: 0, conflicts: 0 });
      expect((await events(app)).map((e) => e.triggerValue)).toEqual([35]);
    }));
});
