import { describe, expect, it } from 'vitest';

import {
  AlertEventListQuery,
  CreateAlertRuleRequest,
  DEVICE_TOKEN_PATTERN,
  DeviceWithToken,
  ReadingHistory,
  ReadingHistoryQuery,
  RegisterDeviceRequest,
  TELEMETRY_BATCH_MAX,
  TelemetryRequest,
  TelemetryResponse,
  UpdateAlertRuleRequest,
} from '../index';

const deviceId = '0b9c3c1e-6f0a-4c51-9b5e-2f6f1d3a8e47';
const reading = { recordedAt: '2026-10-19T08:30:00.000Z', temperatureC: 21.5, humidityPct: 45 };
const issuePaths = (result: { success: boolean; error?: { issues: { path: PropertyKey[] }[] } }) => result.error?.issues.map((i) => i.path.join('.'));

describe('device registration', () => {
  it('applies the default reporting interval and trims names', () => {
    expect(RegisterDeviceRequest.parse({ name: ' Living Room Monitor ', room: 'Living Room', board: 'ESP32', sensor: 'BME280' })).toEqual({
      name: 'Living Room Monitor',
      room: 'Living Room',
      board: 'ESP32',
      sensor: 'BME280',
      reportingIntervalS: 30,
    });
  });

  it.each([
    ['an unsupported board', { board: 'ESP8266' }],
    ['an unsupported sensor', { sensor: 'DHT22' }],
    ['an empty name', { name: '   ' }],
    ['an interval below 10 s', { reportingIntervalS: 5 }],
    ['unknown fields', { secret: 'x' }],
  ])('rejects %s', (_label, patch) => {
    expect(RegisterDeviceRequest.safeParse({ name: 'Monitor', room: 'Living Room', board: 'ESP32', sensor: 'BME280', ...patch }).success).toBe(false);
  });
});

describe('device tokens', () => {
  const secret = 'A'.repeat(43);

  it('accepts nxd_<uuid>.<43 base64url chars>', () => {
    expect(DEVICE_TOKEN_PATTERN.test(`nxd_${deviceId}.${secret}`)).toBe(true);
  });

  it.each([`nxd_${deviceId}.${secret}x`, `nxd_${deviceId}.${'A'.repeat(42)}`, `nxd_not-a-uuid.${secret}`, `${deviceId}.${secret}`, `nxd_${deviceId}.${'+'.repeat(43)}`])(
    'rejects %s',
    (token) => {
      expect(DEVICE_TOKEN_PATTERN.test(token)).toBe(false);
    },
  );

  it('is part of the registration response', () => {
    const device = { id: deviceId, name: 'M', room: 'R', board: 'ESP32', sensor: 'BME280', reportingIntervalS: 30, createdAt: reading.recordedAt, lastSeenAt: null, status: 'never_seen', latestReading: null, diagnostics: null };
    expect(DeviceWithToken.safeParse({ device, deviceToken: `nxd_${deviceId}.${secret}` }).success).toBe(true);
    expect(DeviceWithToken.safeParse({ device, deviceToken: 'plain-secret' }).success).toBe(false);
  });
});

describe('telemetry ingestion', () => {
  it('accepts a batch, with or without device timestamps and diagnostics', () => {
    const { recordedAt: _omit, ...noTime } = reading;
    expect(TelemetryRequest.safeParse({ readings: [reading, noTime], diagnostics: { rssiDbm: -62, firmwareVersion: '0.1.0', uptimeS: 3600 } }).success).toBe(true);
  });

  it.each([
    ['temperature above the BME280 range', { temperatureC: 85.1 }, 'readings.0.temperatureC'],
    ['temperature below the BME280 range', { temperatureC: -40.1 }, 'readings.0.temperatureC'],
    ['humidity above 100 %', { humidityPct: 100.5 }, 'readings.0.humidityPct'],
    ['a non-numeric value', { humidityPct: '45' }, 'readings.0.humidityPct'],
    ['a non-UTC timestamp', { recordedAt: '2026-10-19T14:00:00+05:30' }, 'readings.0.recordedAt'],
    ['a device id in the body', { deviceId }, 'readings.0'],
  ])('rejects %s', (_label, patch, path) => {
    expect(issuePaths(TelemetryRequest.safeParse({ readings: [{ ...reading, ...patch }] }))).toContain(path);
  });

  it('rejects empty and oversized batches', () => {
    expect(TelemetryRequest.safeParse({ readings: [] }).success).toBe(false);
    expect(TelemetryRequest.safeParse({ readings: Array(TELEMETRY_BATCH_MAX + 1).fill(reading) }).success).toBe(false);
  });

  it.each([
    ['an impossible RSSI', { rssiDbm: 10 }],
    ['a firmware version with control characters', { firmwareVersion: '0.1.0\n' }],
    ['uptime beyond a 32-bit integer', { uptimeS: 2 ** 31 }],
  ])('rejects %s in diagnostics', (_label, diagnostics) => {
    expect(TelemetryRequest.safeParse({ readings: [reading], diagnostics }).success).toBe(false);
  });

  it('reports accepted, duplicate and conflicting readings', () => {
    expect(TelemetryResponse.safeParse({ accepted: 2, duplicates: 1, conflicts: 0 }).success).toBe(true);
    expect(TelemetryResponse.safeParse({ accepted: 2, duplicates: 1 }).success).toBe(false);
  });
});

