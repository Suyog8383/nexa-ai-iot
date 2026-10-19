import { describe, expect, it } from '@jest/globals';
import { renderHook } from '@testing-library/react-native';

import { combine, resolved } from '@/hooks/result';
import { useDevice, useDevices, usePrimaryDevice } from '@/hooks/useDevices';
import { useDeviceActivity, useTodayTrend } from '@/hooks/useTelemetry';

const run = async <T,>(hook: () => T) => (await renderHook(hook)).result.current;

describe('device hooks', () => {
  it('lists devices and finds one by id', async () => {
    const all = await run(useDevices);
    expect(all).toMatchObject({ isLoading: false, error: null });
    expect(all.data?.length).toBeGreaterThan(0);

    const id = all.data![0].id;
    expect((await run(() => useDevice(id))).data?.id).toBe(id);
    expect((await run(usePrimaryDevice)).data?.id).toBe(id);
  });

  it('returns null, not undefined, for an unknown device so screens can tell "missing" from "loading"', async () => {
    expect((await run(() => useDevice('nope'))).data).toBeNull();
    expect((await run(() => useDevice(undefined))).data).toBeNull();
  });
});

describe('telemetry hooks', () => {
  it('returns readings for a known device and empty lists for an unknown one', async () => {
    const id = (await run(usePrimaryDevice)).data!.id;
    expect((await run(() => useTodayTrend(id))).data?.length).toBeGreaterThan(1);
    expect((await run(() => useTodayTrend('nope'))).data).toEqual([]);
    expect((await run(() => useDeviceActivity(undefined))).data).toEqual([]);
  });
});

describe('combine', () => {
  const loading = { data: undefined, isLoading: true, error: null };
  const failed = { data: undefined, isLoading: false, error: new Error('offline') };

  it('is loading if any input is, and surfaces the first error', () => {
    expect(combine(resolved(1), loading)).toEqual({ isLoading: true, error: null });
    expect(combine(resolved(1), failed, loading)).toEqual({ isLoading: true, error: failed.error });
    expect(combine(resolved(1), resolved(2))).toEqual({ isLoading: false, error: null });
  });
});
