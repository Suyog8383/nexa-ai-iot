import type { HistoryBucket } from '@nexa/contracts';
import { and, desc, eq, gte, inArray, isNull, lt, sql } from 'drizzle-orm';

import type { Database } from '../../db/client';
import { devices, readings, type ReadingRow } from '../../db/schema';

type Db = Database['db'];

export type NewReading = Pick<ReadingRow, 'recordedAt' | 'temperatureC' | 'humidityPct'>;
export type DeviceReport = { rssiDbm?: number; firmwareVersion?: string; uptimeS?: number };

/**
 * Marks the device as seen and stores the diagnostics it sent (fields it left out keep their
 * previous values). Matches only if the device still has the token hash it authenticated with
 * and isn't revoked, so a token rotated or revoked mid-request can't slip a report in. Also
 * locks the device row, which serializes concurrent reports from the same device.
 */
export async function recordDeviceReport(db: Db, deviceId: string, tokenHash: Buffer, seenAt: Date, report: DeviceReport): Promise<boolean> {
  const rows = await db
    .update(devices)
    .set({
      lastSeenAt: seenAt,
      updatedAt: seenAt,
      ...(report.rssiDbm !== undefined && { lastRssiDbm: report.rssiDbm }),
      ...(report.firmwareVersion !== undefined && { firmwareVersion: report.firmwareVersion }),
      ...(report.uptimeS !== undefined && { uptimeS: report.uptimeS }),
    })
    .where(and(eq(devices.id, deviceId), eq(devices.tokenHash, tokenHash), isNull(devices.revokedAt)))
    .returning({ id: devices.id });
  return rows.length === 1;
}

/** Inserts readings, skipping any whose (device, recordedAt) is already stored. Returns the times actually inserted. */
export async function insertReadings(db: Db, deviceId: string, receivedAt: Date, rows: NewReading[]): Promise<Date[]> {
  const inserted = await db
    .insert(readings)
    .values(rows.map((row) => ({ ...row, deviceId, receivedAt })))
    .onConflictDoNothing({ target: [readings.deviceId, readings.recordedAt] })
    .returning({ recordedAt: readings.recordedAt });
  return inserted.map((row) => row.recordedAt);
}

export function findReadingsAt(db: Db, deviceId: string, times: Date[]): Promise<ReadingRow[]> {
  return db
    .select()
    .from(readings)
    .where(and(eq(readings.deviceId, deviceId), inArray(readings.recordedAt, times)));
}

/**
 * Lateral subquery for the newest reading of the device in the outer query. Postgres answers it
 * with one backwards probe of `readings_pkey` per device, however many readings there are.
 */
export const latestReading = (db: Db) =>
  db
    .select()
    .from(readings)
    .where(eq(readings.deviceId, devices.id))
    .orderBy(desc(readings.recordedAt))
    .limit(1)
    .as('latest_reading');

/** Raw readings in [from, before), newest first. */
export function rawHistory(db: Db, deviceId: string, from: Date, before: Date, limit: number): Promise<ReadingRow[]> {
  return db
    .select()
    .from(readings)
    .where(and(eq(readings.deviceId, deviceId), gte(readings.recordedAt, from), lt(readings.recordedAt, before)))
    .orderBy(desc(readings.recordedAt))
    .limit(limit);
}

export type BucketRow = {
  bucketStart: Date;
  temperatureC: { min: number; avg: number; max: number };
  humidityPct: { min: number; avg: number; max: number };
  count: number;
};

const BUCKET_INTERVALS: Record<Exclude<HistoryBucket, 'raw'>, string> = { '5m': '5 minutes', '1h': '1 hour' };

/**
 * Readings in [from, before) grouped into UTC-aligned buckets, newest bucket first. Buckets with
 * no readings are omitted. Only readings inside the range are aggregated, so a bucket that
 * straddles `from` or `to` covers just the part inside it (its `count` says how many readings).
 */
export async function bucketHistory(
  db: Db,
  deviceId: string,
  bucket: Exclude<HistoryBucket, 'raw'>,
  from: Date,
  before: Date,
  limit: number,
): Promise<BucketRow[]> {
  // date_bin's origin is a UTC midnight, so 5-minute and hourly buckets start on UTC boundaries.
  // The interval is inlined (it comes from the constant map above, never from the request) so the
  // SELECT, GROUP BY and ORDER BY expressions are textually identical, as Postgres requires.
  const interval = sql.raw(`'${BUCKET_INTERVALS[bucket]}'::interval`);
  const bucketStart = sql`date_bin(${interval}, ${readings.recordedAt}, timestamptz '2000-01-01 00:00:00+00')`;
  const rows = await db
    .select({
      bucketStart: sql<string>`to_char(${bucketStart} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`,
      tMin: sql<number>`min(${readings.temperatureC})`,
      tAvg: sql<number>`avg(${readings.temperatureC})`,
      tMax: sql<number>`max(${readings.temperatureC})`,
      hMin: sql<number>`min(${readings.humidityPct})`,
      hAvg: sql<number>`avg(${readings.humidityPct})`,
      hMax: sql<number>`max(${readings.humidityPct})`,
      count: sql<number>`count(*)::int`,
    })
    .from(readings)
    .where(and(eq(readings.deviceId, deviceId), gte(readings.recordedAt, from), lt(readings.recordedAt, before)))
    .groupBy(bucketStart)
    .orderBy(desc(bucketStart))
    .limit(limit);

  return rows.map((row) => ({
    bucketStart: new Date(row.bucketStart),
    temperatureC: { min: row.tMin, avg: row.tAvg, max: row.tMax },
    humidityPct: { min: row.hMin, avg: row.hAvg, max: row.hMax },
    count: row.count,
  }));
}
