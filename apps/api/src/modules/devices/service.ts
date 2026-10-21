import { randomUUID } from 'node:crypto';

import type { Device, RegisterDeviceRequest } from '@nexa/contracts';

import type { Database } from '../../db/client';
import type { DeviceRow } from '../../db/schema';
import { matchesHash } from '../../shared/auth';

import * as repo from './repo';
import { deviceStatus } from './status';
import { deviceIdFromToken, generateDeviceToken } from './tokens';

type Db = Database['db'];

/** The API shape. Never includes the token hash. */
export function toApiDevice(row: DeviceRow, now: Date = new Date()): Device {
  const hasDiagnostics = row.lastRssiDbm !== null || row.firmwareVersion !== null || row.uptimeS !== null;
  return {
    id: row.id,
    name: row.name,
    room: row.room,
    board: row.board as Device['board'],
    sensor: row.sensor as Device['sensor'],
    reportingIntervalS: row.reportingIntervalS,
    createdAt: row.createdAt.toISOString(),
    lastSeenAt: row.lastSeenAt?.toISOString() ?? null,
    status: deviceStatus(row.lastSeenAt, row.reportingIntervalS, now),
    // Readings arrive in a later PR.
    latestReading: null,
    diagnostics: hasDiagnostics
      ? {
          ...(row.lastRssiDbm !== null && { rssiDbm: row.lastRssiDbm }),
          ...(row.firmwareVersion !== null && { firmwareVersion: row.firmwareVersion }),
          ...(row.uptimeS !== null && { uptimeS: row.uptimeS }),
        }
      : null,
  };
}

/** Registers a device and returns its token. The plaintext token exists only in this return value. */
export async function registerDevice(db: Db, input: Required<RegisterDeviceRequest>) {
  const id = randomUUID();
  const { token, hash } = generateDeviceToken(id);
  const row = await repo.insertDevice(db, { id, ...input, tokenHash: hash });
  return { device: toApiDevice(row), deviceToken: token };
}

/** Issues a replacement token; the old one is rejected from now on. Null if the device doesn't exist. */
export async function rotateDeviceToken(db: Db, id: string) {
  const { token, hash } = generateDeviceToken(id);
  const row = await repo.replaceTokenHash(db, id, hash);
  return row ? { device: toApiDevice(row), deviceToken: token } : null;
}

/**
 * The device a token belongs to, or null if the token is malformed, unknown, revoked or replaced.
 * Used by telemetry ingestion (next PR). Comparison is constant-time.
 */
export async function authenticateDevice(db: Db, token: string): Promise<DeviceRow | null> {
  const id = deviceIdFromToken(token);
  if (!id) return null;
  const row = await repo.findDevice(db, id);
  if (!row || row.revokedAt) return null;
  return matchesHash(token, row.tokenHash) ? row : null;
}
