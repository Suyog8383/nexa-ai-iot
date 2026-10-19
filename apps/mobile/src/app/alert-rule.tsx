import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ResultState } from '@/components/feedback/ResultState';
import { StateCard } from '@/components/feedback/StateCard';
import { Screen } from '@/components/layout/Screen';
import { StackHeader } from '@/components/layout/StackHeader';
import { AppText } from '@/components/ui/AppText';
import { Badge, PulseDot } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Icon, type IconName } from '@/components/ui/Icon';
import { IconTile } from '@/components/ui/IconTile';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { Toggle } from '@/components/ui/Toggle';
import { defaultRuleName, describeRuleSummary, formatThreshold, stepThreshold } from '@/domain/rules';
import type { Condition, Device, Metric, NotifyPrefs, TriggerDuration } from '@/domain/types';
import { usePrimaryDevice } from '@/hooks/useDevices';
import { useAlertsStore } from '@/stores/alertsStore';
import { useTheme } from '@/theme/useTheme';
import { radius, spacing, typography } from '@/theme/tokens';

const DEFAULT_THRESHOLD: Record<Metric, number> = { temperature: 19.5, humidity: 60 };

type Params = { from?: string; origin?: string; metric?: Metric; condition?: Condition; threshold?: string };

export default function CreateAlertRuleScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<Params>();
  const deviceResult = usePrimaryDevice();
  const { data: device } = deviceResult;

  if (device) return <AlertRuleForm device={device} params={params} />;

  const header = <StackHeader layout="centered" backLabel={params.from === 'assistant' ? 'Assistant' : 'Alerts'} title="New Alert Rule" />;
  return (
    <Screen header={header}>
      {device === null ? (
        <StateCard
          icon="sensors"
          title="No devices yet"
          message="Pair an ESP32 sensor before creating alert rules."
          action={{ label: 'Pair New Device', onPress: () => router.push('/pair') }}
        />
      ) : (
        <ResultState {...deviceResult} />
      )}
    </Screen>
  );
}

function AlertRuleForm({ device, params }: { device: Device; params: Params }) {
  const { colors } = useTheme();
  const router = useRouter();
  const addRule = useAlertsStore((s) => s.addRule);

  const [metric, setMetric] = useState<Metric>(params.metric ?? 'temperature');
  const [condition, setCondition] = useState<Condition>(params.condition ?? 'below');
  const [threshold, setThreshold] = useState(params.threshold ? Number(params.threshold) : DEFAULT_THRESHOLD[metric]);
  const [duration, setDuration] = useState<TriggerDuration>('5m');
  const [notify, setNotify] = useState<NotifyPrefs>({ push: true, inApp: true, sound: false });

  const current = metric === 'temperature' ? device.temperature : device.humidity;
  const backLabel = params.from === 'assistant' ? 'Assistant' : 'Alerts';

  function selectMetric(next: Metric) {
    setMetric(next);
    setThreshold(DEFAULT_THRESHOLD[next]);
    setCondition(next === 'temperature' ? 'below' : 'above');
  }

  function save() {
    addRule({ name: defaultRuleName(metric, condition), deviceId: device.id, metric, condition, threshold, duration, notify, enabled: true, origin: params.origin });
    router.back();
  }

  const cancel = (
    <Pressable hitSlop={8} onPress={() => router.back()}>
      <AppText variant="bodyLg" color="textMuted">
        Cancel
      </AppText>
    </Pressable>
  );

  return (
    <Screen header={<StackHeader layout="centered" backLabel={backLabel} title="New Alert Rule" right={cancel} />}>
      <View style={{ gap: spacing.xs }}>
        <AppText variant="headlineLg" color="textStrong">
          Configure Alert
        </AppText>
        <AppText variant="bodyMd" color="textMuted">
          Automate notifications when indoor comfort thresholds deviate.
        </AppText>
      </View>

      {/* Target sensor */}
      <Section
        title="Target Sensor"
        right={
          <View style={styles.inline}>
            <PulseDot color={colors.success.dot} />
            <AppText variant="labelSm" tint={colors.secondary}>
              Online
            </AppText>
          </View>
        }>
        <Card active style={styles.sensor}>
          <IconTile name="sensors" size={44} />
          <View style={{ flex: 1 }}>
            <AppText variant="labelLg" color="textStrong">
              {device.name}
            </AppText>
            <AppText variant="bodySm" color="textMuted">
              {device.board} • {device.sensor} • {device.node}
            </AppText>
          </View>
          <View style={[styles.check, { backgroundColor: colors.primaryFill }]}>
            <Icon name="check" size={18} color={colors.onPrimaryFill} />
          </View>
        </Card>
      </Section>

      {/* Metric */}
      <Section title="Select Metric">
        <View style={styles.row}>
          <MetricOption icon="device_thermostat" title="Temperature" unit="°C" selected={metric === 'temperature'} onPress={() => selectMetric('temperature')} />
          <MetricOption icon="water_drop" title="Humidity" unit="% RH" selected={metric === 'humidity'} onPress={() => selectMetric('humidity')} />
        </View>
      </Section>

      {/* Condition + threshold */}
      <Section title="Trigger Condition">
        <SegmentedControl
          appearance="tiles"
          value={condition}
          onChange={setCondition}
          segments={[
            { value: 'below', label: 'Drops Below (<)', icon: 'trending_down' },
            { value: 'above', label: 'Rises Above (>)', icon: 'trending_up' },
          ]}
        />
        <Card style={{ gap: spacing.md, backgroundColor: colors.surfaceLow }}>
          <View style={styles.between}>
            <AppText variant="bodyMd" color="textMuted">
              Target Threshold
            </AppText>
            <Badge label={`Current: ${formatThreshold(metric, current)}`} kind="success" />
          </View>
          <View style={styles.stepper}>
            <StepButton icon="remove" label="Decrease threshold" onPress={() => setThreshold((t) => stepThreshold(metric, t, -1))} />
            <View style={{ alignItems: 'center', minWidth: 150 }}>
              <AppText style={[typography.display, { fontSize: 44, lineHeight: 52 }]} tint={colors.primary} tabular accessibilityLiveRegion="polite">
                {metric === 'temperature' ? `${threshold.toFixed(1)}°C` : `${threshold}%`}
              </AppText>
              <AppText variant="bodySm" color="textMuted">
                {condition === 'below' ? (metric === 'temperature' ? 'Cool trigger point' : 'Dry trigger point') : metric === 'temperature' ? 'Warm trigger point' : 'Humid trigger point'}
              </AppText>
            </View>
            <StepButton icon="add" label="Increase threshold" onPress={() => setThreshold((t) => stepThreshold(metric, t, 1))} />
          </View>
        </Card>
      </Section>

      {/* Duration */}
      <Section title="Trigger Duration">
        <SegmentedControl
          appearance="tiles"
          activeStyle="outlined"
          value={duration}
          onChange={setDuration}
          segments={[
            { value: 'immediate', label: 'Immediately' },
            { value: '5m', label: 'For 5 mins' },
            { value: '15m', label: 'For 15 mins' },
          ]}
        />
      </Section>

      {/* Notifications */}
      <Section title="Notification Preference">
        <Card padded={false}>
          <PrefRow icon="notifications_active" title="Push Notification" subtitle="Urgent lockscreen banner" value={notify.push} onChange={(push) => setNotify((n) => ({ ...n, push }))} />
          <PrefRow icon="inbox" title="In-App Alert Feed" subtitle="Save to habitat history" value={notify.inApp} onChange={(inApp) => setNotify((n) => ({ ...n, inApp }))} divider />
          <PrefRow icon="vibration" title="Sound & Haptics" subtitle="Play audible buzzer chime" value={notify.sound} onChange={(sound) => setNotify((n) => ({ ...n, sound }))} divider />
        </Card>
      </Section>

      {/* Summary */}
      <Card active style={styles.summary}>
        <IconTile name="rule" size={36} color={colors.secondary} />
        <View style={{ flex: 1, gap: spacing.xs }}>
          <AppText variant="labelSm" tint={colors.secondary} uppercase>
            Rule Summary Preview
          </AppText>
          <AppText variant="bodyLg" color="textStrong">
            {describeRuleSummary({ metric, condition, threshold, duration, notify }, device.room).map((p, i) => (
              <AppText key={i} variant="bodyLg" tint={p.highlight ? colors.primary : colors.textStrong}>
                {p.text}
              </AppText>
            ))}
          </AppText>
        </View>
      </Card>

      <Button variant="accent" icon="check_circle" label="Save Alert Rule" onPress={save} style={{ marginTop: spacing.sm }} />
      <Button variant="ghost" label="Cancel" onPress={() => router.back()} />
    </Screen>
  );
}

