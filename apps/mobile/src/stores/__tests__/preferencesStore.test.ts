import { describe, expect, it } from '@jest/globals';

import { createPreferencesStore, LEGACY_THEME_KEY, PREFERENCES_STORAGE_KEY, PREFERENCES_STORAGE_VERSION } from '@/stores/preferencesStore';
import { flush, hydrated, memoryBackend } from '@/test-utils/storage';
import { resolveScheme } from '@/theme/useTheme';

const stored = (state: unknown) => ({ [PREFERENCES_STORAGE_KEY]: JSON.stringify({ state, version: PREFERENCES_STORAGE_VERSION }) });

async function setup(initial: Record<string, string> = {}, failures?: { failReads?: boolean }) {
  const backend = memoryBackend(initial, failures);
  const store = createPreferencesStore({ backend });
  const status = await hydrated(store);
  return { backend, store, status };
}

describe('preferences store', () => {
  it('follows the system theme by default', async () => {
    const { store, status } = await setup();
    expect(status).toBe('ready');
    expect(store.getState().themePreference).toBe('system');
  });

  it('persists the theme override across a fresh store', async () => {
    const first = await setup();
    first.store.getState().setThemePreference('light');
    await flush();

    const second = createPreferencesStore({ backend: first.backend });
    await hydrated(second);
    expect(second.getState().themePreference).toBe('light');
  });

  it('carries over a preference saved under the old key', async () => {
    const { store } = await setup({ [LEGACY_THEME_KEY]: 'dark' });
    expect(store.getState().themePreference).toBe('dark');
  });

  it('prefers the current key over the old one', async () => {
    const { store } = await setup({ ...stored({ themePreference: 'light' }), [LEGACY_THEME_KEY]: 'dark' });
    expect(store.getState().themePreference).toBe('light');
  });

  it.each([
    ['an unknown value', stored({ themePreference: 'sepia' })],
    ['a missing field', stored({})],
    ['corrupt JSON', { [PREFERENCES_STORAGE_KEY]: '{oops' }],
    ['a corrupt legacy value', { [LEGACY_THEME_KEY]: 'sepia' }],
  ])('falls back to system for %s', async (_label, initial) => {
    const { store, status } = await setup(initial);
    expect(status).toBe('ready');
    expect(store.getState().themePreference).toBe('system');
  });

  it('ignores invalid values passed at runtime', async () => {
    const { store } = await setup();
    store.getState().setThemePreference('sepia' as never);
    expect(store.getState().themePreference).toBe('system');
  });

  it('ignores changes made before loading finishes', async () => {
    const backend = memoryBackend(stored({ themePreference: 'dark' }));
    const store = createPreferencesStore({ backend });
    store.getState().setThemePreference('light');
    expect(backend.writes).toBe(0);
    await hydrated(store);
    expect(store.getState().themePreference).toBe('dark');
  });

  it('reports a read failure and keeps the default without overwriting storage', async () => {
    const { store, status, backend } = await setup(stored({ themePreference: 'dark' }), { failReads: true });
    expect(status).toBe('failed');
    expect(store.getState().themePreference).toBe('system');
    store.getState().setThemePreference('light');
    await flush();
    expect(store.getState().themePreference).toBe('light');
    expect(backend.writes).toBe(0);
  });
});

describe('resolveScheme', () => {
  it('uses the override when set', () => {
    expect(resolveScheme('light', 'dark')).toBe('light');
    expect(resolveScheme('dark', 'light')).toBe('dark');
  });

  it('follows the device in system mode, defaulting to dark when unknown', () => {
    expect(resolveScheme('system', 'light')).toBe('light');
    expect(resolveScheme('system', 'dark')).toBe('dark');
    expect(resolveScheme('system', null)).toBe('dark');
    expect(resolveScheme('system', undefined)).toBe('dark');
  });
});
