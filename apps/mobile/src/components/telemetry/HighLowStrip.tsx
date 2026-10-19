import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { Inset } from '@/components/ui/Card';
import { Icon, type IconName } from '@/components/ui/Icon';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, spacing } from '@/theme/tokens';

type Stat = { label: string; value: string; icon?: IconName; caption?: string; emphasis?: boolean };

/**
 * `inline`: High/Low pair with arrows (Home chart card).
 * `columns`: Lowest / Average / Highest with the middle column raised (Device Details).
 */
export function HighLowStrip({ stats, appearance = 'inline' }: { stats: Stat[]; appearance?: 'inline' | 'columns' }) {
  const { colors } = useTheme();

  if (appearance === 'inline') {
    return (
      <Inset style={styles.inline}>
        {stats.map((s) => (
          <View key={s.label} style={styles.inlineItem}>
            {s.icon && <Icon name={s.icon} size={18} color={colors.primary} />}
            <View>
              <AppText variant="labelSm" color="textMuted">
                {s.label}
              </AppText>
              <AppText variant="labelLg" color="textStrong" tabular>
                {s.value}
              </AppText>
            </View>
          </View>
        ))}
      </Inset>
    );
  }

  return (
    <Inset style={styles.columns}>
      {stats.map((s) => (
        <View key={s.label} style={[styles.column, s.emphasis && { backgroundColor: colors.surfaceHigh, borderRadius: radius.md }]}>
          <AppText variant="labelSm" tint={s.emphasis ? colors.primary : colors.textMuted} uppercase>
            {s.label}
          </AppText>
          <AppText variant="headlineMd" tint={s.emphasis ? colors.textStrong : colors.primary} tabular>
            {s.value}
          </AppText>
          {s.caption && (
            <AppText variant="labelSm" tint={s.emphasis ? colors.secondary : colors.textMuted} tabular>
              {s.caption}
            </AppText>
          )}
        </View>
      ))}
    </Inset>
  );
}

const styles = StyleSheet.create({
  inline: { flexDirection: 'row', paddingVertical: spacing.sm + 2 },
  inlineItem: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  columns: { flexDirection: 'row', padding: spacing.xs },
  column: { flex: 1, alignItems: 'center', gap: 2, paddingVertical: spacing.sm + 2 },
});
