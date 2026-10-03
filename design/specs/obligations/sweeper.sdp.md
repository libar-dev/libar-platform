---
id: spec:obligations.sweeper
kind: contract
altitude: story
readiness: defined
relations:
  refines: spec:obligations.obligation-module
  dependsOn:
    - spec:obligations.record-contract
    - spec:obligations.lifecycle-transitions
    - spec:effects.claim-call-settle
  constrainedBy:
    - spec:facts.f16-scheduled-functions-table-shows-failed-runs
    - spec:facts.f13-transactions-have-limits
    - spec:facts.f03-nested-run-mutation-partial-rollback
    - spec:facts.f04-nested-calls-cost-more-than-helpers
    - spec:constraints.bulk-operations-bounded
    - spec:laws.law10-replay-never-runs-commands-or-effects
    - spec:facts.f08-scheduling-commits-with-mutation
    - spec:facts.f09-scheduled-mutation-and-action-retry-semantics
    - spec:facts.f12-backups-exclude-pending-scheduled-functions
---
# Obligation sweeper

Layer 3 · Detail: full where D13 rules; numbers provisional until the first experiment · Traces: D13, D14, D19, F3, F4, F13, F16, Probe 3, Sc L3-2, Sc L3-3, Sc L3-4, Sc L3-7, E-52, E-56, E-57.

The sweeper is the one batched recovery per obligation module. It finds dispatches that failed or went missing, rearms them with a fresh attempt ID, leaves a legitimate backlog alone, expires stale leases, and escalates an obligation whose recovery itself keeps failing. It runs on a cron, so it is code rather than a pending scheduled function and exists again after a restore without anyone re-scheduling it. It reads `_scheduled_functions` to tell a queued dispatch from a dead one, and it never trusts that table for what an obligation proves.

One run costs one nested mutation per recovered candidate and per expired lease, and F4 leaves the size of that overhead to Probe 3, so the candidate count alone cannot prove that a run fits the 1 second mutation timeout. A run therefore carries two bounds: a document bound, which the F13 ceilings justify, and an elapsed-time guard, which is what keeps a run inside the timeout whatever the probe finds. The guard reads `performance.now()`, because the runtimes page (docs.convex.dev/functions/runtimes, read 2026-09-30) says `Date.now()` returns the same value for the whole of a function's execution while `performance.now()` increments inside a mutation. Work the guard leaves behind waits for the next tick and is counted, so the sweeper's health metric shows it.

## Intent

- outcome: Pin the sweeper's bounds, its scheduling, what counts as a failed or missing dispatch, how a backlog is left alone, how a rearm is bounded and dispatched by kind, and how recovery failures escalate (D13, D14, D19, F16)

### Open questions

- [non-blocking] Extension E-52: the doc says the sweeper is batched and bounded but gives no cadence, batch bound, grace period, rearm bound or time guard; this design runs every 60 seconds, examines at most 100 candidates and 100 expired leases per scan, stops a run after 500 ms of elapsed time by `performance.now()`, waits a grace of 120 seconds past the next attempt time, allows 5 rearms, and isolates each candidate in a nested mutation; the numbers are tested against the pinned Convex version (D13, D19, E-52)
- [non-blocking] Probe 3 pending: the candidate bound of 100 is provisional; it assumes a nested `ctx.runMutation` costs a few milliseconds, which F4 records as unknown, so the bound is reset from the probe's measured cost so that a full scan of 200 nested calls fits inside the elapsed guard, and until then the guard rather than the count is what keeps a run under the mutation timeout (Probe 3, F4, F13, E-52)
- [non-blocking] Extension E-57: the sweeper scans deployment-wide by status; tenant fairness in its order is a policy to add when one tenant can starve another (D13, E-57)

## Contract

