import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { useTheme } from '@/theme/ThemeProvider';
import { radius, spacing } from '@/theme/tokens';

import { AppText } from './AppText';
import { Icon, type IconName } from './Icon';

export type Segment<T extends string> = { value: T; label: string; icon?: IconName };

type Props<T extends string> = {
  segments: Segment<T>[];
  value: T;
  onChange: (value: T) => void;
  /**
   * `track`: recessed well with elevated active pill (Temp/Humidity, Today/7 Days).
   * `chips`: separate pills, active one filled (All/Sensors).
   * `tiles`: separate rounded tiles, active one filled or outlined (trigger condition, duration).
   */
  appearance?: 'track' | 'chips' | 'tiles';
  /** For `tiles`: active style. */
  activeStyle?: 'filled' | 'outlined';
  /** Compact track for card headers. */
  size?: 'md' | 'sm';
  style?: StyleProp<ViewStyle>;
};

export function SegmentedControl<T extends string>({ segments, value, onChange, appearance = 'track', activeStyle = 'filled', size = 'md', style }: Props<T>) {
  const { colors, scheme } = useTheme();

  if (appearance === 'track') {
    return (
      <View style={[styles.track, { backgroundColor: scheme === 'dark' ? colors.inset : colors.surfaceHigh, borderColor: colors.border }, style]}>
        {segments.map((s) => {
          const active = s.value === value;
          return (
            <Pressable
              key={s.value}
              accessibilityRole="tab"
              accessibilityLabel={s.label}
              accessibilityState={{ selected: active }}
              onPress={() => onChange(s.value)}
              style={[
                styles.trackItem,
                size === 'sm' && styles.trackItemSm,
                active && {
                  backgroundColor: scheme === 'dark' ? colors.surfaceHigh : colors.surface,
                  borderColor: scheme === 'dark' ? 'rgba(255,255,255,0.1)' : colors.border,
                },
              ]}>
              <AppText variant={size === 'sm' ? 'labelSm' : 'labelMd'} tint={active ? colors.primary : colors.textMuted}>
                {s.label}
              </AppText>
            </Pressable>
          );
        })}
      </View>
    );
  }

  return (
    <View style={[styles.row, style]}>
      {segments.map((s) => {
        const active = s.value === value;
        const filled = active && (appearance === 'chips' || activeStyle === 'filled');
        const outlined = active && !filled;
        const fg = filled ? colors.onPrimaryFill : outlined ? colors.primary : colors.textMuted;
        return (
          <Pressable
            key={s.value}
            accessibilityRole="tab"
              accessibilityLabel={s.label}
            accessibilityState={{ selected: active }}
            onPress={() => onChange(s.value)}
            style={[
              appearance === 'chips' ? styles.chip : styles.tile,
              {
                backgroundColor: filled ? colors.primaryFill : outlined ? colors.primaryTint : appearance === 'chips' ? colors.surface : colors.surfaceLow,
                borderColor: filled ? colors.primaryFill : outlined ? colors.primary : colors.border,
              },
            ]}>
            {s.icon && <Icon name={s.icon} size={16} color={fg} />}
            <AppText variant="labelMd" tint={fg} numberOfLines={1}>
              {s.label}
            </AppText>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: { flexDirection: 'row', padding: 4, borderRadius: radius.lg, borderWidth: 1, gap: 2 },
  trackItem: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  trackItemSm: { paddingHorizontal: 8, paddingVertical: 5 },
  row: { flexDirection: 'row', gap: spacing.sm },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 36,
    paddingHorizontal: spacing.md,
    borderRadius: radius.full,
    borderWidth: 1,
  },
  tile: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 44,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.lg,
    borderWidth: 1,
  },
});
