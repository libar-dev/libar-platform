---
id: spec:obligations.obligation-module
kind: behavior
altitude: feature
readiness: defined
relations:
  refines: spec:platform.transactional-domain-platform
  dependsOn:
    - spec:command.command-pipeline
    - spec:command.actor-and-scope
    - spec:command.outcome-boundary
    - spec:effects.retry-ownership
  constrainedBy:
    - spec:laws.law07-deferred-work-never-reported-early
    - spec:laws.law08-durable-capability-ships-operations
    - spec:laws.law12-one-retry-owner
    - spec:facts.f03-nested-run-mutation-partial-rollback
    - spec:facts.f08-scheduling-commits-with-mutation
    - spec:facts.f09-scheduled-mutation-and-action-retry-semantics
    - spec:facts.f12-backups-exclude-pending-scheduled-functions
    - spec:facts.f16-scheduled-functions-table-shows-failed-runs
    - spec:laws.law05-authorization-before-execution-and-disclosure
    - spec:facts.f07-queries-reactive-not-durable-delivery
  decidedBy:
    - spec:decisions.d13-deferred-work-is-an-obligation
    - spec:decisions.d15-one-retry-owner-per-obligation
    - spec:decisions.d19-operations-travel-with-capability
---
# Obligation module

Layer 3 · Detail: full where D13 rules, deferred elsewhere; numbers provisional until the first experiment · Traces: D13, D15, D19, Law 7, Law 8, Law 12, F3, F8, F9, F12, F16, Probe 7, Decision method rule 4, Sc L3-1, Sc L3-2, Sc L3-3, Sc L3-4.

The obligation module is the durable profile's one mechanism for deferred work. An obligation records one promise, such as "deliver confirmation for operation X", commits in the same transaction as the business change that made the promise, and is fulfilled by attempts that the module dispatches, fences, recovers, inspects, retains and repairs. The module is installed only when its trigger appears: an effect must happen after the transaction, a wait, background isolation, or external I/O. It is not a copy of every event and not a queue; the business change is in the journal, the promise is in the obligation, and the dispatch is a scheduled function whose ID is execution metadata.

The module lives in the parent as a shared library and two parent tables, because the wrapper must run parent-side effect bodies as nested mutations and because scheduled functions carry no auth, so the record must carry the authority an attempt runs under. Its children pin the record, the lifecycle, the wrapper, the sweeper, the operator operations, fan-out and chains, retention and restore, and the do-nothing check that Probe 7 must answer before the module is built. External effects extend it with claim, call and settle in `spec:effects.external-effects`.

## Intent

- actor: A use case or reaction that must promise work beyond its transaction; the scheduled wrapper and the sweeper that fulfil and recover it; the operator who inspects and repairs it (D13)
- problem: A local worker is duplicated and its completion callback is lost; a dispatch is killed before work or the scheduled wrapper fails; legitimate backlog builds up; retries are exhausted, including failures of recovery itself; with only a scheduled function there is no promise that survives restore, retention or an operator's inspection (Sc L3-1, Sc L3-2, Sc L3-3, Sc L3-4, F12, F16)
- outcome: Deferred work is one recorded promise that commits with the business change, has one generic lifecycle of six states, is proven by evidence and never by a callback, and is dispatched, recovered, inspected, retained and repaired by one module (D13, Law 7, Law 8)
- value: Adding an effect means supplying its policy and handler while the module supplies dispatch, recovery, inspection and retention (Thesis, D13)
- risk: The standing cost is the `obligations` and `obligationRepairs` tables, one insert and one schedule per promise inside the command, six lifecycle states, a scheduled wrapper per attempt, one cron sweeper, five operator operations, a retention policy and handler versioning (D13, Decision method rule 2)
- risk: The obligation table is justified against the do-nothing option only through restore, retention past the system table's window, business visibility and operator exits; Probe 7 can still narrow it for local reactions (D13, Probe 7)
- assumption: Scheduling from a mutation commits with it, so the first dispatch exists exactly when the obligation exists (F8)
- assumption: A scheduled mutation runs exactly once with internal errors retried and developer errors ending it, so a failed wrapper leaves the obligation pending for the sweeper (F9)
- assumption: A nested `ctx.runMutation` rolls back on throw and the wrapper can catch and continue, so the wrapper can record an attempt after the body failed (F3)
- assumption: Backups exclude scheduled functions; a CLI replacement into a fresh backend restores obligations without dispatches, while a replacement in place keeps every dispatch the destination had, including those created after the export (F12)
- assumption: `_scheduled_functions` shows the states Pending, InProgress, Success, Failed and Canceled for 7 days after completion (F16)

