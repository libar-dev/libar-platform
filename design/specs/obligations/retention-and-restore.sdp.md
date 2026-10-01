---
id: spec:obligations.retention-and-restore
kind: rule
altitude: story
readiness: defined
relations:
  refines: spec:obligations.obligation-module
  dependsOn:
    - spec:obligations.record-contract
    - spec:obligations.sweeper
    - spec:effects.claim-call-settle
    - spec:operations.baseline-operations
  decidedBy: spec:decisions.d19-operations-travel-with-capability
  constrainedBy:
    - spec:facts.f12-backups-exclude-pending-scheduled-functions
    - spec:facts.f16-scheduled-functions-table-shows-failed-runs
    - spec:facts.f13-transactions-have-limits
    - spec:laws.law08-durable-capability-ships-operations
    - spec:constraints.bulk-operations-bounded
---
# Obligation retention and restore

Layer 3 · Detail: full where D13 and D19 rule; numbers provisional until the first experiment · Traces: D13, D14, D19, Law 8, F12, F13, F16, Sc L3-7, Sc L3-8, E-42, E-55, E-56.

Retention and restore are the two operations that make the obligation table earn its cost over a plain scheduled function. Retention never erases unresolved work and keeps completed work past every horizon that could repeat it. Restore starts with external dispatch off, reconciles the gap between the backup and the provider, and rebuilds schedules from the obligations, because a backup excludes pending scheduled functions. Handler keys and versions stay logical so that a release can keep old work executable through a shim. The durable profile's restore extends the transactional profile's: `spec:application.restore` closes the writer door with `MAINTENANCE_MODE`, restores the snapshot, runs its checks and clears the door in its accepted branch; only then does this Spec's schedule rebuild run, because a rearmed wrapper that met the closed door would only be deferred, and the reconcile pass must see a deployment whose checks passed.

## Intent

- outcome: Routine TTL never deletes an unresolved obligation, completed work stays until every repeat horizon has closed, restore rebuilds dispatch from obligations with external dispatch off until the gap is reconciled, and accepted work keeps a logical handler key and version (D13, D19, Law 8)

### Open questions

- [non-blocking] Extension E-55: the doc gives no retention horizon, compaction rule or batch bound; this design keeps a completed obligation for the longest repetition policy validity in the module and never less than 30 days, compacts `lastError.message` and `lateEvidence` after 7 days into a count, and deletes at most 500 rows per retention run (D19, F13, E-55)
- [non-blocking] Extension E-56: the doc says restore starts with dispatch off but not how the switch works; this design reads a deployment environment variable in the parent's claim mutation only, where a call-mode claim defers its attempt without counting it and a reconcile-mode claim proceeds, sets it before the restore, adds a cursor-driven `rebuildSchedules` operation for a backlog larger than the sweeper's batch, and orders the two switches: `OBLIGATIONS_DISPATCH` goes off before the snapshot and on last, and `rebuildSchedules` refuses to run while `MAINTENANCE_MODE` is `restore`, so it runs only after `spec:application.restore` has accepted the run and reopened writers (D19, F12, E-42, E-56)
- [non-blocking] Probe 7 pending: what a restore leaves of Workpool and Workflow state decides whether the rebuild covers only the module's own dispatches or also passed-ownership work (Probe 7, F12, D19)

## Rule

- Routine TTL never deletes an obligation in pending, running or needs attention (D13, Sc L3-8)
- A completed obligation stays until every retry, redelivery and replay horizon that could repeat it has closed, and never less than the 7 days that `_scheduled_functions` keeps a dispatch (D13, F16)
- Bulky diagnostics may expire earlier while a compact identity stays: the effect key, operation ID, status, settled time and evidence reference survive compaction (D13, D19)
- Retention runs as a bounded batch on a cron with a stated bound tested against the pinned Convex version; platform limits are ceilings, not batch sizes (D19, F13)
- Restore uses matching code and configuration and starts with external dispatch off (D19, Sc L3-7)
- After a restore the module reconciles the gap since the backup before any external dispatch resumes: every running obligation and every pending one whose attempt may have run after the backup is reconciled under its policy, and one with no safe policy goes to needs attention (D19, D14, Sc L3-7)
- After a restore schedules are rebuilt from obligations, because the backup holds the obligations but not their pending scheduled functions; the rebuild mints new attempt IDs and never new effect keys (D19, F12)
- External idempotency keys survive restore because they live on the obligation row, so a rebuilt attempt reuses the provider key within its validity (D19, D14, Sc L3-7)
- Accepted work stores a logical handler key and version; stable shims stay while vendor jobs refer to old function handles, and an unsupported version goes to needs attention, never an endless retry (D19, D13)
- A release preserves, migrates or drains pending obligations before removing a handler version; reset-only upgrades are for disposable environments (D19)
- Restore is tested, not only backup, and the run records the commit, installed layers, backend version, configuration and dataset (D19, Acceptance scenarios)
- [extension] The completed-work horizon is the maximum of every `reuseProviderKey` validity in the registry and 30 days (D13, E-55)
- [extension] Compaction after 7 days replaces `lastError.message` with its code and replaces `lateEvidence` with a count, in the same batch as retention (D19, E-55)
- [extension] External dispatch is off when the parent reads `OBLIGATIONS_DISPATCH` as `off`; a call-mode claim then defers its attempt without counting it and keeps a pending dispatch row, so the sweeper leaves it alone as a backlog and no rearm is spent however long the switch stays off, while a reconcile-mode claim proceeds, because a reconcile sends nothing irreversible and reconciling the gap is what runs while dispatch is off (D19, D14, E-56, Sc L3-7)

## Design

