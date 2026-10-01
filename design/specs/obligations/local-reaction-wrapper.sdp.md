---
id: spec:obligations.local-reaction-wrapper
kind: contract
altitude: story
readiness: defined
relations:
  refines: spec:obligations.obligation-module
  dependsOn:
    - spec:obligations.record-contract
    - spec:obligations.lifecycle-transitions
    - spec:command.outcome-boundary
  constrainedBy:
    - spec:facts.f03-nested-run-mutation-partial-rollback
    - spec:facts.f08-scheduling-commits-with-mutation
    - spec:facts.f09-scheduled-mutation-and-action-retry-semantics
    - spec:laws.law05-authorization-before-execution-and-disclosure
    - spec:laws.law07-deferred-work-never-reported-early
    - spec:facts.f13-transactions-have-limits
    - spec:facts.f14-convex-error-survives-nested-and-component-boundary
---
# Local reaction wrapper

Layer 3 · Detail: full where D13 rules; numbers provisional until the first experiment · Traces: D13, D7, D4, D9, D11, D19, F3, F8, F9, F14, Probe 2, Sc L3-1, Sc L3-2, Sc L3-3, Sc L3-4, E-51.

The wrapper is the scheduled mutation that carries out one attempt of a local reaction. It is the one place D7 allows a nested mutation on the parent's behalf: the body runs as a sub-transaction so that its writes roll back on failure while the wrapper's own record of the attempt commits. On success the body's writes and the completion commit together, so the effect is never proven before it exists and never exists without being proven. A body refused by a maintenance gate or a capacity policy is delayed, not counted: a full pool delays work and never turns valid intent into a rejection, and a write pause or a restore that lasts longer than the backoff budget must not park every reaction in its scope for an operator.

## Intent

- outcome: Pin the wrapper as a step sequence with the outcome table: success commits effect and completion together; a known rejection settles; a retryable failure rolls the body back and records the next attempt; a maintenance refusal reschedules the same attempt without counting it; a wrapper failure leaves nothing and the sweeper rearms (D13, F3, F9)
- assumption: A `ConvexError` thrown by the body inside its nested mutation reaches the wrapper's catch with its `data` intact, which `errorClassification` rests on; this is F14, assumed, and Probe 2 settles it (F14, Probe 2)

### Open questions

- [non-blocking] Extension E-51: the doc does not give the backoff schedule, the default attempt budget, the default deadline or what a maintenance refusal does to the attempt count; this design uses exponential backoff from 1 second with base 2 capped at 1 hour, 8 attempts by default and no deadline by default, all per handler in the registry, and treats a transient `writePaused` or `capacity` refusal as a delay of the same attempt after `retryAfterMs` or 60 seconds; every number is a provisional default until the first experiment (D13, E-51, Decision method rule 4)

## Contract

- The wrapper is an internal mutation scheduled by `createObligation`, by the previous attempt, by the sweeper or by an operator retry, with the obligation ID and the attempt ID as its only arguments (D13, F8)
- The wrapper fences on the active attempt ID and the pending status; a stale dispatch returns without writing anything (D13)
- The wrapper resolves the handler by key and version from the static registry; an unsupported version moves the obligation to needs attention with reason `unsupportedVersion` and returns (D19, D13)
- When the authority mode is `recheckDelegator`, the wrapper rechecks the captured actor's grants in its own transaction before the body runs; a revoked authority moves the obligation to needs attention with reason `authorityRevoked` (D11, Law 5)
- The body runs as `ctx.runMutation` on the resolved handler, so a throw rolls back every write of the body and the wrapper can catch it and continue (D13, F3, D7)
- The body receives the tenant, the obligation ID, the operation ID, the attempt number and ID, the payload, the authority, the source event and the causation depth, and never reads `ctx.auth` (D13, D11, F9)
- A body that returns `applied` or `businessFailure` has committed its events in the sub-transaction; the wrapper records succeeded with `events` evidence in the same transaction, so the effect and the completion commit together (D13, D4, F8)
- A body that throws a `ConvexError` whose code the outcome boundary classifies as a rejection commits nothing; the wrapper records cancelled with `businessRejection` evidence and the last error of class `rejection` (D13, D7, E-51)
- A body that throws a `ConvexError` the boundary classifies as transient with code `writePaused` or `capacity` commits nothing and has not been attempted: the wrapper keeps the attempt number, the attempt ID and the attempt count, reschedules the same attempt after the refusal's `retryAfterMs` or the deferral delay, and records the refusal as the last error of class `retryable`, because a full pool or a closed gate delays work and never turns valid intent into a rejection (D13, D9, D4, E-51, Sc L3-3)
- A body that throws a `ConvexError` the boundary classifies as transient with any other code, or any other error, commits nothing; the wrapper records the last error of class `retryable`, increments the attempt count, and either schedules the next attempt or moves the obligation to needs attention with reason `exhausted` (D13, D4, F3)
- The next attempt is scheduled in the wrapper's transaction with a new attempt ID, so the schedule commits with the record or not at all (D13, F8)
- A throw from the wrapper itself outside the body's catch rolls back the whole scheduled mutation; nothing partial remains, the obligation stays pending with the old attempt ID, and the sweeper rearms it (D13, F9, Sc L3-2)
- Convex retries the wrapper on internal errors and executes it once; those retries are not attempts (F9, D15)
- The wrapper never reads `_scheduled_functions`, never calls an action and never decides from a callback (D13, Law 7)
- [extension] The body's `HandlerResult` is a closed union of `applied` and `businessFailure`; a body that wants to refuse throws through the outcome boundary's error shape rather than returning a third kind (D4, E-51)

