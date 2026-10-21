import { createHash, randomUUID } from 'node:crypto';

import { Device, DeviceList, DeviceWithToken } from '@nexa/contracts';
import type { InjectOptions } from 'fastify';
import pg from 'pg';
import { afterAll, describe, expect, it } from 'vitest';

import type { App } from '../../app';
import { ownerAuth, TEST_OWNER_TOKEN, withRolledBackApp } from '../../test/app';
import { testDatabaseUrl } from '../../test/db';

import { authenticateDevice } from './service';

const pool = new pg.Pool({ connectionString: testDatabaseUrl() });

afterAll(async () => {
  // Every test ran in a rolled-back transaction: nothing may be left behind.
  const { rows } = await pool.query<{ n: number }>('select count(*)::int as n from devices');
  expect(rows[0]?.n).toBe(0);
  await pool.end();
});

const monitor = { name: 'Living Room Monitor', room: 'Living Room', board: 'ESP32', sensor: 'BME280' } as const;

async function register(app: App, body: Record<string, unknown> = monitor) {
  const res = await app.inject({ method: 'POST', url: '/v1/devices', headers: ownerAuth, payload: body });
  expect(res.statusCode).toBe(201);
  return { res, body: DeviceWithToken.parse(res.json()) };
}

const secretPart = (token: string) => token.slice(token.indexOf('.') + 1);

describe('POST /v1/devices', () => {
  it('registers a device and discloses its token once', () =>
    withRolledBackApp(pool, async ({ app }) => {
      const { res, body } = await register(app);
      expect(res.headers['cache-control']).toBe('no-store');
      expect(body.device).toMatchObject({ ...monitor, reportingIntervalS: 30, status: 'never_seen', lastSeenAt: null, latestReading: null, diagnostics: null });
      expect(body.deviceToken.startsWith(`nxd_${body.device.id}.`)).toBe(true);

      // Neither the list nor the detail response ever includes the token or its hash.
      for (const url of ['/v1/devices', `/v1/devices/${body.device.id}`]) {
        const raw = (await app.inject({ method: 'GET', url, headers: ownerAuth })).body;
        expect(raw).not.toContain(secretPart(body.deviceToken));
        expect(raw).not.toMatch(/token/i);
      }
    }));

  it('accepts a custom reporting interval', () =>
    withRolledBackApp(pool, async ({ app }) => {
      const { body } = await register(app, { ...monitor, reportingIntervalS: 60 });
      expect(body.device.reportingIntervalS).toBe(60);
    }));

  it('stores only the SHA-256 hash, never the plaintext token', () =>
    withRolledBackApp(pool, async ({ app, client }) => {
      const { body } = await register(app);
      const { rows } = await client.query<{ token_hash: Buffer; whole_row: string }>('select token_hash, row_to_json(d)::text as whole_row from devices d where id = $1', [body.device.id]);
      expect(rows[0]?.token_hash).toEqual(createHash('sha256').update(body.deviceToken).digest());
      expect(rows[0]?.whole_row).not.toContain(secretPart(body.deviceToken));
    }));

  it.each([
    ['a missing name', { ...monitor, name: undefined }, 'name'],
    ['a blank room', { ...monitor, room: '   ' }, 'room'],
    ['an unsupported board', { ...monitor, board: 'ESP8266' }, 'board'],
    ['an unsupported sensor', { ...monitor, sensor: 'DHT22' }, 'sensor'],
    ['a reporting interval below 10 s', { ...monitor, reportingIntervalS: 5 }, 'reportingIntervalS'],
    ['a client-supplied status', { ...monitor, status: 'online' }, '(root)'],
    ['a client-supplied token hash', { ...monitor, tokenHash: 'abc' }, '(root)'],
  ])('rejects %s with 422', (_label, payload, path) =>
    withRolledBackApp(pool, async ({ app, client }) => {
      const res = await app.inject({ method: 'POST', url: '/v1/devices', headers: ownerAuth, payload });
      expect(res.statusCode).toBe(422);
      expect(res.json().errors.map((e: { path: string }) => e.path)).toContain(path);
      const { rows } = await client.query<{ n: number }>('select count(*)::int as n from devices');
      expect(rows[0]?.n).toBe(0);
    }));
});

