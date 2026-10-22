import {
  Id,
  isThresholdInBounds,
  ONLINE_INTERVALS,
  type AlertEvent,
  type AlertEventList,
  type AlertRule,
  type Condition,
  type CreateAlertRuleRequest,
  type Metric,
  type UpdateAlertRuleRequest,
} from '@nexa/contracts';

import type { Database } from '../../db/client';
import type { AlertEventRow, AlertRuleRow, DeviceRow, ReadingRow } from '../../db/schema';
import type { Issue } from '../telemetry/service';

import * as repo from './repo';

type Db = Database['db'];

export function toApiRule(row: AlertRuleRow): AlertRule {
  return {
    id: row.id,
    deviceId: row.deviceId,
    name: row.name,
    metric: row.metric as Metric,
    condition: row.condition as Condition,
    threshold: row.threshold,
    durationS: row.durationS as AlertRule['durationS'],
    notify: { push: row.notifyPush, inApp: row.notifyInApp, sound: row.notifySound },
    enabled: row.enabled,
    ...(row.origin !== null && { origin: row.origin }),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function toApiEvent(row: AlertEventRow): AlertEvent {
  return {
    id: row.id,
    ruleId: row.ruleId,
    deviceId: row.deviceId,
    metric: row.metric as Metric,
    condition: row.condition as Condition,
    threshold: row.threshold,
    triggerValue: row.triggerValue,
    triggeredAt: row.triggeredAt.toISOString(),
    resolvedAt: row.resolvedAt?.toISOString() ?? null,
    acknowledgedAt: row.acknowledgedAt?.toISOString() ?? null,
  };
}

// --- Rules ---

const deviceMissing: Issue[] = [{ path: 'deviceId', message: 'No device with this id.' }];
const thresholdOutOfBounds: Issue[] = [{ path: 'threshold', message: 'Threshold is outside the allowed range for this metric' }];

/** Postgres foreign-key violation on the rule's device, possibly wrapped by Drizzle. */
function isMissingDevice(error: unknown): boolean {
  const pgError = (error as { cause?: unknown })?.cause ?? error;
  const { code, constraint } = (pgError ?? {}) as { code?: string; constraint?: string };
  return code === '23503' && constraint === 'alert_rules_device_id_devices_id_fk';
}

/**
 * Creates a rule, evaluated against readings recorded from `now`. The device must exist; the
 * foreign key checks it, so a concurrent delete can't slip past. The insert runs in its own
 * transaction (a savepoint when nested), so a rejected insert doesn't abort an enclosing one.
 */
export async function createRule(db: Db, input: CreateAlertRuleRequest & { enabled: boolean }, now: Date): Promise<AlertRule | { issues: Issue[] }> {
  try {
    const row = await db.transaction((tx) => repo.insertRule(tx, {
      deviceId: input.deviceId,
      name: input.name,
      metric: input.metric,
      condition: input.condition,
      threshold: input.threshold,
      durationS: input.durationS,
      notifyPush: input.notify.push,
      notifyInApp: input.notify.inApp,
      notifySound: input.notify.sound,
      enabled: input.enabled,
      origin: input.origin ?? null,
      evaluateFrom: now,
    }));
    return toApiRule(row);
  } catch (error) {
    if (isMissingDevice(error)) return { issues: deviceMissing };
    throw error;
  }
}

/** Fields whose change makes an open event describe a rule that no longer exists. */
const evaluatedFields = ['metric', 'condition', 'threshold', 'durationS'] as const;

/**
 * Applies a partial update to an undeleted rule, re-validating the merged threshold. Disabling a
 * rule, or changing what it evaluates, resolves its open event now. Re-enabling it, or changing
 * what it evaluates, restarts evaluation from now: readings recorded earlier are never evaluated
 * against the new settings. Null if the rule doesn't exist.
 */
export async function updateRule(db: Db, id: string, input: UpdateAlertRuleRequest, now: Date): Promise<AlertRule | { issues: Issue[] } | null> {
  return db.transaction(async (tx) => {
    const current = await repo.findRule(tx, id, { lock: true });
    if (!current) return null;

    const metric = input.metric ?? (current.metric as Metric);
    const threshold = input.threshold ?? current.threshold;
    if (!isThresholdInBounds(metric, threshold)) return { issues: thresholdOutOfBounds };

    const changed = evaluatedFields.some((field) => input[field] !== undefined && input[field] !== current[field]);
    const disabling = input.enabled === false;
    const enabling = input.enabled === true && !current.enabled;
    // A new event can't overlap the one resolved here: it needs a reading recorded after both
    // `now` and the device's newest stored reading, and the resolved event ends at the later of those.
    if (changed || disabling) await repo.resolveOpenEvent(tx, id, now);

    const { notify, ...rest } = input;
    const row = await repo.updateRule(
      tx,
      id,
      { ...rest, ...(notify && { notifyPush: notify.push, notifyInApp: notify.inApp, notifySound: notify.sound }) },
      changed || enabling ? now : undefined,
    );
    return toApiRule(row);
  });
}

/** Soft-deletes a rule, keeping its events, and resolves its open event. False if it doesn't exist. */
export async function deleteRule(db: Db, id: string, now: Date): Promise<boolean> {
  return db.transaction(async (tx) => {
    if (!(await repo.findRule(tx, id, { lock: true }))) return false;
    await repo.updateRule(tx, id, { deletedAt: now });
    await repo.resolveOpenEvent(tx, id, now);
    return true;
  });
}

// --- Event history ---

type EventQuery = { deviceId?: string; status: 'open' | 'resolved' | 'all'; limit: number; cursor?: string };

/** Opaque to clients: base64url JSON of the last item's trigger time and id. */
export function encodeEventCursor(row: Pick<AlertEventRow, 'triggeredAt' | 'id'>): string {
  return Buffer.from(JSON.stringify({ t: row.triggeredAt.toISOString(), id: row.id })).toString('base64url');
}

function decodeEventCursor(cursor: string): { triggeredAt: Date; id: string } | null {
  try {
    const parsed: unknown = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
    if (typeof parsed !== 'object' || parsed === null) return null;
    const { t, id } = parsed as { t?: unknown; id?: unknown };
    if (typeof t !== 'string' || !Id.safeParse(id).success) return null;
    const triggeredAt = new Date(t);
    return Number.isNaN(triggeredAt.getTime()) || triggeredAt.toISOString() !== t ? null : { triggeredAt, id: id as string };
  } catch {
    return null;
  }
}

export async function listEvents(db: Db, query: EventQuery): Promise<AlertEventList | { issues: Issue[] }> {
  let before: { triggeredAt: Date; id: string } | undefined;
  if (query.cursor !== undefined) {
    const decoded = decodeEventCursor(query.cursor);
    if (!decoded) return { issues: [{ path: 'query.cursor', message: 'Not a cursor returned by this endpoint.' }] };
    before = decoded;
  }
  // One extra row tells us whether there is a next page.
  const rows = await repo.listEvents(db, { deviceId: query.deviceId, status: query.status, before }, query.limit + 1);
  const page = rows.slice(0, query.limit);
  const last = page.at(-1);
  return { items: page.map(toApiEvent), nextCursor: rows.length > query.limit && last ? encodeEventCursor(last) : null };
}

// --- Evaluation ---

type EvaluatedRule = Pick<AlertRuleRow, 'metric' | 'condition' | 'threshold' | 'durationS'>;
type Sample = Pick<ReadingRow, 'recordedAt' | 'temperatureC' | 'humidityPct'>;
export type Transition = { kind: 'open'; at: Date; value: number } | { kind: 'resolve'; at: Date };

const valueOf = (rule: EvaluatedRule, reading: Sample) => (rule.metric === 'temperature' ? reading.temperatureC : reading.humidityPct);
const meets = (rule: EvaluatedRule, value: number) => (rule.condition === 'above' ? value > rule.threshold : value < rule.threshold);

/**
 * Walks `incoming` readings (oldest first) through one rule and returns the events to open and
 * resolve, in order. A rule opens once its condition has held on every reading for `durationS`
 * (immediately when 0); the open event resolves at the first reading that doesn't meet it. A
 * gap between readings longer than `gapMs` restarts the duration, but doesn't resolve an open
 * event. `history` is the stored readings just before `incoming` (newest first) and only needs
 * to reach back `durationS + gapMs` before the first incoming reading.
 */
export function evaluateRule(rule: EvaluatedRule, history: Sample[], incoming: Sample[], isOpen: boolean, gapMs: number): Transition[] {
  const durationMs = rule.durationS * 1000;

  // Where the current streak of matching readings began, as of the newest stored reading.
  let streakStart: Date | null = null;
  let previous: Date | null = history[0]?.recordedAt ?? null;
  let newer: Date | null = null;
  for (const reading of history) {
    if (!meets(rule, valueOf(rule, reading)) || (newer && newer.getTime() - reading.recordedAt.getTime() > gapMs)) break;
    streakStart = reading.recordedAt;
    newer = reading.recordedAt;
  }

  const transitions: Transition[] = [];
  for (const reading of incoming) {
    const at = reading.recordedAt;
    if (previous && at.getTime() - previous.getTime() > gapMs) streakStart = null;
    previous = at;

    const value = valueOf(rule, reading);
    if (!meets(rule, value)) {
      streakStart = null;
      if (isOpen) {
        transitions.push({ kind: 'resolve', at });
        isOpen = false;
      }
      continue;
    }
    streakStart ??= at;
    if (!isOpen && at.getTime() - streakStart.getTime() >= durationMs) {
      transitions.push({ kind: 'open', at, value });
      isOpen = true;
    }
  }
  return transitions;
}

/**
 * Evaluates the device's enabled rules against readings just stored, inside the ingestion
 * transaction (the device row is already locked, so reports from one device are evaluated one at
 * a time). Only readings newer than `previousLatest` are evaluated: a late reading older than
 * what was already stored can't retroactively open or resolve events. Each rule also ignores
 * readings, stored or new, recorded before its `evaluateFrom`.
 */
export async function evaluateNewReadings(db: Db, device: DeviceRow, stored: Sample[], previousLatest: Date | null): Promise<void> {
  const incoming = stored.filter((r) => !previousLatest || r.recordedAt > previousLatest).sort((a, b) => a.recordedAt.getTime() - b.recordedAt.getTime());
  const first = incoming[0];
  if (!first) return;

  const rules = await repo.lockActiveRules(db, device.id);
  if (!rules.length) return;

  const gapMs = ONLINE_INTERVALS * device.reportingIntervalS * 1000;
  const lookbackMs = Math.max(...rules.map((r) => r.durationS * 1000)) + gapMs;
  const history = previousLatest ? await repo.readingsBetween(db, device.id, new Date(first.recordedAt.getTime() - lookbackMs), previousLatest) : [];

  for (const rule of rules) {
    const since = (r: Sample) => r.recordedAt >= rule.evaluateFrom;
    const open = await repo.findOpenEvent(db, rule.id);
    for (const t of evaluateRule(rule, history.filter(since), incoming.filter(since), open !== null, gapMs)) {
      if (t.kind === 'resolve') await repo.resolveOpenEvent(db, rule.id, t.at);
      else
        await repo.insertEvent(db, {
          ruleId: rule.id,
          deviceId: device.id,
          metric: rule.metric,
          condition: rule.condition,
          threshold: rule.threshold,
          triggerValue: t.value,
          triggeredAt: t.at,
        });
    }
  }
}
