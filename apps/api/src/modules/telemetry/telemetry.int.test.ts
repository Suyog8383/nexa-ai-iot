import { Device, DeviceList, DeviceWithToken, Problem, TelemetryResponse } from '@nexa/contracts';
import pg from 'pg';
import { afterAll, describe, expect, it } from 'vitest';

import type { App } from '../../app';
import { findDevice } from '../devices/repo';
import { ownerAuth, TEST_OWNER_TOKEN, withRolledBackApp } from '../../test/app';
import { testDatabaseUrl } from '../../test/db';

import { ingestTelemetry } from './service';

const pool = new pg.Pool({ connectionString: testDatabaseUrl() });

afterAll(async () => {
  // Every test ran in a rolled-back transaction: nothing may be left behind.
  const { rows } = await pool.query<{ devices: number; readings: number }>('select (select count(*)::int from devices) as devices, (select count(*)::int from readings) as readings');
  expect(rows[0]).toEqual({ devices: 0, readings: 0 });
  await pool.end();
});

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;

const monitor = { name: 'Living Room Monitor', room: 'Living Room', board: 'ESP32', sensor: 'BME280' } as const;

async function register(app: App, name: string = monitor.name) {
  const res = await app.inject({ method: 'POST', url: '/v1/devices', headers: ownerAuth, payload: { ...monitor, name } });
  expect(res.statusCode).toBe(201);
  const { device, deviceToken } = DeviceWithToken.parse(res.json());
  return { id: device.id, token: deviceToken };
}

const send = (app: App, token: string | null, payload: unknown) =>
  app.inject({ method: 'POST', url: '/v1/telemetry', headers: token === null ? {} : { authorization: `Bearer ${token}` }, payload: payload as object });

/** An ISO timestamp `offsetMs` from now. */
const at = (offsetMs: number) => new Date(Date.now() + offsetMs).toISOString();
const reading = (offsetMs = -MINUTE, temperatureC = 21.5, humidityPct = 45) => ({ recordedAt: at(offsetMs), temperatureC, humidityPct });

const errorPaths = (res: { json: () => unknown }) => (Problem.parse(res.json()).errors ?? []).map((e) => e.path);

async function storedReadings(client: pg.PoolClient, deviceId?: string) {
  const { rows } = await client.query<{ device_id: string; recorded_at: Date; received_at: Date; temperature_c: number; humidity_pct: number }>(
    `select * from readings ${deviceId ? 'where device_id = $1' : ''} order by recorded_at`,
    deviceId ? [deviceId] : [],
  );
  return rows;
}

async function getDevice(app: App, id: string) {
  return Device.parse((await app.inject({ method: 'GET', url: `/v1/devices/${id}`, headers: ownerAuth })).json());
}

