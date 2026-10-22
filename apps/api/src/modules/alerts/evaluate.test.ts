import { describe, expect, it } from 'vitest';

import { evaluateRule } from './service';

const S = 1000;
const t0 = Date.parse('2026-10-22T08:00:00.000Z');
const r = (offsetS: number, temperatureC: number, humidityPct = 50) => ({ recordedAt: new Date(t0 + offsetS * S), temperatureC, humidityPct });
const newestFirst = <T extends { recordedAt: Date }>(rows: T[]) => [...rows].sort((a, b) => b.recordedAt.getTime() - a.recordedAt.getTime());

const hot = { metric: 'temperature', condition: 'above', threshold: 30, durationS: 300 };
const GAP = 90 * S;

describe('evaluateRule', () => {
  it('continues a streak that began in stored history', () => {
    const history = newestFirst([r(0, 31), r(30, 31), r(60, 31)]);
    // 60 → 270 s is a gap of 210 s, so the streak restarts at 270 and 300 s isn't long enough.
    expect(evaluateRule(hot, history, [r(270, 31), r(300, 32)], false, GAP)).toEqual([]);
    // With readings every 30 s since 0, the reading at 300 completes 5 minutes.
    expect(evaluateRule(hot, newestFirst([...history, r(90, 31), r(120, 31), r(150, 31), r(180, 31), r(210, 31), r(240, 31)]), [r(270, 31), r(300, 32)], false, GAP)).toEqual([
      { kind: 'open', at: new Date(t0 + 300 * S), value: 32 },
    ]);
  });

  it('stops walking history at a reading that does not meet the condition', () => {
    const history = newestFirst([r(0, 31), r(30, 29), ...[60, 90, 120, 150, 180, 210, 240, 270].map((s) => r(s, 31))]);
    expect(evaluateRule(hot, history, [r(300, 31)], false, GAP)).toEqual([]);
    expect(evaluateRule(hot, history, [r(300, 31), r(330, 31), r(360, 31)], false, GAP)).toEqual([{ kind: 'open', at: new Date(t0 + 360 * S), value: 31 }]);
  });

  it('stops walking history at a gap', () => {
    const history = newestFirst([r(0, 31), ...[120, 150, 180, 210, 240, 270].map((s) => r(s, 31))]);
    expect(evaluateRule(hot, history, [r(300, 31)], false, GAP)).toEqual([]);
  });

  it('does not resolve an open event across a gap, only on a reading that clears', () => {
    expect(evaluateRule({ ...hot, durationS: 0 }, [r(0, 31)], [r(600, 31)], true, GAP)).toEqual([]);
    expect(evaluateRule({ ...hot, durationS: 0 }, [r(0, 31)], [r(600, 29)], true, GAP)).toEqual([{ kind: 'resolve', at: new Date(t0 + 600 * S) }]);
  });

  it('compares "below" strictly', () => {
    const cold = { metric: 'humidity', condition: 'below', threshold: 30, durationS: 0 };
    expect(evaluateRule(cold, [], [r(0, 20, 30)], false, GAP)).toEqual([]);
    expect(evaluateRule(cold, [], [r(0, 20, 29.9)], false, GAP)).toEqual([{ kind: 'open', at: new Date(t0), value: 29.9 }]);
  });
});
