import type { AlertRule, Condition, Metric, TriggerDuration } from './types';

export const metricUnit: Record<Metric, string> = { temperature: '°C', humidity: '% RH' };

export function formatThreshold(metric: Metric, value: number): string {
  return metric === 'temperature' ? `${value.toFixed(1)}°C` : `${Math.round(value)}% RH`;
}

export const durationLabel: Record<TriggerDuration, string> = {
  immediate: 'Immediately',
  '5m': 'For 5 mins',
  '15m': 'For 15 mins',
};

const durationPhrase: Record<TriggerDuration, string | null> = { immediate: null, '5m': '5 mins', '15m': '15 mins' };

export const thresholdStep: Record<Metric, number> = { temperature: 0.5, humidity: 1 };
export const thresholdBounds: Record<Metric, [number, number]> = { temperature: [5, 40], humidity: [10, 90] };

export function stepThreshold(metric: Metric, value: number, direction: 1 | -1): number {
  const [min, max] = thresholdBounds[metric];
  const next = Math.round((value + direction * thresholdStep[metric]) * 10) / 10;
  return Math.min(max, Math.max(min, next));
}

export function defaultRuleName(metric: Metric, condition: Condition): string {
  const level = condition === 'below' ? 'Low' : 'High';
  return metric === 'temperature' ? `${level} Temperature Alert` : `${level} Humidity Warning`;
}

/** "Notify when Living Room drops below 19.5°C" — Alerts list description. */
export function describeRuleShort(rule: Pick<AlertRule, 'metric' | 'condition' | 'threshold'>, room: string): string {
  const verb = rule.condition === 'below' ? 'drops below' : 'rises above';
  return `Notify when ${room} ${verb} ${formatThreshold(rule.metric, rule.threshold)}`;
}

export type SummaryPart = { text: string; highlight?: boolean };

/** Rule Summary Preview copy, split so highlighted tokens can be coloured. */
export function describeRuleSummary(
  rule: Pick<AlertRule, 'metric' | 'condition' | 'threshold' | 'duration' | 'notify'>,
  room: string,
): SummaryPart[] {
  const verb = rule.condition === 'below' ? 'drops below' : 'rises above';
  const parts: SummaryPart[] = [
    { text: 'When ' },
    { text: room, highlight: true },
    { text: ` ${rule.metric} ${verb} ` },
    { text: formatThreshold(rule.metric, rule.threshold), highlight: true },
  ];
  const duration = durationPhrase[rule.duration];
  if (duration) parts.push({ text: ' for ' }, { text: duration, highlight: true });
  parts.push({ text: ` → ${notifyPhrase(rule.notify)}.` });
  return parts;
}

function notifyPhrase(notify: AlertRule['notify']): string {
  if (notify.push) return 'Send push notification';
  if (notify.inApp) return 'Save to alert feed';
  if (notify.sound) return 'Play buzzer chime';
  return 'Log silently';
}