- The sweeper is one internal mutation per module, scheduled by a cron rather than by a chain of scheduled functions, so it survives a restore and a deploy as code (D13, D19, F12)
- A pending obligation is a candidate when its next attempt time is older than now minus the grace period; obligations whose next attempt is in the future are never examined (D13, Sc L3-3)
- For each candidate the sweeper reads its dispatch row with `ctx.db.system.get("_scheduled_functions", dispatchId)` (D13, F16)
- A dispatch in state Pending or InProgress is a legitimate backlog; the sweeper leaves it alone and does not replace it for not having started (D13, F16, Sc L3-3)
- A dispatch in state Failed or Canceled, or a missing row, or an absent dispatch ID, is a failed or missing dispatch; the sweeper rearms it (D13, F16, Sc L3-2)
- A dispatch in state Success whose obligation is still pending on the same attempt ID is treated as missing, because the wrapper wrote nothing; the sweeper rearms it (D13, F9)
- A rearm keeps the attempt number, increments the rearm count, mints a new attempt ID and schedules the obligation's own dispatch now, the wrapper for a local reaction or the claim for an external effect, chosen by the record's `kind` exactly as `createObligation` and the operator retry choose it; it never runs the effect body itself (D13, D14, Law 10)
- When the rearm count reaches its bound, the sweeper moves the obligation to needs attention with reason `recoveryFailing` instead of rearming, which is the escalation when recovery itself keeps failing (D13, Sc L3-4)
- While external dispatch is off, a call-mode claim of `spec:effects.claim-call-settle` defers itself with the same attempt ID and a pending dispatch row, so the sweeper treats it as a backlog under the rule above, spends no rearm on it and never reads the switch; the lease-expiry loop keeps running, so a running obligation whose action is gone still settles under its policy (D19, E-56, Sc L3-7)
- A running obligation whose lease has expired is handed to the lease expiry mutation of `spec:effects.claim-call-settle`, which settles it as ambiguous under its policy; the sweeper never assumes the provider call did not happen (D14, D13)
- Each candidate's recovery runs as a nested mutation, so one candidate that throws does not roll back the batch; the outer transaction records the increment of the rearm count before the nested call so a throwing recovery still counts toward escalation (D13, F3)
- The sweeper examines at most its batch bound per scan, stops early when its elapsed-time guard fires and leaves the rest for the next tick, and never deletes anything; retention is a separate batch (D19, F13, F4)
- The sweeper's own health is a metric: the age of the oldest pending obligation past its grace, and the count a run left behind under its guard; a sweeper that keeps failing or keeps running out of time leaves that age growing, which is the alarm (D19)
- [extension] The cron interval is 60 seconds, the grace is 120 seconds, the batch bound is 100 candidates and 100 expired leases per scan, the elapsed guard is 500 ms, and the rearm bound is 5; the batch bound is provisional until Probe 3 measures the nested-call cost (D13, Probe 3, E-52)

## Design

