import { randomUUID } from 'node:crypto';

import { AlertRule, AlertRuleList, DeviceWithToken, Problem } from '@nexa/contracts';
import pg from 'pg';
import { afterAll, describe, expect, it } from 'vitest';

import type { App } from '../../app';
import { ownerAuth, withRolledBackApp } from '../../test/app';
import { testDatabaseUrl } from '../../test/db';

const pool = new pg.Pool({ connectionString: testDatabaseUrl() });

afterAll(async () => {
  const { rows } = await pool.query<{ rules: number }>('select count(*)::int as rules from alert_rules');
  expect(rows[0]?.rules).toBe(0);
  await pool.end();
});

async function register(app: App, name = 'Living Room Monitor') {
  const res = await app.inject({ method: 'POST', url: '/v1/devices', headers: ownerAuth, payload: { name, room: 'Living Room', board: 'ESP32', sensor: 'BME280' } });
  return DeviceWithToken.parse(res.json());
}

const ruleBody = (deviceId: string, overrides: Record<string, unknown> = {}) => ({
  deviceId,
  name: 'High Temperature Alert',
  metric: 'temperature',
  condition: 'above',
  threshold: 30,
  durationS: 0,
  notify: { push: true, inApp: true, sound: false },
  ...overrides,
});

const createRule = (app: App, payload: unknown, headers: Record<string, string> = ownerAuth) =>
  app.inject({ method: 'POST', url: '/v1/alert-rules', headers, payload: payload as object });

async function created(app: App, payload: unknown) {
  const res = await createRule(app, payload);
  expect(res.statusCode).toBe(201);
  return AlertRule.parse(res.json());
}

const errorPaths = (res: { json: () => unknown }) => (Problem.parse(res.json()).errors ?? []).map((e) => e.path);

describe('POST /v1/alert-rules', () => {
  it('[AC-1] creates an enabled rule by default and returns it', () =>
    withRolledBackApp(pool, async ({ app }) => {
      const { device } = await register(app);
      const res = await createRule(app, ruleBody(device.id, { name: '  Hot Room  ', origin: 'msg-42' }));

      expect(res.statusCode).toBe(201);
      const rule = AlertRule.parse(res.json());
      expect(rule).toMatchObject({ deviceId: device.id, name: 'Hot Room', metric: 'temperature', condition: 'above', threshold: 30, durationS: 0, enabled: true, origin: 'msg-42' });
      expect(rule.createdAt).toBe(rule.updatedAt);
      expect(res.headers.location).toBe(`/v1/alert-rules/${rule.id}`);
    }));

  it.each([
    ['a temperature threshold above 40 °C', { threshold: 40.5 }, 'threshold'],
    ['a humidity threshold below 10 %', { metric: 'humidity', threshold: 5 }, 'threshold'],
    ['a threshold given as a string', { threshold: '30' }, 'threshold'],
    ['an unknown metric', { metric: 'pressure' }, 'metric'],
    ['an unknown condition', { condition: 'equals' }, 'condition'],
    ['an unsupported duration', { durationS: 60 }, 'durationS'],
    ['an empty name', { name: '   ' }, 'name'],
    ['a deviceId that is not a uuid', { deviceId: 'living-room' }, 'deviceId'],
    ['an unknown field', { ownerId: 'someone' }, '(root)'],
  ])('[AC-2] rejects %s with 422 and stores nothing', (_label, overrides, path) =>
    withRolledBackApp(pool, async ({ app, client }) => {
      const { device } = await register(app);
      const res = await createRule(app, ruleBody(device.id, overrides));

      expect(res.statusCode).toBe(422);
      expect(res.headers['content-type']).toMatch(/^application\/problem\+json/);
      expect(errorPaths(res)).toContain(path);
      expect((await client.query('select 1 from alert_rules')).rowCount).toBe(0);
    }));

  it('[AC-2] rejects a rule for a device that does not exist', () =>
    withRolledBackApp(pool, async ({ app, client }) => {
      const res = await createRule(app, ruleBody(randomUUID()));
      expect(res.statusCode).toBe(422);
      expect(errorPaths(res)).toEqual(['deviceId']);
      expect((await client.query('select 1 from alert_rules')).rowCount).toBe(0);
    }));
});

