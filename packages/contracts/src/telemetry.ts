import { z } from 'zod';

import { Cursor, Id, Timestamp } from './common';
import { HISTORY_BUCKETS, HISTORY_LIMIT, HUMIDITY_RANGE_PCT, TELEMETRY_BATCH_MAX, TEMPERATURE_RANGE_C } from './limits';

const TemperatureC = z.number().min(TEMPERATURE_RANGE_C.min).max(TEMPERATURE_RANGE_C.max);
const HumidityPct = z.number().min(HUMIDITY_RANGE_PCT.min).max(HUMIDITY_RANGE_PCT.max);

/** One reading as sent by a device. */
export const ReadingInput = z.strictObject({
  /**
   * When the sensor was read (device clock, set via NTP). Optional: the server uses its receive
   * time when absent. The server rejects times too far in the future or past — see `limits`.
   */
  recordedAt: Timestamp.optional(),
  temperatureC: TemperatureC,
  humidityPct: HumidityPct,
});
export type ReadingInput = z.infer<typeof ReadingInput>;

/** Self-reported by the device alongside its readings; all optional. */
export const Diagnostics = z.strictObject({
  rssiDbm: z.number().int().min(-120).max(0).optional(),
  /** Printable ASCII only, e.g. `0.1.0`. */
  firmwareVersion: z.string().min(1).max(32).regex(/^[\x20-\x7E]+$/).optional(),
  /** Seconds since boot; capped at the largest 32-bit signed integer (about 68 years). */
  uptimeS: z.number().int().min(0).max(2_147_483_647).optional(),
});
export type Diagnostics = z.infer<typeof Diagnostics>;

/** POST /v1/telemetry, authenticated with the device token. The device id comes from the token, never from the body. */
export const TelemetryRequest = z.strictObject({
  readings: z.array(ReadingInput).min(1).max(TELEMETRY_BATCH_MAX),
  diagnostics: Diagnostics.optional(),
});
export type TelemetryRequest = z.infer<typeof TelemetryRequest>;

/**
 * 202. A reading whose `recordedAt` is already stored is never overwritten: it counts as a
 * `duplicate` if its values match the stored ones, otherwise as a `conflict` (and is not stored).
 */
export const TelemetryResponse = z.object({
  accepted: z.number().int().min(0),
  duplicates: z.number().int().min(0),
  conflicts: z.number().int().min(0),
});
export type TelemetryResponse = z.infer<typeof TelemetryResponse>;

/** A stored reading. */
export const Reading = z.object({
  recordedAt: Timestamp,
  receivedAt: Timestamp,
  temperatureC: z.number(),
  humidityPct: z.number(),
});
export type Reading = z.infer<typeof Reading>;

const Stat = z.object({ min: z.number(), avg: z.number(), max: z.number() });

/** One averaged bucket of readings. */
export const ReadingBucket = z.object({
  bucketStart: Timestamp,
  temperatureC: Stat,
  humidityPct: Stat,
  count: z.number().int().min(1),
});
export type ReadingBucket = z.infer<typeof ReadingBucket>;

/** GET /v1/devices/:id/readings — query string. `from`/`to` default to the last 24 h. */
export const ReadingHistoryQuery = z
  .strictObject({
    from: Timestamp.optional(),
    to: Timestamp.optional(),
    bucket: z.enum(HISTORY_BUCKETS).default('raw'),
    limit: z.coerce.number().int().min(1).max(HISTORY_LIMIT.max).default(HISTORY_LIMIT.default),
    cursor: Cursor.optional(),
  })
  .refine((q) => !q.from || !q.to || q.from < q.to, { message: '`from` must be before `to`', path: ['from'] });
export type ReadingHistoryQuery = z.input<typeof ReadingHistoryQuery>;

export const ReadingHistory = z.discriminatedUnion('bucket', [
  z.object({ deviceId: Id, bucket: z.literal('raw'), items: z.array(Reading), nextCursor: Cursor.nullable() }),
  z.object({ deviceId: Id, bucket: z.enum(['5m', '1h']), items: z.array(ReadingBucket), nextCursor: Cursor.nullable() }),
]);
export type ReadingHistory = z.infer<typeof ReadingHistory>;
