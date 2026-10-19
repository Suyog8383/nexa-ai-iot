/**
 * Design tokens extracted from the approved Stitch project
 * "Nexa IoT Environment Monitor" (Precision Ambient Tech / Luminous Precision IoT).
 *
 * The rendered Stitch screens share one type scale and one radius scale across
 * both themes, so only colour (and elevation style) varies per scheme.
 */
import type { TextStyle } from 'react-native';

export type ColorScheme = 'light' | 'dark';

type StatusColors = { fg: string; bg: string; border: string; dot: string };

export type ThemeColors = {
  background: string;
  surface: string;
  surfaceLow: string;
  surfaceHigh: string;
  surfaceHighest: string;
  /** Recessed wells: segmented tracks, inputs, inner metric strips. */
  inset: string;
  border: string;
  borderStrong: string;

  text: string;
  textStrong: string;
  textMuted: string;
  textFaint: string;

  /** Accent used for links, active icons, highlighted values. */
  primary: string;
  /** Solid accent fill (user chat bubble, selected segment, toggles). */
  primaryFill: string;
  onPrimaryFill: string;
  primaryTint: string;
  primaryBorder: string;
  secondary: string;
  secondaryTint: string;
  tertiary: string;

  success: StatusColors;
  warning: StatusColors;
  danger: StatusColors;
  neutral: StatusColors;

  gradientPrimary: readonly [string, string];
  /** Cyan→teal "Create / Save Alert Rule" call-to-action. */
  gradientAccent: readonly [string, string];
  /** Soft wash used on hero / assistant cards. */
  gradientHero: readonly [string, string];

  chartStroke: string;
  chartFillTop: string;
  chartGrid: string;

  tabBar: string;
  tabActive: string;
  tabInactive: string;
  toggleOff: string;
  overlay: string;
};

export const palette: Record<ColorScheme, ThemeColors> = {
  dark: {
    background: '#0F131D',
    surface: '#1C1F2A',
    surfaceLow: '#171B26',
    surfaceHigh: '#262A35',
    surfaceHighest: '#313540',
    inset: '#0A0E18',
    border: 'rgba(51, 65, 85, 0.5)',
    borderStrong: 'rgba(51, 65, 85, 0.8)',

    text: '#DFE2F1',
    textStrong: '#F8FAFC',
    textMuted: '#BCC9CD',
    textFaint: '#869397',

    primary: '#4CD7F6',
    primaryFill: '#06B6D4',
    onPrimaryFill: '#0B0F19',
    primaryTint: 'rgba(6, 182, 212, 0.12)',
    primaryBorder: 'rgba(6, 182, 212, 0.4)',
    secondary: '#4FDBC8',
    secondaryTint: 'rgba(4, 180, 162, 0.2)',
    tertiary: '#7BD0FF',

    success: { fg: '#4FDBC8', bg: 'rgba(16, 185, 129, 0.12)', border: 'rgba(16, 185, 129, 0.3)', dot: '#10B981' },
    warning: { fg: '#FBBF24', bg: 'rgba(245, 158, 11, 0.12)', border: 'rgba(245, 158, 11, 0.3)', dot: '#F59E0B' },
    danger: { fg: '#F87171', bg: 'rgba(239, 68, 68, 0.12)', border: 'rgba(239, 68, 68, 0.3)', dot: '#EF4444' },
    neutral: { fg: '#BCC9CD', bg: '#262A35', border: 'rgba(51, 65, 85, 0.6)', dot: '#869397' },

    gradientPrimary: ['#06B6D4', '#0891B2'],
    gradientAccent: ['#06B6D4', '#4FDBC8'],
    gradientHero: ['#1C2433', '#161B26'],

    chartStroke: '#4CD7F6',
    chartFillTop: 'rgba(76, 215, 246, 0.35)',
    chartGrid: 'rgba(134, 147, 151, 0.15)',

    tabBar: 'rgba(10, 14, 24, 0.92)',
    tabActive: '#4CD7F6',
    tabInactive: '#BCC9CD',
    toggleOff: '#313540',
    overlay: 'rgba(0, 0, 0, 0.5)',
  },
  light: {
    background: '#F5F7FA',
    surface: '#FFFFFF',
    surfaceLow: '#F8FAFC',
    surfaceHigh: '#F1F5F9',
    surfaceHighest: '#E2E8F0',
    inset: '#F1F5F9',
    border: '#E2E8F0',
    borderStrong: '#CBD5E1',

    text: '#0F172A',
    textStrong: '#0F172A',
    textMuted: '#64748B',
    textFaint: '#94A3B8',

    primary: '#0F766E',
    primaryFill: '#0D9488',
    onPrimaryFill: '#FFFFFF',
    primaryTint: '#F0FDFA',
    primaryBorder: '#99F6E4',
    secondary: '#059669',
    secondaryTint: '#ECFDF5',
    tertiary: '#0891B2',

    success: { fg: '#047857', bg: '#ECFDF5', border: '#A7F3D0', dot: '#10B981' },
    warning: { fg: '#B45309', bg: '#FFFBEB', border: '#FDE68A', dot: '#F59E0B' },
    danger: { fg: '#DC2626', bg: '#FEF2F2', border: '#FECACA', dot: '#EF4444' },
    neutral: { fg: '#475569', bg: '#F1F5F9', border: '#E2E8F0', dot: '#94A3B8' },

    gradientPrimary: ['#0D9488', '#0F766E'],
    gradientAccent: ['#0D9488', '#0891B2'],
    gradientHero: ['#FFFFFF', '#ECFDF5'],

    chartStroke: '#0891B2',
    chartFillTop: 'rgba(8, 145, 178, 0.2)',
    chartGrid: 'rgba(148, 163, 184, 0.2)',

    tabBar: 'rgba(255, 255, 255, 0.96)',
    tabActive: '#0F766E',
    tabInactive: '#64748B',
    toggleOff: '#CBD5E1',
    overlay: 'rgba(15, 23, 42, 0.3)',
  },
};