describe('POST /v1/telemetry: ingestion', () => {
  it('stores a single reading and returns 202 with counts', () =>
    withRolledBackApp(pool, async ({ app, client }) => {
      const { id, token } = await register(app);
      const r = reading(-30 * SECOND, 21.53, 44.8);
      const before = Date.now();
      const res = await send(app, token, { readings: [r] });

      expect(res.statusCode).toBe(202);
      expect(TelemetryResponse.parse(res.json())).toEqual({ accepted: 1, duplicates: 0, conflicts: 0 });
      const [row, ...rest] = await storedReadings(client, id);
      expect(rest).toHaveLength(0);
      expect(row).toMatchObject({ device_id: id, temperature_c: 21.53, humidity_pct: 44.8 });
      expect(row?.recorded_at.toISOString()).toBe(r.recordedAt);
      expect(row?.received_at.getTime()).toBeGreaterThanOrEqual(before);
    }));

  it('stores a full batch of 100 and rejects 101 without storing any', () =>
    withRolledBackApp(pool, async ({ app, client }) => {
      const { id, token } = await register(app);
      const batch = (n: number) => Array.from({ length: n }, (_, i) => reading(-(i + 1) * 30 * SECOND));

      const tooMany = await send(app, token, { readings: batch(101) });
      expect(tooMany.statusCode).toBe(422);
      expect(errorPaths(tooMany)).toContain('readings');
      expect(await storedReadings(client, id)).toHaveLength(0);

      const full = await send(app, token, { readings: batch(100) });
      expect(full.statusCode).toBe(202);
      expect(full.json()).toEqual({ accepted: 100, duplicates: 0, conflicts: 0 });
      expect(await storedReadings(client, id)).toHaveLength(100);
    }));

  it('rejects an empty batch', () =>
    withRolledBackApp(pool, async ({ app }) => {
      const { token } = await register(app);
      expect((await send(app, token, { readings: [] })).statusCode).toBe(422);
    }));

  it('treats a resubmitted batch as duplicates and still marks the device seen', () =>
    withRolledBackApp(pool, async ({ app, client }) => {
      const { id, token } = await register(app);
      const batch = { readings: [reading(-2 * MINUTE), reading(-MINUTE)] };
      expect((await send(app, token, batch)).json()).toEqual({ accepted: 2, duplicates: 0, conflicts: 0 });

      // Pretend the device was last seen long ago; a duplicate-only report must refresh it.
      await client.query("update devices set last_seen_at = now() - interval '1 hour' where id = $1", [id]);
      const again = await send(app, token, batch);
      expect(again.statusCode).toBe(202);
      expect(again.json()).toEqual({ accepted: 0, duplicates: 2, conflicts: 0 });
      expect(await storedReadings(client, id)).toHaveLength(2);
      const device = await getDevice(app, id);
      expect(device.status).toBe('online');
      expect(Date.now() - Date.parse(device.lastSeenAt ?? '')).toBeLessThan(10 * SECOND);
    }));

  it('never overwrites a stored reading with different values at the same timestamp', () =>
    withRolledBackApp(pool, async ({ app, client, logs }) => {
      const { id, token } = await register(app);
      const original = reading(-MINUTE, 21.5, 45);
      await send(app, token, { readings: [original] });

      const res = await send(app, token, { readings: [{ ...original, temperatureC: 30 }, reading(-30 * SECOND)] });
      expect(res.statusCode).toBe(202);
      expect(res.json()).toEqual({ accepted: 1, duplicates: 0, conflicts: 1 });
      const rows = await storedReadings(client, id);
      expect(rows.find((r) => r.recorded_at.toISOString() === original.recordedAt)?.temperature_c).toBe(21.5);
      expect(logs.join('')).toContain('readings conflict with stored readings');
    }));

  it('counts duplicates and conflicts inside one batch; the first reading for a timestamp wins', () =>
    withRolledBackApp(pool, async ({ app, client }) => {
      const { id, token } = await register(app);
      const r = reading(-MINUTE, 20, 40);
      const res = await send(app, token, { readings: [r, { ...r }, { ...r, humidityPct: 41 }] });
      expect(res.json()).toEqual({ accepted: 1, duplicates: 1, conflicts: 1 });
      expect((await storedReadings(client, id)).map((row) => row.humidity_pct)).toEqual([40]);
    }));

  it('uses the server receive time when recordedAt is omitted', () =>
    withRolledBackApp(pool, async ({ app, client }) => {
      const { id, token } = await register(app);
      const before = Date.now();
      const res = await send(app, token, { readings: [{ temperatureC: 22, humidityPct: 50 }] });
      expect(res.statusCode).toBe(202);
      const [row] = await storedReadings(client, id);
      expect(row?.recorded_at.getTime()).toBe(row?.received_at.getTime());
      expect(row?.recorded_at.getTime()).toBeGreaterThanOrEqual(before);
      expect(row?.recorded_at.getTime()).toBeLessThanOrEqual(Date.now());
    }));

  it('allows only one reading per batch without recordedAt', () =>
    withRolledBackApp(pool, async ({ app, client }) => {
      const { id, token } = await register(app);
      const res = await send(app, token, { readings: [{ temperatureC: 22, humidityPct: 50 }, { temperatureC: 23, humidityPct: 51 }] });
      expect(res.statusCode).toBe(422);
      expect(errorPaths(res)).toEqual(['readings.1.recordedAt']);
      expect(await storedReadings(client, id)).toHaveLength(0);
    }));
});

