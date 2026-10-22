import {
  HISTORY_DEFAULT_RANGE_MS,
  HISTORY_MAX_RANGE_MS,
  TELEMETRY_MAX_AGE_MS,
  TELEMETRY_MAX_FUTURE_SKEW_MS,
  type HistoryBucket,
  type Reading,
  type ReadingHistory,
  type TelemetryRequest,
  type TelemetryResponse,
} from '@nexa/contracts';

import type { Database } from '../../db/client';
import type { DeviceRow, ReadingRow } from '../../db/schema';
import { evaluateNewReadings } from '../alerts/service';

import * as repo from './repo';

type Db = Database['db'];

/** A field-level problem, reported in a 422's `errors`. */
export type Issue = { path: string; message: string };

export function toApiReading(row: Pick<ReadingRow, 'recordedAt' | 'receivedAt' | 'temperatureC' | 'humidityPct'>): Reading {
  return {
    recordedAt: row.recordedAt.toISOString(),
    receivedAt: row.receivedAt.toISOString(),
    temperatureC: row.temperatureC,
    humidityPct: row.humidityPct,
  };
}

// --- Ingestion ---

/**
 * Turns a validated request body into rows, or field-level issues. Times are checked against the
 * server's receive time: no more than 2 minutes ahead, no more than 24 hours old. A reading
 * without `recordedAt` is stamped with the receive time, so at most one per batch may omit it.
 */
export function prepareReadings(input: TelemetryRequest['readings'], receivedAt: Date): { rows: repo.NewReading[] } | { issues: Issue[] } {
  const issues: Issue[] = [];
  const rows: repo.NewReading[] = [];
  let omitted = 0;

  input.forEach((reading, i) => {
    const path = `readings.${i}.recordedAt`;
    if (reading.recordedAt === undefined) {
      if (++omitted > 1) issues.push({ path, message: 'Only one reading per batch may omit recordedAt.' });
    }
    const recordedAt = reading.recordedAt === undefined ? receivedAt : new Date(reading.recordedAt);
    const aheadMs = recordedAt.getTime() - receivedAt.getTime();
    if (Number.isNaN(aheadMs)) issues.push({ path, message: 'Not a valid timestamp.' });
    else if (aheadMs > TELEMETRY_MAX_FUTURE_SKEW_MS) issues.push({ path, message: 'More than 2 minutes in the future; check the device clock.' });
    else if (-aheadMs > TELEMETRY_MAX_AGE_MS) issues.push({ path, message: 'Older than 24 hours.' });
    rows.push({ recordedAt, temperatureC: reading.temperatureC, humidityPct: reading.humidityPct });
  });

  return issues.length ? { issues } : { rows };
}

const sameValues = (a: repo.NewReading, b: repo.NewReading) => a.temperatureC === b.temperatureC && a.humidityPct === b.humidityPct;

/**
 * Stores a report from an authenticated device in one transaction: marks the device seen (even
 * if every reading is a duplicate), updates its diagnostics, inserts new readings and evaluates
 * the device's alert rules against them. A reading at an already-stored `recordedAt` is never
 * overwritten (or re-evaluated). Returns null if the device's token was rotated or revoked after
 * authentication; nothing is written then.
 */
