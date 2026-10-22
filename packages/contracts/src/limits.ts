/**
 * Shared limits and enumerations. Plain constants with no dependencies, so the mobile app can
 * import `@nexa/contracts/limits` without bundling zod.
 */

export const METRICS = ['temperature', 'humidity'] as const;
export type Metric = (typeof METRICS)[number];

export const CONDITIONS = ['below', 'above'] as const;
export type Condition = (typeof CONDITIONS)[number];

/** BME280 operating range. Readings outside it are rejected as invalid, not clamped. */
export const TEMPERATURE_RANGE_C = { min: -40, max: 85 } as const;
export const HUMIDITY_RANGE_PCT = { min: 0, max: 100 } as const;

/** Range and step of the Create Alert Rule threshold stepper. */
export const ALERT_THRESHOLD_BOUNDS: Record<Metric, readonly [min: number, max: number]> = {
  temperature: [5, 40],
  humidity: [10, 90],
};
export const ALERT_THRESHOLD_STEP: Record<Metric, number> = { temperature: 0.5, humidity: 1 };

/** "Immediately", "For 5 mins", "For 15 mins". */
export const ALERT_DURATIONS_S = [0, 300, 900] as const;
export type AlertDurationS = (typeof ALERT_DURATIONS_S)[number];

export const REPORTING_INTERVAL_S = { default: 30, min: 10, max: 3600 } as const;

/** A device counts as online if it reported within this many reporting intervals. */
export const ONLINE_INTERVALS = 3;

export const TELEMETRY_BATCH_MAX = 100;
/** Readings timestamped further ahead than this are rejected (device clock is wrong). */
export const TELEMETRY_MAX_FUTURE_SKEW_MS = 2 * 60 * 1000;
/** Readings older than this are rejected; enough for a device to flush an offline buffer. */
export const TELEMETRY_MAX_AGE_MS = 24 * 60 * 60 * 1000;
/**
 * Telemetry requests allowed per device per window. A device reporting every 10 s (the fastest
 * interval) sends 6 a minute; the headroom lets it flush a 24 h offline buffer (≤ 29 batches at
 * the default 30 s) within a minute or two.
 */
export const TELEMETRY_RATE_LIMIT = { max: 30, windowMs: 60 * 1000 } as const;

export const HISTORY_LIMIT = { default: 100, max: 500 } as const;
/** History `from`/`to` default to the last 24 h; one request may span at most 31 days. */
export const HISTORY_DEFAULT_RANGE_MS = 24 * 60 * 60 * 1000;
export const HISTORY_MAX_RANGE_MS = 31 * 24 * 60 * 60 * 1000;
export const HISTORY_BUCKETS = ['raw', '5m', '1h'] as const;
export type HistoryBucket = (typeof HISTORY_BUCKETS)[number];

/** `nxd_<device uuid>.<base64url of 32 random bytes>` — the id lets the server look the device up before comparing hashes. */
export const DEVICE_TOKEN_PATTERN = /^nxd_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.[A-Za-z0-9_-]{43}$/;
