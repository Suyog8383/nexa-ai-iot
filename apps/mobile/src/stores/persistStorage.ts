import AsyncStorage from '@react-native-async-storage/async-storage';
import type { PersistStorage, StorageValue } from 'zustand/middleware';

/** The subset of AsyncStorage the stores use; tests pass an in-memory or failing fake. */
export type KeyValueStorage = {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
  removeItem: (key: string) => Promise<void>;
};

export const defaultBackend: KeyValueStorage = AsyncStorage;

export type HydrationStatus = 'pending' | 'ready' | 'failed';

type Options<S> = {
  /** Read once when the store's own key is empty, e.g. to carry over a value saved under an older key. */
  fallback?: (backend: KeyValueStorage) => Promise<StorageValue<S> | null>;
};

/**
 * JSON storage for zustand `persist` that never takes the app down:
 * - unparseable or non-envelope data reads as "nothing stored", so the store keeps its defaults;
 * - a failing read rejects (the store reports `failed`) and switches writes off for the session,
 *   so in-memory defaults never overwrite data that exists but couldn't be read;
 * - write failures are logged, not thrown.
 */
export function createSafeStorage<S>(backend: KeyValueStorage, options: Options<S> = {}): PersistStorage<S, Promise<void>> {
  let readFailed = false;

  return {
    async getItem(name) {
      let raw: string | null;
      try {
        raw = await backend.getItem(name);
      } catch (error) {
        readFailed = true;
        throw error;
      }
      if (raw == null) return options.fallback ? options.fallback(backend).catch(() => null) : null;
      try {
        const parsed: unknown = JSON.parse(raw);
        return isEnvelope<S>(parsed) ? parsed : null;
      } catch {
        return null;
      }
    },
    async setItem(name, value) {
      if (readFailed) return;
      try {
        await backend.setItem(name, JSON.stringify(value));
      } catch (error) {
        console.warn(`[nexa] could not save ${name}`, error);
      }
    },
    async removeItem(name) {
      try {
        await backend.removeItem(name);
      } catch (error) {
        console.warn(`[nexa] could not clear ${name}`, error);
      }
    },
  };
}

function isEnvelope<S>(value: unknown): value is StorageValue<S> {
  return typeof value === 'object' && value !== null && 'state' in value;
}
