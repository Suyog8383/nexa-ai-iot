import type { Device } from '@/domain/types';
import { devices } from '@/mocks/fixtures';

import { resolved, type DataResult } from './result';

export function useDevices(): DataResult<Device[]> {
  return resolved(devices);
}

/** `data` is `null` when no device has this id. */
export function useDevice(id: string | undefined): DataResult<Device | null> {
  return resolved(devices.find((d) => d.id === id) ?? null);
}

/**
 * The device the Home dashboard and Create Alert Rule are about. The MVP has a single sensor;
 * this is the one place to change when there's a real "selected device".
 */
export function usePrimaryDevice(): DataResult<Device | null> {
  return resolved(devices[0] ?? null);
}
