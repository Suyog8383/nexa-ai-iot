import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Defs, Line, LinearGradient, Path, Stop } from 'react-native-svg';

import { useTheme } from '@/theme/ThemeProvider';
import { spacing } from '@/theme/tokens';

import { AppText } from './AppText';

type Props = {
  values: number[];
  /** Evenly spaced x-axis labels; the last one is highlighted (e.g. "Now (21.5°)"). */
  labels: string[];
  height?: number;
  /** Index of an extra marker (e.g. the daily high). */
  markerIndex?: number;
  /** Padding added to the min/max range so the curve breathes. */
  rangePadding?: number;
};

/** Smoothed area chart: 2px stroke, gradient fill fading to zero, pulse node on the latest reading. */
export function TrendChart({ values, labels, height = 140, markerIndex, rangePadding = 0.6 }: Props) {
  const { colors } = useTheme();
  const [width, setWidth] = useState(0);

  const min = Math.min(...values) - rangePadding;
  const max = Math.max(...values) + rangePadding;
  const pad = 8;
  const points = values.map((v, i) => ({
    x: pad + (i / (values.length - 1)) * (width - pad * 2),
    y: pad + (1 - (v - min) / (max - min)) * (height - pad * 2),
  }));

  const line = smoothPath(points);
  const area = points.length ? `${line} L ${points[points.length - 1].x} ${height} L ${points[0].x} ${height} Z` : '';
  const last = points[points.length - 1];
  const marker = markerIndex != null ? points[markerIndex] : undefined;

  return (
    <View>
      <View style={{ height }} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
        {width > 0 && (
          <Svg width={width} height={height}>
            <Defs>
              <LinearGradient id="fill" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor={colors.chartFillTop} />
                <Stop offset="1" stopColor={colors.chartFillTop} stopOpacity={0} />
              </LinearGradient>
            </Defs>
            {[0.33, 0.66].map((f) => (
              <Line key={f} x1={0} x2={width} y1={height * f} y2={height * f} stroke={colors.chartGrid} strokeWidth={1} />
            ))}
            <Path d={area} fill="url(#fill)" />
            <Path d={line} stroke={colors.chartStroke} strokeWidth={2.5} fill="none" strokeLinecap="round" />
            {marker && <Circle cx={marker.x} cy={marker.y} r={4.5} fill={colors.chartStroke} stroke={colors.surface} strokeWidth={2} />}
            {last && (
              <>
                <Circle cx={last.x} cy={last.y} r={9} fill={colors.chartStroke} opacity={0.25} />
                <Circle cx={last.x} cy={last.y} r={4.5} fill={colors.chartStroke} stroke={colors.surface} strokeWidth={2} />
              </>
            )}
          </Svg>
        )}
      </View>
      <View style={styles.labels}>
        {labels.map((l, i) => (
          <AppText key={l} variant="labelSm" tint={i === labels.length - 1 ? colors.primary : colors.textMuted} tabular>
            {l}
          </AppText>
        ))}
      </View>
    </View>
  );
}

/** Catmull-Rom → cubic Bézier for a smooth curve through every point. */
function smoothPath(pts: { x: number; y: number }[]): string {
  if (pts.length < 2) return '';
  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? p2;
    const c1 = { x: p1.x + (p2.x - p0.x) / 6, y: p1.y + (p2.y - p0.y) / 6 };
    const c2 = { x: p2.x - (p3.x - p1.x) / 6, y: p2.y - (p3.y - p1.y) / 6 };
    d += ` C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${p2.x} ${p2.y}`;
  }
  return d;
}

const styles = StyleSheet.create({
  labels: { flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing.sm },
});