## Design

- fnRunAttempt: `export const runAttempt = internalMutation({ args: { obligationId: v.id("obligations"), attemptId: v.string() }, returns: v.null(), handler })` (D13)
- typeHandlerArgs: `type HandlerArgs = { tenantId: string; obligationId: Id<"obligations">; operationId: string; attemptNumber: number; attemptId: string; payload: Payload; authority: Authority; sourceEvent?: { contextId: string; eventId: string }; causationDepth: number }` where `Payload` is the record contract's type, `Authority` is the one shape of `spec:command.actor-and-scope`, and `sourceEvent` and `causationDepth` are what a body needs to issue a derived command or create a derived obligation as `spec:obligations.fan-out-and-chains` pins (D13, D11, E-6, E-10, E-54)
- typeHandlerResult: `type HandlerResult = { kind: "applied"; evidence: CompletionEvidence } | { kind: "businessFailure"; evidence: CompletionEvidence }` (D13, D4)
- typeHandlerEntry: `type HandlerEntry = { run: FunctionReference<"mutation", "internal", HandlerArgs, HandlerResult>; maxAttempts: number; backoff: { initialMs: number; base: number; capMs: number }; defaultDeadlineMs?: number }` (D13, E-51)
- step1: load the obligation by `_id`; return null when it is missing (D13)
- step2: return null unless `status === "pending"` and `activeAttemptId === args.attemptId`; this is the fence against a duplicated or stale dispatch (D13, Sc L3-1)
- step3: resolve `registry[handlerKey][handlerVersion]`; when absent, patch `status: "needsAttention"`, `attentionReason: "unsupportedVersion"`, `lastError` of class `wrapper`, and return (D19)
- step4: when `authority.mode === "recheckDelegator"`, call `authorize` from `spec:command.actor-and-scope` with the captured actor and scope; when refused, patch needs attention with reason `authorityRevoked` and return (D11, Law 5)
- step5: `const result = await ctx.runMutation(entry.run, handlerArgs)` inside a try block (D13, F3)
- step6: on return, patch `status: "succeeded"`, `completionEvidence: result.evidence`, `settledAt: now`, `attemptCount + 1`, and clear `activeAttemptId` and `dispatchId` (D13, Law 7)
- step7: on a rejection-class `ConvexError`, patch `status: "cancelled"`, `completionEvidence: { kind: "businessRejection", code, attemptNumber }`, `lastError` of class `rejection`, `settledAt: now` (D13, D7, E-51)
- step8: on a transient `ConvexError` whose code is `writePaused` or `capacity`, patch `nextAttemptAt: now + (data.retryAfterMs ?? limitDeferralDelay)`, `lastError` of class `retryable` with that code, and `dispatchId = await ctx.scheduler.runAt(nextAttemptAt, internal.obligations.runAttempt, { obligationId, attemptId })` with the same attempt ID, leaving `attemptNumber`, `activeAttemptId` and `attemptCount` unchanged; the transition is the maintenance deferral of `spec:obligations.lifecycle-transitions` (D13, D9, F8, E-51)
- step9: on any other throw, compute `attemptCount + 1`; when it is below `maxAttempts` and the next time is before `deadline`, patch `status: "pending"`, `attemptNumber + 1`, a fresh `activeAttemptId`, `nextAttemptAt`, `lastError` of class `retryable`, and `dispatchId = await ctx.scheduler.runAt(nextAttemptAt, internal.obligations.runAttempt, { obligationId, attemptId })`; otherwise patch needs attention with reason `exhausted` (D13, F8)
- step10: return null; the wrapper makes no other write and schedules nothing else (D13)
- backoff: [extension] `nextAttemptAt = now + min(initialMs * base ^ (attemptNumber - 1), capMs)` with up to 10 percent jitter; provisional defaults 1000 ms, 2, 3,600,000 ms (D13, E-51)
- limitAttempts: [extension] `maxAttempts` defaults to 8 per handler entry, provisionally, and may be overridden per obligation at creation (D13, E-51)
- limitDeferralDelay: [extension] 60 seconds, the sweeper's cron interval, provisionally; a deferred attempt is rescheduled at that delay or at the refusal's `retryAfterMs`, and the sweeper leaves it alone because its dispatch row is Pending (D13, E-51, E-52)
- transactionBoundary: one scheduled mutation per attempt with the body as one nested sub-transaction; no action on the local path (D13, F3)
- errorClassification: the wrapper reads the `ConvexError` data shape and code list that `spec:command.outcome-boundary` pins; a code in the rejection set settles, the transient codes `writePaused` and `capacity` defer the same attempt, the transient `rateLimited` and a non-`ConvexError` throw retry as a counted attempt (D4, D7, F14, E-51)
- limitBodyBudget: the body shares the wrapper's transaction limits, so a body reads and writes within the ceilings in F13 minus the wrapper's own two reads and one write; a body that needs more is a fan-out task (F13, D13)
