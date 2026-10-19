import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Screen } from '@/components/layout/Screen';
import { StackHeader } from '@/components/layout/StackHeader';
import { ActivityRow } from '@/components/telemetry/ActivityRow';
import { ComfortIndexBar } from '@/components/telemetry/ComfortIndexBar';
import { HighLowStrip } from '@/components/telemetry/HighLowStrip';
import { AppText } from '@/components/ui/AppText';
import { Badge, PulseDot } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, Inset } from '@/components/ui/Card';
import { Icon, type IconName } from '@/components/ui/Icon';
import { IconTile } from '@/components/ui/IconTile';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { Toggle } from '@/components/ui/Toggle';
import { TrendChart } from '@/components/ui/TrendChart';
import { deviceActivity, devices, todayTrend } from '@/data/mock';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, spacing } from '@/theme/tokens';

export default function DeviceDetailsScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const device = devices.find((d) => d.id === id);

  const [range, setRange] = useState<'today' | 'week'>('today');
  const [favorite, setFavorite] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [comfortAlerts, setComfortAlerts] = useState(true);

  const header = <StackHeader backLabel="Devices" title="Device Details" right={<Avatar />} />;

  if (!device) {
    return (
      <Screen header={header}>
        <Card style={styles.missing}>
          <Icon name="error" size={32} color={colors.danger.dot} />
          <AppText variant="headlineSm" color="textStrong">
            Device not found
          </AppText>
          <Button label="Back to Devices" variant="secondary" onPress={() => router.back()} />
        </Card>
      </Screen>
    );
  }

  const [tMin, tMax] = device.temperatureTarget;
  const [hMin, hMax] = device.humidityRange;

  return (
    <Screen header={header}>
      {/* Identity */}
      <Card hero style={{ gap: spacing.md }}>
        <View style={styles.identity}>
          <IconTile name="memory" size={48} />
          <View style={{ flex: 1, gap: 2 }}>
            <View style={styles.inline}>
              <PulseDot color={colors.success.dot} size={8} />
              <AppText variant="labelSm" tint={colors.secondary} uppercase style={{ flex: 1 }}>
                Online • Wi-Fi {device.rssi} dBm • 5V USB Power
              </AppText>
            </View>
            <AppText variant="headlineMd" color="textStrong">
              {device.name}
            </AppText>
            <AppText variant="labelMd" tint={colors.primary}>
              {device.boardModel} • {device.sensor}
            </AppText>
          </View>
          <Pressable
            accessibilityLabel={favorite ? 'Remove from favourites' : 'Add to favourites'}
            onPress={() => setFavorite((f) => !f)}
            style={[styles.fav, { backgroundColor: colors.surfaceHigh }]}>
            <Icon name="favorite" size={20} color={favorite ? colors.danger.dot : colors.textMuted} filled={favorite} />
          </Pressable>
        </View>
        <View style={styles.infoRow}>
          <InfoTile icon="power" title="USB Powered (5V)" subtitle="Continuous Supply" accent />
          <InfoTile icon="wifi" title={`RSSI: ${device.rssi} dBm`} subtitle={`BSSID: ${device.bssid}`} />
        </View>
      </Card>

      {/* Readouts */}
      <View style={styles.infoRow}>
        <Readout
          title="Temperature"
          icon="thermostat"
          value={device.temperature.toFixed(1)}
          unit="°C"
          badge={{ icon: 'sentiment_satisfied', label: 'Feels pleasant' }}
          footnote={`Target: ${tMin}–${tMax}°C`}
        />
        <Readout
          title="Relative Humidity"
          icon="humidity_percentage"
          value={String(device.humidity)}
          unit="%"
          badge={{ icon: 'water_drop', label: 'Ideal humidity' }}
          footnote={`Ideal range: ${hMin}–${hMax}%`}
        />
      </View>

      {/* Comfort index */}
      <Card style={{ gap: spacing.md }}>
        <View style={styles.between}>
          <View style={styles.inline}>
            <Icon name="spa" size={22} color={colors.secondary} />
            <AppText variant="headlineSm" color="textStrong">
              Living Comfort Index
            </AppText>
          </View>
          <Badge label="In Green Zone" kind="success" />
        </View>
        <ComfortIndexBar
          value={device.temperature}
          min={16}
          max={26}
          zone={[18, 24]}
          labels={['Too Cool (Below 18°C)', 'Optimal Comfort Zone', 'Too Warm (Above 24°C)']}
        />
      </Card>

      {/* Trend */}
      <Card style={{ gap: spacing.md }}>
        <View style={styles.between}>
          <View style={{ flex: 1 }}>
            <AppText variant="headlineSm" color="textStrong">
              Trend Overview
            </AppText>
            <AppText variant="bodySm" color="textMuted">
              Smooth and balanced all day
            </AppText>
          </View>
          <SegmentedControl
            size="sm"
            value={range}
            onChange={setRange}
            segments={[
              { value: 'today', label: 'Today' },
              { value: 'week', label: 'Past 7 Days' },
            ]}
          />
        </View>
        <HighLowStrip
          appearance="columns"
          stats={[
            { label: 'Lowest', value: '19.8°C', caption: '06:00 AM' },
            { label: 'Average', value: '21.1°C', caption: 'Balanced', emphasis: true },
            { label: 'Highest', value: '22.1°C', caption: '02:00 PM' },
          ]}
        />
        {range === 'today' ? (
          <TrendChart values={todayTrend.map((p) => p.temperature)} labels={['12 AM', '6 AM', '12 PM', '6 PM', 'Now']} height={110} rangePadding={2.5} />
        ) : (
          <Inset style={styles.placeholder}>
            <Icon name="timeline" size={24} color={colors.textMuted} />
            <AppText variant="bodySm" color="textMuted" align="center">
              7-day history will appear once the hub has a full week of BME280 telemetry.
            </AppText>
          </Inset>
        )}
      </Card>

      {/* Recent activity */}
      <Card style={{ gap: spacing.xs }}>
        <View style={styles.between}>
          <AppText variant="headlineSm" color="textStrong">
            Recent Activity
          </AppText>
          <AppText variant="labelSm" tint={colors.primary}>
            All Normal
          </AppText>
        </View>
        {deviceActivity.map((a, i) => (
          <ActivityRow key={a.id} item={a} divider={i > 0} />
        ))}
      </Card>

      {/* Advanced */}
      <Card padded={false}>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded: advancedOpen }}
          onPress={() => setAdvancedOpen((o) => !o)}
          style={styles.accordionHead}>
          <Icon name="tune" size={20} color={colors.textMuted} />
          <AppText variant="labelLg" color="textStrong" style={{ flex: 1 }}>
            Advanced Settings &amp; Technical Diagnostics
          </AppText>
          <Icon name="expand_more" size={22} color={colors.textMuted} style={advancedOpen && { transform: [{ rotate: '180deg' }] }} />
        </Pressable>
        {advancedOpen && (
          <View style={[styles.accordionBody, { borderTopColor: colors.border }]}>
            {[
              ['IP Address', device.ip],
              ['MAC Address', device.mac],
              ['Telemetry Interval', device.telemetryInterval],
              ['Sensor Offset Calibration', device.calibrationOffset],
            ].map(([k, v]) => (
              <View key={k} style={styles.between}>
                <AppText variant="bodySm" color="textMuted">
                  {k}
                </AppText>
                <AppText variant="labelMd" color="textStrong" tabular>
                  {v}
                </AppText>
              </View>
            ))}
            <View style={[styles.infoRow, { marginTop: spacing.sm }]}>
              <Button label="Ping Self-Test" icon="sync" variant="secondary" compact style={{ flex: 1 }} />
              <Button label="Restart Device" icon="restart_alt" variant="secondary" compact style={{ flex: 1 }} />
            </View>
          </View>
        )}
      </Card>

      {/* Comfort alerts */}
      <Card style={styles.alertRow}>
        <IconTile name="notifications_active" size={40} shape="circle" />
        <View style={{ flex: 1 }}>
          <AppText variant="labelLg" color="textStrong">
            Climate Comfort Alerts
          </AppText>
          <AppText variant="bodySm" color="textMuted">
            Notify if temperature leaves green zone
          </AppText>
        </View>
        <Toggle value={comfortAlerts} onChange={setComfortAlerts} accessibilityLabel="Climate comfort alerts" />
      </Card>
    </Screen>
  );
}