describe('owner authentication on every device endpoint', () => {
  const id = randomUUID();
  const endpoints: InjectOptions[] = [
    { method: 'POST', url: '/v1/devices', payload: monitor },
    { method: 'GET', url: '/v1/devices' },
    { method: 'GET', url: `/v1/devices/${id}` },
    { method: 'POST', url: `/v1/devices/${id}/token` },
  ];

  it.each(endpoints)('$method $url: 401 without a token, 401 with a wrong one, allowed with the right one', (request) =>
    withRolledBackApp(pool, async ({ app }) => {
      expect((await app.inject(request)).statusCode).toBe(401);
      expect((await app.inject({ ...request, headers: { authorization: 'Bearer not-the-owner-token-0123456789abcdef' } })).statusCode).toBe(401);
      expect((await app.inject({ ...request, headers: ownerAuth })).statusCode).not.toBe(401);
    }));
});

describe('GET /v1/devices and /v1/devices/:id', () => {
  it('lists devices oldest first and returns one by id', () =>
    withRolledBackApp(pool, async ({ app, client }) => {
      const a = await register(app, { ...monitor, name: 'Living Room Monitor' });
      const b = await register(app, { ...monitor, name: 'Bedroom Monitor', room: 'Bedroom' });
      // Same transaction means the same now(); make the order explicit.
      await client.query("update devices set created_at = created_at - interval '1 minute' where id = $1", [a.body.device.id]);

      const list = DeviceList.parse((await app.inject({ method: 'GET', url: '/v1/devices', headers: ownerAuth })).json());
      expect(list.items.map((d) => d.name)).toEqual(['Living Room Monitor', 'Bedroom Monitor']);

      const detail = await app.inject({ method: 'GET', url: `/v1/devices/${b.body.device.id}`, headers: ownerAuth });
      expect(detail.statusCode).toBe(200);
      expect(Device.parse(detail.json())).toMatchObject({ id: b.body.device.id, name: 'Bedroom Monitor', room: 'Bedroom' });
    }));

  it('returns an empty list when nothing is registered', () =>
    withRolledBackApp(pool, async ({ app }) => {
      expect((await app.inject({ method: 'GET', url: '/v1/devices', headers: ownerAuth })).json()).toEqual({ items: [] });
    }));

  it('404s for an unknown id and 422s for a malformed one', () =>
    withRolledBackApp(pool, async ({ app }) => {
      const unknown = await app.inject({ method: 'GET', url: `/v1/devices/${randomUUID()}`, headers: ownerAuth });
      expect(unknown.statusCode).toBe(404);
      expect(unknown.headers['content-type']).toBe('application/problem+json; charset=utf-8');

      const malformed = await app.inject({ method: 'GET', url: '/v1/devices/not-a-uuid', headers: ownerAuth });
      expect(malformed.statusCode).toBe(422);
      expect(malformed.json().errors).toEqual([{ path: 'params.id', message: expect.any(String) }]);
    }));

  it('derives status from last_seen_at: never_seen, online (fresh), offline (stale)', () =>
    withRolledBackApp(pool, async ({ app, client }) => {
      const { body } = await register(app);
      const status = async () => Device.parse((await app.inject({ method: 'GET', url: `/v1/devices/${body.device.id}`, headers: ownerAuth })).json()).status;

      expect(await status()).toBe('never_seen');
      await client.query('update devices set last_seen_at = $2 where id = $1', [body.device.id, new Date(Date.now() - 10_000)]);
      expect(await status()).toBe('online');
      await client.query('update devices set last_seen_at = $2 where id = $1', [body.device.id, new Date(Date.now() - 10 * 60_000)]);
      expect(await status()).toBe('offline');
    }));

  it('reports diagnostics when the device has sent them', () =>
    withRolledBackApp(pool, async ({ app, client }) => {
      const { body } = await register(app);
      await client.query("update devices set last_rssi_dbm = -62, firmware_version = '0.1.0' where id = $1", [body.device.id]);
      const device = Device.parse((await app.inject({ method: 'GET', url: `/v1/devices/${body.device.id}`, headers: ownerAuth })).json());
      expect(device.diagnostics).toEqual({ rssiDbm: -62, firmwareVersion: '0.1.0' });
    }));
});

