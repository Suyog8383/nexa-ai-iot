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

  it('create only the devices, readings and alert tables', async () => {
    const { rows } = await database.pool.query<{ table_name: string }>(`select table_name from information_schema.tables where table_schema = 'public' order by table_name`);
    expect(rows.map((r) => r.table_name)).toEqual(['alert_events', 'alert_rules', 'devices', 'readings']);
  });

  it('create the readings table with the expected columns', async () => {
    const { rows } = await database.pool.query<{ column_name: string; data_type: string; is_nullable: string }>(
      `select column_name, data_type, is_nullable from information_schema.columns where table_schema = 'public' and table_name = 'readings' order by ordinal_position`,
    );
    expect(rows).toEqual([
      { column_name: 'device_id', data_type: 'uuid', is_nullable: 'NO' },
      { column_name: 'recorded_at', data_type: 'timestamp with time zone', is_nullable: 'NO' },
      { column_name: 'received_at', data_type: 'timestamp with time zone', is_nullable: 'NO' },
      { column_name: 'temperature_c', data_type: 'double precision', is_nullable: 'NO' },
      { column_name: 'humidity_pct', data_type: 'double precision', is_nullable: 'NO' },
    ]);
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

describe('readings table', () => {
  const reading = (deviceId: string, overrides: Record<string, unknown> = {}) => {
    const row = { device_id: deviceId, recorded_at: new Date('2026-10-19T08:30:00Z'), temperature_c: 21.5, humidity_pct: 45, ...overrides };
    const columns = Object.keys(row);
    return { text: `insert into readings (${columns.join(', ')}) values (${columns.map((_, i) => `$${i + 1}`).join(', ')})`, values: Object.values(row) };
  };

  it('allows one reading per device per recorded_at', async () => {
    await inRolledBackTransaction(database.pool, async (client) => {
      const { rows } = (await insertDevice(client)) as { rows: { id: string }[] };
      const id = rows[0]?.id ?? '';
      const { text, values } = reading(id);
      await client.query(text, values);
      await expect(client.query(text, values)).rejects.toMatchObject({ constraint: 'readings_pkey' });
    });
  });

  it.each([
    ['a temperature above 85 °C', { temperature_c: 85.5 }, 'readings_temperature_range'],
    ['a temperature below -40 °C', { temperature_c: -41 }, 'readings_temperature_range'],
    ['a NaN temperature', { temperature_c: 'NaN' }, 'readings_temperature_range'],
    ['an infinite humidity', { humidity_pct: 'Infinity' }, 'readings_humidity_range'],
    ['humidity above 100 %', { humidity_pct: 101 }, 'readings_humidity_range'],
  ])('reject %s', async (_label, overrides, constraint) => {
    await inRolledBackTransaction(database.pool, async (client) => {
      const { rows } = (await insertDevice(client)) as { rows: { id: string }[] };
      const { text, values } = reading(rows[0]?.id ?? '', overrides);
      await expect(client.query(text, values)).rejects.toMatchObject({ constraint });
    });
  });

  it('reject readings for a device that does not exist', async () => {
    await inRolledBackTransaction(database.pool, async (client) => {
      const { text, values } = reading('00000000-0000-4000-8000-000000000000');
      await expect(client.query(text, values)).rejects.toMatchObject({ constraint: 'readings_device_id_devices_id_fk' });
    });
  });

  it('serve newest-first history and the latest reading from the primary key index', async () => {
    await inRolledBackTransaction(database.pool, async (client) => {
      // The table is tiny in tests, so steer the planner away from a sequential scan to see which index it can use.
      await client.query('set local enable_seqscan = off');
      const plan = async (text: string) => ((await client.query(`explain ${text}`)).rows as { 'QUERY PLAN': string }[]).map((r) => r['QUERY PLAN']).join('\n');
      const id = "'00000000-0000-4000-8000-000000000000'";
      const history = await plan(`select * from readings where device_id = ${id} and recorded_at >= now() - interval '1 day' and recorded_at < now() order by recorded_at desc limit 101`);
      expect(history).toMatch(/Index Scan Backward using readings_pkey/);
      expect(history).not.toMatch(/Sort/);
    });
  });
});

describe('alert tables', () => {
  type Client = { query: (text: string, values?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }> };

  async function insertRow(client: Client, table: string, row: Record<string, unknown>) {
    const columns = Object.keys(row);
    // Table and column names come from this test's own constants; values are always parameters.
    const { rows } = await client.query(`insert into ${table} (${columns.join(', ')}) values (${columns.map((_, i) => `$${i + 1}`).join(', ')}) returning *`, Object.values(row));
    return rows[0] as Record<string, unknown> & { id: string };
  }

  const rule = (deviceId: string, overrides: Record<string, unknown> = {}) => ({
    device_id: deviceId,
    name: 'High Temperature Alert',
    metric: 'temperature',
    condition: 'above',
    threshold: 30,
    duration_s: 0,
    notify_push: true,
    notify_in_app: true,
    notify_sound: false,
    ...overrides,
  });

  const event = (ruleId: string, deviceId: string, overrides: Record<string, unknown> = {}) => ({
    rule_id: ruleId,
    device_id: deviceId,
    metric: 'temperature',
    condition: 'above',
    threshold: 30,
    trigger_value: 31,
    triggered_at: new Date('2026-10-19T08:30:00Z'),
    ...overrides,
  });

  async function deviceAndRule(client: Client) {
    const { rows } = (await insertDevice(client)) as { rows: { id: string }[] };
    const deviceId = rows[0]?.id ?? '';
    const created = await insertRow(client, 'alert_rules', rule(deviceId));
    return { deviceId, ruleId: created.id };
  }

  it('apply defaults to a new rule', async () => {
    await inRolledBackTransaction(database.pool, async (client) => {
      const { rows } = (await insertDevice(client)) as { rows: { id: string }[] };
      const created = await insertRow(client, 'alert_rules', rule(rows[0]?.id ?? ''));
      expect(created).toMatchObject({ enabled: true, deleted_at: null, origin: null });
      expect(created.evaluate_from).toBeInstanceOf(Date);
    });
  });

  it.each([
    ['an unknown metric', { metric: 'pressure' }, 'alert_rules_metric_supported'],
    ['an unknown condition', { condition: 'equals' }, 'alert_rules_condition_supported'],
    ['a temperature threshold above 40 °C', { threshold: 40.5 }, 'alert_rules_threshold_range'],
    ['a humidity threshold below 10 %', { metric: 'humidity', threshold: 5 }, 'alert_rules_threshold_range'],
    ['a NaN threshold', { threshold: 'NaN' }, 'alert_rules_threshold_range'],
    ['an unsupported duration', { duration_s: 60 }, 'alert_rules_duration_supported'],
    ['an empty name', { name: '' }, 'alert_rules_name_length'],
    ['a rule for a device that does not exist', { device_id: '00000000-0000-4000-8000-000000000000' }, 'alert_rules_device_id_devices_id_fk'],
  ])('reject a rule with %s', async (_label, overrides, constraint) => {
    await inRolledBackTransaction(database.pool, async (client) => {
      const { rows } = (await insertDevice(client)) as { rows: { id: string }[] };
      await expect(insertRow(client, 'alert_rules', rule(rows[0]?.id ?? '', overrides))).rejects.toMatchObject({ constraint });
    });
  });

  it('allow only one open event per rule', async () => {
    await inRolledBackTransaction(database.pool, async (client) => {
      const { deviceId, ruleId } = await deviceAndRule(client);
      await insertRow(client, 'alert_events', event(ruleId, deviceId));
      await expect(insertRow(client, 'alert_events', event(ruleId, deviceId, { triggered_at: new Date('2026-10-19T09:00:00Z') }))).rejects.toMatchObject({
        constraint: 'alert_events_one_open_per_rule',
      });
    });
  });

  it('allow one event per rule per trigger time, even once resolved', async () => {
    await inRolledBackTransaction(database.pool, async (client) => {
      const { deviceId, ruleId } = await deviceAndRule(client);
      await insertRow(client, 'alert_events', event(ruleId, deviceId, { resolved_at: new Date('2026-10-19T08:31:00Z') }));
      await expect(insertRow(client, 'alert_events', event(ruleId, deviceId, { resolved_at: new Date('2026-10-19T08:32:00Z') }))).rejects.toMatchObject({
        constraint: 'alert_events_rule_triggered_at_unique',
      });
    });
  });

  it('reject an event whose device is not its rule’s device', async () => {
    await inRolledBackTransaction(database.pool, async (client) => {
      const { ruleId } = await deviceAndRule(client);
      const { rows } = (await insertDevice(client, { name: 'Other' })) as { rows: { id: string }[] };
      await expect(insertRow(client, 'alert_events', event(ruleId, rows[0]?.id ?? ''))).rejects.toMatchObject({ constraint: 'alert_events_rule_device_fk' });
    });
  });

  it.each([
    ['resolved before it triggered', { resolved_at: new Date('2026-10-19T08:00:00Z') }, 'alert_events_resolved_after_triggered'],
    ['acknowledged before it triggered', { acknowledged_at: new Date('2026-10-19T08:00:00Z') }, 'alert_events_acknowledged_after_triggered'],
    ['an infinite trigger value', { trigger_value: 'Infinity' }, 'alert_events_trigger_value_range'],
  ])('reject an event %s', async (_label, overrides, constraint) => {
    await inRolledBackTransaction(database.pool, async (client) => {
      const { deviceId, ruleId } = await deviceAndRule(client);
      await expect(insertRow(client, 'alert_events', event(ruleId, deviceId, overrides))).rejects.toMatchObject({ constraint });
    });
  });

  it('delete a device’s rules and events with the device', async () => {
    await inRolledBackTransaction(database.pool, async (client) => {
      const { deviceId, ruleId } = await deviceAndRule(client);
      await insertRow(client, 'alert_events', event(ruleId, deviceId));
      await client.query('delete from devices where id = $1', [deviceId]);
      const { rows } = await client.query('select (select count(*)::int from alert_rules) as rules, (select count(*)::int from alert_events) as events');
      expect(rows[0]).toEqual({ rules: 0, events: 0 });
    });
  });
});
