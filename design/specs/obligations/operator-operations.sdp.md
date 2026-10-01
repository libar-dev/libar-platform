---
id: spec:obligations.operator-operations
kind: contract
altitude: story
readiness: defined
relations:
  refines: spec:obligations.obligation-module
  dependsOn:
    - spec:obligations.record-contract
    - spec:obligations.lifecycle-transitions
    - spec:command.tenancy-and-authority
  constrainedBy:
    - spec:laws.law05-authorization-before-execution-and-disclosure
    - spec:laws.law08-durable-capability-ships-operations
    - spec:laws.law11-tenant-scope-named
    - spec:laws.law07-deferred-work-never-reported-early
    - spec:facts.f08-scheduling-commits-with-mutation
    - spec:facts.f16-scheduled-functions-table-shows-failed-runs
---
# Operator operations on obligations

Layer 3 · Detail: full where D13 rules; numbers provisional until the first experiment · Traces: D13, D11, D14, D19, F16, Law 5, Law 7, Law 8, Law 11, Sc L3-4, Sc L3-6, E-53.

The module ships five scoped operations: inspect, retry, reconcile, cancel and abandon. They are ordinary authorized parent functions on the obligation record, not domain commands, and every repair writes an `obligationRepairs` row in its own transaction, so the audit fails closed with the repair. An operator is an actor kind in the one authorization vocabulary, named on every call with the tenant scope, and a repair is refused before it is executed when the grant is missing. No operation can create a success without evidence. A reconcile without supplied evidence is a claimed attempt like every other dispatch: the operator mints the attempt and moves the obligation to pending, the claim mutation of `spec:effects.claim-call-settle` takes the lease, and the reconcile action's report meets the settle's fence; no operator operation schedules the reconcile action itself.

## Intent

- outcome: Pin inspect, retry, reconcile, cancel and abandon as authorized parent functions with the repair record each writes, so that every needs attention state has a working operator exit (D13, Law 8, Sc L3-4)

### Open questions

- [non-blocking] Extension E-53: the doc names the five operations and the repair record's fields but not their signatures or their transaction shape; this design makes them authorized parent mutations and queries that write the repair in the same transaction, refuses cancel and reconcile while a lease is live, and lets reconcile either mint a reconcile attempt that the claim mutation of `spec:effects.claim-call-settle` dispatches, or accept supplied provider evidence from needs attention (D13, D14, E-53)

## Contract

- Every operation names the tenant scope and runs under an actor of kind `operator` established by the parent; the grant is read in the transaction before execution and before any obligation is disclosed (D11, Law 5, Law 11)
- `inspect` returns one obligation with its repair history and its dispatch state read from `_scheduled_functions`, and it discloses nothing across tenants (D13, D19, F16)
- `listByStatus` returns one tenant's obligations in a status, paginated by `updatedAt`, for the needs attention queue and the pending backlog (D13, Law 8)
- `retry` is allowed from needs attention, and from pending when the next attempt is past due; it mints a new attempt, resets the rearm count, schedules the wrapper or the claim now by the record's `kind`, and writes a repair; from pending it is the fourth cause of the `pending` to `pending` transition in `spec:obligations.lifecycle-transitions`, and the old dispatch is fenced out by the new attempt ID (D13, Law 8)
- `reconcile` is allowed from needs attention and from pending when the obligation is flagged `reconcileRequested`, and it is refused while a lease is live; with no evidence supplied it mints a new attempt, resets the rearm count, sets `reconcileRequested`, moves the obligation to pending and schedules the claim of `spec:effects.claim-call-settle` in reconcile mode, so the reconcile action runs under a lease and its report settles through the same fence as a call, and the obligation leaves needs attention through pending and running like every claimed attempt; with `provider` evidence supplied it is allowed from needs attention only and settles succeeded, recording the evidence and the repair together (D13, D14, Law 7, Sc L3-6)
- [extension] `reconcile` without evidence is refused when the obligation's `kind` is `local` or the resolved handler declares no `reconcile`, so an effect that cannot be queried is settled only by supplied evidence or ended by cancel or abandon (D14, E-53)
- `cancel` is allowed from pending and needs attention when no call is in flight; it is refused while a lease is live, because cancelled means no call is still in flight (D13, D14)
- `abandon` is allowed only from needs attention; the obligation ends unfulfilled and is never shown as success (D13)
- A repair records reason, actor, old and new attempt, old and new status, the exact subject as obligation ID and effect key, and the time (D13, Law 8)
- No operator operation produces `succeeded` without `provider` or `events` evidence; an `operatorDecision` evidence entry is lawful only on cancelled and abandoned (D13, Law 7)
- An operation on a terminal obligation is refused with a rejection through the outcome boundary; nothing is written (D13, D7)
- Operator operations are not domain commands and take no receipt; the Convex client covers their retries and a repeated repair on a changed state is refused by the status check (D6, D13)
- [extension] `retry` and `reconcile` without evidence reset `rearmCount` to 0 and keep the attempt history in `lastError`; the repair's `newAttemptNumber` is the minted attempt (D13, E-53)

