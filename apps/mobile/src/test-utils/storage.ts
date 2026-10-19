import type { HydrationStatus, KeyValueStorage } from '@/stores/persistStorage';

/** In-memory AsyncStorage stand-in. Pass `failReads`/`failWrites` to simulate a broken device store. */
export function memoryBackend(initial: Record<string, string> = {}, { failReads = false, failWrites = false } = {}) {
  const data = new Map(Object.entries(initial));
  const backend: KeyValueStorage & { data: Map<string, string>; writes: number } = {
    data,
    writes: 0,
    async getItem(key) {
      if (failReads) throw new Error('read failed');
      return data.get(key) ?? null;
    },
    async setItem(key, value) {
      backend.writes += 1;
      if (failWrites) throw new Error('write failed');
      data.set(key, value);
    },
    async removeItem(key) {
      data.delete(key);
    },
  };
  return backend;
}

type HydratingStore = {
  getState: () => { hydration: HydrationStatus };
  subscribe: (listener: (state: { hydration: HydrationStatus }) => void) => () => void;
};

/** Resolves with the final status once the store has finished loading from storage. */
export function hydrated(store: HydratingStore): Promise<HydrationStatus> {
  return new Promise((resolve) => {
    const done = store.getState().hydration;
    if (done !== 'pending') return resolve(done);
    const unsubscribe = store.subscribe((state) => {
      if (state.hydration !== 'pending') {
        unsubscribe();
        resolve(state.hydration);
      }
    });
  });
}

/** Lets fire-and-forget writes settle. */
export const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