export const fonts = {
  heading600: 'PlusJakartaSans_600SemiBold',
  heading700: 'PlusJakartaSans_700Bold',
  body400: 'Inter_400Regular',
  body500: 'Inter_500Medium',
  body600: 'Inter_600SemiBold',
  iconOutlined: 'MaterialSymbolsOutlined',
  iconFilled: 'MaterialSymbolsFilled',
} as const;

const em = (size: number, value: number) => size * value;

export const typography = {
  display: { fontFamily: fonts.heading700, fontSize: 40, lineHeight: 48, letterSpacing: em(40, -0.03) },
  headlineLg: { fontFamily: fonts.heading700, fontSize: 26, lineHeight: 34, letterSpacing: em(26, -0.02) },
  headlineMd: { fontFamily: fonts.heading600, fontSize: 22, lineHeight: 28, letterSpacing: em(22, -0.01) },
  headlineSm: { fontFamily: fonts.heading600, fontSize: 18, lineHeight: 24 },
  telemetry: { fontFamily: fonts.heading700, fontSize: 36, lineHeight: 40, letterSpacing: em(36, -0.03) },
  bodyLg: { fontFamily: fonts.body400, fontSize: 16, lineHeight: 24 },
  bodyMd: { fontFamily: fonts.body400, fontSize: 14, lineHeight: 20 },
  bodySm: { fontFamily: fonts.body400, fontSize: 12, lineHeight: 16 },
  labelLg: { fontFamily: fonts.heading600, fontSize: 14, lineHeight: 18, letterSpacing: em(14, 0.01) },
  labelMd: { fontFamily: fonts.heading600, fontSize: 13, lineHeight: 16, letterSpacing: em(13, 0.02) },
  labelSm: { fontFamily: fonts.heading600, fontSize: 11, lineHeight: 14, letterSpacing: em(11, 0.04) },
  caption: { fontFamily: fonts.body500, fontSize: 10, lineHeight: 12, letterSpacing: em(10, 0.05) },
} satisfies Record<string, TextStyle>;

export type TypographyVariant = keyof typeof typography;

export const spacing = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32, margin: 16, gutter: 16 } as const;

export const radius = { sm: 4, md: 8, lg: 12, xl: 16, full: 9999 } as const;

export const layout = { buttonHeight: 48, inputHeight: 48, chipHeight: 32, badgeHeight: 24, tabBarHeight: 64 } as const;