### Open questions

- [non-blocking] Probe 7 observes local scheduler states, short retention, both CLI replacement modes, scheduler-ID validation and the failed-function scan boundary; a stored `v.id("_scheduled_functions")` can validate after fresh replacement while resolving to no row, so it is a typed reference and not proof of a live dispatch; seven-day expiry, hosted restore, Workpool and Workflow remain open, and the owner confirmed the do-nothing check's rejection on these observations (Probe 7, D13, F12, F16)
- [non-blocking] Extension E-50: the doc does not say where the module lives; this design places it in the parent as a library plus the `obligations` and `obligationRepairs` tables with a static handler registry keyed by handler key and version, because the wrapper runs parent-side bodies as nested mutations and the record reuses the parent's actor and scope types; the alternative, a Convex component driven by function handles like Workpool, is not pre-empted (D13, D11, E-50)
- [non-blocking] OQ1 dependency: OQ1 is answered with a component for every context, so a local reaction's body runs as a nested mutation; if a measured workload reopens it, only the bodies change shape (OQ1, Probe 3)
- [non-blocking] Decision method rule 4: the doc says Layers 0 to 2 get full detail, the first experiment runs, and Layer 3 is written from what it showed; this module and its children are written now, at the depth D13 to D15 give, with numeric defaults the doc does not give, the backoff and attempt budget of E-51, the sweeper's cadence and bounds of E-52, the fan-out bounds of E-54, the retention horizons of E-55, the lease and settle repeats of E-58 and the index set of E-57; every such number is a provisional default until the experiment's measurements and Probe 7 confirm or replace it, and the owner confirms that writing the structure now does not pre-empt the experiment (Decision method rule 4, D13, Probe 7, E-51, E-52, E-54, E-55, E-57, E-58)

## Behavior

