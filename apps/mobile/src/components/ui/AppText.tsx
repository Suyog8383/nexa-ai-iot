import { Text, type TextProps } from 'react-native';

import { useTheme } from '@/theme/useTheme';
import { typography, type ThemeColors, type TypographyVariant } from '@/theme/tokens';

type ColorToken = { [K in keyof ThemeColors]: ThemeColors[K] extends string ? K : never }[keyof ThemeColors];

type Props = TextProps & {
  variant?: TypographyVariant;
  color?: ColorToken;
  /** Raw colour override (e.g. status colours). */
  tint?: string;
  /** Tabular figures for live telemetry so digits don't jitter. */
  tabular?: boolean;
  uppercase?: boolean;
  align?: 'left' | 'center' | 'right';
};

export function AppText({ variant = 'bodyMd', color = 'text', tint, tabular, uppercase, align, style, ...rest }: Props) {
  const { colors } = useTheme();
  return (
    <Text
      {...rest}
      style={[
        typography[variant],
        { color: tint ?? colors[color] },
        tabular && { fontVariant: ['tabular-nums'] },
        uppercase && { textTransform: 'uppercase' },
        align && { textAlign: align },
        style,
      ]}
    />
  );
}
