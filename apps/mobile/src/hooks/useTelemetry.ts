import type { ActivityItem, TrendPoint } from '@/domain/types';
import { activityByDevice, homeActivity, trendsByDevice } from '@/mocks/fixtures';

import { resolved, type DataResult } from './result';

/** Today's temperature/humidity readings for a device, oldest first. Empty when there are none. */
export function useTodayTrend(deviceId: string | undefined): DataResult<TrendPoint[]> {
  return resolved((deviceId && trendsByDevice[deviceId]) || []);
}

/** Recent events across the home (Home dashboard). */
export function useHomeActivity(): DataResult<ActivityItem[]> {
  return resolved(homeActivity);
}

/** Recent events for one device (Device Details). */
export function useDeviceActivity(deviceId: string | undefined): DataResult<ActivityItem[]> {
  return resolved((deviceId && activityByDevice[deviceId]) || []);
}
