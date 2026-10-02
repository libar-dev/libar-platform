---
id: spec:decisions.d13-deferred-work-is-an-obligation
kind: decision
altitude: feature
readiness: defined
relations:
  refines: spec:platform.transactional-domain-platform
  dependsOn: spec:decisions.d01-one-mutation-per-operation
  constrainedBy:
    - spec:facts.f03-nested-run-mutation-partial-rollback
    - spec:facts.f08-scheduling-commits-with-mutation
    - spec:facts.f09-scheduled-mutation-and-action-retry-semantics
    - spec:facts.f12-backups-exclude-pending-scheduled-functions
    - spec:facts.f16-scheduled-functions-table-shows-failed-runs
---
# Deferred work is an obligation

Provenance: carried from v0.1; the do-nothing check is new. Feature · Trigger: an effect must happen after the transaction, a wait, background isolation, or external I/O · Traces: D13, Law 7, Law 8, F3, F8, F9, F12, F16, Probe 7, Sc L3-1, Sc L3-2, Sc L3-3, Sc L3-4.

An obligation records one promise. It commits in the same transaction as the business change and its first scheduling joins that transaction. It is not a copy of every event. It has one generic lifecycle of six states, holds the fields listed below, and is proven by evidence, never by a callback. A local reaction is a scheduled mutation whose wrapper runs the body as a nested mutation; one sweeper per module recovers failed or missing dispatches; the module ships inspect, retry, reconcile, cancel and abandon. The decision depends on D1 because the obligation and its first dispatch commit inside the one mutation. Layer 3 is written at the depth the doc gives here; the build that the first experiment triggers writes the rest.

## Intent

- problem: A local worker is duplicated and its completion callback is lost; a dispatch is killed before work or the scheduled wrapper fails; legitimate backlog builds up; retries are exhausted, including failures of recovery itself; a scheduled function alone leaves no promise that survives restore, retention or an operator's inspection (Sc L3-1, Sc L3-2, Sc L3-3, Sc L3-4)
- outcome: Deferred work is one recorded promise that commits with the business change, has one generic lifecycle, is proven by evidence and never by a callback, and is recovered, inspected, retained and repaired by one module (D13)
- value: Adding an effect means supplying its policy and handler while the module supplies dispatch, recovery, inspection and retention (D13, Law 8)
- risk: The standing cost is one obligations table, one insert per promise in every command that makes one, six lifecycle states, a scheduled wrapper per attempt, one sweeper per module, five operator operations and a retention policy (D13)
- assumption: Scheduling from a mutation commits with it (F8)
- assumption: Scheduled mutations retry internal errors and run once, and scheduled actions are not retried (F9)
- assumption: Backups exclude pending scheduled functions (F12)
- assumption: `_scheduled_functions` shows failed runs for a retention window, documented as 7 days on recheck (F16)

### Open questions

- [non-blocking] Probe 7 observes the local scheduled reaction, states, scan boundary and both CLI replacement modes; the owner must apply those measurements to the do-nothing check before activation; seven-day expiry, hosted dashboard restore, Workpool and Workflow remain unprobed (Probe 7, D13, F12, F16)

## Decision

- context: The concern is deferred work: an effect after the transaction, a wait, background isolation or external I/O; Convex gives scheduling that commits with the mutation, scheduled mutations that run exactly once with internal retries, scheduled actions that run at most once, a system table of scheduled runs kept for 7 days, and backups that exclude pending scheduled functions (D13, F8, F9, F12, F16)
- alternative: Do nothing beyond Convex: a plain scheduled mutation plus a scan of `_scheduled_functions` for failed runs; it may cover a local reaction and is checked at activation by Probe 7; rejected for the durable profile because fresh CLI replacement has no scheduled intent and in-place replacement can retain intent outside restored data, the system table keeps results for 7 days only, and neither gives business visibility or operator exits (D13, F12, F16, Decision method rule 2)
- alternative: A copy of every event as an outbox that workers consume; rejected, because an obligation is not a copy of every event (D13)
- alternative: An `onComplete` callback that decides whether the effect happened; rejected, because no callback decides and the obligation or an identified domain record is the evidence (D13, Law 7)
- alternative: A specialized record per effect type; rejected as the default and kept only where a record carries distinct business evidence, such as payment attempts or approvals (D13)
- alternative: One generic obligation record with one lifecycle, a scheduled wrapper, a sweeper and operator operations; this is the option chosen (D13)
- decision: An obligation records one promise, such as "deliver confirmation for operation X"; it commits in the same transaction as the business change and its first scheduling joins that transaction; it is not a copy of every event; it has one generic lifecycle of pending, running, succeeded, needs attention, cancelled and abandoned (D13)
- rationale: A scheduler or Workpool ID is execution metadata; the obligation, or an identified domain record, is the evidence of fulfillment (D13, Law 7)
- rationale: The obligation table earns its cost through restore, retention past the system table's window, and business visibility and operator exits (D13, F12, F16)
- consequence: The states mean: pending is accepted, where a retry is a timestamp on pending and not a state; running means an external call has claimed execution and local reactions skip it; succeeded means the effect is proven; needs attention means exhausted, uncertain, authority revoked or unsupported version; cancelled means it will not happen and no call is still in flight; abandoned means an operator ended it unfulfilled, and it is never shown as success (D13)
- consequence: An obligation holds an effect key unique per tenant and logical effect; the source operation, and the source event where there is one; handler key, handler version and payload schema version; the exact accepted payload or an immutable versioned reference to it, never a pointer to the latest payload; the server-established authority it runs under; status, next attempt time, attempt count and deadline; an attempt number and active attempt ID that fence stale dispatches; for external calls, a lease that marks execution ownership and proves nothing about provider cancellation; completion evidence, or the last classified error (D13)
- consequence: A local reaction is a scheduled mutation whose wrapper checks the obligation and runs the effect body as a nested mutation; on success the effect and the completion commit together; on a known business rejection the wrapper records the settled business result; on a retryable failure the body rolls back and the wrapper records the next attempt or needs attention; an unexpected wrapper failure leaves no partial effect and the sweeper rearms it (D13, F3, F9, Sc L3-2)
- consequence: No `onComplete` callback decides whether the effect happened; a UI learns of completion by a reactive query of the obligation (D13, Sc L3-1)
- consequence: One batched sweeper per module recovers failed or missing dispatches, leaves a legitimate backlog alone, and escalates when recovery itself keeps failing (D13, Sc L3-3, Sc L3-4)
- consequence: Specialized records exist only where they carry distinct business evidence, such as payment attempts or approvals (D13)
- consequence: A full worker pool delays work and never turns valid intent into a rejection; concurrency is partitioned by real contention or provider limits, and tenant fairness becomes an explicit policy once one tenant can starve another (D13)
- consequence: A small static subscription creates its obligations in the publishing transaction and that fan-out counts toward the command's budget; larger or dynamic fan-out is a separate durable task that snapshots its routing; derived commands carry causation and a server namespace, and reaction chains have a bound against cycles (D13)
- consequence: Routine TTL never deletes an unresolved obligation; a completed one stays until every retry, redelivery and replay horizon that could repeat it has closed; bulky diagnostics may expire earlier while a compact identity stays (D13, Law 8)
- consequence: The module ships scoped inspect, retry, reconcile, cancel and abandon operations; a repair records reason, actor, old and new attempt, and the exact subject; no operator can create a success without evidence (D13, Law 8)
- consequence: The standing cost is the obligations table, one insert per promise inside the command, six states, a wrapper, a sweeper, five operator operations, a retention policy and handler versioning (D13)