- rule: An obligation records one promise; it commits in the same transaction as the business change and its first scheduling joins that transaction (D13, F8)
- rule: An obligation is not a copy of every event; a command creates one only for work it must promise beyond its own transaction (D13)
- rule: An obligation has one generic lifecycle: pending, running, succeeded, needs attention, cancelled and abandoned, and a retry is a timestamp on pending, not a state (D13)
- rule: A scheduler or Workpool ID is execution metadata; the obligation, or an identified domain record, is the evidence of fulfillment (D13, Law 7)
- rule: No `onComplete` callback decides whether the effect happened; a UI learns of completion by a reactive query of the obligation (D13, Sc L3-1)
- rule: A local reaction is a scheduled mutation whose wrapper checks the obligation and runs the effect body as a nested mutation, so the effect and the completion commit together on success (D13, F3, F8)
- rule: On a known business rejection the wrapper records the settled business result; on a retryable failure the body rolls back and the wrapper records the next attempt or needs attention; an unexpected wrapper failure leaves no partial effect and the sweeper rearms it (D13, F3, F9, Sc L3-2)
- rule: One batched sweeper per module recovers failed or missing dispatches, leaves a legitimate backlog alone, and escalates when recovery itself keeps failing (D13, Sc L3-3, Sc L3-4)
- rule: Specialized records exist only where they carry distinct business evidence, such as payment attempts or approvals (D13)
- rule: A full worker pool delays work and never turns valid intent into a rejection (D13)
- rule: Concurrency is partitioned by real contention or provider limits, and tenant fairness becomes an explicit policy once one tenant can starve another (D13)
- rule: The obligation module owns retry policy; Workpool runs with its own retries off or receives ownership deliberately with its attempts shown the same way; Convex's internal transaction retries are not business attempts (D15, Law 12)
- rule: Every attempt runs under the server-established authority stored on the obligation, because auth is not propagated from the scheduling mutation to the scheduled function (D13, D11, F9)
- rule: Accepted work stores a logical handler key and version; an unsupported version goes to needs attention, never an endless retry (D19, D13)
- rule: The module ships scoped inspect, retry, reconcile, cancel and abandon operations, and no operator can create a success without evidence (D13, Law 8)
- rule: Routine TTL never deletes an unresolved obligation, and restore starts with external dispatch off and rebuilds schedules from obligations (D13, D19, F12)
- flow: A use case makes its business change, then its executor body calls the module helper once per static reaction, which reads the effect key index, inserts the pending obligation if none exists, mints attempt 1 with a fresh attempt ID and schedules the wrapper, all inside the use case's mutation; those calls are the command's static fan-out, bounded as `spec:obligations.fan-out-and-chains` rules (D13, D6, F8, E-54)
- flow: The wrapper runs as a scheduled mutation, fences on the obligation's active attempt ID, resolves the handler by key and version, rechecks authority when the record asks for it, and runs the body as a nested mutation (D13, D11, D19, F3)
- flow: The wrapper settles the attempt per the body's outcome in the same transaction: succeeded with evidence, cancelled with the settled business result, or pending with the next attempt scheduled, or needs attention when the budget is exhausted (D13, D4, F8)
- flow: The sweeper runs on a cron, scans pending obligations whose next attempt is past due plus a grace period, reads each dispatch's row in `_scheduled_functions`, leaves Pending and InProgress dispatches alone, rearms Failed, Canceled and missing ones with a fresh attempt ID, and escalates an obligation whose rearms exceed their bound (D13, F16, Sc L3-2, Sc L3-3, Sc L3-4)
- flow: An operator inspects an obligation by tenant and ID, and repairs it through retry, reconcile, cancel or abandon, each of which writes a repair record in the same transaction (D13, D19, Law 8)

## Design

One top-level transaction creates the obligation with its first dispatch. Every later write to the record happens in a scheduled mutation, the wrapper or the sweeper, or in an operator mutation. The body of a local reaction is the only nested mutation on the path, and it exists so that the wrapper can record an attempt after the body failed (F3, D7). No action touches the record for a local reaction; external effects add one action between two mutations and are specified in `spec:effects.external-effects`.

The module depends on the command pipeline for derived commands, on the actor and scope contract for the `Authority` shape it stores, `{ actor, scope, mode }` with the modes `recheckDelegator` and `serviceAuthority`, on the outcome boundary for the error classes it settles by, and on the retry ownership rule for what a Workpool or workflow may do with an attempt. The record, the wrapper, the sweeper, the operator operations and the two rule Specs below carry the pasteable shapes.

