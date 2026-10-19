import { z } from 'zod';

import { Id, Timestamp } from './common';
import { DEVICE_TOKEN_PATTERN, REPORTING_INTERVAL_S } from './limits';
import { Diagnostics, Reading } from './telemetry';

export const DeviceStatus = z.enum(['online', 'offline', 'never_seen']);
export type DeviceStatus = z.infer<typeof DeviceStatus>;

export const Device = z.object({
  id: Id,
  name: z.string(),
  room: z.string(),
  board: z.literal('ESP32'),
  sensor: z.literal('BME280'),
  reportingIntervalS: z.number().int(),
  createdAt: Timestamp,
  lastSeenAt: Timestamp.nullable(),
  /** `online` = reported within `ONLINE_INTERVALS` × `reportingIntervalS`. */
  status: DeviceStatus,
  latestReading: Reading.nullable(),
  diagnostics: Diagnostics.nullable(),
});
export type Device = z.infer<typeof Device>;

/** POST /v1/devices */
export const RegisterDeviceRequest = z.strictObject({
  name: z.string().trim().min(1).max(60),
  room: z.string().trim().min(1).max(40),
  board: z.literal('ESP32'),
  sensor: z.literal('BME280'),
  reportingIntervalS: z.number().int().min(REPORTING_INTERVAL_S.min).max(REPORTING_INTERVAL_S.max).default(REPORTING_INTERVAL_S.default),
});
export type RegisterDeviceRequest = z.input<typeof RegisterDeviceRequest>;

export const DeviceToken = z.string().regex(DEVICE_TOKEN_PATTERN);

/** 201 from POST /v1/devices and 200 from POST /v1/devices/:id/token. The token is never returned again. */
export const DeviceWithToken = z.object({ device: Device, deviceToken: DeviceToken });
export type DeviceWithToken = z.infer<typeof DeviceWithToken>;

/** GET /v1/devices */
export const DeviceList = z.object({ items: z.array(Device) });
export type DeviceList = z.infer<typeof DeviceList>;
