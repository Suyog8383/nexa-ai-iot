import { useAlertsStore } from './alertsStore';
import { usePreferencesStore } from './preferencesStore';

/** True once every persisted store has finished loading (or given up after a storage error). */
export function useStoresHydrated(): boolean {
  const alerts = useAlertsStore((s) => s.hydration);
  const preferences = usePreferencesStore((s) => s.hydration);
  return alerts !== 'pending' && preferences !== 'pending';
}