describe('POST /v1/telemetry: timestamps', () => {
  it.each([
    ['more than 2 minutes in the future', 2 * MINUTE + 10 * SECOND],
    ['older than 24 hours', -(24 * HOUR + MINUTE)],
  ])('rejects a reading %s, and the whole batch with it', (_label, offset) =>
    withRolledBackApp(pool, async ({ app, client }) => {
      const { id, token } = await register(app);
      const res = await send(app, token, { readings: [reading(-MINUTE), reading(offset)] });
      expect(res.statusCode).toBe(422);
      expect(errorPaths(res)).toEqual(['readings.1.recordedAt']);
      expect(await storedReadings(client, id)).toHaveLength(0);
    }));

  it('accepts readings within the limits: slightly ahead, and almost 24 hours old', () =>
    withRolledBackApp(pool, async ({ app }) => {
      const { token } = await register(app);
      const res = await send(app, token, { readings: [reading(MINUTE), reading(-(23 * HOUR + 59 * MINUTE))] });
      expect(res.statusCode).toBe(202);
      expect(res.json()).toMatchObject({ accepted: 2 });
    }));

  it.each([
    ['not a date', 'yesterday'],
    ['an impossible date', '2026-02-30T10:00:00.000Z'],
    ['a non-UTC offset', '2026-10-19T14:00:00+05:30'],
    ['a number', 1_792_000_000],
  ])('rejects %s', (_label, recordedAt) =>
    withRolledBackApp(pool, async ({ app }) => {
      const { token } = await register(app);
      const res = await send(app, token, { readings: [{ recordedAt, temperatureC: 21, humidityPct: 45 }] });
      expect(res.statusCode).toBe(422);
      expect(errorPaths(res)).toEqual(['readings.0.recordedAt']);
    }));
});

describe('POST /v1/telemetry: values and diagnostics', () => {
  it.each([
    ['temperature above the BME280 range', { temperatureC: 85.01 }, 'readings.0.temperatureC'],
    ['temperature below the BME280 range', { temperatureC: -40.5 }, 'readings.0.temperatureC'],
    ['humidity above 100 %', { humidityPct: 100.1 }, 'readings.0.humidityPct'],
    ['negative humidity', { humidityPct: -1 }, 'readings.0.humidityPct'],
    ['a numeric string', { temperatureC: '21.5' }, 'readings.0.temperatureC'],
    ['null', { humidityPct: null }, 'readings.0.humidityPct'],
    ['a missing value', { temperatureC: undefined }, 'readings.0.temperatureC'],
  ])('rejects %s', (_label, patch, path) =>
    withRolledBackApp(pool, async ({ app, client }) => {
      const { id, token } = await register(app);
      const res = await send(app, token, { readings: [{ ...reading(), ...patch }] });
      expect(res.statusCode).toBe(422);
      expect(errorPaths(res)).toContain(path);
      expect(await storedReadings(client, id)).toHaveLength(0);
    }));

  it('rejects non-finite numbers, which JSON cannot carry', () =>
    withRolledBackApp(pool, async ({ app }) => {
      const { token } = await register(app);
      const res = await app.inject({
        method: 'POST',
        url: '/v1/telemetry',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        payload: `{"readings":[{"temperatureC":NaN,"humidityPct":Infinity}]}`,
      });
      expect(res.statusCode).toBe(400);
    }));

  it('stores diagnostics, keeps fields a later report leaves out, and shows them on the device', () =>
    withRolledBackApp(pool, async ({ app }) => {
      const { id, token } = await register(app);
      await send(app, token, { readings: [reading(-2 * MINUTE)], diagnostics: { rssiDbm: -62, firmwareVersion: '0.1.0', uptimeS: 3600 } });
      expect((await getDevice(app, id)).diagnostics).toEqual({ rssiDbm: -62, firmwareVersion: '0.1.0', uptimeS: 3600 });

      await send(app, token, { readings: [reading(-MINUTE)], diagnostics: { rssiDbm: -70 } });
      expect((await getDevice(app, id)).diagnostics).toEqual({ rssiDbm: -70, firmwareVersion: '0.1.0', uptimeS: 3600 });
    }));

  it.each([
    ['an impossible RSSI', { rssiDbm: 10 }, 'diagnostics.rssiDbm'],
    ['a fractional RSSI', { rssiDbm: -61.5 }, 'diagnostics.rssiDbm'],
    ['a firmware version with control characters', { firmwareVersion: '0.1.0\nadmin' }, 'diagnostics.firmwareVersion'],
    ['an over-long firmware version', { firmwareVersion: 'v'.repeat(33) }, 'diagnostics.firmwareVersion'],
    ['negative uptime', { uptimeS: -1 }, 'diagnostics.uptimeS'],
    ['uptime beyond a 32-bit integer', { uptimeS: 2 ** 31 }, 'diagnostics.uptimeS'],
    ['an unknown diagnostics field', { freeHeap: 1000 }, 'diagnostics'],
  ])('rejects %s', (_label, diagnostics, path) =>
    withRolledBackApp(pool, async ({ app, client }) => {
      const { id, token } = await register(app);
      const res = await send(app, token, { readings: [reading()], diagnostics });
      expect(res.statusCode).toBe(422);
      expect(errorPaths(res)).toContain(path);
      expect(await storedReadings(client, id)).toHaveLength(0);
      expect((await getDevice(app, id)).lastSeenAt).toBeNull();
    }));
});