## Design

- fnInspect: `export const inspect = query({ args: { tenantId: v.string(), obligationId: v.id("obligations") }, returns: v.union(v.null(), obligationViewValidator), handler })` (D13, Law 11)
- typeObligationView: `type ObligationView = { obligation: Doc⟨"obligations"⟩; repairs: Doc⟨"obligationRepairs"⟩[]; dispatch: { state: "pending" | "inProgress" | "success" | "failed" | "canceled" | "missing"; error?: string; scheduledTime?: number; completedTime?: number } }` read from the system row's `state.kind`, with `error` from `state.error` when the kind is `failed` and `missing` when `ctx.db.system.get` returns null (D13, F16, S6)
- fnListByStatus: `export const listByStatus = query({ args: { tenantId: v.string(), status: obligationStatusValidator, paginationOpts: paginationOptsValidator }, returns: v.object({ page: v.array(v.any()), isDone: v.boolean(), continueCursor: v.string() }), handler })` (D13, Law 11)
- fnRetry: `export const retry = mutation({ args: { tenantId: v.string(), obligationId: v.id("obligations"), reason: v.string() }, returns: v.id("obligationRepairs"), handler })` (D13)
- fnReconcile: `export const reconcile = mutation({ args: { tenantId: v.string(), obligationId: v.id("obligations"), reason: v.string(), evidence: v.optional(completionEvidenceValidator) }, returns: v.id("obligationRepairs"), handler })` (D13, D14)
- fnCancel: `export const cancel = mutation({ args: { tenantId: v.string(), obligationId: v.id("obligations"), reason: v.string() }, returns: v.id("obligationRepairs"), handler })` (D13)
- fnAbandon: `export const abandon = mutation({ args: { tenantId: v.string(), obligationId: v.id("obligations"), reason: v.string() }, returns: v.id("obligationRepairs"), handler })` (D13)
- step1: establish the actor from `ctx.auth` in the parent and authorize `obligations:repair` or `obligations:inspect` for the tenant through `spec:command.tenancy-and-authority`; refuse before reading the obligation (D11, Law 5)
- step2: load the obligation by `_id` and refuse when its `tenantId` differs from the argument, without disclosing that it exists (Law 11, Law 5)
- step3: check the transition against `spec:obligations.lifecycle-transitions`; refuse with the outcome boundary's rejection code when it is not allowed (D13, D7)
- step4: patch the obligation and insert the repair in the same mutation; for retry and for reconcile without evidence the patch is `status: "pending"`, `attemptNumber + 1`, a fresh `activeAttemptId`, `rearmCount: 0`, `nextAttemptAt: now` and `updatedAt`, with `reconcileRequested: true` added for the reconcile; for reconcile with evidence it is `status: "succeeded"`, the supplied `completionEvidence`, `settledAt`, and the cleared `activeAttemptId`, `dispatchId` and `leaseExpiresAt`; a failure of either write rolls back both, so audit fails closed (D19, D13, Law 8)
- step5: for retry, dispatch by `kind`: `dispatchId = await ctx.scheduler.runAfter(0, internal.obligations.runAttempt, { obligationId, attemptId })` for `local`, or `dispatchId = await ctx.scheduler.runAfter(0, internal.effects.claimAttempt, { obligationId, attemptId, mode: reconcileRequested ? "reconcile" : "call" })` for `external`, the same choice `createObligation` and the sweeper's `recoverOne` make; for reconcile without evidence, which is external only, `dispatchId = await ctx.scheduler.runAfter(0, internal.effects.claimAttempt, { obligationId, attemptId, mode: "reconcile" })` with the attempt step4 minted, so the claim sets running with a lease and the settle's fence admits the reconcile action's report; no operator operation schedules `internal.effects.reconcileAttempt` itself, because only the claim takes the lease the settle expects (D13, D14, F8, Sc L3-6)
- errorCodeObligationNotRepairable: thrown when the requested transition is not allowed from the current status, which includes supplied evidence on a pending obligation, because a pending obligation settles only through its claimed attempt; carries `status` and `operation` (D13, D7)
- errorCodeLeaseInFlight: thrown by cancel and by reconcile while `leaseExpiresAt` is in the future; carries `leaseExpiresAt` (D14)
- errorCodeEvidenceRequired: thrown by reconcile when supplied evidence is not of kind `provider` (D13, Law 7)
- errorCodeReconcileUnsupported: thrown by reconcile without evidence when the obligation's `kind` is `local` or the resolved handler declares no `reconcile`; carries `kind` and `handlerKey` (D14, E-53)
- transactionBoundary: one top-level authorized mutation per repair; the schedule commits with it (D13, F8)
- disclosureRule: authorization is checked before the obligation is read and again before its evidence is returned by inspect, so a revoked operator sees nothing (Law 5)
