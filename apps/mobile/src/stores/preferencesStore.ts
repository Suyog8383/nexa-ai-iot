import { persist } from 'zustand/middleware';
import { useStore } from 'zustand';
import { createStore } from 'zustand/vanilla';

import { createSafeStorage, defaultBackend, type HydrationStatus, type KeyValueStorage } from './persistStorage';

export const PREFERENCES_STORAGE_KEY = 'nexa.preferences';
export const PREFERENCES_STORAGE_VERSION = 1;
/** Where ThemeProvider saved the bare preference string before the stores existed. */
export const LEGACY_THEME_KEY = 'nexa.themePreference';

export type ThemePreference = 'system' | 'light' | 'dark';

type PersistedPreferences = { themePreference: ThemePreference };

export type PreferencesState = PersistedPreferences & {
  /** Not persisted. `setThemePreference` is ignored while `pending`. */
  hydration: HydrationStatus;
  setThemePreference: (preference: ThemePreference) => void;
};

const DEFAULTS: PersistedPreferences = { themePreference: 'system' };

export function isThemePreference(value: unknown): value is ThemePreference {
  return value === 'system' || value === 'light' || value === 'dark';
}

function readPreferences(persisted: unknown, fallback: PersistedPreferences): PersistedPreferences {
  const themePreference = typeof persisted === 'object' && persisted !== null ? (persisted as PersistedPreferences).themePreference : undefined;
  return { themePreference: isThemePreference(themePreference) ? themePreference : fallback.themePreference };
}

export function createPreferencesStore({ backend = defaultBackend }: { backend?: KeyValueStorage } = {}) {
  const store = createStore<PreferencesState>()(
    persist(
      (set, get) => ({
        ...DEFAULTS,
        hydration: 'pending',
        // Ignored while loading: hydration would overwrite it with the stored value anyway.
        setThemePreference: (themePreference) => {
          if (get().hydration !== 'pending' && isThemePreference(themePreference)) set({ themePreference });
        },
      }),
      {
        name: PREFERENCES_STORAGE_KEY,
        version: PREFERENCES_STORAGE_VERSION,
        storage: createSafeStorage<PersistedPreferences>(backend, {
          fallback: async (b) => {
            const legacy = await b.getItem(LEGACY_THEME_KEY);
            return isThemePreference(legacy) ? { state: { themePreference: legacy }, version: PREFERENCES_STORAGE_VERSION } : null;
          },
        }),
        partialize: (state) => ({ themePreference: state.themePreference }),
        migrate: (persisted) => readPreferences(persisted, DEFAULTS),
        merge: (persisted, current) => ({ ...current, ...readPreferences(persisted, current) }),
        onRehydrateStorage: () => (_state, error) => {
          store.setState({ hydration: error ? 'failed' : 'ready' });
        },
      },
    ),
  );
  return store;
}

export type PreferencesStore = ReturnType<typeof createPreferencesStore>;

export const preferencesStore = createPreferencesStore();

export function usePreferencesStore<T>(selector: (state: PreferencesState) => T): T {
  return useStore(preferencesStore, selector);
}
