import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { Icon } from '@/components/ui/Icon';
import type { AlertHistoryItem } from '@/data/types';
import { useTheme } from '@/theme/ThemeProvider';
import { spacing } from '@/theme/tokens';

export function AlertHistoryCard({ item }: { item: AlertHistoryItem }) {
  const { colors } = useTheme();
  const timeColor = item.badge.kind === 'neutral' ? colors.textMuted : colors.primary;
  return (
    <Card style={{ gap: 4 }}>
      <View style={styles.top}>
        <View style={styles.time}>
          <Icon name={item.icon} size={14} color={timeColor} />
          <AppText variant="labelSm" color="textMuted" numberOfLines={1} style={{ flexShrink: 1 }}>
            {item.time}
          </AppText>
        </View>
        <Badge label={item.badge.label} kind={item.badge.kind} icon={item.badge.icon} dot={item.badge.kind === 'success'} />
      </View>
      <AppText variant="labelLg" color="textStrong">
        {item.title}
      </AppText>
      <AppText variant="bodySm" color="textMuted">
        {item.detail}
      </AppText>
    </Card>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  time: { flexDirection: 'row', alignItems: 'center', gap: 4, flexShrink: 1 },
});