describe('POST /v1/telemetry: device identity', () => {
  it.each([
    ['at the top level', (other: string) => ({ deviceId: other, readings: [reading()] }), '(root)'],
    ['inside a reading', (other: string) => ({ readings: [{ ...reading(), deviceId: other }] }), 'readings.0'],
  ])('rejects a device id %s and never writes to that device', (_label, body, path) =>
    withRolledBackApp(pool, async ({ app, client }) => {
      const attacker = await register(app, 'Attacker');
      const victim = await register(app, 'Victim');
      const res = await send(app, attacker.token, body(victim.id));
      expect(res.statusCode).toBe(422);
      expect(errorPaths(res)).toContain(path);
      expect(await storedReadings(client)).toHaveLength(0);
      expect((await getDevice(app, victim.id)).lastSeenAt).toBeNull();
    }));

  it('attributes readings to the device whose token was used', () =>
    withRolledBackApp(pool, async ({ app, client }) => {
      const a = await register(app, 'A');
      const b = await register(app, 'B');
      await send(app, b.token, { readings: [reading()] });
      expect((await storedReadings(client)).map((r) => r.device_id)).toEqual([b.id]);
      expect((await getDevice(app, a.id)).status).toBe('never_seen');
    }));
});

describe('POST /v1/telemetry: authentication', () => {
  const secretPart = (token: string) => token.slice(token.indexOf('.') + 1);

  it.each([
    ['no token', () => null],
    ['the owner token', () => TEST_OWNER_TOKEN],
    ['a malformed token', () => 'nxd_garbage'],
    ['another device id with this secret', (token: string, otherId: string) => `nxd_${otherId}.${secretPart(token)}`],
    ['a tampered secret', (token: string) => token.slice(0, -1) + (token.endsWith('A') ? 'B' : 'A')],
  ])('rejects %s with 401 and writes nothing', (_label, credential) =>
    withRolledBackApp(pool, async ({ app, client }) => {
      const { token } = await register(app, 'Device');
      const other = await register(app, 'Other');
      const res = await send(app, credential(token, other.id), { readings: [reading()] });
      expect(res.statusCode).toBe(401);
      expect(res.headers['www-authenticate']).toBe('Bearer');
      expect(res.headers['content-type']).toBe('application/problem+json; charset=utf-8');
      expect(await storedReadings(client)).toHaveLength(0);
    }));

  it('checks the token before reading the body', () =>
    withRolledBackApp(pool, async ({ app }) => {
      const res = await app.inject({ method: 'POST', url: '/v1/telemetry', headers: { 'content-type': 'application/json' }, payload: '{not json' });
      expect(res.statusCode).toBe(401);
    }));

  it('rejects a token that has been replaced, and accepts the new one', () =>
    withRolledBackApp(pool, async ({ app, client }) => {
      const { id, token } = await register(app);
      const rotated = DeviceWithToken.parse((await app.inject({ method: 'POST', url: `/v1/devices/${id}/token`, headers: ownerAuth })).json());
      expect((await send(app, token, { readings: [reading()] })).statusCode).toBe(401);
      expect(await storedReadings(client, id)).toHaveLength(0);
      expect((await send(app, rotated.deviceToken, { readings: [reading()] })).statusCode).toBe(202);
    }));

  it('rejects a revoked device', () =>
    withRolledBackApp(pool, async ({ app, client }) => {
      const { id, token } = await register(app);
      await client.query('update devices set revoked_at = now() where id = $1', [id]);
      expect((await send(app, token, { readings: [reading()] })).statusCode).toBe(401);
      expect(await storedReadings(client, id)).toHaveLength(0);
    }));

  it('writes nothing if the token is replaced between authentication and storage', () =>
    withRolledBackApp(pool, async ({ app, client, database }) => {
      const { id } = await register(app);
      const authenticated = await findDevice(database.db, id);
      if (!authenticated) throw new Error('device missing');
      await app.inject({ method: 'POST', url: `/v1/devices/${id}/token`, headers: ownerAuth });

      const row = { recordedAt: new Date(Date.now() - MINUTE), temperatureC: 21, humidityPct: 45 };
      expect(await ingestTelemetry(database.db, authenticated, [row], { readings: [] }, new Date())).toBeNull();
      expect(await storedReadings(client, id)).toHaveLength(0);
      expect((await getDevice(app, id)).lastSeenAt).toBeNull();
    }));
});