- transactionBoundary: the creating use case is one top-level mutation; each attempt is one scheduled mutation with the effect body as a nested sub-transaction; the sweeper is one scheduled mutation per run with one nested mutation per recovered candidate (D13, D1, F3, F8)
- convexSurface: `createObligation` helper called inside a mutation; `runAttempt` internal mutation as the scheduled wrapper; `sweep` internal mutation on a cron; `inspect` and `listByStatus` authorized queries; `retry`, `reconcile`, `cancel`, `abandon` authorized mutations; `claimAttempt`, `callProvider`, `settleAttempt` for external effects (D13, D14, Law 8)
- placement: [extension] the module is a parent-side library with the `obligations` and `obligationRepairs` tables in the parent schema and a static handler registry; no component, no function handles, no runtime registration (D12, E-50)
- fnCreateObligation: `createObligation(ctx: MutationCtx, input: NewObligation): Promise<{ obligationId: Id<"obligations">; created: boolean }>` (D13, F8)
- typeNewObligation: `type NewObligation = { tenantId: string; effectKey: string; kind: "local" | "external"; operationId: string; sourceEvent?: { contextId: string; eventId: string }; causedByObligation?: Id<"obligations">; causationDepth: number; handlerKey: string; handlerVersion: number; payloadSchemaVersion: number; payload: Payload; authority: Authority; maxAttempts?: number; deadline?: number; firstAttemptAt?: number; retryOwner?: "module" | "workpool" }` (D13, D2, D11, D15)
- createStep1: read `by_effect_key` for `(tenantId, effectKey)`; an existing row returns its ID with `created: false`, so a retried use case never creates a second promise (D13, D6)
- createStep2: refuse when `causationDepth` exceeds the chain bound in `spec:obligations.fan-out-and-chains` (D13)
- createStep3: insert the row from the input with `status: "pending"`, `attemptNumber: 1`, `attemptCount: 0`, `rearmCount: 0`, `activeAttemptId` fresh, `nextAttemptAt: firstAttemptAt ?? now`, `maxAttempts: input.maxAttempts ?? entry.maxAttempts` from the registry entry, `retryOwner: input.retryOwner ?? "module"`, and `createdAt` and `updatedAt` at now, so every field the table requires is set at creation (D13, D15)
- createStep4: `dispatchId = await ctx.scheduler.runAt(nextAttemptAt, internal.obligations.runAttempt, { obligationId, attemptId })` for a local reaction, or `internal.effects.claimAttempt` with `{ obligationId, attemptId, mode: "call" }` for an external effect, then patch `dispatchId` onto the row; the schedule commits with the use case or not at all, and every later dispatcher, the sweeper's `recoverOne` and the operator retry, makes the same choice by `kind` (D13, D14, F8)
- typeHandlerRegistry: `type HandlerRegistry = Record<string, Record<number, FunctionReference<"mutation", "internal", HandlerArgs, HandlerResult>>>` keyed by handler key then handler version; an old version maps to a shim mutation while accepted work refers to it (D19, D12)
- authorityModes: the two modes of the `Authority` shape `spec:command.actor-and-scope` pins under E-6, never restated here: `recheckDelegator` rechecks the captured actor's current grants in the attempt's transaction before the body runs; `serviceAuthority` runs an accepted obligation under a narrow service actor without a recheck (D11, Law 5, E-6)
- completionQuery: a UI subscribes to `inspect` for the obligation and reads `status` and `completionEvidence`; no callback carries completion (D13, F7, Sc L3-1)
- metrics: age of the oldest unresolved obligation, age of the oldest pending obligation past its grace, retry and exhaustion counts, rearm counts, provider uncertainty count, sweeper last successful run; logging or metric failure never cancels a write (D19)
- deferred: partition concurrency by contention or provider limits, tenant fairness as a policy, and the Workpool binding are written by the build that first needs them, on the trigger that one tenant can starve another or a provider limit binds (D13, D15)

## Example space

```gwt-vocabulary
Given an obligation is pending for a local reaction with attempt number {attempt:number}
And its dispatch is {dispatch:"duplicated"|"killed before work"|"failing in the wrapper"|"queued behind a backlog"|"healthy"}
And the completion callback is {callback:"lost"|"delivered"}
And the effect body {body:"succeeds"|"fails with a retryable error"}
And the attempt budget allows {attemptsLeft:number} more attempts
And recovery itself {recovery:"succeeds"|"keeps failing"}
When the scheduled wrapper and the sweeper run
Then the effect happened {effects:number} times
And the obligation is {status:"succeeded"|"pending"|"needs attention"}
And the truth about completion comes from {truth:"the obligation record"|"a callback"}
And a bounded rearm {rearm:"follows"|"does not follow"}
And the queued dispatch is {queued:"left alone"|"replaced"}
And the operator exit {exit:"works"|"is missing"}
```

## Verification — reviewed

- A reviewer confirms that every write to an obligation happens in a mutation, that the only nested mutation on the local path is the effect body, and that no action writes the record for a local reaction (F3, F10).
- A reviewer confirms that the record's indexes named in `spec:obligations.record-contract` are the ones the wrapper, the sweeper, the retention batch and the operator queries read.
- A reviewer confirms that the six states and the fields match D13's two lists exactly and that the lifecycle rule allows no transition D13 forbids.
- A reviewer confirms that the module passes the do-nothing check only through the four reasons D13 names, and that Probe 7 is recorded on the decision Spec.
