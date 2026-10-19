import type { DeviceStatus, StatusKind } from '@/data/types';

export function statusBadge(status: DeviceStatus): { label: string; kind: StatusKind } {
  switch (status) {
    case 'online':
      return { label: 'Online', kind: 'success' };
    case 'warning':
      return { label: 'Degraded', kind: 'warning' };
    case 'offline':
      return { label: 'Offline', kind: 'danger' };
  }
}