describe('POST /v1/telemetry: rate limiting', () => {
  const limit = { telemetryRateLimit: { max: 2, timeWindowMs: 60 * SECOND } };

  it('returns 429 with a retry hint once a device exceeds its limit; other devices are unaffected', () =>
    withRolledBackApp(
      pool,
      async ({ app, client }) => {
        const a = await register(app, 'A');
        const b = await register(app, 'B');

        const first = await send(app, a.token, { readings: [reading(-3 * MINUTE)] });
        expect(first.statusCode).toBe(202);
        expect(first.headers['x-ratelimit-limit']).toBe('2');
        expect(first.headers['x-ratelimit-remaining']).toBe('1');
        expect((await send(app, a.token, { readings: [reading(-2 * MINUTE)] })).statusCode).toBe(202);

        const limited = await send(app, a.token, { readings: [reading(-MINUTE)] });
        expect(limited.statusCode).toBe(429);
        expect(limited.headers['content-type']).toBe('application/problem+json; charset=utf-8');
        expect(Problem.parse(limited.json())).toMatchObject({ status: 429, type: 'urn:nexa:problem:rate-limited' });
        expect(Number(limited.headers['retry-after'])).toBeGreaterThan(0);
        expect(Number(limited.headers['retry-after'])).toBeLessThanOrEqual(60);
        expect(await storedReadings(client, a.id)).toHaveLength(2);

        expect((await send(app, b.token, { readings: [reading()] })).statusCode).toBe(202);
      },
      limit,
    ));

  it("keys on the verified device: invalid requests count against the sender, unauthenticated ones against no device", () =>
    withRolledBackApp(
      pool,
      async ({ app }) => {
        const a = await register(app, 'A');
        const b = await register(app, 'B');

        // A names B in its bodies; the requests are rejected and count against A only.
        for (let i = 0; i < 2; i++) expect((await send(app, a.token, { deviceId: b.id, readings: [reading()] })).statusCode).toBe(422);
        expect((await send(app, a.token, { readings: [reading()] })).statusCode).toBe(429);

        // Requests with B's id but no valid secret are refused before the limiter and use none of B's budget.
        for (let i = 0; i < 3; i++) expect((await send(app, `nxd_${b.id}.${'A'.repeat(43)}`, { readings: [reading()] })).statusCode).toBe(401);
        expect((await send(app, b.token, { readings: [reading(-2 * MINUTE)] })).statusCode).toBe(202);
        expect((await send(app, b.token, { readings: [reading(-MINUTE)] })).statusCode).toBe(202);
      },
      limit,
    ));

  it('does not limit owner endpoints', () =>
    withRolledBackApp(
      pool,
      async ({ app }) => {
        for (let i = 0; i < 4; i++) expect((await app.inject({ method: 'GET', url: '/v1/devices', headers: ownerAuth })).statusCode).toBe(200);
      },
      limit,
    ));
});

