# Nexa — Deferred Backend Work

Known gaps in the API that were deliberately left out of the MVP. Current behaviour is described in [apps/api/README.md](../apps/api/README.md#alerts); the decisions behind it are in [architecture.md](architecture.md).

## 1. Notification delivery
**Status:** Deferred

Alert rules store notification preferences, but the backend does not yet deliver notifications.

**Future work:**
- Implement notification delivery for eligible alert events.
- Select and configure the delivery provider.
- Handle retries, delivery failures, and duplicate notifications.
- Keep delivery status separate from alert-event status.

## 2. Alert evaluation reliability
**Status:** Deferred

Alert evaluation currently runs within the telemetry ingestion transaction. If evaluation fails, the telemetry report is rejected and its database changes are rolled back.

**Future work:**
- Evaluate moving alert processing into a durable background worker.
- Define retry and recovery behavior.
- Track processing progress so failed evaluations can resume safely.
- Add operational monitoring for repeated failures.

Any asynchronous design must preserve idempotency and ensure accepted readings are not permanently missed by alert evaluation.

## 3. Device clock skew
**Status:** Accepted MVP limitation

Device timestamps may be up to two minutes ahead of server time. A future-dated reading can delay alert evaluation, and a brief spike may be missed.

**Future work:**
- Evaluate clock synchronization and timestamp-validation strategies.
- Preserve protection against old buffered readings incorrectly triggering alerts.
- Add regression tests before changing timestamp ordering or evaluation semantics.
