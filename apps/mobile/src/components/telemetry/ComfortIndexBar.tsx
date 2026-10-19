import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { Icon } from '@/components/ui/Icon';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, spacing } from '@/theme/tokens';

type Props = {
  value: number;
  /** Scale bounds and optimal zone, °C. */
  min: number;
  max: number;
  zone: [number, number];
  labels: [string, string, string];
};

/** Three-band comfort scale (too cool / optimal / too warm) with a caret on the current reading. */
export function ComfortIndexBar({ value, min, max, zone, labels }: Props) {
  const { colors, scheme } = useTheme();
  const pos = (v: number) => ((v - min) / (max - min)) * 100;
  const coolW = pos(zone[0]);
  const optimalW = pos(zone[1]) - coolW;
  const marker = Math.max(0, Math.min(100, pos(value)));

  const cool = scheme === 'dark' ? '#3B4A5E' : '#7DD3FC';
  const warm = scheme === 'dark' ? '#6B5050' : '#FBBF24';
  const optimal = scheme === 'dark' ? colors.secondary : '#10B981';

  return (
    <View style={{ gap: spacing.xs }}>
      <View style={[styles.bar, { backgroundColor: warm }]}>
        <View style={{ width: `${coolW}%`, backgroundColor: cool }} />
        <View style={{ width: `${optimalW}%`, backgroundColor: optimal }} />
      </View>
      <View style={styles.markerRow}>
        <View style={[styles.marker, { left: `${marker}%` }]}>
          <Icon name="arrow_drop_down" size={18} color={colors.primary} style={{ transform: [{ rotate: '180deg' }] }} />
          <AppText variant="labelSm" tint={colors.primary} tabular>
            {value.toFixed(1)}°C Current
          </AppText>
        </View>
      </View>
      <View style={styles.labels}>
        {labels.map((l, i) => (
          <AppText
            key={l}
            variant="caption"
            tint={i === 1 ? colors.secondary : colors.textMuted}
            align={i === 0 ? 'left' : i === 1 ? 'center' : 'right'}
            style={styles.flex}>
            {l}
          </AppText>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { height: 10, borderRadius: radius.full, overflow: 'hidden', flexDirection: 'row' },
  markerRow: { height: 30 },
  marker: { position: 'absolute', top: -6, alignItems: 'center', width: 120, marginLeft: -60 },
  labels: { flexDirection: 'row', gap: spacing.sm },
  flex: { flex: 1 },
});
