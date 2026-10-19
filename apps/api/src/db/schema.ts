import { sql } from 'drizzle-orm';
import { check, customType, integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

const bytea = customType<{ data: Buffer; driverData: Buffer }>({ dataType: () => 'bytea' });

const timestamptz = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });

/**
 * Registered ESP32 + BME280 devices. Columns follow docs/architecture.md; the token is stored
 * only as a SHA-256 hash (issued in a later PR).
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
