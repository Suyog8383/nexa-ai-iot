import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppHeader } from '@/components/layout/AppHeader';
import { ResultState } from '@/components/feedback/ResultState';
import { StateCard } from '@/components/feedback/StateCard';
import { Screen } from '@/components/layout/Screen';
import { DeviceCard } from '@/components/telemetry/DeviceCard';
import { AppText } from '@/components/ui/AppText';
import { PulseDot } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { useDevices } from '@/hooks/useDevices';
import { useTheme } from '@/theme/useTheme';
import { radius, spacing } from '@/theme/tokens';

export default function DevicesScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const [filter, setFilter] = useState<'all' | 'sensors'>('all');
  const devicesResult = useDevices();
  const devices = devicesResult.data ?? [];
  const connected = devices.filter((d) => d.status !== 'offline').length;

  return (
    <Screen header={<AppHeader />} withTabBar>
      <View style={styles.titleRow}>
        <View style={{ gap: 2 }}>
          <AppText variant="headlineLg" color="textStrong">
            Your Devices
          </AppText>
          <View style={styles.inline}>
            <PulseDot color={colors.success.dot} />
            <AppText variant="labelSm" color="textMuted">
              {connected} Connected Sensor{connected === 1 ? '' : 's'}
            </AppText>
          </View>
        </View>
        <Pressable accessibilityLabel="Refresh devices" style={[styles.refresh, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Icon name="sync" size={20} color={colors.primary} />
        </Pressable>
      </View>

      <SegmentedControl
        appearance="chips"
        value={filter}
        onChange={setFilter}
        segments={[
          { value: 'all', label: `All (${devices.length})`, icon: 'widgets' },
          { value: 'sensors', label: `Sensors (${devices.length})`, icon: 'sensors' },
        ]}
      />

      {!devicesResult.data ? (
        <ResultState {...devicesResult} />
      ) : devices.length === 0 ? (
        <StateCard icon="sensors" title="No devices yet" message="Pair an ESP32 sensor to start monitoring your home climate." />
      ) : (
        devices.map((d) => <DeviceCard key={d.id} device={d} />)
      )}

      <Button variant="secondary" icon="add" label="Pair New Device" onPress={() => router.push('/pair')} style={{ marginTop: spacing.sm }} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  inline: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  refresh: { width: 40, height: 40, borderRadius: radius.lg, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
});
