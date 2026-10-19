import { useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, Inset } from '@/components/ui/Card';
import { Icon, type IconName } from '@/components/ui/Icon';
import { IconTile } from '@/components/ui/IconTile';
import type { Device } from '@/data/types';
import { useTheme } from '@/theme/useTheme';
import { spacing } from '@/theme/tokens';

import { statusBadge } from './status';

export function DeviceCard({ device }: { device: Device }) {
  const { colors } = useTheme();
  const router = useRouter();
  const badge = statusBadge(device.status);

  return (
    <Card style={{ gap: spacing.md }}>
      <View style={styles.header}>
        <IconTile name="thermostat" size={44} />
        <View style={styles.flex}>
          <AppText variant="headlineSm" color="textStrong" numberOfLines={1}>
            {device.name}
          </AppText>
          <AppText variant="bodySm" color="textMuted">
            {device.board} Board • {device.sensor} Sensor
          </AppText>
        </View>
        <Badge label={badge.label} kind={badge.kind} dot />
      </View>

      <Inset style={styles.readings}>
        <Reading icon="device_thermostat" label="Temperature" value={`${device.temperature.toFixed(1)}°C`} />
        <Reading icon="humidity_mid" label="Relative Humidity" value={`${device.humidity}% RH`} />
      </Inset>

      <View style={styles.meta}>
        <View style={styles.metaItem}>
          <Icon name="power" size={16} color={colors.secondary} />
          <AppText variant="labelSm" color="textMuted">
            USB 5V Powered
          </AppText>
        </View>
        <View style={styles.metaItem}>
          <Icon name="wifi" size={16} color={colors.primary} />
          <AppText variant="labelSm" color="textMuted" tabular>
            Wi-Fi {device.rssi} dBm
          </AppText>
        </View>
      </View>

      <Button
        variant="outline"
        icon="query_stats"
        trailingIcon="arrow_forward"
        label="View Device Details & Diagnostics"
        onPress={() => router.push({ pathname: '/device/[id]', params: { id: device.id } })}
      />
    </Card>
  );
}

function Reading({ icon, label, value }: { icon: IconName; label: string; value: string }) {
  const { colors } = useTheme();
  return (
    <View style={styles.reading}>
      <IconTile name={icon} size={32} color={colors.primary} tint={colors.surfaceHigh} />
      <View>
        <AppText variant="labelSm" color="textMuted">
          {label}
        </AppText>
        <AppText variant="labelLg" color="textStrong" tabular>
          {value}
        </AppText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm + 4 },
  flex: { flex: 1 },
  readings: { flexDirection: 'row', gap: spacing.sm, padding: spacing.sm + 4 },
  reading: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  meta: { flexDirection: 'row', justifyContent: 'space-between' },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
});