describe('POST /v1/devices/:id/token', () => {
  it('replaces the token: the old one stops working and the new one works', () =>
    withRolledBackApp(pool, async ({ app, database }) => {
      const { body: first } = await register(app);
      expect((await authenticateDevice(database.db, first.deviceToken))?.id).toBe(first.device.id);

      const res = await app.inject({ method: 'POST', url: `/v1/devices/${first.device.id}/token`, headers: ownerAuth });
      expect(res.statusCode).toBe(200);
      expect(res.headers['cache-control']).toBe('no-store');
      const rotated = DeviceWithToken.parse(res.json());

      expect(rotated.device.id).toBe(first.device.id);
      expect(rotated.deviceToken).not.toBe(first.deviceToken);
      expect(await authenticateDevice(database.db, first.deviceToken)).toBeNull();
      expect((await authenticateDevice(database.db, rotated.deviceToken))?.id).toBe(first.device.id);
    }));

  it('404s for an unknown device', () =>
    withRolledBackApp(pool, async ({ app }) => {
      expect((await app.inject({ method: 'POST', url: `/v1/devices/${randomUUID()}/token`, headers: ownerAuth })).statusCode).toBe(404);
    }));
});

describe('authenticateDevice', () => {
  it('rejects malformed, foreign, tampered and revoked tokens', () =>
    withRolledBackApp(pool, async ({ app, client, database }) => {
      const { body: a } = await register(app);
      const { body: b } = await register(app, { ...monitor, name: 'Other' });

      expect(await authenticateDevice(database.db, 'garbage')).toBeNull();
      // A's secret presented under B's id.
      expect(await authenticateDevice(database.db, `nxd_${b.device.id}.${secretPart(a.deviceToken)}`)).toBeNull();
      // One character changed.
      const tampered = a.deviceToken.slice(0, -1) + (a.deviceToken.endsWith('A') ? 'B' : 'A');
      expect(await authenticateDevice(database.db, tampered)).toBeNull();
      // A well-formed token for a device that doesn't exist.
      expect(await authenticateDevice(database.db, `nxd_${randomUUID()}.${secretPart(a.deviceToken)}`)).toBeNull();

      await client.query('update devices set revoked_at = now() where id = $1', [a.device.id]);
      expect(await authenticateDevice(database.db, a.deviceToken)).toBeNull();
      expect((await authenticateDevice(database.db, b.deviceToken))?.id).toBe(b.device.id);
    }));
});

describe('secrets never reach the logs', () => {
  it('logs no owner token, device token or hash across register, rotate and failed auth', () =>
    withRolledBackApp(pool, async ({ app, logs }) => {
      const { body } = await register(app);
      const rotated = DeviceWithToken.parse((await app.inject({ method: 'POST', url: `/v1/devices/${body.device.id}/token`, headers: ownerAuth })).json());
      await app.inject({ method: 'GET', url: '/v1/devices', headers: { authorization: `Bearer ${body.deviceToken}` } });

      const output = logs.join('');
      expect(output.length).toBeGreaterThan(0);
      for (const secret of [TEST_OWNER_TOKEN, body.deviceToken, rotated.deviceToken, secretPart(body.deviceToken)]) {
        expect(output).not.toContain(secret);
      }
      expect(output).not.toMatch(/token_?hash/i);
    }));
});
