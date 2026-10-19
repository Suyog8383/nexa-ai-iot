import { describe, expect, it } from '@jest/globals';

import { defaultRuleName, describeRuleShort, describeRuleSummary, formatThreshold, stepThreshold } from '../rules';

const notify = { push: true, inApp: true, sound: false };
const join = (parts: { text: string }[]) => parts.map((p) => p.text).join('');

describe('rule copy', () => {
  it('matches the Stitch summary preview', () => {
    const parts = describeRuleSummary({ metric: 'temperature', condition: 'below', threshold: 19.5, duration: '5m', notify }, 'Living Room');
    expect(join(parts)).toBe('When Living Room temperature drops below 19.5°C for 5 mins → Send push notification.');
    expect(parts.filter((p) => p.highlight).map((p) => p.text)).toEqual(['Living Room', '19.5°C', '5 mins']);
  });

  it('omits duration when immediate and reflects notify channel', () => {
    const parts = describeRuleSummary(
      { metric: 'humidity', condition: 'above', threshold: 60, duration: 'immediate', notify: { push: false, inApp: true, sound: false } },
      'Living Room',
    );
    expect(join(parts)).toBe('When Living Room humidity rises above 60% RH → Save to alert feed.');
  });

  it('builds the Alerts list description', () => {
    expect(describeRuleShort({ metric: 'temperature', condition: 'below', threshold: 19.5 }, 'Living Room')).toBe(
      'Notify when Living Room drops below 19.5°C',
    );
    expect(describeRuleShort({ metric: 'humidity', condition: 'above', threshold: 60 }, 'Living Room')).toBe(
      'Notify when Living Room rises above 60% RH',
    );
  });

  it('names rules like the designs', () => {
    expect(defaultRuleName('temperature', 'below')).toBe('Low Temperature Alert');
    expect(defaultRuleName('humidity', 'above')).toBe('High Humidity Warning');
  });

  it('formats thresholds', () => {
    expect(formatThreshold('temperature', 20)).toBe('20.0°C');
    expect(formatThreshold('humidity', 59.6)).toBe('60% RH');
  });
});

describe('stepThreshold', () => {
  it('steps temperature by 0.5 without float drift', () => {
    expect(stepThreshold('temperature', 19.5, 1)).toBe(20);
    expect(stepThreshold('temperature', 19.5, -1)).toBe(19);
    expect(stepThreshold('temperature', 0.1 + 0.2, 1)).toBe(5);
  });

  it('clamps to metric bounds', () => {
    expect(stepThreshold('temperature', 40, 1)).toBe(40);
    expect(stepThreshold('humidity', 10, -1)).toBe(10);
    expect(stepThreshold('humidity', 60, 1)).toBe(61);
  });
});
