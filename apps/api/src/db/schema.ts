import { sql } from 'drizzle-orm';
import { boolean, check, customType, doublePrecision, foreignKey, index, integer, pgTable, primaryKey, text, timestamp, unique, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

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

/**
 * Owner-defined thresholds on one device's readings. Bounds mirror `ALERT_THRESHOLD_BOUNDS` and
 * `ALERT_DURATIONS_S` in `@nexa/contracts/limits`. Deleting a rule sets `deleted_at` so the events
 * it produced keep their history; deleting the device removes both.
 */
export const alertRules = pgTable(
  'alert_rules',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    deviceId: uuid('device_id')
      .notNull()
      .references(() => devices.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    metric: text('metric').notNull(),
    condition: text('condition').notNull(),
    threshold: doublePrecision('threshold').notNull(),
    durationS: integer('duration_s').notNull(),
    notifyPush: boolean('notify_push').notNull(),
    notifyInApp: boolean('notify_in_app').notNull(),
    notifySound: boolean('notify_sound').notNull(),
    enabled: boolean('enabled').notNull().default(true),
    origin: text('origin'),
    createdAt: timestamptz('created_at').notNull().defaultNow(),
    updatedAt: timestamptz('updated_at').notNull().defaultNow(),
    deletedAt: timestamptz('deleted_at'),
    /**
     * Readings recorded before this aren't evaluated against the rule. Set when the rule is created,
     * re-enabled, or changes what it evaluates, so late readings (an offline buffer) can't open
     * events from before the rule, or overlapping the event a change resolved.
     */
    evaluateFrom: timestamptz('evaluate_from').notNull().defaultNow(),
  },
  (t) => [
    // Lets alert_events reference (rule, device) together, so an event's device is always its rule's.
    unique('alert_rules_id_device_unique').on(t.id, t.deviceId),
    index('alert_rules_device_idx').on(t.deviceId),
    check('alert_rules_name_length', sql`char_length(${t.name}) between 1 and 60`),
    check('alert_rules_metric_supported', sql`${t.metric} in ('temperature', 'humidity')`),
    check('alert_rules_condition_supported', sql`${t.condition} in ('below', 'above')`),
    // Also rejects NaN and ±Infinity.
    check(
      'alert_rules_threshold_range',
      sql`(${t.metric} = 'temperature' and ${t.threshold} between 5 and 40) or (${t.metric} = 'humidity' and ${t.threshold} between 10 and 90)`,
    ),
    check('alert_rules_duration_supported', sql`${t.durationS} in (0, 300, 900)`),
    check('alert_rules_origin_length', sql`char_length(${t.origin}) between 1 and 64`),
  ],
);

export type AlertRuleRow = typeof alertRules.$inferSelect;

/**
 * A period during which a rule's condition held. `metric`, `condition` and `threshold` are copied
 * from the rule when the event opens, so later edits don't rewrite history. At most one open
 * (unresolved) event per rule, and one event per rule per trigger time, so re-evaluating the same
 * readings can never create a second event.
 */
export const alertEvents = pgTable(
  'alert_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ruleId: uuid('rule_id').notNull(),
    deviceId: uuid('device_id').notNull(),
    metric: text('metric').notNull(),
    condition: text('condition').notNull(),
    threshold: doublePrecision('threshold').notNull(),
    triggerValue: doublePrecision('trigger_value').notNull(),
    triggeredAt: timestamptz('triggered_at').notNull(),
    resolvedAt: timestamptz('resolved_at'),
    acknowledgedAt: timestamptz('acknowledged_at'),
    createdAt: timestamptz('created_at').notNull().defaultNow(),
  },
  (t) => [
    foreignKey({ name: 'alert_events_rule_device_fk', columns: [t.ruleId, t.deviceId], foreignColumns: [alertRules.id, alertRules.deviceId] }).onDelete('cascade'),
    unique('alert_events_rule_triggered_at_unique').on(t.ruleId, t.triggeredAt),
    uniqueIndex('alert_events_one_open_per_rule').on(t.ruleId).where(sql`${t.resolvedAt} is null`),
    // Newest-first listing, overall and per device.
    index('alert_events_triggered_idx').on(t.triggeredAt.desc(), t.id.desc()),
    index('alert_events_device_triggered_idx').on(t.deviceId, t.triggeredAt.desc(), t.id.desc()),
    check('alert_events_metric_supported', sql`${t.metric} in ('temperature', 'humidity')`),
    check('alert_events_condition_supported', sql`${t.condition} in ('below', 'above')`),
    // A trigger value is a stored reading, so it is inside the BME280 range.
    check('alert_events_trigger_value_range', sql`${t.triggerValue} between -40 and 100`),
    check('alert_events_resolved_after_triggered', sql`${t.resolvedAt} >= ${t.triggeredAt}`),
    check('alert_events_acknowledged_after_triggered', sql`${t.acknowledgedAt} >= ${t.triggeredAt}`),
  ],
);

export type AlertEventRow = typeof alertEvents.$inferSelect;
