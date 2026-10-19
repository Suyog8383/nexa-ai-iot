import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, View } from 'react-native';

import { useTheme } from '@/theme/ThemeProvider';
import { radius } from '@/theme/tokens';

/** Thin progress track used under metric readouts. `fraction` is 0–1. */
export function RangeBar({ fraction }: { fraction: number }) {
  const { colors, scheme } = useTheme();
  const clamped = Math.max(0, Math.min(1, fraction));
  return (
    <View style={[styles.track, { backgroundColor: scheme === 'dark' ? colors.surfaceHighest : colors.surfaceHighest }]}>
      <LinearGradient
        colors={colors.gradientAccent}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={[styles.fill, { width: `${clamped * 100}%` }]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  track: { height: 6, borderRadius: radius.full, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: radius.full },
});
