import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';

import type { StatusKind } from '@/data/types';
import { useTheme } from '@/theme/useTheme';
import { radius } from '@/theme/tokens';

import { AppText } from './AppText';
import { Icon, type IconName } from './Icon';

export function useStatusColors(kind: StatusKind) {
  const { colors } = useTheme();
  if (kind === 'primary') {
    return { fg: colors.primary, bg: colors.primaryTint, border: colors.primaryBorder, dot: colors.primaryFill };
  }
  return colors[kind];
}

type Props = {
  label: string;
  kind?: StatusKind;
  /** Live LED dot with radial ping. */
  dot?: boolean;
  icon?: IconName;
  bordered?: boolean;
};

/** Pill-shaped glowing sensor badge (24px). */
export function Badge({ label, kind = 'success', dot, icon, bordered = true }: Props) {
  const c = useStatusColors(kind);
  return (
    <View style={[styles.badge, { backgroundColor: c.bg, borderColor: bordered ? c.border : 'transparent' }]}>
      {dot && <PulseDot color={c.dot} />}
      {icon && <Icon name={icon} size={14} color={c.fg} />}
      <AppText variant="labelSm" tint={c.fg} numberOfLines={1}>
        {label}
      </AppText>
    </View>
  );
}

export function PulseDot({ color, size = 6 }: { color: string; size?: number }) {
  const progress = useSharedValue(0);
  useEffect(() => {
    progress.value = withRepeat(withTiming(1, { duration: 1600, easing: Easing.out(Easing.ease) }), -1, false);
  }, [progress]);
  const ring = useAnimatedStyle(() => ({
    opacity: 0.6 * (1 - progress.value),
    transform: [{ scale: 1 + progress.value * 1.6 }],
  }));
  return (
    <View style={{ width: size, height: size }}>
      <Animated.View style={[StyleSheet.absoluteFill, { borderRadius: size, backgroundColor: color }, ring]} />
      <View style={[StyleSheet.absoluteFill, { borderRadius: size, backgroundColor: color }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 24,
    paddingHorizontal: 10,
    borderRadius: radius.full,
    borderWidth: 1,
    alignSelf: 'flex-start',
  },
});