Retention and rebuild are batches with cursors, not sweeps; each run is one mutation with one cursor and a bound below the F13 ceilings. The dispatch switch is an environment variable because environment variables are not part of a backup, so the switch survives the restore and is set before it, and because the parent may read `process.env` while a context component, by this design's rule, reads none.

- fnRetain: `export const retain = internalMutation({ args: { cursor: v.optional(v.string()) }, returns: v.object({ deleted: v.number(), compacted: v.number(), cursor: v.optional(v.string()) }), handler })` (D19)
- cronRetain: `crons.interval("obligation retention", { hours: 1 }, internal.obligations.retain, {})` (D19, E-55)
- retainStep1: query `by_status_settled_at` for each terminal status with `settledAt < now - horizonMs`, `.take(limitRetentionBatch)`, and delete the rows (D13, D19)
- retainStep2: query the same index with `settledAt < now - compactionMs` and compact `lastError.message` and `lateEvidence` on rows not yet compacted (D19, E-55)
- limitRetentionBatch: [extension] 500 deletions and 500 compactions per run, a provisional default under the 16,000 writes per transaction and the 1 second timeout (F13, E-55)
- limitCompletedHorizon: [extension] `max(30 days, max validityMs over reuseProviderKey policies)`, the 30 days provisional; the retention run reads the registry, never a stored number (D13, E-55)
- limitCompaction: [extension] 7 days after `settledAt`, a provisional default (D19, E-55)
- dispatchSwitch: [extension] `process.env.OBLIGATIONS_DISPATCH === "off"` read in `claimAttempt` only; while off, a call-mode claim reschedules the same attempt ID after the deferral delay of `spec:effects.claim-call-settle` and patches its `dispatchId`, so the row stays pending with a pending dispatch and the sweeper needs no knowledge of the switch, and a reconcile-mode claim proceeds, so no provider call is made while off and the reconcile pass can run (D19, D14, F12, E-56)
- fnRebuildSchedules: `export const rebuildSchedules = internalMutation({ args: { cursor: v.optional(v.string()) }, returns: v.object({ rearmed: v.number(), flaggedForReconcile: v.number(), cursor: v.optional(v.string()) }), handler })` which refuses with a plain error while `process.env.MAINTENANCE_MODE === "restore"`, so no wrapper is rearmed before the transactional restore has accepted its run and reopened writers (D19, F12, E-42, E-56)
- rebuildStep1: page `by_status_next_attempt` over pending obligations by cursor, mint a fresh attempt ID for each, and schedule the wrapper or the claim by `kind`, with the claim in reconcile mode when `reconcileRequested` is set, as `recoverOne` in `spec:obligations.sweeper` does; a page is bounded like a sweep (D19, F12)
- rebuildStep2: page `by_status_lease_expiry` over running obligations, whose in-flight action was lost with the backup, and call `internal.effects.expireLease` with cause `restoreGap` for each as a nested mutation, so the ambiguous outcome is settled under its policy exactly as a lease expiry is: under `reconcileFirst` a reconcile attempt is claimed and runs while dispatch is off, under `reuseProviderKey` within validity or `duplicatesAcceptable` a call attempt with the same key is rearmed and waits at the switch, and under `none` the obligation moves to needs attention with reason `uncertain`; nothing schedules the reconcile action directly (D19, D14, F12)
- restoreStep1: set `OBLIGATIONS_DISPATCH` to `off` on the target deployment beside the `MAINTENANCE_MODE` of `spec:application.restore`, then restore the backup with matching code and configuration and run the transactional restore's checks to their accepted branch, which clears `MAINTENANCE_MODE` (D19, E-42, E-56)
- restoreStep2: with writers reopened and dispatch still off, run `rebuildSchedules` to completion by cursor; the reconcile attempts it claims run while the switch is off and the call attempts it rearms wait at the switch, and the reconcile pass is complete when no obligation is running on a reconcile attempt and none is flagged `reconcileRequested` (D19, D14, E-42, E-56)
- restoreStep3: verify the invariants named by `spec:operations.baseline-operations` and that every pending obligation has a dispatch row whose `state.kind` is `pending`, then set `OBLIGATIONS_DISPATCH` to `on`, the last switch to move (D19, F16)
- handlerShims: a registry entry for an old version that maps to an adapter mutation; a release removes a version only after `by_tenant_status` shows no pending or running obligation on it (D19)
- metrics: rebuild and restore progress as rows rebuilt over rows pending, and the count flagged for reconcile (D19)

## Example space

```gwt-vocabulary
Given an obligation is {status:"running"|"pending"|"succeeded"} with provider key {key:string}
And it settled {settledDaysAgo:number} days ago
And the longest repetition horizon is {horizonDays:number} days
And a backup was taken and afterwards the provider {providerMoved:"confirmed the effect"|"did nothing"}
And another obligation is still unresolved
And the module operation under test is {operation:"restore"|"retention"}
When the module operation runs
Then external dispatch {dispatch:"waits until the gap is reconciled"|"resumes immediately"}
And the obligation identity and provider key are {identities:"unchanged"|"regenerated"}
And the obligation evidence {evidence:"survives"|"is erased"}
And unresolved work {unresolved:"is untouched"|"is erased"}
And irreversible provider effects number {effects:number}
```

## Verification — reviewed

- A reviewer confirms that no retention path can delete a row whose status is pending, running or needs attention, and that the horizon is computed from the registry.
- A reviewer confirms that the restore procedure claims no call before the reconcile pass ends and the switch is on, that only reconcile actions run while the switch is off, and that no rebuilt attempt mints a new effect key or provider key.
- A reviewer confirms that a call-mode claim deferred at the switch changes no attempt number, attempt count or rearm count, so the sweeper's rearm bound cannot be spent by the length of a restore window.
- A reviewer confirms that the environment variable is read only in the parent and never inside a component.
