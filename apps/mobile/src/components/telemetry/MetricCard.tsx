import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { IconTile } from '@/components/ui/IconTile';
import type { IconName } from '@/components/ui/Icon';
import type { StatusKind } from '@/domain/types';
import { useTheme } from '@/theme/useTheme';
import { spacing } from '@/theme/tokens';

type Props = {
  icon: IconName;
  iconColor?: string;
  badge: { label: string; kind: StatusKind };
  value: string;
  unit: string;
  label: string;
  /** Footer content: range text, progress bar, etc. */
  footer?: ReactNode;
};

/** Home 2-up telemetry tile: icon + status badge, big readout with unit, label, footer. */
export function MetricCard({ icon, iconColor, badge, value, unit, label, footer }: Props) {
  const { colors } = useTheme();
  return (
    <Card style={styles.card}>
      <View style={styles.top}>
        <IconTile name={icon} size={32} color={iconColor ?? colors.primary} />
        <Badge label={badge.label} kind={badge.kind} bordered={false} />
      </View>
      <View style={styles.valueRow}>
        <AppText variant="display" color="textStrong" tabular>
          {value}
        </AppText>
        <AppText variant="headlineSm" color="textMuted" style={styles.unit}>
          {unit}
        </AppText>
      </View>
      <AppText variant="labelLg" color="text">
        {label}
      </AppText>
      {footer && <View style={styles.footer}>{footer}</View>}
    </Card>
  );
}

export function RangeCaption({ left, right }: { left: string; right?: string }) {
  const { colors } = useTheme();
  return (
    <View style={styles.caption}>
      <AppText variant="labelSm" color="textMuted" style={styles.flex} tabular>
        {left}
      </AppText>
      {right && (
        <AppText variant="labelSm" tint={colors.primary}>
          {right}
        </AppText>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { flex: 1, gap: 2 },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.md },
  valueRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 4 },
  unit: { marginBottom: 6 },
  footer: { marginTop: spacing.md, gap: spacing.sm },
  caption: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm },
  flex: { flex: 1 },
});
