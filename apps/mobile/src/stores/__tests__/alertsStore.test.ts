import { describe, expect, it, jest } from '@jest/globals';

import type { AlertRule } from '@/domain/types';
import { ALERTS_STORAGE_KEY, ALERTS_STORAGE_VERSION, createAlertsStore, type NewAlertRule } from '@/stores/alertsStore';
import { flush, hydrated, memoryBackend } from '@/test-utils/storage';

const seed: AlertRule[] = [
  { id: 'r1', name: 'Low Temperature Alert', deviceId: 'd1', metric: 'temperature', condition: 'below', threshold: 19.5, duration: '5m', notify: { push: true, inApp: true, sound: false }, enabled: true },
];

const input: NewAlertRule = {
  name: 'High Humidity Warning',
  deviceId: 'd1',
  metric: 'humidity',
  condition: 'above',
  threshold: 60,
  duration: 'immediate',
  notify: { push: false, inApp: true, sound: false },
  enabled: true,
};

const stored = (rules: unknown, version = ALERTS_STORAGE_VERSION) => ({ [ALERTS_STORAGE_KEY]: JSON.stringify({ state: { rules }, version }) });
const savedRules = (backend: ReturnType<typeof memoryBackend>) => JSON.parse(backend.data.get(ALERTS_STORAGE_KEY) ?? 'null')?.state.rules;

async function setup(initial: Record<string, string> = {}, failures?: { failReads?: boolean; failWrites?: boolean }) {
  const backend = memoryBackend(initial, failures);
  const store = createAlertsStore({ backend, seed });
  const status = await hydrated(store);
  return { backend, store, status };
}

describe('alerts store — actions', () => {
  it('adds a rule with a generated id and persists it', async () => {
    const { store, backend } = await setup();
    const rule = store.getState().addRule({ ...input, origin: 'm2' });

    expect(rule).toMatchObject({ ...input, origin: 'm2' });
    expect(rule?.id).toEqual(expect.any(String));
    expect(store.getState().rules).toHaveLength(2);
    await flush();
    expect(savedRules(backend)).toHaveLength(2);
  });

  it('gives each new rule a distinct id', async () => {
    const { store } = await setup();
    const a = store.getState().addRule(input);
    const b = store.getState().addRule(input);
    expect(a?.id).not.toEqual(b?.id);
  });

  it('rejects an invalid rule without changing state', async () => {
    const { store } = await setup();
    expect(store.getState().addRule({ ...input, threshold: Number.NaN })).toBeNull();
    expect(store.getState().addRule({ ...input, threshold: 500 })).toBeNull();
    expect(store.getState().rules).toEqual(seed);
  });

  it('updates a rule and rejects invalid patches or unknown ids', async () => {
    const { store } = await setup();
    expect(store.getState().updateRule('r1', { threshold: 18 })).toBe(true);
    expect(store.getState().rules[0].threshold).toBe(18);

    expect(store.getState().updateRule('r1', { metric: 'pressure' as never })).toBe(false);
    expect(store.getState().updateRule('missing', { threshold: 18 })).toBe(false);
    expect(store.getState().rules[0]).toMatchObject({ metric: 'temperature', threshold: 18 });
  });

  it('toggles a rule on and off', async () => {
    const { store } = await setup();
    expect(store.getState().setRuleEnabled('r1', false)).toBe(true);
    expect(store.getState().rules[0].enabled).toBe(false);
    store.getState().setRuleEnabled('r1', true);
    expect(store.getState().rules[0].enabled).toBe(true);
  });

  it('deletes a rule', async () => {
    const { store } = await setup();
    expect(store.getState().deleteRule('r1')).toBe(true);
    expect(store.getState().rules).toEqual([]);
    expect(store.getState().deleteRule('r1')).toBe(false);
  });
});

describe('alerts store — persistence and hydration', () => {
  it('starts from the seed rules when nothing is stored', async () => {
    const { store, status } = await setup();
    expect(status).toBe('ready');
    expect(store.getState().rules).toEqual(seed);
  });

  it('restores saved rules in a fresh store', async () => {
    const first = await setup();
    const added = first.store.getState().addRule(input);
    first.store.getState().setRuleEnabled('r1', false);
    await flush();

    const second = createAlertsStore({ backend: first.backend, seed });
    await hydrated(second);
    expect(second.getState().rules).toEqual([{ ...seed[0], enabled: false }, added]);
  });

  it('keeps an empty saved list instead of re-seeding', async () => {
    const { store } = await setup(stored([]));
    expect(store.getState().rules).toEqual([]);
  });

  it('drops malformed and duplicate saved rules but keeps valid ones', async () => {
    const { store, backend } = await setup(stored([seed[0], { id: 'bad', metric: 'temperature' }, 'junk', null, { ...seed[0], name: 'dupe' }]));
    expect(store.getState().rules).toEqual(seed);
    await flush();
    expect(savedRules(backend)).toEqual(seed); // cleaned data is written back
  });

  it.each([
    ['not JSON', '{oops'],
    ['not an envelope', JSON.stringify([1, 2, 3])],
    ['rules is not a list', JSON.stringify({ state: { rules: 'nope' }, version: ALERTS_STORAGE_VERSION })],
  ])('falls back to the seed when stored data is %s', async (_label, raw) => {
    const { store, status } = await setup({ [ALERTS_STORAGE_KEY]: raw });
    expect(status).toBe('ready');
    expect(store.getState().rules).toEqual(seed);
  });

  it('validates data saved under a different version', async () => {
    const { store } = await setup(stored([seed[0], { id: 'bad' }], 0));
    expect(store.getState().rules).toEqual(seed);
  });

  it('ignores actions until loading finishes, so they cannot overwrite saved rules', async () => {
    const backend = memoryBackend(stored([seed[0]]));
    const store = createAlertsStore({ backend, seed: [] });

    expect(store.getState().hydration).toBe('pending');
    expect(store.getState().addRule(input)).toBeNull();
    expect(store.getState().deleteRule('r1')).toBe(false);
    expect(backend.writes).toBe(0);

    await hydrated(store);
    expect(store.getState().rules).toEqual(seed);
  });

  it('reports a read failure, keeps working in memory, and never overwrites storage', async () => {
    const original = JSON.stringify({ state: { rules: [seed[0]] }, version: ALERTS_STORAGE_VERSION });
    const { store, status, backend } = await setup({ [ALERTS_STORAGE_KEY]: original }, { failReads: true });

    expect(status).toBe('failed');
    expect(store.getState().addRule(input)).not.toBeNull();
    await flush();
    expect(backend.writes).toBe(0);
    expect(backend.data.get(ALERTS_STORAGE_KEY)).toBe(original);
  });

  it('survives write failures', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const { store, status } = await setup({}, { failWrites: true });
    expect(status).toBe('ready');
    expect(store.getState().addRule(input)).not.toBeNull();
    await flush();
    expect(store.getState().rules).toHaveLength(2);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
