import { LinearGradient } from 'expo-linear-gradient';
import type { ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { useTheme } from '@/theme/useTheme';
import { radius, spacing } from '@/theme/tokens';

type Props = {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  /** Soft gradient wash used on hero and assistant cards. */
  hero?: boolean;
  /** Highlight border (selected / live). */
  active?: boolean;
  padded?: boolean;
};

/**
 * Telemetry card: glass-like surface with a 1px instrument stroke in dark,
 * white surface with a micro border and ambient shadow in light.
 */
export function Card({ children, style, hero, active, padded = true }: Props) {
  const { colors, scheme } = useTheme();
  const base: ViewStyle = {
    backgroundColor: colors.surface,
    borderColor: active ? colors.primaryBorder : colors.border,
    ...(scheme === 'light' ? styles.lightShadow : null),
  };
  return (
    <View style={[styles.card, base, padded && styles.padded, style]}>
      {hero && (
        <LinearGradient
          colors={colors.gradientHero}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[StyleSheet.absoluteFill, { borderRadius: radius.xl }]}
        />
      )}
      {children}
    </View>
  );
}

/** Recessed inner well (metric strips, inputs, nested rows). */
export function Inset({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const { colors, scheme } = useTheme();
  return (
    <View
      style={[
        styles.inset,
        { backgroundColor: scheme === 'dark' ? colors.inset : colors.surfaceLow, borderColor: colors.border },
        style,
      ]}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radius.xl, borderWidth: 1, overflow: 'hidden' },
  padded: { padding: spacing.md },
  lightShadow: {
    shadowColor: '#0F172A',
    shadowOpacity: 0.05,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 1,
  },
  inset: { borderRadius: radius.lg, borderWidth: 1, padding: spacing.md },
});
