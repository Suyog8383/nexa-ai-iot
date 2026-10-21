import { describe, expect, it } from 'vitest';

import { deviceStatus } from './status';

const now = new Date('2026-10-19T12:00:00.000Z');
const ago = (ms: number) => new Date(now.getTime() - ms);

describe('deviceStatus', () => {
  it('is never_seen before any telemetry', () => {
    expect(deviceStatus(null, 30, now)).toBe('never_seen');
  });

  it('is online within 3 reporting intervals (90 s at the 30 s default), inclusive', () => {
    expect(deviceStatus(ago(10_000), 30, now)).toBe('online');
    expect(deviceStatus(ago(90_000), 30, now)).toBe('online');
  });

  it('is offline once the window has passed', () => {
    expect(deviceStatus(ago(90_001), 30, now)).toBe('offline');
    expect(deviceStatus(ago(24 * 3600_000), 30, now)).toBe('offline');
  });

  it('scales with the device reporting interval', () => {
    expect(deviceStatus(ago(170_000), 60, now)).toBe('online');
    expect(deviceStatus(ago(181_000), 60, now)).toBe('offline');
  });

  it('treats a last-seen time slightly in the future (clock skew) as online', () => {
    expect(deviceStatus(new Date(now.getTime() + 5_000), 30, now)).toBe('online');
  });
});
