import { createHash, randomUUID } from 'node:crypto';

import { DeviceToken } from '@nexa/contracts';
import { describe, expect, it } from 'vitest';

import { deviceIdFromToken, generateDeviceToken } from './tokens';

describe('device tokens', () => {
  const id = randomUUID();

  it('use the contract format, embed the device id and carry 256 bits of randomness', () => {
    const { token } = generateDeviceToken(id);
    expect(DeviceToken.safeParse(token).success).toBe(true);
    expect(token.startsWith(`nxd_${id}.`)).toBe(true);
    expect(Buffer.from(token.split('.')[1] ?? '', 'base64url')).toHaveLength(32);
  });

  it('are unique', () => {
    const tokens = new Set(Array.from({ length: 1000 }, () => generateDeviceToken(id).token));
    expect(tokens.size).toBe(1000);
  });

  it('come with their SHA-256 digest, which is all that gets stored', () => {
    const { token, hash } = generateDeviceToken(id);
    expect(hash).toEqual(createHash('sha256').update(token).digest());
    expect(hash).toHaveLength(32);
  });

  it('expose the device id only for well-formed tokens', () => {
    expect(deviceIdFromToken(generateDeviceToken(id).token)).toBe(id);
    expect(deviceIdFromToken(`nxd_${id}`)).toBeNull();
    expect(deviceIdFromToken(`nxd_${id}.short`)).toBeNull();
    expect(deviceIdFromToken('Bearer something')).toBeNull();
    expect(deviceIdFromToken('')).toBeNull();
  });
});
