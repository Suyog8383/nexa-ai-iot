import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { Card } from '@/components/ui/Card';
import { Icon } from '@/components/ui/Icon';
import { IconTile } from '@/components/ui/IconTile';
import { Toggle } from '@/components/ui/Toggle';
import { describeRuleShort } from '@/data/rules';
import type { AlertRule, Device } from '@/data/types';
import { useTheme } from '@/theme/ThemeProvider';
import { spacing } from '@/theme/tokens';

type Props = { rule: AlertRule; device: Device; onToggle: (enabled: boolean) => void };

export function AlertRuleCard({ rule, device, onToggle }: Props) {
  const { colors } = useTheme();
  return (
    <Card style={styles.card}>
      <IconTile name={rule.metric === 'temperature' ? 'device_thermostat' : 'water_drop'} size={40} color={colors.primary} />
      <View style={styles.body}>
        <AppText variant="headlineSm" color="textStrong">
          {rule.name}
        </AppText>
        <AppText variant="bodySm" color="textMuted">
          {describeRuleShort(rule, device.room)}
        </AppText>
        <View style={styles.meta}>
          <Icon name="sensors" size={14} color={colors.textMuted} />
          <AppText variant="labelSm" color="textMuted">
            {device.room} {device.board} • {device.sensor}
          </AppText>
        </View>
      </View>
      <Toggle value={rule.enabled} onChange={onToggle} accessibilityLabel={`${rule.name} enabled`} />
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm + 4 },
  body: { flex: 1, gap: 2 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: spacing.sm },
});
