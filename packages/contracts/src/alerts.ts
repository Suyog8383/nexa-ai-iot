import { z } from 'zod';

import { Cursor, Id, page, Timestamp } from './common';
import { ALERT_DURATIONS_S, ALERT_THRESHOLD_BOUNDS, CONDITIONS, HISTORY_LIMIT, METRICS, type Metric } from './limits';

export const MetricSchema = z.enum(METRICS);
export const ConditionSchema = z.enum(CONDITIONS);
export const AlertDurationSchema = z.literal(ALERT_DURATIONS_S);
export const NotifyPrefs = z.strictObject({ push: z.boolean(), inApp: z.boolean(), sound: z.boolean() });

/** True when `threshold` is inside the stepper range for `metric`. */
export function isThresholdInBounds(metric: Metric, threshold: number): boolean {
  const [min, max] = ALERT_THRESHOLD_BOUNDS[metric];
  return threshold >= min && threshold <= max;
}

const thresholdIssue = { message: 'Threshold is outside the allowed range for this metric', path: ['threshold'] };

const ruleFields = {
  deviceId: Id,
  name: z.string().trim().min(1).max(60),
  metric: MetricSchema,
  condition: ConditionSchema,
  threshold: z.number(),
  durationS: AlertDurationSchema,
  notify: NotifyPrefs,
  enabled: z.boolean(),
  /** Assistant message id when the rule was created from an AI suggestion. */
  origin: z.string().min(1).max(64).optional(),
};

/** POST /v1/alert-rules */
export const CreateAlertRuleRequest = z
  .strictObject({ ...ruleFields, enabled: ruleFields.enabled.default(true) })
  .refine((r) => isThresholdInBounds(r.metric, r.threshold), thresholdIssue);
export type CreateAlertRuleRequest = z.input<typeof CreateAlertRuleRequest>;

/**
 * PATCH /v1/alert-rules/:id. Any subset of the editable fields; `deviceId` and `origin` are fixed.
 * The server re-validates the merged rule, so e.g. changing only `metric` can still fail on `threshold`.
 */
export const UpdateAlertRuleRequest = z
  .strictObject({
    name: ruleFields.name,
    metric: ruleFields.metric,
    condition: ruleFields.condition,
    threshold: ruleFields.threshold,
    durationS: ruleFields.durationS,
    notify: ruleFields.notify,
    enabled: ruleFields.enabled,
  })
  .partial()
  .refine((r) => Object.keys(r).length > 0, { message: 'Provide at least one field to update' })
  .refine((r) => r.metric === undefined || r.threshold === undefined || isThresholdInBounds(r.metric, r.threshold), thresholdIssue);
export type UpdateAlertRuleRequest = z.input<typeof UpdateAlertRuleRequest>;

export const AlertRule = z.object({
  id: Id,
  ...ruleFields,
  createdAt: Timestamp,
  updatedAt: Timestamp,
});
export type AlertRule = z.infer<typeof AlertRule>;

/** GET /v1/alert-rules?deviceId= */
export const AlertRuleListQuery = z.strictObject({ deviceId: Id.optional() });
export const AlertRuleList = z.object({ items: z.array(AlertRule) });
export type AlertRuleList = z.infer<typeof AlertRuleList>;

/** Opened when a rule's condition has held for its duration; resolved when it clears. */
export const AlertEvent = z.object({
  id: Id,
  ruleId: Id,
  deviceId: Id,
  metric: MetricSchema,
  condition: ConditionSchema,
  threshold: z.number(),
  /** The reading value that opened the event. */
  triggerValue: z.number(),
  triggeredAt: Timestamp,
  resolvedAt: Timestamp.nullable(),
  acknowledgedAt: Timestamp.nullable(),
});
export type AlertEvent = z.infer<typeof AlertEvent>;

/** GET /v1/alert-events — newest first. */
export const AlertEventListQuery = z.strictObject({
  deviceId: Id.optional(),
  status: z.enum(['open', 'resolved', 'all']).default('all'),
  limit: z.coerce.number().int().min(1).max(HISTORY_LIMIT.max).default(HISTORY_LIMIT.default),
  cursor: Cursor.optional(),
});
export type AlertEventListQuery = z.input<typeof AlertEventListQuery>;

export const AlertEventList = page(AlertEvent);
export type AlertEventList = z.infer<typeof AlertEventList>;
