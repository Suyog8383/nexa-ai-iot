import { persist } from 'zustand/middleware';
import { useStore } from 'zustand';
import { createStore } from 'zustand/vanilla';

import { initialRules } from '@/mocks/fixtures';
import { parseAlertRule } from '@/domain/rules';
import type { AlertRule } from '@/domain/types';

import { createSafeStorage, defaultBackend, type HydrationStatus, type KeyValueStorage } from './persistStorage';

export const ALERTS_STORAGE_KEY = 'nexa.alerts';
export const ALERTS_STORAGE_VERSION = 1;

export type NewAlertRule = Omit<AlertRule, 'id'>;
export type AlertRulePatch = Partial<Omit<AlertRule, 'id'>>;

type PersistedAlerts = { rules: AlertRule[] };

export type AlertsState = PersistedAlerts & {
  /** Not persisted. Actions are ignored while `pending` so they can't race the stored rules. */
  hydration: HydrationStatus;
  /** Returns the saved rule, or null if the input is invalid or the store hasn't loaded yet. */
  addRule: (input: NewAlertRule) => AlertRule | null;
  /** Returns false if the rule doesn't exist, the result would be invalid, or the store hasn't loaded. */
  updateRule: (id: string, patch: AlertRulePatch) => boolean;
  deleteRule: (id: string) => boolean;
  setRuleEnabled: (id: string, enabled: boolean) => boolean;
};

/** Stored rules, keeping only well-formed ones. A missing or non-array `rules` falls back to the seed. */
function readRules(persisted: unknown, fallback: AlertRule[]): AlertRule[] {
  if (typeof persisted !== 'object' || persisted === null || !Array.isArray((persisted as PersistedAlerts).rules)) return fallback;
  const seen = new Set<string>();
  return (persisted as PersistedAlerts).rules.flatMap((value) => {
    const rule = parseAlertRule(value);
    if (!rule || seen.has(rule.id)) return [];
    seen.add(rule.id);
    return [rule];
  });
}

function newRuleId(): string {
  return `r-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function createAlertsStore({ backend = defaultBackend, seed = initialRules }: { backend?: KeyValueStorage; seed?: AlertRule[] } = {}) {
  const store = createStore<AlertsState>()(
    persist(
      (set, get) => {
        const loaded = () => get().hydration !== 'pending';

        return {
          rules: seed,
          hydration: 'pending',

          addRule: (input) => {
            if (!loaded()) return null;
            const rule = parseAlertRule({ ...input, id: newRuleId() });
            if (!rule) return null;
            set({ rules: [...get().rules, rule] });
            return rule;
          },

          updateRule: (id, patch) => {
            if (!loaded()) return false;
            const current = get().rules.find((r) => r.id === id);
            const next = current && parseAlertRule({ ...current, ...patch, id });
            if (!next) return false;
            set({ rules: get().rules.map((r) => (r.id === id ? next : r)) });
            return true;
          },

          deleteRule: (id) => {
            if (!loaded() || !get().rules.some((r) => r.id === id)) return false;
            set({ rules: get().rules.filter((r) => r.id !== id) });
            return true;
          },

          setRuleEnabled: (id, enabled) => get().updateRule(id, { enabled }),
        };
      },
      {
        name: ALERTS_STORAGE_KEY,
        version: ALERTS_STORAGE_VERSION,
        storage: createSafeStorage<PersistedAlerts>(backend),
        partialize: (state) => ({ rules: state.rules }),
        // No earlier versions exist yet; anything older or newer is validated like current data.
        migrate: (persisted) => ({ rules: readRules(persisted, seed) }),
        merge: (persisted, current) => ({ ...current, rules: readRules(persisted, current.rules) }),
        onRehydrateStorage: () => (_state, error) => {
          store.setState({ hydration: error ? 'failed' : 'ready' });
        },
      },
    ),
  );
  return store;
}

export type AlertsStore = ReturnType<typeof createAlertsStore>;

export const alertsStore = createAlertsStore();

export function useAlertsStore<T>(selector: (state: AlertsState) => T): T {
  return useStore(alertsStore, selector);
}
