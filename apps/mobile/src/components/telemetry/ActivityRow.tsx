import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { Badge } from '@/components/ui/Badge';
import { IconTile } from '@/components/ui/IconTile';
import type { ActivityItem } from '@/data/types';
import { useTheme } from '@/theme/ThemeProvider';
import { spacing } from '@/theme/tokens';

export function ActivityRow({ item, divider }: { item: ActivityItem; divider?: boolean }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.row, divider && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }]}>
      <IconTile name={item.icon} size={32} shape="circle" color={colors.primary} />
      <View style={styles.flex}>
        <AppText variant="labelLg" color="textStrong">
          {item.title}
        </AppText>
        <AppText variant="bodySm" color="textMuted">
          {item.meta}
        </AppText>
      </View>
      {item.badge && <Badge label={item.badge.label} kind={item.badge.kind} />}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm + 4, paddingVertical: spacing.sm + 4 },
  flex: { flex: 1, gap: 2 },
});