function Section({ title, right, children }: { title: string; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <View style={{ gap: spacing.sm + 2 }}>
      <View style={styles.between}>
        <AppText variant="labelLg" color="textStrong">
          {title}
        </AppText>
        {right}
      </View>
      {children}
    </View>
  );
}

function MetricOption({ icon, title, unit, selected, onPress }: { icon: IconName; title: string; unit: string; selected: boolean; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityLabel={title}
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[styles.metric, { backgroundColor: selected ? colors.primaryTint : colors.surfaceLow, borderColor: selected ? colors.primary : colors.border }]}>
      <IconTile name={icon} size={36} color={selected ? colors.primary : colors.textMuted} />
      <View>
        <AppText variant="labelLg" color="textStrong">
          {title}
        </AppText>
        <AppText variant="labelSm" tint={selected ? colors.primary : colors.textMuted}>
          {unit}
          {selected ? ' • Active' : ''}
        </AppText>
      </View>
    </Pressable>
  );
}

function StepButton({ icon, label, onPress }: { icon: IconName; label: string; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={({ pressed }) => [styles.step, { backgroundColor: colors.surfaceHighest, opacity: pressed ? 0.7 : 1 }]}>
      <Icon name={icon} size={24} color={colors.textStrong} />
    </Pressable>
  );
}

type PrefRowProps = { icon: IconName; title: string; subtitle: string; value: boolean; onChange: (v: boolean) => void; divider?: boolean };

function PrefRow({ icon, title, subtitle, value, onChange, divider }: PrefRowProps) {
  const { colors } = useTheme();
  return (
    <View style={[styles.pref, divider && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }]}>
      <Icon name={icon} size={22} color={value ? colors.primary : colors.textMuted} />
      <View style={{ flex: 1 }}>
        <AppText variant="labelLg" tint={value ? colors.textStrong : colors.textMuted}>
          {title}
        </AppText>
        <AppText variant="bodySm" color="textMuted">
          {subtitle}
        </AppText>
      </View>
      <Toggle value={value} onChange={onChange} accessibilityLabel={title} />
    </View>
  );
}

const styles = StyleSheet.create({
  inline: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  row: { flexDirection: 'row', gap: spacing.sm },
  sensor: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm + 4 },
  check: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  metric: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.sm + 2, padding: spacing.sm + 4, borderRadius: radius.xl, borderWidth: 1 },
  stepper: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  step: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  pref: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm + 4, padding: spacing.md },
  summary: { flexDirection: 'row', gap: spacing.sm + 4, alignItems: 'flex-start' },
});