describe('reading history', () => {
  it('defaults to raw readings, 100 per page, and coerces query-string numbers', () => {
    expect(ReadingHistoryQuery.parse({ limit: '50' })).toEqual({ bucket: 'raw', limit: 50 });
    expect(ReadingHistoryQuery.parse({})).toEqual({ bucket: 'raw', limit: 100 });
  });

  it('rejects an inverted range, unknown buckets and oversized pages', () => {
    expect(ReadingHistoryQuery.safeParse({ from: '2026-10-19T10:00:00.000Z', to: '2026-10-19T09:00:00.000Z' }).success).toBe(false);
    expect(ReadingHistoryQuery.safeParse({ bucket: '1d' }).success).toBe(false);
    expect(ReadingHistoryQuery.safeParse({ limit: '501' }).success).toBe(false);
  });

  it('shapes items by bucket', () => {
    const stored = { ...reading, receivedAt: reading.recordedAt };
    const bucket = { bucketStart: reading.recordedAt, temperatureC: { min: 21, avg: 21.5, max: 22 }, humidityPct: { min: 44, avg: 45, max: 46 }, count: 10 };
    expect(ReadingHistory.safeParse({ deviceId, bucket: 'raw', items: [stored], nextCursor: null }).success).toBe(true);
    expect(ReadingHistory.safeParse({ deviceId, bucket: '5m', items: [bucket], nextCursor: 'c1' }).success).toBe(true);
    expect(ReadingHistory.safeParse({ deviceId, bucket: '5m', items: [stored], nextCursor: null }).success).toBe(false);
  });
});

describe('alert rules', () => {
  const rule = { deviceId, name: 'Low Temperature Alert', metric: 'temperature', condition: 'below', threshold: 19.5, durationS: 300, notify: { push: true, inApp: true, sound: false } } as const;

  it('creates an enabled rule by default', () => {
    expect(CreateAlertRuleRequest.parse(rule).enabled).toBe(true);
  });

  it('uses the same threshold bounds as the app stepper', () => {
    expect(CreateAlertRuleRequest.safeParse({ ...rule, threshold: 5 }).success).toBe(true);
    expect(CreateAlertRuleRequest.safeParse({ ...rule, threshold: 4.5 }).success).toBe(false);
    expect(CreateAlertRuleRequest.safeParse({ ...rule, metric: 'humidity', threshold: 19.5 }).success).toBe(true);
    expect(issuePaths(CreateAlertRuleRequest.safeParse({ ...rule, metric: 'humidity', threshold: 95 }))).toContain('threshold');
  });

  it.each([
    ['an unsupported duration', { durationS: 60 }],
    ['an unsupported metric', { metric: 'pressure' }],
    ['partial notify prefs', { notify: { push: true } }],
  ])('rejects %s', (_label, patch) => {
    expect(CreateAlertRuleRequest.safeParse({ ...rule, ...patch }).success).toBe(false);
  });

  it('updates any subset of editable fields but not the device or origin', () => {
    expect(UpdateAlertRuleRequest.safeParse({ enabled: false }).success).toBe(true);
    expect(UpdateAlertRuleRequest.safeParse({}).success).toBe(false);
    expect(UpdateAlertRuleRequest.safeParse({ deviceId }).success).toBe(false);
    expect(UpdateAlertRuleRequest.safeParse({ origin: 'm2' }).success).toBe(false);
    expect(UpdateAlertRuleRequest.safeParse({ metric: 'humidity', threshold: 95 }).success).toBe(false);
  });
});

describe('alert events', () => {
  it('lists all events, newest first, by default', () => {
    expect(AlertEventListQuery.parse({})).toEqual({ status: 'all', limit: 100 });
  });
});