describe('device status and latest reading', () => {
  it('turns a device online after its first valid report', () =>
    withRolledBackApp(pool, async ({ app }) => {
      const { id, token } = await register(app);
      expect((await getDevice(app, id)).status).toBe('never_seen');
      await send(app, token, { readings: [reading()] });
      expect((await getDevice(app, id)).status).toBe('online');
    }));

  it('shows the most recently recorded reading in list and detail, even when older readings arrive later', () =>
    withRolledBackApp(pool, async ({ app }) => {
      const a = await register(app, 'A');
      const quiet = await register(app, 'Quiet');
      const newest = reading(-MINUTE, 23.25, 47);
      await send(app, a.token, { readings: [newest] });
      // A buffered batch from earlier arrives afterwards.
      await send(app, a.token, { readings: [reading(-10 * MINUTE, 19), reading(-5 * MINUTE, 20)] });

      const detail = await getDevice(app, a.id);
      expect(detail.latestReading).toMatchObject({ recordedAt: newest.recordedAt, temperatureC: 23.25, humidityPct: 47 });

      const list = DeviceList.parse((await app.inject({ method: 'GET', url: '/v1/devices', headers: ownerAuth })).json());
      expect(list.items.find((d) => d.id === a.id)?.latestReading?.recordedAt).toBe(newest.recordedAt);
      expect(list.items.find((d) => d.id === quiet.id)?.latestReading).toBeNull();
      expect((await getDevice(app, quiet.id)).latestReading).toBeNull();
    }));

  it('includes the latest reading when the token is rotated', () =>
    withRolledBackApp(pool, async ({ app }) => {
      const { id, token } = await register(app);
      const r = reading();
      await send(app, token, { readings: [r] });
      const rotated = DeviceWithToken.parse((await app.inject({ method: 'POST', url: `/v1/devices/${id}/token`, headers: ownerAuth })).json());
      expect(rotated.device.latestReading?.recordedAt).toBe(r.recordedAt);
    }));
});

describe('secrets never reach the logs', () => {
  it('logs no device token, secret or owner token across ingestion, conflicts, rate limiting and failed auth', () =>
    withRolledBackApp(
      pool,
      async ({ app, logs }) => {
        const { token } = await register(app);
        const r = reading();
        await send(app, token, { readings: [r] });
        await send(app, token, { readings: [{ ...r, temperatureC: 30 }] }); // conflict → warn log
        await send(app, token, { readings: [reading()] }); // 429
        await send(app, `${token.slice(0, -1)}x`, { readings: [reading()] }); // 401
        await send(app, TEST_OWNER_TOKEN, { readings: [reading()] }); // 401

        const output = logs.join('');
        expect(output).toContain('readings conflict');
        for (const secret of [token, token.slice(token.indexOf('.') + 1), TEST_OWNER_TOKEN]) expect(output).not.toContain(secret);
        expect(output).not.toMatch(/token_?hash/i);
      },
      { telemetryRateLimit: { max: 2, timeWindowMs: 60 * SECOND } },
    ));
});