- fnSweep: `export const sweep = internalMutation({ args: {}, returns: v.object({ examined: v.number(), rearmed: v.number(), leftAlone: v.number(), leasesExpired: v.number(), escalated: v.number(), failed: v.number(), deferred: v.number() }), handler })` (D13)
- fnRecoverOne: `export const recoverOne = internalMutation({ args: { obligationId: v.id("obligations"), expectedAttemptId: v.optional(v.string()), dispatchError: v.optional(v.string()) }, returns: v.union(v.literal("rearmed"), v.literal("leftAlone"), v.literal("escalated"), v.literal("skipped")), handler })` (D13, F3, F16)
- cronSweep: `crons.interval("obligation sweep", { seconds: 60 }, internal.obligations.sweep, {})` in `convex/crons.ts` (D13, E-52)
- step1: `startedAt = performance.now()` and `now = Date.now()`; query `by_status_next_attempt` with `status === "pending"` and `nextAttemptAt < now - graceMs`, `.take(limitSweepBatch)` (D13, E-52)
- step2: before each candidate, when `performance.now() - startedAt >= limitSweepElapsedMs`, stop the loop and count this and every remaining candidate as `deferred`; otherwise read the dispatch row and, when `row.state.kind` is not `pending` or `inProgress`, patch `rearmCount + 1` and `updatedAt` in the outer transaction; a candidate whose `row.state.kind` is `pending` or `inProgress` is counted as left alone and not patched (D13, F16, F4)
- dispatchStateRead: the system row's `state` is an object whose `kind` is one of the lowercase literals `pending`, `inProgress`, `success`, `failed` and `canceled`, and the `failed` variant carries `error: string`; the docs' capitalized names in the contract bullets above are prose for these literals, and no code compares against a capitalized string (F16, S6)
- step3: `await ctx.runMutation(internal.obligations.recoverOne, { obligationId, expectedAttemptId: activeAttemptId, dispatchError })` inside a try block, where `dispatchError` is `row.state.error` when the kind was `failed`; a throw is counted as failed and the loop continues (D13, F3, F16)
- step4: `recoverOne` re-reads the row, returns `skipped` unless it is still pending on `expectedAttemptId`, returns `escalated` after patching needs attention when `rearmCount >= limitRearms`, and otherwise mints a fresh `activeAttemptId`, sets `nextAttemptAt: now`, records `lastError` of class `wrapper` with code `dispatchFailed` and the dispatch error's message when one was passed, schedules the dispatch by `kind` and returns `rearmed` (D13, D14, F8, F16)
- step4Dispatch: for `kind === "local"`, `dispatchId = await ctx.scheduler.runAfter(0, internal.obligations.runAttempt, { obligationId, attemptId })`; for `kind === "external"`, `dispatchId = await ctx.scheduler.runAfter(0, internal.effects.claimAttempt, { obligationId, attemptId, mode: reconcileRequested ? "reconcile" : "call" })`; the row is patched with the new `dispatchId` in the same nested transaction, so a rearmed external effect always reaches the claim and never the local wrapper (D13, D14, F8)
- step5: query `by_status_lease_expiry` with `status === "running"` and `leaseExpiresAt < now`, `.take(limitSweepBatch)`, and call `internal.effects.expireLease` for each as a nested mutation under the same elapsed guard; leases the guard leaves are counted as `deferred` (D14, F3, F4)
- step6: return the counts; the counts are logged as metrics and a logging failure never fails the sweep (D19)
- limitSweepBatch: [extension] 100 candidates per scan and 100 expired leases per scan as the document bound, so one run reads at most about 400 documents and writes at most about 200, under the F13 ceilings; the binding cost is the up to 200 nested calls, whose size F4 leaves to Probe 3, so the count is provisional until the probe reports and the elapsed guard is what keeps a run under the 1 second mutation timeout (F4, F13, Probe 3, E-52)
- limitSweepElapsed: [extension] 500 ms by `performance.now()`, checked before each candidate and each lease, half the mutation timeout so that the candidate in flight when the guard fires still finishes; `Date.now()` is fixed for a whole mutation and cannot measure elapsed time, while `performance.now()` increments inside one (F13, E-52)
- limitGrace: [extension] 120 seconds past `nextAttemptAt`, twice the cron interval, so a dispatch delayed by scheduler load is not mistaken for a dead one (D13, E-52)
- limitRearms: [extension] 5 rearms per obligation before escalation to needs attention with reason `recoveryFailing` (D13, E-52)
- boundTest: the acceptance test that `spec:constraints.bulk-operations-bounded` requires runs one sweep with 100 rearmable candidates and 100 expired leases on the pinned Convex version, asserts that the mutation finishes, and records how many of them the guard admitted; when that number is below the bound, the bound is lowered to it (D19, F13, Probe 3)
- transactionBoundary: one scheduled mutation per run with one nested sub-transaction per recovered candidate and per expired lease; no action (D13, F3)
- isolationChoice: per-candidate isolation stays because a catch around a plain helper does not undo the helper's writes, so a candidate that throws halfway through a plain-helper recovery would leave a rearmed row without its dispatch, and the example for Sc L3-4 relies on a throwing recovery counting toward escalation without touching the other candidates; the cost of the isolation is the nested-call overhead the elapsed guard bounds (F3, F4, Sc L3-4)
- systemTableUse: `_scheduled_functions` is read for the dispatch state only; its 7-day retention means an old dispatch row is missing, which the sweeper treats like a failed one (F16)
- restoreUse: after a restore every pending obligation's dispatch row is missing, so the sweeper's normal path rebuilds schedules, and `spec:obligations.retention-and-restore` adds a cursor-driven rebuild operation for a large backlog; each rearmed external claim then waits at the dispatch switch with a pending dispatch row, so the sweeper's later ticks count it as left alone and its `rearmCount` stays at one however long the restore takes (D19, F12, E-56, Sc L3-7)
