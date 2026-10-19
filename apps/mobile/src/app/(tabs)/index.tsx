import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppHeader } from '@/components/layout/AppHeader';
import { Screen } from '@/components/layout/Screen';
import { ActivityRow } from '@/components/telemetry/ActivityRow';
import { HighLowStrip } from '@/components/telemetry/HighLowStrip';
import { MetricCard, RangeCaption } from '@/components/telemetry/MetricCard';
import { AppText } from '@/components/ui/AppText';
import { Badge } from '@/components/ui/Badge';
import { Card, Inset } from '@/components/ui/Card';
import { Icon } from '@/components/ui/Icon';
import { IconTile } from '@/components/ui/IconTile';
import { RangeBar } from '@/components/ui/RangeBar';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { TrendChart } from '@/components/ui/TrendChart';
import { homeActivity, livingRoomMonitor as device, todayTrend } from '@/data/mock';
import { useTheme } from '@/theme/useTheme';
import { radius, spacing } from '@/theme/tokens';

const ASSISTANT_PROMPT = 'Why did temperature drop at 6 AM?';

export default function HomeScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const [metric, setMetric] = useState<'temp' | 'humidity'>('temp');

  const [tMin, tMax] = device.temperatureTarget;
  const [hMin, hMax] = device.humidityRange;
  const series = todayTrend.slice(3).map((p) => (metric === 'temp' ? p.temperature : p.humidity));
  const unit = metric === 'temp' ? '°C' : '%';
  const peakIndex = series.indexOf(Math.max(...series));

  return (
    <Screen header={<AppHeader status={{ label: '1 Sensor Online', kind: 'success' }} />} withTabBar>
      {/* Hero */}
      <Card hero style={{ gap: spacing.sm }}>
        <View style={styles.rowBetween}>
          <AppText variant="labelSm" tint={colors.primary} uppercase>
            Home Habitat
          </AppText>
          <Badge label="1 active • ESP32 Online" kind="success" dot />
        </View>
        <AppText variant="headlineLg" color="textStrong">
          Good afternoon, Alex
        </AppText>
        <AppText variant="bodyMd" color="textMuted">
          Your home is balanced, fresh, and set for rest.
        </AppText>
        <View style={styles.chips}>
          <Chip icon="sensors" label={`${device.room}: ${device.temperature}°C • ${device.humidity}%`} />
          <Chip icon="memory" label={device.sensor} />
        </View>
      </Card>

      {/* Metric tiles */}
      <View style={styles.tiles}>
        <MetricCard
          icon="thermostat"
          badge={{ label: 'Comfortable', kind: 'success' }}
          value={device.temperature.toFixed(1)}
          unit="°C"
          label="Temperature"
          footer={
            <>
              <RangeCaption left={`Target: ${tMin}° – ${tMax}°`} right="Ideal" />
              <RangeBar fraction={(device.temperature - 15) / 15} />
            </>
          }
        />
        <MetricCard
          icon="water_drop"
          iconColor={colors.secondary}
          badge={{ label: 'Optimal', kind: 'success' }}
          value={String(device.humidity)}
          unit="%"
          label="Humidity"
          footer={
            <>
              <RangeCaption left={`Range: ${hMin}% – ${hMax}%`} right="Balanced" />
              <RangeBar fraction={device.humidity / 90} />
            </>
          }
        />
      </View>

      {/* Active sensors */}
      <SectionHeader title="Active Sensors" action={{ label: 'All connected' }} />
      <Pressable accessibilityRole="button" accessibilityLabel="Device Details" onPress={() => router.push({ pathname: '/device/[id]', params: { id: device.id } })}>
        <Card style={styles.sensorRow}>
          <IconTile name="sensors" size={40} />
          <View style={styles.flex}>
            <AppText variant="labelLg" color="textStrong">
              {device.name}{' '}
              <AppText variant="bodySm" color="textMuted">
                ({device.board} • {device.sensor})
              </AppText>
            </AppText>
            <AppText variant="labelSm" tint={colors.success.fg}>
              Online • Signal 94% • USB Powered
            </AppText>
          </View>
          <Icon name="chevron_right" size={20} color={colors.textMuted} />
        </Card>
      </Pressable>

      {/* Today's trend */}
      <Card style={{ gap: spacing.md }}>
        <View style={styles.rowBetween}>
          <View style={styles.flex}>
            <AppText variant="headlineSm" color="textStrong" numberOfLines={1}>
              Today&apos;s {metric === 'temp' ? 'Temperature' : 'Humidity'}
            </AppText>
            <AppText variant="bodySm" color="textMuted">
              Comfortable all day
            </AppText>
          </View>
          <SegmentedControl
            size="sm"
            value={metric}
            onChange={setMetric}
            segments={[
              { value: 'temp', label: 'Temp' },
              { value: 'humidity', label: 'Humidity' },
            ]}
          />
        </View>
        <HighLowStrip
          stats={
            metric === 'temp'
              ? [
                  { icon: 'arrow_upward', label: 'High (2:00 PM)', value: '22.1°C' },
                  { icon: 'arrow_downward', label: 'Low (6:00 AM)', value: '19.8°C' },
                ]
              : [
                  { icon: 'arrow_upward', label: 'High (4:00 AM)', value: '48%' },
                  { icon: 'arrow_downward', label: 'Low (6:00 AM)', value: '42%' },
                ]
          }
        />
        <TrendChart
          values={series}
          markerIndex={peakIndex}
          labels={['6 AM', '12 PM', '6 PM', `Now (${series[series.length - 1]}${metric === 'temp' ? '°' : unit})`]}
          rangePadding={metric === 'temp' ? 0.6 : 2}
        />
      </Card>

      {/* Recent activity */}
      <Card style={{ gap: spacing.sm }}>
        <View style={styles.rowBetween}>
          <View style={styles.inline}>
            <Icon name="check_circle" size={20} color={colors.success.dot} />
            <AppText variant="labelLg" color="textStrong">
              Recent Activity
            </AppText>
          </View>
          <AppText variant="labelSm" color="textMuted">
            Today
          </AppText>
        </View>
        <Inset style={{ paddingVertical: 0 }}>
          {homeActivity.map((a) => (
            <ActivityRow key={a.id} item={a} />
          ))}
        </Inset>
        <AppText variant="labelSm" color="textMuted" align="center">
          ✨ Everything is running smoothly right now.
        </AppText>
      </Card>

      {/* Assistant entry */}
      <Card hero style={{ gap: spacing.sm + 4 }}>
        <View style={styles.rowBetween}>
          <View style={styles.inline}>
            <IconTile name="auto_awesome" size={28} />
            <AppText variant="labelLg" color="textStrong">
              Nexa Assistant
            </AppText>
          </View>
          <AppText variant="labelSm" tint={colors.primary}>
            Living Room Context
          </AppText>
        </View>
        <AppText variant="bodyMd" color="text">
          Ask Nexa about your Living Room climate:
        </AppText>
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push({ pathname: '/assistant', params: { q: ASSISTANT_PROMPT } })}
          style={[styles.prompt, { backgroundColor: colors.inset, borderColor: colors.border }]}>
          <Icon name="chat_bubble" size={20} color={colors.primary} />
          <AppText variant="labelLg" color="textStrong" style={styles.flex}>
            &quot;{ASSISTANT_PROMPT}&quot;
          </AppText>
          <View style={[styles.send, { backgroundColor: colors.primaryFill }]}>
            <Icon name="arrow_forward" size={18} color={colors.onPrimaryFill} />
          </View>
        </Pressable>
      </Card>
    </Screen>
  );
}

function Chip({ icon, label }: { icon: 'sensors' | 'memory'; label: string }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.chip, { backgroundColor: colors.surfaceHigh, borderColor: colors.border }]}>
      <Icon name={icon} size={14} color={colors.primary} />
      <AppText variant="labelSm" color="text" tabular numberOfLines={1}>
        {label}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  inline: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: spacing.xs },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 4, height: 28, paddingHorizontal: 10, borderRadius: radius.full, borderWidth: 1 },
  tiles: { flexDirection: 'row', gap: spacing.gutter },
  sensorRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm + 4, paddingVertical: spacing.sm + 4 },
  flex: { flex: 1 },
  prompt: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm + 4, padding: spacing.sm + 4, borderRadius: radius.lg, borderWidth: 1 },
  send: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
});
