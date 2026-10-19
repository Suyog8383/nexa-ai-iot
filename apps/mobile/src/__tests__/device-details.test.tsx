import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render as rtlRender, screen } from '@testing-library/react-native';
import type { ReactElement, ReactNode } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import DeviceDetailsScreen from '@/app/device/[id]';
import { TrendChart } from '@/components/ui/TrendChart';

const mockBack = jest.fn();
let mockParams: Record<string, string> = {};

jest.mock('expo-router', () => ({
  useRouter: () => ({ back: mockBack, push: jest.fn() }),
  useLocalSearchParams: () => mockParams,
}));

const metrics = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 47, left: 0, right: 0, bottom: 34 } };
const Providers = ({ children }: { children: ReactNode }) => <SafeAreaProvider initialMetrics={metrics}>{children}</SafeAreaProvider>;
const render = (ui: ReactElement) => rtlRender(ui, { wrapper: Providers });

beforeEach(() => {
  mockBack.mockClear();
});

describe('Device Details', () => {
  it('shows the device from the route id', async () => {
    mockParams = { id: 'living-room-monitor' };
    await render(<DeviceDetailsScreen />);
    expect(screen.getAllByText('Living Room Monitor', { exact: false })).not.toHaveLength(0);
    expect(screen.queryByText('Device not found')).toBeNull();
  });

  it('shows a not-found state with a way back for an unknown id', async () => {
    mockParams = { id: 'nope' };
    await render(<DeviceDetailsScreen />);
    expect(screen.getByText('Device not found')).toBeTruthy();
    await fireEvent.press(screen.getByText('Back to Devices'));
    expect(mockBack).toHaveBeenCalledTimes(1);
  });
});

describe('TrendChart', () => {
  it.each([[[]], [[21.5]]])('shows a note instead of a curve for %j', async (values) => {
    await render(<TrendChart values={values} labels={['Now']} />);
    expect(screen.getByText('Not enough readings yet today.')).toBeTruthy();
  });
});