function Avatar() {
  const { colors } = useTheme();
  const router = useRouter();
  return (
    <Pressable accessibilityLabel="Profile and settings" onPress={() => router.push('/profile')} style={[styles.avatar, { backgroundColor: colors.primaryFill }]}>
      <Icon name="person" size={20} color={colors.onPrimaryFill} />
    </Pressable>
  );
}

function InfoTile({ icon, title, subtitle, accent }: { icon: IconName; title: string; subtitle: string; accent?: boolean }) {
  const { colors } = useTheme();
  return (
    <Inset style={styles.infoTile}>
      <IconTile name={icon} size={32} shape="circle" color={colors.primary} tint={colors.primaryTint} />
      <View style={{ flex: 1 }}>
        <AppText variant="labelMd" color="textStrong" numberOfLines={2}>
          {title}
        </AppText>
        <AppText variant="labelSm" tint={accent ? colors.secondary : colors.textMuted} numberOfLines={1}>
          {subtitle}
        </AppText>
      </View>
    </Inset>
  );
}

type ReadoutProps = { title: string; icon: IconName; value: string; unit: string; badge: { icon: IconName; label: string }; footnote: string };

function Readout({ title, icon, value, unit, badge, footnote }: ReadoutProps) {
  const { colors } = useTheme();
  return (
    <Card style={{ flex: 1, gap: spacing.sm }}>
      <View style={styles.between}>
        <AppText variant="labelLg" color="textStrong" style={{ flex: 1 }}>
          {title}
        </AppText>
        <IconTile name={icon} size={28} />
      </View>
      <View style={styles.valueRow}>
        <AppText variant="telemetry" color="textStrong" tabular>
          {value}
        </AppText>
        <AppText variant="headlineSm" tint={colors.primary} style={{ marginBottom: 4 }}>
          {unit}
        </AppText>
      </View>
      <Badge label={badge.label} icon={badge.icon} kind="success" />
      <View style={styles.inline}>
        <Icon name="check_circle" size={14} color={colors.secondary} />
        <AppText variant="labelSm" color="textMuted" tabular>
          {footnote}
        </AppText>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  identity: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm + 4 },
  inline: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  fav: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  infoRow: { flexDirection: 'row', gap: spacing.sm + 4 },
  infoTile: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.sm + 2 },
  valueRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 4 },
  placeholder: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.lg },
  accordionHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm + 4, padding: spacing.md },
  accordionBody: { padding: spacing.md, gap: spacing.sm + 4, borderTopWidth: StyleSheet.hairlineWidth },
  alertRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm + 4 },
  avatar: { width: 32, height: 32, borderRadius: radius.full, alignItems: 'center', justifyContent: 'center' },
  missing: { alignItems: 'center', gap: spacing.md, paddingVertical: spacing.xl },
});