describe('GET /v1/alert-rules', () => {
  it('lists rules oldest first, optionally for one device', () =>
    withRolledBackApp(pool, async ({ app }) => {
      const a = (await register(app, 'A')).device.id;
      const b = (await register(app, 'B')).device.id;
      const r1 = await created(app, ruleBody(a, { name: 'First' }));
      const r2 = await created(app, ruleBody(b, { name: 'Second', metric: 'humidity', condition: 'below', threshold: 30 }));

      // Inside one test transaction `now()` is constant, so both share createdAt and id breaks the tie.
      const all = AlertRuleList.parse((await app.inject({ method: 'GET', url: '/v1/alert-rules', headers: ownerAuth })).json());
      const expected = [r1, r2].sort((x, y) => x.createdAt.localeCompare(y.createdAt) || x.id.localeCompare(y.id));
      expect(all.items.map((r) => r.id)).toEqual(expected.map((r) => r.id));

      const forB = AlertRuleList.parse((await app.inject({ method: 'GET', url: `/v1/alert-rules?deviceId=${b}`, headers: ownerAuth })).json());
      expect(forB.items).toEqual([r2]);
    }));

  it('gets one rule, and 404s an unknown id', () =>
    withRolledBackApp(pool, async ({ app }) => {
      const rule = await created(app, ruleBody((await register(app)).device.id));
      const res = await app.inject({ method: 'GET', url: `/v1/alert-rules/${rule.id}`, headers: ownerAuth });
      expect(AlertRule.parse(res.json())).toEqual(rule);

      const missing = await app.inject({ method: 'GET', url: `/v1/alert-rules/${randomUUID()}`, headers: ownerAuth });
      expect(missing.statusCode).toBe(404);
      expect(missing.headers['content-type']).toMatch(/^application\/problem\+json/);
    }));
});

describe('PATCH /v1/alert-rules/:id', () => {
  it('updates the given fields and updatedAt, leaving the rest', () =>
    withRolledBackApp(pool, async ({ app }) => {
      const rule = await created(app, ruleBody((await register(app)).device.id));
      const res = await app.inject({ method: 'PATCH', url: `/v1/alert-rules/${rule.id}`, headers: ownerAuth, payload: { threshold: 32.5, enabled: false } });

      expect(res.statusCode).toBe(200);
      const updated = AlertRule.parse(res.json());
      expect(updated).toMatchObject({ ...rule, threshold: 32.5, enabled: false, updatedAt: updated.updatedAt });
      expect(new Date(updated.updatedAt).getTime()).toBeGreaterThanOrEqual(new Date(rule.updatedAt).getTime());
    }));

  it('[AC-2] re-validates the merged rule: a metric change that leaves the threshold out of range is rejected', () =>
    withRolledBackApp(pool, async ({ app }) => {
      // 5 °C is a valid temperature threshold but below the humidity minimum of 10 %.
      const rule = await created(app, ruleBody((await register(app)).device.id, { threshold: 5 }));
      const res = await app.inject({ method: 'PATCH', url: `/v1/alert-rules/${rule.id}`, headers: ownerAuth, payload: { metric: 'humidity' } });

      expect(res.statusCode).toBe(422);
      expect(errorPaths(res)).toEqual(['threshold']);
      const after = AlertRule.parse((await app.inject({ method: 'GET', url: `/v1/alert-rules/${rule.id}`, headers: ownerAuth })).json());
      expect(after.metric).toBe('temperature');
    }));

  it.each([
    ['an empty body', {}],
    ['a deviceId (rules cannot move devices)', { deviceId: randomUUID() }],
    ['an origin', { origin: 'msg-1' }],
  ])('[AC-2] rejects %s', (_label, payload) =>
    withRolledBackApp(pool, async ({ app }) => {
      const rule = await created(app, ruleBody((await register(app)).device.id));
      const res = await app.inject({ method: 'PATCH', url: `/v1/alert-rules/${rule.id}`, headers: ownerAuth, payload });
      expect(res.statusCode).toBe(422);
    }));

  it('404s an unknown rule', () =>
    withRolledBackApp(pool, async ({ app }) => {
      const res = await app.inject({ method: 'PATCH', url: `/v1/alert-rules/${randomUUID()}`, headers: ownerAuth, payload: { enabled: false } });
      expect(res.statusCode).toBe(404);
    }));
});

