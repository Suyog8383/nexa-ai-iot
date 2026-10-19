import { afterAll, describe, expect, it } from 'vitest';

import { inRolledBackTransaction, testDatabaseUrl } from '../test/db';

import { createDatabase } from './client';
import { runMigrations } from './migrate';

const database = createDatabase(testDatabaseUrl());
afterAll(() => database.pool.end());

const validDevice = { name: 'Living Room Monitor', room: 'Living Room', board: 'ESP32', sensor: 'BME280', token_hash: Buffer.alloc(32, 7) };

async function insertDevice(client: { query: (text: string, values: unknown[]) => Promise<unknown> }, overrides: Record<string, unknown> = {}) {
  const row = { ...validDevice, ...overrides };
  const columns = Object.keys(row);
  // Column names come from this test's own constant; values are always parameters.
  return client.query(`insert into devices (${columns.join(', ')}) values (${columns.map((_, i) => `$${i + 1}`).join(', ')}) returning *`, Object.values(row));
}

describe('migrations', () => {
  it('create the devices table with the expected columns', async () => {
    const { rows } = await database.pool.query<{ column_name: string; data_type: string; is_nullable: string }>(
      `select column_name, data_type, is_nullable from information_schema.columns where table_schema = 'public' and table_name = 'devices' order by ordinal_position`,
    );
    expect(rows.map((r) => r.column_name)).toEqual([
      'id', 'name', 'room', 'board', 'sensor', 'reporting_interval_s', 'token_hash', 'token_rotated_at', 'revoked_at',
      'last_seen_at', 'last_rssi_dbm', 'firmware_version', 'uptime_s', 'created_at', 'updated_at',
    ]);
    expect(rows.find((r) => r.column_name === 'token_hash')).toMatchObject({ data_type: 'bytea', is_nullable: 'NO' });
    expect(rows.find((r) => r.column_name === 'last_seen_at')).toMatchObject({ data_type: 'timestamp with time zone', is_nullable: 'YES' });
  });

  it('only create the devices table in this PR', async () => {
    const { rows } = await database.pool.query<{ table_name: string }>(`select table_name from information_schema.tables where table_schema = 'public'`);
    expect(rows.map((r) => r.table_name)).toEqual(['devices']);
  });

  it('are idempotent', async () => {
    await expect(runMigrations(database)).resolves.toBeUndefined();
  });

  it('apply defaults to a new device', async () => {
    await inRolledBackTransaction(database.pool, async (client) => {
      const { rows } = (await insertDevice(client)) as { rows: Record<string, unknown>[] };
      expect(rows[0]).toMatchObject({ reporting_interval_s: 30, revoked_at: null, last_seen_at: null });
      expect(rows[0]?.id).toMatch(/^[0-9a-f-]{36}$/);
    });
  });

  it.each([
    ['an unsupported board', { board: 'ESP8266' }, 'devices_board_supported'],
    ['an unsupported sensor', { sensor: 'DHT22' }, 'devices_sensor_supported'],
    ['an empty name', { name: '' }, 'devices_name_length'],
    ['a reporting interval below 10 s', { reporting_interval_s: 5 }, 'devices_reporting_interval_range'],
    ['a token hash that is not 32 bytes', { token_hash: Buffer.alloc(16) }, 'devices_token_hash_sha256'],
    ['an impossible RSSI', { last_rssi_dbm: 20 }, 'devices_rssi_range'],
  ])('reject %s', async (_label, overrides, constraint) => {
    await inRolledBackTransaction(database.pool, async (client) => {
      await expect(insertDevice(client, overrides)).rejects.toMatchObject({ constraint });
    });
  });
});
