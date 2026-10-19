import { useColorScheme } from 'react-native';

import { usePreferencesStore, type ThemePreference } from '@/stores/preferencesStore';

import { palette, type ColorScheme } from './tokens';

export type { ThemePreference };

/** The scheme to render: the saved override, else the device setting (dark when the device reports none). */
export function resolveScheme(preference: ThemePreference, system: string | null | undefined): ColorScheme {
  if (preference !== 'system') return preference;
  return system === 'light' ? 'light' : 'dark';
}

export function useTheme() {
  const system = useColorScheme();
  const preference = usePreferencesStore((s) => s.themePreference);
  const setPreference = usePreferencesStore((s) => s.setThemePreference);
  const scheme = resolveScheme(preference, system);
  return { scheme, colors: palette[scheme], preference, setPreference };
}
