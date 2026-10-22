import { describe, expect, it } from 'vitest';

import { encodeCursor, prepareReadings, resolveHistoryRange } from './service';

const now = new Date('2026-10-21T12:00:00.000Z');
const offset = (ms: number) => new Date(now.getTime() + ms).toISOString();
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

describe('prepareReadings', () => {
  const at = (ms: number) => [{ recordedAt: offset(ms), temperatureC: 21, humidityPct: 45 }];

  it.each([
    ['exactly 2 minutes ahead', 2 * MINUTE, true],
    ['2 minutes and 1 ms ahead', 2 * MINUTE + 1, false],
    ['exactly 24 hours old', -24 * HOUR, true],
    ['24 hours and 1 ms old', -24 * HOUR - 1, false],
  ])('a reading %s is accepted: %s', (_label, ms, accepted) => {
    expect('rows' in prepareReadings(at(ms), now)).toBe(accepted);
  });

  it('stamps a reading without recordedAt with the receive time', () => {
    expect(prepareReadings([{ temperatureC: 21, humidityPct: 45 }], now)).toEqual({ rows: [{ recordedAt: now, temperatureC: 21, humidityPct: 45 }] });
  });

  it('reports every bad reading, not just the first', () => {
    const result = prepareReadings([...at(-25 * HOUR), ...at(-MINUTE), ...at(10 * MINUTE)], now);
    expect('issues' in result && result.issues.map((i) => i.path)).toEqual(['readings.0.recordedAt', 'readings.2.recordedAt']);
  });
});

describe('resolveHistoryRange', () => {
  const query = { bucket: 'raw' as const, limit: 100 };

  it('defaults to the 24 hours before now', () => {
    expect(resolveHistoryRange(query, now)).toEqual({ from: new Date(offset(-24 * HOUR)), before: now });
  });

  it('defaults from to 24 hours before an explicit to', () => {
    expect(resolveHistoryRange({ ...query, to: offset(-HOUR) }, now)).toEqual({ from: new Date(offset(-25 * HOUR)), before: new Date(offset(-HOUR)) });
  });

  it('allows exactly 31 days and rejects more', () => {
    const days = (n: number) => n * 24 * HOUR;
    expect('from' in resolveHistoryRange({ ...query, from: offset(-days(31)), to: offset(0) }, now)).toBe(true);
    expect('issues' in resolveHistoryRange({ ...query, from: offset(-days(31) - 1), to: offset(0) }, now)).toBe(true);
  });

  it('resumes before the cursor, but never past `to`', () => {
    const range = { ...query, from: offset(-2 * HOUR), to: offset(-HOUR) };
    expect(resolveHistoryRange({ ...range, cursor: encodeCursor('raw', new Date(offset(-90 * MINUTE))) }, now)).toMatchObject({ before: new Date(offset(-90 * MINUTE)) });
    expect(resolveHistoryRange({ ...range, cursor: encodeCursor('raw', now) }, now)).toMatchObject({ before: new Date(offset(-HOUR)) });
  });

  it.each([
    ['garbage', 'not-a-cursor'],
    ['another bucket mode', encodeCursor('5m', now)],
    ['a non-canonical time', Buffer.from(JSON.stringify({ b: 'raw', t: '2026-10-21' })).toString('base64url')],
    ['JSON that is not an object', Buffer.from('42').toString('base64url')],
  ])('rejects a cursor that is %s', (_label, cursor) => {
    expect(resolveHistoryRange({ ...query, cursor }, now)).toEqual({ issues: [{ path: 'query.cursor', message: expect.any(String) }] });
  });
});
