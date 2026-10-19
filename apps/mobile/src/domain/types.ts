import type { IconName } from '@/components/ui/Icon';

export type DeviceStatus = 'online' | 'warning' | 'offline';
export type Metric = 'temperature' | 'humidity';
export type Condition = 'below' | 'above';
export type TriggerDuration = 'immediate' | '5m' | '15m';
export type StatusKind = 'success' | 'warning' | 'danger' | 'neutral' | 'primary';

export type Device = {
  id: string;
  name: string;
  /** Short room name used in rule copy, e.g. "Living Room". */
  room: string;
  board: string;
  boardModel: string;
  sensor: string;
  node: string;
  status: DeviceStatus;
  rssi: number;
  bssid: string;
  power: string;
  temperature: number;
  humidity: number;
  temperatureTarget: [number, number];
  humidityRange: [number, number];
  ip: string;
  mac: string;
  telemetryInterval: string;
  calibrationOffset: string;
};

export type TrendPoint = { hour: number; temperature: number; humidity: number };

export type ActivityItem = {
  id: string;
  icon: IconName;
  title: string;
  meta: string;
  badge?: { label: string; kind: StatusKind };
};

export type NotifyPrefs = { push: boolean; inApp: boolean; sound: boolean };

export type AlertRule = {
  id: string;
  name: string;
  deviceId: string;
  metric: Metric;
  condition: Condition;
  threshold: number;
  duration: TriggerDuration;
  notify: NotifyPrefs;
  enabled: boolean;
  /** Chat message id when created from an AI suggestion. */
  origin?: string;
};

export type AlertHistoryItem = {
  id: string;
  icon: IconName;
  time: string;
  title: string;
  detail: string;
  badge: { label: string; kind: StatusKind; icon?: IconName };
};

export type ChatMessage =
  | { id: string; role: 'user'; text: string; time: string }
  | { id: string; role: 'assistant'; text: string; context?: AssistantContext; suggestion?: RuleSuggestion };

export type AssistantContext = { device: string; status: string; value: string; caption: string; corridor: string; tip: string };

export type RuleSuggestion = {
  title: string;
  description: string;
  rule: Pick<AlertRule, 'metric' | 'condition' | 'threshold'>;
};
