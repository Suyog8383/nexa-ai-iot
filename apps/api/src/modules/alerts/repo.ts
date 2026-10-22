import { and, asc, desc, eq, gte, isNotNull, isNull, lt, lte, or, sql, type SQL } from 'drizzle-orm';

import type { Database } from '../../db/client';
import { alertEvents, alertRules, readings, type AlertEventRow, type AlertRuleRow, type ReadingRow } from '../../db/schema';

type Db = Database['db'];

export type NewAlertRule = Pick<
  AlertRuleRow,
  'deviceId' | 'name' | 'metric' | 'condition' | 'threshold' | 'durationS' | 'notifyPush' | 'notifyInApp' | 'notifySound' | 'enabled' | 'origin' | 'evaluateFrom'
>;
export type AlertRuleChanges = Partial<Omit<NewAlertRule, 'deviceId' | 'origin' | 'evaluateFrom'>>;

const live = isNull(alertRules.deletedAt);

export async function insertRule(db: Db, rule: NewAlertRule): Promise<AlertRuleRow> {
  const [row] = await db.insert(alertRules).values(rule).returning();
  if (!row) throw new Error('insert returned no row');
  return row;
}

/** Rules that aren't deleted, oldest first. */
export function listRules(db: Db, deviceId?: string): Promise<AlertRuleRow[]> {
  return db
    .select()
    .from(alertRules)
    .where(and(live, deviceId === undefined ? undefined : eq(alertRules.deviceId, deviceId)))
    .orderBy(asc(alertRules.createdAt), asc(alertRules.id));
}

/** A rule that isn't deleted. `lock` takes a row lock, serializing edits with evaluation of the same rule. */
export async function findRule(db: Db, id: string, { lock = false } = {}): Promise<AlertRuleRow | null> {
  const query = db.select().from(alertRules).where(and(eq(alertRules.id, id), live)).limit(1);
  const [row] = lock ? await query.for('update') : await query;
  return row ?? null;
}

/** Updates a rule. `restartEvaluationAt` moves `evaluate_from` to that time. */
export async function updateRule(db: Db, id: string, changes: AlertRuleChanges & { deletedAt?: Date }, restartEvaluationAt?: Date): Promise<AlertRuleRow> {
  const [row] = await db
    .update(alertRules)
    .set({
      ...changes,
      updatedAt: sql`now()`,
      ...(restartEvaluationAt && { evaluateFrom: restartEvaluationAt }),
    })
    .where(eq(alertRules.id, id))
    .returning();
  if (!row) throw new Error('update returned no row');
  return row;
}

/** Enabled, undeleted rules for a device, locked until the transaction ends. */
export function lockActiveRules(db: Db, deviceId: string): Promise<AlertRuleRow[]> {
  return db
    .select()
    .from(alertRules)
    .where(and(eq(alertRules.deviceId, deviceId), eq(alertRules.enabled, true), live))
    .orderBy(asc(alertRules.id))
    .for('update');
}

// --- Events ---

export type NewAlertEvent = Pick<AlertEventRow, 'ruleId' | 'deviceId' | 'metric' | 'condition' | 'threshold' | 'triggerValue' | 'triggeredAt'>;

export async function findOpenEvent(db: Db, ruleId: string): Promise<AlertEventRow | null> {
  const [row] = await db
    .select()
    .from(alertEvents)
    .where(and(eq(alertEvents.ruleId, ruleId), isNull(alertEvents.resolvedAt)))
    .limit(1);
  return row ?? null;
}

/** Opens an event. Returns null if one already exists for this rule and trigger time (a re-evaluation). */
export async function insertEvent(db: Db, event: NewAlertEvent): Promise<AlertEventRow | null> {
  const [row] = await db.insert(alertEvents).values(event).onConflictDoNothing({ target: [alertEvents.ruleId, alertEvents.triggeredAt] }).returning();
  return row ?? null;
}

/**
 * Resolves the rule's open event, if any, at `at`, or at its trigger time if `at` is earlier
 * (a device clock may run up to 2 minutes ahead of the server).
 */
export async function resolveOpenEvent(db: Db, ruleId: string, at: Date): Promise<void> {
  await db
    .update(alertEvents)
    .set({ resolvedAt: sql`greatest(${at.toISOString()}::timestamptz, ${alertEvents.triggeredAt})` })
    .where(and(eq(alertEvents.ruleId, ruleId), isNull(alertEvents.resolvedAt)));
}

export type EventFilter = { deviceId?: string; status: 'open' | 'resolved' | 'all'; before?: { triggeredAt: Date; id: string } };

/** Events newest first (by trigger time, then id). `before` resumes after the last item of a previous page. */
export function listEvents(db: Db, filter: EventFilter, limit: number): Promise<AlertEventRow[]> {
  const conditions: (SQL | undefined)[] = [
    filter.deviceId === undefined ? undefined : eq(alertEvents.deviceId, filter.deviceId),
    filter.status === 'open' ? isNull(alertEvents.resolvedAt) : filter.status === 'resolved' ? isNotNull(alertEvents.resolvedAt) : undefined,
    filter.before &&
      or(lt(alertEvents.triggeredAt, filter.before.triggeredAt), and(eq(alertEvents.triggeredAt, filter.before.triggeredAt), lt(alertEvents.id, filter.before.id))),
  ];
  return db
    .select()
    .from(alertEvents)
    .where(and(...conditions))
    .orderBy(desc(alertEvents.triggeredAt), desc(alertEvents.id))
    .limit(limit);
}

/** Sets `acknowledged_at` once; acknowledging again keeps the first time. Null if no such event. */
export async function acknowledgeEvent(db: Db, id: string, at: Date): Promise<AlertEventRow | null> {
  const [row] = await db
    .update(alertEvents)
    .set({ acknowledgedAt: sql`coalesce(${alertEvents.acknowledgedAt}, greatest(${at.toISOString()}::timestamptz, ${alertEvents.triggeredAt}))` })
    .where(eq(alertEvents.id, id))
    .returning();
  return row ?? null;
}

// --- Readings for evaluation ---

/** Readings in [from, to], newest first. */
export function readingsBetween(db: Db, deviceId: string, from: Date, to: Date): Promise<ReadingRow[]> {
  return db
    .select()
    .from(readings)
    .where(and(eq(readings.deviceId, deviceId), gte(readings.recordedAt, from), lte(readings.recordedAt, to)))
    .orderBy(desc(readings.recordedAt));
}
