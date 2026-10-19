import { ALERT_THRESHOLD_BOUNDS, ALERT_THRESHOLD_STEP, CONDITIONS, METRICS } from '@nexa/contracts/limits';

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

/** Shared with the API so the stepper and server validation always agree. */
export const thresholdStep = ALERT_THRESHOLD_STEP;
export const thresholdBounds = ALERT_THRESHOLD_BOUNDS;

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

const metrics: readonly Metric[] = METRICS;
const conditions: readonly Condition[] = CONDITIONS;
const durations: readonly TriggerDuration[] = ['immediate', '5m', '15m'];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

/**
 * Returns a well-formed rule, or null if `value` isn't one. Used on anything that didn't come
 * straight from typed code — persisted state today, API payloads later.
 */
export function parseAlertRule(value: unknown): AlertRule | null {
  if (!isRecord(value)) return null;
  const { id, name, deviceId, metric, condition, threshold, duration, notify, enabled, origin } = value;
  if (!isNonEmptyString(id) || !isNonEmptyString(name) || !isNonEmptyString(deviceId)) return null;
  if (!metrics.includes(metric as Metric) || !conditions.includes(condition as Condition)) return null;
  if (!durations.includes(duration as TriggerDuration)) return null;
  if (typeof threshold !== 'number' || !Number.isFinite(threshold)) return null;
  const [min, max] = thresholdBounds[metric as Metric];
  if (threshold < min || threshold > max) return null;
  if (!isRecord(notify) || typeof notify.push !== 'boolean' || typeof notify.inApp !== 'boolean' || typeof notify.sound !== 'boolean') return null;
  if (typeof enabled !== 'boolean') return null;
  if (origin !== undefined && typeof origin !== 'string') return null;

  return {
    id,
    name,
    deviceId,
    metric: metric as Metric,
    condition: condition as Condition,
    threshold,
    duration: duration as TriggerDuration,
    notify: { push: notify.push, inApp: notify.inApp, sound: notify.sound },
    enabled,
    ...(origin !== undefined && { origin }),
  };
}
