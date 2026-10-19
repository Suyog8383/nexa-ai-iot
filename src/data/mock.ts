/**
 * Mock telemetry matching the approved Stitch designs (dark-theme copy is canonical).
 * Replace with live ESP32 / backend data via `src/services`.
 */
import type { ActivityItem, AlertHistoryItem, AlertRule, ChatMessage, Device, TrendPoint } from './types';

export const livingRoomMonitor: Device = {
  id: 'living-room-monitor',
  name: 'Living Room Monitor',
  room: 'Living Room',
  board: 'ESP32',
  boardModel: 'ESP32-WROOM-32',
  sensor: 'BME280',
  node: 'Node 04',
  status: 'online',
  rssi: -62,
  bssid: 'NexaHub_2.4G',
  power: '5V USB',
  temperature: 21.5,
  humidity: 45,
  temperatureTarget: [20, 23],
  humidityRange: [40, 60],
  ip: '192.168.1.84',
  mac: '24:6F:28:XX:XX',
  telemetryInterval: 'Every 30 seconds',
  calibrationOffset: '±0.0°C',
};

export const devices: Device[] = [livingRoomMonitor];

/** Today's temperature curve: 6 AM low, 2 PM high, settling at 21.5°C now. */
export const todayTrend: TrendPoint[] = [
  { hour: 0, temperature: 20.9, humidity: 47 },
  { hour: 2, temperature: 20.6, humidity: 48 },
  { hour: 4, temperature: 21.2, humidity: 48 },
  { hour: 6, temperature: 19.8, humidity: 42 },
  { hour: 8, temperature: 20.1, humidity: 43 },
  { hour: 10, temperature: 20.8, humidity: 44 },
  { hour: 12, temperature: 21.6, humidity: 44 },
  { hour: 14, temperature: 22.1, humidity: 43 },
  { hour: 16, temperature: 21.9, humidity: 44 },
  { hour: 18, temperature: 21.2, humidity: 45 },
  { hour: 20, temperature: 21.0, humidity: 46 },
  { hour: 22, temperature: 21.5, humidity: 45 },
];

export const homeActivity: ActivityItem[] = [
  {
    id: 'a1',
    icon: 'water_drop',
    title: 'Living room humidity dipped below 40%',
    meta: '11:30 AM • Living Room Monitor (BME280)',
    badge: { label: 'Resolved', kind: 'success' },
  },
];

export const deviceActivity: ActivityItem[] = [
  { id: 'd1', icon: 'wifi', title: 'Wi-Fi reconnected', meta: 'Signal restored at -62 dBm • Today at 10:14 AM' },
  { id: 'd2', icon: 'tune', title: 'Hourly calibration check normal', meta: 'BME280 self-test passed • Today at 9:00 AM' },
];

export const initialRules: AlertRule[] = [
  {
    id: 'r-low-temp',
    name: 'Low Temperature Alert',
    deviceId: livingRoomMonitor.id,
    metric: 'temperature',
    condition: 'below',
    threshold: 19.5,
    duration: '5m',
    notify: { push: true, inApp: true, sound: false },
    enabled: true,
  },
  {
    id: 'r-high-humidity',
    name: 'High Humidity Warning',
    deviceId: livingRoomMonitor.id,
    metric: 'humidity',
    condition: 'above',
    threshold: 60,
    duration: '5m',
    notify: { push: true, inApp: true, sound: false },
    enabled: true,
  },
];

export const alertHistory: AlertHistoryItem[] = [
  {
    id: 'h1',
    icon: 'schedule',
    time: 'Today, 11:30 AM • BME280 Sensor',
    title: 'Living room humidity dipped below 40%',
    detail: 'Humidifier automatically turned on and restored safe 45% level',
    badge: { label: 'Auto-resolved', kind: 'success' },
  },
  {
    id: 'h2',
    icon: 'schedule',
    time: 'Today, 6:00 AM • BME280 Sensor',
    title: 'Living room temperature dropped to 19.8°C',
    detail: 'Dismissed on mobile • Habitat acclimating',
    badge: { label: 'Acknowledged', kind: 'primary', icon: 'done_all' },
  },
  {
    id: 'h3',
    icon: 'wifi',
    time: 'Yesterday, 10:14 AM',
    title: 'ESP32 Wi-Fi connected to NexaHub',
    detail: 'Hardware heartbeat verified (RSSI -58 dBm)',
    badge: { label: 'System', kind: 'neutral' },
  },
];

export const suggestedInquiries = [
  { icon: 'thermostat', text: 'Why did the temperature drop at 6:00 AM?' },
  { icon: 'humidity_mid', text: 'Is the humidity within healthy range today?' },
  { icon: 'timeline', text: 'What was the peak temperature in the past 24 hours?' },
] as const;

export const seededConversation: ChatMessage[] = [
  { id: 'm1', role: 'user', text: 'Why did the living room temperature drop at 6:00 AM?', time: '06:14 AM' },
  {
    id: 'm2',
    role: 'assistant',
    text:
      'At 6:00 AM, the temperature recorded by your Living Room Monitor (ESP32 • BME280) dipped to 19.8°C (down from 21.2°C at 4:00 AM). The humidity also showed a slight drop from 48% to 42%. Based purely on your sensor timeline, the room cooled steadily over 2 hours.',
    context: {
      device: 'Living Room Monitor',
      status: 'Optimal',
      value: '21.5°C',
      caption: 'Current',
      corridor: 'Comfort corridor: 20.0°–23.0°C',
      tip: 'Consider setting a Low Temperature Alert rule for 19.5°C to be notified if it cools further.',
    },
    suggestion: {
      title: 'Set Low Temperature Alert (19.5°C)',
      description: 'Notify when Living Room Monitor temperature drops below 19.5°C based on BME280 telemetry.',
      rule: { metric: 'temperature', condition: 'below', threshold: 19.5 },
    },
  },
];