export async function ingestTelemetry(db: Db, device: DeviceRow, rows: repo.NewReading[], body: TelemetryRequest, receivedAt: Date): Promise<TelemetryResponse | null> {
  // Within the batch, the first reading for a timestamp wins, like an earlier request would.
  const unique = new Map<number, repo.NewReading>();
  let duplicates = 0;
  let conflicts = 0;
  for (const row of rows) {
    const first = unique.get(row.recordedAt.getTime());
    if (!first) unique.set(row.recordedAt.getTime(), row);
    else if (sameValues(first, row)) duplicates++;
    else conflicts++;
  }

  return db.transaction(async (tx) => {
    if (!(await repo.recordDeviceReport(tx, device.id, device.tokenHash, receivedAt, body.diagnostics ?? {}))) return null;

    const previousLatest = await repo.latestRecordedAt(tx, device.id);
    const inserted = new Set((await repo.insertReadings(tx, device.id, receivedAt, [...unique.values()])).map((d) => d.getTime()));
    await evaluateNewReadings(tx, device, [...unique.values()].filter((row) => inserted.has(row.recordedAt.getTime())), previousLatest);
    const skipped = [...unique.values()].filter((row) => !inserted.has(row.recordedAt.getTime()));
    if (skipped.length) {
      const stored = new Map((await repo.findReadingsAt(tx, device.id, skipped.map((row) => row.recordedAt))).map((row) => [row.recordedAt.getTime(), row]));
      for (const row of skipped) {
        const existing = stored.get(row.recordedAt.getTime());
        if (existing && sameValues(existing, row)) duplicates++;
        else conflicts++;
      }
    }
    return { accepted: inserted.size, duplicates, conflicts };
  });
}

// --- History ---

type HistoryQuery = { from?: string; to?: string; bucket: HistoryBucket; limit: number; cursor?: string };
type Range = { from: Date; before: Date };

/**
 * Cursors are opaque to clients: base64url JSON naming the bucket mode and the `recordedAt` /
 * `bucketStart` of the last item returned. The next page holds items strictly before it.
 */
export function encodeCursor(bucket: HistoryBucket, last: Date): string {
  return Buffer.from(JSON.stringify({ b: bucket, t: last.toISOString() })).toString('base64url');
}

function decodeCursor(cursor: string, bucket: HistoryBucket): Date | null {
  try {
    const parsed: unknown = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
    if (typeof parsed !== 'object' || parsed === null) return null;
    const { b, t } = parsed as { b?: unknown; t?: unknown };
    if (b !== bucket || typeof t !== 'string') return null;
    const date = new Date(t);
    return Number.isNaN(date.getTime()) || date.toISOString() !== t ? null : date;
  } catch {
    return null;
  }
}

/**
 * The half-open range [from, to) to read. `to` defaults to now and `from` to 24 hours before
 * `to`; a request may span at most 31 days. With a cursor, reading resumes just before it.
 */
export function resolveHistoryRange(query: HistoryQuery, now: Date): Range | { issues: Issue[] } {
  const to = query.to ? new Date(query.to) : now;
  const from = query.from ? new Date(query.from) : new Date(to.getTime() - HISTORY_DEFAULT_RANGE_MS);
  if (from >= to) return { issues: [{ path: 'query.from', message: '`from` must be before `to` (which defaults to now).' }] };
  if (to.getTime() - from.getTime() > HISTORY_MAX_RANGE_MS) return { issues: [{ path: 'query.from', message: 'The range may span at most 31 days.' }] };

  let before = to;
  if (query.cursor !== undefined) {
    const after = decodeCursor(query.cursor, query.bucket);
    if (!after) return { issues: [{ path: 'query.cursor', message: 'Not a cursor returned for this bucket.' }] };
    if (after < before) before = after;
  }
  return { from, before };
}

export async function readingHistory(db: Db, deviceId: string, query: HistoryQuery, range: Range): Promise<ReadingHistory> {
  // One extra row tells us whether there is a next page.
  const fetch = query.limit + 1;
  if (query.bucket === 'raw') {
    const rows = await repo.rawHistory(db, deviceId, range.from, range.before, fetch);
    const page = rows.slice(0, query.limit);
    const last = page.at(-1);
    return { deviceId, bucket: 'raw', items: page.map(toApiReading), nextCursor: rows.length > query.limit && last ? encodeCursor('raw', last.recordedAt) : null };
  }

  const rows = await repo.bucketHistory(db, deviceId, query.bucket, range.from, range.before, fetch);
  const page = rows.slice(0, query.limit);
  const last = page.at(-1);
  return {
    deviceId,
    bucket: query.bucket,
    items: page.map((row) => ({ ...row, bucketStart: row.bucketStart.toISOString() })),
    nextCursor: rows.length > query.limit && last ? encodeCursor(query.bucket, last.bucketStart) : null,
  };
}
