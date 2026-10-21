import type { DeviceStatus } from '@nexa/contracts';
import { ONLINE_INTERVALS } from '@nexa/contracts/limits';

/**
 * Derived on the server only, never stored or accepted from clients:
 * - `never_seen`: no authenticated telemetry yet;
 * - `online`: last seen within ONLINE_INTERVALS (3) × the device's reporting interval
 *   (90 s at the default 30 s), so one or two missed reports don't flip it offline;
 * - `offline`: otherwise.
 */
export function deviceStatus(lastSeenAt: Date | null, reportingIntervalS: number, now: Date = new Date()): DeviceStatus {
  if (!lastSeenAt) return 'never_seen';
  const freshnessMs = ONLINE_INTERVALS * reportingIntervalS * 1000;
  return now.getTime() - lastSeenAt.getTime() <= freshnessMs ? 'online' : 'offline';
}
