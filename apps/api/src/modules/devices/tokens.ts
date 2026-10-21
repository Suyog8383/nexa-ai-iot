import { randomBytes } from 'node:crypto';

import { DEVICE_TOKEN_PATTERN } from '@nexa/contracts/limits';

import { sha256 } from '../../shared/auth';

const PREFIX = 'nxd_';

/**
 * A new device token: `nxd_<device id>.<base64url of 32 random bytes>` (256 bits of entropy).
 * The id lets the server find the device before comparing hashes; only `hash` is stored.
 */
export function generateDeviceToken(deviceId: string): { token: string; hash: Buffer } {
  const token = `${PREFIX}${deviceId}.${randomBytes(32).toString('base64url')}`;
  return { token, hash: sha256(token) };
}

/** The device id inside a well-formed token, or null. Says nothing about whether the token is valid. */
export function deviceIdFromToken(token: string): string | null {
  if (!DEVICE_TOKEN_PATTERN.test(token)) return null;
  return token.slice(PREFIX.length, token.indexOf('.'));
}
