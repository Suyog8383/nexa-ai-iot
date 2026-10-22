import { sql } from 'drizzle-orm';
import { check, customType, doublePrecision, integer, pgTable, primaryKey, text, timestamp, uuid } from 'drizzle-orm/pg-core';

const bytea = customType<{ data: Buffer; driverData: Buffer }>({ dataType: () => 'bytea' });

const timestamptz = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });

/**
 * Registered ESP32 + BME280 devices. Columns follow docs/architecture.md; the token is stored
 * only as a SHA-256 hash.
 */
export const devices = pgTable(
  'devices',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    room: text('room').notNull(),
    board: text('board').notNull(),
    sensor: text('sensor').notNull(),
    reportingIntervalS: integer('reporting_interval_s').notNull().default(30),
    tokenHash: bytea('token_hash').notNull(),
    tokenRotatedAt: timestamptz('token_rotated_at').notNull().defaultNow(),
    revokedAt: timestamptz('revoked_at'),
    lastSeenAt: timestamptz('last_seen_at'),
    lastRssiDbm: integer('last_rssi_dbm'),
    firmwareVersion: text('firmware_version'),
    uptimeS: integer('uptime_s'),
    createdAt: timestamptz('created_at').notNull().defaultNow(),
    updatedAt: timestamptz('updated_at').notNull().defaultNow(),
  },
  (t) => [
    check('devices_name_length', sql`char_length(${t.name}) between 1 and 60`),
    check('devices_room_length', sql`char_length(${t.room}) between 1 and 40`),
    check('devices_board_supported', sql`${t.board} = 'ESP32'`),
    check('devices_sensor_supported', sql`${t.sensor} = 'BME280'`),
    check('devices_reporting_interval_range', sql`${t.reportingIntervalS} between 10 and 3600`),
    check('devices_token_hash_sha256', sql`octet_length(${t.tokenHash}) = 32`),
    check('devices_rssi_range', sql`${t.lastRssiDbm} between -120 and 0`),
    check('devices_uptime_nonnegative', sql`${t.uptimeS} >= 0`),
  ],
);

export type DeviceRow = typeof devices.$inferSelect;

/**
 * One sensor reading per device per `recorded_at`. The primary key is the idempotency key for
 * telemetry resends, and its B-tree index also serves newest-first history scans (Postgres reads
 * it backwards for `order by recorded_at desc`), so no second index is needed.
 */
export const readings = pgTable(
  'readings',
  {
    deviceId: uuid('device_id')
      .notNull()
      .references(() => devices.id, { onDelete: 'cascade' }),
    recordedAt: timestamptz('recorded_at').notNull(),
    receivedAt: timestamptz('received_at').notNull().defaultNow(),
    temperatureC: doublePrecision('temperature_c').notNull(),
    humidityPct: doublePrecision('humidity_pct').notNull(),
  },
  (t) => [
    primaryKey({ name: 'readings_pkey', columns: [t.deviceId, t.recordedAt] }),
    // BME280 operating range (TEMPERATURE_RANGE_C / HUMIDITY_RANGE_PCT). Also rejects NaN and ±Infinity.
    check('readings_temperature_range', sql`${t.temperatureC} between -40 and 85`),
    check('readings_humidity_range', sql`${t.humidityPct} between 0 and 100`),
  ],
);

export type ReadingRow = typeof readings.$inferSelect;
