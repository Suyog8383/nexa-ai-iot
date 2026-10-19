import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render as rtlRender, screen } from '@testing-library/react-native';
import type { ReactElement, ReactNode } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import CreateAlertRuleScreen from '@/app/alert-rule';
import { initialRules } from '@/mocks/fixtures';
import { alertsStore } from '@/stores/alertsStore';
import { hydrated } from '@/test-utils/storage';

const mockBack = jest.fn();
let mockParams: Record<string, string> = {};

jest.mock('expo-router', () => ({
  useRouter: () => ({ back: mockBack, push: jest.fn() }),
  useLocalSearchParams: () => mockParams,
}));

// Expo Router provides this in the app.
const metrics = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 47, left: 0, right: 0, bottom: 34 } };
const Providers = ({ children }: { children: ReactNode }) => <SafeAreaProvider initialMetrics={metrics}>{children}</SafeAreaProvider>;
const render = (ui: ReactElement) => rtlRender(ui, { wrapper: Providers });

const newestRule = () => alertsStore.getState().rules.at(-1);

beforeEach(async () => {
  mockBack.mockClear();
  mockParams = {};
  await hydrated(alertsStore);
  alertsStore.setState({ rules: initialRules });
});

describe('Create Alert Rule', () => {
  it('saves the default low-temperature rule and returns to Alerts', async () => {
    await render(<CreateAlertRuleScreen />);
    expect(screen.getByText('Alerts')).toBeTruthy(); // back label
    expect(screen.getAllByText('19.5°C')).not.toHaveLength(0); // stepper + summary

    await fireEvent.press(screen.getByText('Save Alert Rule'));

    expect(alertsStore.getState().rules).toHaveLength(initialRules.length + 1);
    expect(newestRule()).toMatchObject({
      name: 'Low Temperature Alert',
      metric: 'temperature',
      condition: 'below',
      threshold: 19.5,
      duration: '5m',
      notify: { push: true, inApp: true, sound: false },
      enabled: true,
    });
    expect(newestRule()?.origin).toBeUndefined();
    expect(mockBack).toHaveBeenCalledTimes(1);
  });

  it('opens prefilled from an AI suggestion and links the saved rule to it', async () => {
    mockParams = { from: 'assistant', origin: 'm2', metric: 'temperature', condition: 'below', threshold: '19.5' };
    await render(<CreateAlertRuleScreen />);
    expect(screen.getByText('Assistant')).toBeTruthy();

    await fireEvent.press(screen.getByLabelText('Increase threshold'));
    expect(screen.getAllByText('20.0°C')).not.toHaveLength(0);

    await fireEvent.press(screen.getByText('Save Alert Rule'));
    expect(newestRule()).toMatchObject({ origin: 'm2', threshold: 20 });
    expect(mockBack).toHaveBeenCalledTimes(1);
  });

  it('switching to humidity resets to the humidity default and condition', async () => {
    await render(<CreateAlertRuleScreen />);
    await fireEvent.press(screen.getByLabelText('Humidity'));
    expect(screen.getByText('60% RH', { exact: false })).toBeTruthy();

    await fireEvent.press(screen.getByText('Save Alert Rule'));
    expect(newestRule()).toMatchObject({ name: 'High Humidity Warning', metric: 'humidity', condition: 'above', threshold: 60 });
  });

  it('cancel leaves without saving', async () => {
    await render(<CreateAlertRuleScreen />);
    const [, footerCancel] = screen.getAllByText('Cancel');
    await fireEvent.press(footerCancel);

    expect(alertsStore.getState().rules).toEqual(initialRules);
    expect(mockBack).toHaveBeenCalledTimes(1);
  });
});
