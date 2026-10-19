import { useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { AlertHistoryCard } from '@/components/alerts/AlertHistoryCard';
import { AlertRuleCard } from '@/components/alerts/AlertRuleCard';
import { AppHeader } from '@/components/layout/AppHeader';
import { Screen } from '@/components/layout/Screen';
import { AppText } from '@/components/ui/AppText';
import { PulseDot } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { IconTile } from '@/components/ui/IconTile';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { alertHistory, devices } from '@/data/mock';
import { useAlertsStore } from '@/stores/alertsStore';
import { useTheme } from '@/theme/useTheme';
import { spacing } from '@/theme/tokens';

export default function AlertsScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const rules = useAlertsStore((s) => s.rules);
  const setRuleEnabled = useAlertsStore((s) => s.setRuleEnabled);
  const enabled = rules.filter((r) => r.enabled).length;

  return (
    <Screen header={<AppHeader />} withTabBar>
      <Card hero style={styles.guard}>
        <IconTile name="verified_user" size={40} color={colors.secondary} tint={colors.secondaryTint} filled />
        <View style={{ flex: 1, gap: 2 }}>
          <View style={styles.inline}>
            <AppText variant="labelLg" tint={colors.secondary}>
              Habitat Guard Active
            </AppText>
            <PulseDot color={colors.success.dot} />
          </View>
          <AppText variant="bodySm" color="text">
            All current conditions are within your safe comfort thresholds.
          </AppText>
          <AppText variant="labelSm" color="textMuted">
            Monitoring {devices.length} Sensor (ESP32 • BME280)
          </AppText>
        </View>
      </Card>

      <View style={{ gap: spacing.xs, marginTop: spacing.sm }}>
        <AppText variant="headlineLg" color="textStrong">
          Alerts &amp; Rules
        </AppText>
        <AppText variant="bodyLg" color="textMuted">
          Get notified when your home goes outside your comfort zone.
        </AppText>
      </View>

      <SectionHeader title="Comfort Thresholds" count={`${enabled} of ${rules.length} On`} action={{ label: 'Edit All' }} />
      {rules.map((rule) => {
        const device = devices.find((d) => d.id === rule.deviceId) ?? devices[0];
        return <AlertRuleCard key={rule.id} rule={rule} device={device} onToggle={(v) => setRuleEnabled(rule.id, v)} />;
      })}

      <Button
        variant="accent"
        icon="add_circle"
        label="Create New Alert Rule"
        subtitle="Configure sensor, threshold & notification"
        onPress={() => router.push('/alert-rule')}
        style={{ marginVertical: spacing.sm }}
      />

      <SectionHeader title="Recent Alert History" caption="Past 7 Days" />
      {alertHistory.map((item) => (
        <AlertHistoryCard key={item.id} item={item} />
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  guard: { flexDirection: 'row', gap: spacing.sm + 4, alignItems: 'flex-start' },
  inline: { flexDirection: 'row', alignItems: 'center', gap: 6 },
});