describe('DELETE /v1/alert-rules/:id', () => {
  it('hides the rule from reads and edits, and a second delete 404s', () =>
    withRolledBackApp(pool, async ({ app, client }) => {
      const rule = await created(app, ruleBody((await register(app)).device.id));
      const res = await app.inject({ method: 'DELETE', url: `/v1/alert-rules/${rule.id}`, headers: ownerAuth });
      expect(res.statusCode).toBe(204);
      expect(res.body).toBe('');

      expect((await app.inject({ method: 'GET', url: `/v1/alert-rules/${rule.id}`, headers: ownerAuth })).statusCode).toBe(404);
      expect((await app.inject({ method: 'PATCH', url: `/v1/alert-rules/${rule.id}`, headers: ownerAuth, payload: { enabled: true } })).statusCode).toBe(404);
      expect((await app.inject({ method: 'DELETE', url: `/v1/alert-rules/${rule.id}`, headers: ownerAuth })).statusCode).toBe(404);
      expect(AlertRuleList.parse((await app.inject({ method: 'GET', url: '/v1/alert-rules', headers: ownerAuth })).json()).items).toEqual([]);

      // Kept for the history of its events.
      const { rows } = await client.query<{ deleted_at: Date | null }>('select deleted_at from alert_rules where id = $1', [rule.id]);
      expect(rows[0]?.deleted_at).toBeInstanceOf(Date);
    }));
});

describe('authentication', () => {
  const routes = (id: string) =>
    [
      ['POST', '/v1/alert-rules'],
      ['GET', '/v1/alert-rules'],
      ['GET', `/v1/alert-rules/${id}`],
      ['PATCH', `/v1/alert-rules/${id}`],
      ['DELETE', `/v1/alert-rules/${id}`],
      ['GET', '/v1/alert-events'],
      ['POST', `/v1/alert-events/${id}/acknowledge`],
    ] as const;

  it('[AC-3] rejects missing, wrong and device tokens with 401 on every alert route', () =>
    withRolledBackApp(pool, async ({ app }) => {
      const { device, deviceToken } = await register(app);
      const rule = await created(app, ruleBody(device.id));

      for (const [method, url] of routes(rule.id)) {
        for (const headers of [{}, { authorization: 'Bearer wrong' }, { authorization: `Bearer ${deviceToken}` }]) {
          const res = await app.inject({ method, url, headers, payload: method === 'GET' ? undefined : ruleBody(device.id) });
          expect(res.statusCode, `${method} ${url}`).toBe(401);
          expect(res.headers['www-authenticate']).toBe('Bearer');
        }
      }
      // Nothing changed.
      const after = AlertRule.parse((await app.inject({ method: 'GET', url: `/v1/alert-rules/${rule.id}`, headers: ownerAuth })).json());
      expect(after).toEqual(rule);
    }));

  it('[AC-11] never logs tokens', () =>
    withRolledBackApp(pool, async ({ app, logs }) => {
      const { device, deviceToken } = await register(app);
      await created(app, ruleBody(device.id));
      await app.inject({ method: 'GET', url: '/v1/alert-rules', headers: { authorization: `Bearer ${deviceToken}` } });
      await app.inject({ method: 'GET', url: '/v1/alert-events', headers: ownerAuth });
      const output = logs.join('\n');
      expect(output).not.toContain(deviceToken);
      expect(output).not.toContain(ownerAuth.authorization.slice('Bearer '.length));
    }));
});
