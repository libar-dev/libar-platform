---
id: spec:effects.claim-call-settle
kind: contract
altitude: story
readiness: defined
relations:
  refines: spec:effects.external-effects
  dependsOn:
    - spec:obligations.record-contract
    - spec:obligations.lifecycle-transitions
    - spec:obligations.local-reaction-wrapper
  constrainedBy:
    - spec:facts.f09-scheduled-mutation-and-action-retry-semantics
    - spec:facts.f10-action-mutation-calls-are-separate-transactions
    - spec:facts.f08-scheduling-commits-with-mutation
    - spec:facts.f13-transactions-have-limits
    - spec:facts.f12-backups-exclude-pending-scheduled-functions
    - spec:laws.law05-authorization-before-execution-and-disclosure
    - spec:laws.law07-deferred-work-never-reported-early
    - spec:laws.law12-one-retry-owner
  decidedBy:
    - spec:decisions.d15-one-retry-owner-per-obligation
    - spec:decisions.d19-operations-travel-with-capability
---
# Claim, call and settle

Layer 3 · Detail: full where D14 and D15 rule; numbers provisional until the first experiment · Traces: D14, D15, D13, D11, D19, F8, F9, F10, F12, F13, Sc L3-5, Sc L3-6, Sc L3-7, E-11, E-51, E-53, E-56, E-58.

The three functions of an external attempt and the closed policy union. The claim is a mutation, the call is an action, the settle is a mutation; the reconcile path reuses the same three with a reconcile action in the middle. The lease expiry mutation lets the sweeper settle an attempt whose action never reported, and the schedule rebuild after a restore settles a running obligation whose action was lost with the backup the same way. Backoff, attempt budget and error classes are shared with the local wrapper.

The reconcile action is reached only through the claim. The settle mutation, the lease expiry, the sweeper's rearm, the schedule rebuild and the operator reconcile each mint an attempt and schedule the claim in reconcile mode; the claim takes the lease that the settle's fence expects, so a reconcile report is never classified stale for want of a claim. While external dispatch is off, a claim in call mode defers the same attempt instead of returning, so its dispatch row stays pending, the sweeper leaves it alone as a backlog and no rearm is spent; a claim in reconcile mode proceeds, because a reconcile sends nothing irreversible and reconciling the gap is what the restore does while dispatch is off.

The action repeats exactly one thing when it throws: its settle call, within a small bound. The settle is fenced on the attempt and recognizes a duplicate delivery of a report it already recorded, so a repeated settle sends nothing to the provider, changes no attempt number and is not an attempt under Law 12. Without the repeat, a provider call that succeeded in seconds would wait for the lease to expire, 15 or 35 minutes, before the sweeper settled it as ambiguous; with it, lease expiry is the last resort rather than the normal path for a transient failure between the action and the database.

## Intent

- outcome: Pin `claimAttempt`, `callProvider`, `settleAttempt`, `reconcileAttempt`, `expireLease` and `readForCall` with their arguments, fences and outcome handling, and the `RepetitionPolicy` union (D14, E-11)

### Open questions

- [non-blocking] Extension E-11: the doc gives the three steps and the three policies but no signatures; this Spec pins them and adds a fourth policy value `none`, which is the declared absence of a safe policy the doc describes (D14, E-11)
- [non-blocking] Extension E-58: the doc gives no lease duration, key derivation, late evidence bound, reconcile shape or handling of a settle call that throws; this design sets the lease to the handler runtime's action timeout plus 5 minutes, derives the key from tenant and effect key, keeps ten late reports, defines a reconcile as a provider query that returns the same report union, and lets the action repeat a thrown settle call three times, with a duplicate rule in the settle, before leaving the attempt to lease expiry (D14, D15, F13, E-58)

## Contract

- The claim fences on pending status and the active attempt ID, defers the attempt in call mode while external dispatch is off, resolves the effect handler by key and version, rechecks authority when the mode asks for it, sets running with a lease expiry and the provider key, and schedules the action in the same transaction (D14, D13, D11, D19, F8)
- `reconcileAttempt` is scheduled only by the claim in reconcile mode, so every reconcile runs under a lease and its report meets the settle's fence; the settle mutation, the lease expiry, the sweeper, the schedule rebuild and the operator reconcile reach it by minting an attempt and scheduling the claim, never by scheduling the action (D14, Sc L3-6)
- [extension] While external dispatch is off, a claim in call mode reschedules the same attempt ID after the deferral delay and counts nothing, and a claim in reconcile mode proceeds, because a reconcile sends nothing irreversible and reconciling the gap is what runs while dispatch is off; a deferred claim keeps a pending dispatch row, so the sweeper spends no rearm on it (D19, D14, E-56, Sc L3-7)
- The provider key is derived at the first claim and stored; a later claim reuses it and, when the policy is reuse and the validity has passed, schedules a reconcile instead of a call (D14)
- The action reads the record through an internal query and skips the call when the attempt is no longer active, so a cancelled or superseded attempt sends nothing new (D14, F10)
- The action calls the provider once, classifies the result into the report union, and calls the settle mutation; a thrown call is classified ambiguous; a settle call that throws is repeated by the action within a small bound, because the settle is fenced and idempotent and repeating it repeats no provider call; when the bound is spent the action logs and returns, and the lease expiry path settles the attempt (D14, D15, F9, F10)
- A repeated settle call is not an attempt under Law 12: it carries the same attempt number and ID, sends nothing to the provider and is bounded inside the one action run; lease expiry stays the last resort when every settle call fails (D15, Law 12, D14)
- The action writes nothing to the database itself and holds no transaction (F10)
- The settle fences on running status and the active attempt ID; a stale report is appended to late evidence with a reconcile request and changes no status (D14, Sc L3-6)
- The settle recognizes a duplicate delivery, a report it has already recorded for the same attempt number, and returns `duplicate` without a write, so a repeated settle call after a lost response neither settles twice nor pollutes late evidence, while a different report for the same attempt, such as a confirmation arriving after lease expiry, is still kept as late evidence (D14, D15, Sc L3-6)
- A confirmed report settles succeeded with `provider` evidence carrying the provider key, the provider reference, the observation time and the attempt number (D14, Law 7)
- A declined report settles cancelled with `businessRejection` evidence (D14, E-51)
- A retryable report schedules the next attempt with the same provider key when the budget allows, and moves to needs attention with reason `exhausted` otherwise (D14, D13)
- An ambiguous report under `reuseProviderKey` within validity is handled like a retryable report; under `reconcileFirst` it claims a reconcile attempt; under `duplicatesAcceptable` it is handled like a retryable report within the policy's attempt count; under `none` it moves to needs attention with reason `uncertain` (D14)
- A reconcile report of `confirmed` or `declined` settles like a call report; a reconcile report of `retryable` means the provider never saw the attempt and a new call with the same key is safe; a reconcile report of `ambiguous` moves to needs attention with reason `uncertain` (D14)
- Lease expiry is settled as an ambiguous report with code `lease-expired` through the same policy branches, and the schedule rebuild after a restore settles a running obligation the backup left behind, whose action is gone, the same way with code `restore-gap` (D13, D14, D19, F12)
- An obligation flagged `reconcileRequested` claims its next attempt in reconcile mode first, and that claim consumes the flag, so a later attempt runs in the mode its report calls for unless new late evidence sets the flag again (D14, Sc L3-6)
- [extension] The lease duration is the action timeout of the handler's declared runtime plus 5 minutes: 35 minutes for the Convex runtime, 15 minutes for Node (F13, E-58)
- [extension] The provider key is `tenantId + ":" + effectKey`, which is unique per tenant and logical effect and carries no secret (D14, E-58)
- [extension] The action repeats a thrown settle call at most 3 times, 250 ms, 500 ms and 1000 ms apart, so it spends under 2 seconds on the repeats and stays far inside the shortest lease (F13, E-58)

## Design

- typeRepetitionPolicy: `type RepetitionPolicy = { kind: "reuseProviderKey"; validityMs: number } | { kind: "reconcileFirst" } | { kind: "duplicatesAcceptable"; maxAttempts: number } | { kind: "none" }` (D14, E-11)
- validatorRepetitionPolicy: `const repetitionPolicyValidator = v.union(v.object({ kind: v.literal("reuseProviderKey"), validityMs: v.number() }), v.object({ kind: v.literal("reconcileFirst") }), v.object({ kind: v.literal("duplicatesAcceptable"), maxAttempts: v.number() }), v.object({ kind: v.literal("none") }))` (D14, E-11)
- typeProviderReport: `type ProviderReport = { kind: "confirmed"; providerRef: string; observedAt: number } | { kind: "declined"; code: string } | { kind: "retryable"; code: string; message: string } | { kind: "ambiguous"; code: string; message: string }` (D14)
- validatorProviderReport: `const providerReportValidator = v.union(v.object({ kind: v.literal("confirmed"), providerRef: v.string(), observedAt: v.number() }), v.object({ kind: v.literal("declined"), code: v.string() }), v.object({ kind: v.literal("retryable"), code: v.string(), message: v.string() }), v.object({ kind: v.literal("ambiguous"), code: v.string(), message: v.string() }))` (D14)
- typeCallInput: `type CallInput = { tenantId: string; obligationId: Id⟨"obligations"⟩; operationId: string; attemptNumber: number; attemptId: string; providerKey: string; payload: Payload; authority: Authority }` where `Payload` is the record contract's type and `Authority` the one shape of `spec:command.actor-and-scope` (D14, D13, E-6, E-10)
- typeEffectHandler: `type EffectHandler = { policy: RepetitionPolicy; runtime: "convex" | "node"; call: (input: CallInput) => Promise⟨ProviderReport⟩; reconcile?: (input: CallInput) => Promise⟨ProviderReport⟩; maxAttempts: number; backoff: { initialMs: number; base: number; capMs: number } }` with `reconcile` required when the policy is `reconcileFirst` (D14, E-11)
- typeEffectRegistry: `type EffectRegistry = Record⟨string, Record⟨number, EffectHandler⟩⟩` keyed by handler key then version, a static module imported by the actions (D19, D12)
- fnClaimAttempt: `export const claimAttempt = internalMutation({ args: { obligationId: v.id("obligations"), attemptId: v.string(), mode: v.union(v.literal("call"), v.literal("reconcile")) }, returns: v.null(), handler })` (D14)
- fnReadForCall: `export const readForCall = internalQuery({ args: { obligationId: v.id("obligations"), attemptId: v.string() }, returns: v.union(v.null(), callInputValidator), handler })` (D14)
- fnCallProvider: `export const callProvider = internalAction({ args: { obligationId: v.id("obligations"), attemptId: v.string() }, returns: v.null(), handler })` (D14, F9)
- fnReconcileAttempt: `export const reconcileAttempt = internalAction({ args: { obligationId: v.id("obligations"), attemptId: v.string() }, returns: v.null(), handler })` (D14)
- fnSettleAttempt: `export const settleAttempt = internalMutation({ args: { obligationId: v.id("obligations"), attemptId: v.string(), attemptNumber: v.number(), mode: v.union(v.literal("call"), v.literal("reconcile")), report: providerReportValidator }, returns: v.union(v.literal("settled"), v.literal("stale"), v.literal("duplicate")), handler })` (D14, D15)
- fnExpireLease: `export const expireLease = internalMutation({ args: { obligationId: v.id("obligations"), attemptId: v.string(), cause: v.optional(v.union(v.literal("leaseExpired"), v.literal("restoreGap"))) }, returns: v.union(v.literal("settled"), v.literal("skipped")), handler })` with `leaseExpired` the default (D13, D14, D19)
- claimStep1: load; return unless `status === "pending"` and `activeAttemptId === args.attemptId` (D13)
- claimStep2: when `process.env.OBLIGATIONS_DISPATCH === "off"` and `mode === "call"`, patch `nextAttemptAt: now + limitDeferralDelay`, `lastError` of class `retryable` with code `dispatchOff` and the current attempt number, `updatedAt`, and `dispatchId = await ctx.scheduler.runAt(nextAttemptAt, internal.effects.claimAttempt, { obligationId, attemptId, mode })` with the same attempt ID, leaving `status`, `attemptNumber`, `activeAttemptId`, `attemptCount` and `rearmCount` unchanged, then return; this is the maintenance deferral of `spec:obligations.lifecycle-transitions`, its pending dispatch row keeps the sweeper away, and a claim in reconcile mode passes this step (D19, E-56, E-51, F8)
- claimStep3: resolve the handler; unsupported version moves to needs attention with reason `unsupportedVersion` (D19)
- claimStep4: recheck authority when `authority.mode === "recheckDelegator"`; revoked moves to needs attention with reason `authorityRevoked` (D11, Law 5)
- claimStep5: set `providerKey` and `providerKeyIssuedAt` when absent; when the policy is `reuseProviderKey` and `now - providerKeyIssuedAt > validityMs`, force `mode` to `reconcile` (D14)
- claimStep6: patch `status: "running"`, `leaseExpiresAt: now + leaseMs`, `attemptCount + 1`, `updatedAt`, and `reconcileRequested: false` when `mode === "reconcile"`, because this claim honours the flag, then `dispatchId = await ctx.scheduler.runAfter(0, mode === "call" ? internal.effects.callProvider : internal.effects.reconcileAttempt, { obligationId, attemptId })`; this is the only place `reconcileAttempt` is scheduled (D14, F8, Sc L3-6)
- actionStep1: `const input = await ctx.runQuery(internal.effects.readForCall, { obligationId, attemptId })`; return when null (D14, F10)
- actionStep2: `report = await handler.call(input)` or `handler.reconcile(input)` inside a try; a throw becomes `{ kind: "ambiguous", code: "call-threw", message }` (D14)
- actionStep3: `await ctx.runMutation(internal.effects.settleAttempt, { obligationId, attemptId, attemptNumber: input.attemptNumber, mode, report })`; when it throws, the action waits and calls it again with the same arguments, up to `limitSettleRetries` times; when the retries are spent the last throw is logged and the action returns, and the lease expiry path settles the attempt (D14, D15, F10)
- settleStep1: load; when the fence fails, that is `status !== "running"` or `activeAttemptId !== args.attemptId`, test for a duplicate delivery first: the row already records this report for `args.attemptNumber`, which is `completionEvidence` of kind `provider` for a confirmed report or `businessRejection` for a declined report with `attemptNumber === args.attemptNumber`, or `lastError` with `attemptNumber === args.attemptNumber`, the class of the report's kind and the report's code for a retryable or ambiguous report; a duplicate returns `duplicate` and writes nothing (D14, D15)
- settleStep2: when the fence fails and the report is not a duplicate, append the report as late evidence when it is confirmed or ambiguous, set `reconcileRequested: true`, and return `stale` (D14, Sc L3-6)
- settleStep3: confirmed patches succeeded with `provider` evidence, `settledAt`, and clears `activeAttemptId`, `dispatchId`, `leaseExpiresAt` (D14, Law 7)
- settleStep4: declined patches cancelled with `businessRejection` evidence and `settledAt` (D14, E-51)
- settleStep5: retryable, and ambiguous under a policy that allows a new attempt, patch pending with `attemptNumber + 1`, a fresh `activeAttemptId`, `nextAttemptAt` by the shared backoff, `lastError`, and `dispatchId = await ctx.scheduler.runAt(nextAttemptAt, internal.effects.claimAttempt, { obligationId, attemptId, mode })` where mode is `reconcile` under `reconcileFirst` and `call` otherwise; when the budget is exhausted, patch needs attention with reason `exhausted` (D14, D13, F8)
- settleStep6: ambiguous under `none`, or ambiguous from a reconcile, patches needs attention with reason `uncertain` and keeps `lastError` of class `ambiguous` (D14, Law 7)
- expireStep1: load; return `skipped` unless running on `attemptId`; with cause `leaseExpired`, the default the sweeper passes, also return `skipped` unless `leaseExpiresAt < now`; with cause `restoreGap`, which only `rebuildSchedules` of `spec:obligations.retention-and-restore` passes, the lease time is ignored because the action that held it was lost with the backup; otherwise run settleStep5 or settleStep6 with the report `{ kind: "ambiguous", code }` where `code` is `lease-expired` or `restore-gap` by the cause (D13, D14, D19, F12)
- limitLease: [extension] 35 minutes for `runtime: "convex"` and 15 minutes for `runtime: "node"`, both above the action timeouts in F13; the 5 minute margin is a provisional default (F13, E-58)
- limitLateEvidence: [extension] 10 reports kept on the row, a provisional default (D14, E-58)
- limitSettleRetries: [extension] 3 repeats of the settle call after the first, spaced 250 ms, 500 ms and 1000 ms by a timer inside the action, provisional defaults; the repeats end under 2 seconds, far inside the shortest lease, and a settle that keeps throwing past them is left to lease expiry (F13, E-58)
- settleRetryRule: a repeated settle call is not an attempt: it carries the same attempt number and ID, sends nothing to the provider, and either settles once, returns `duplicate`, or returns `stale`; Law 12's one retry owner is untouched because nothing the provider sees is repeated (D15, Law 12)
- errorCodeDispatchOff: the claim throws nothing while dispatch is off; it defers the same attempt with `lastError.code` `dispatchOff`, so an operator's inspect shows why the obligation waits, the sweeper leaves the pending dispatch row alone, no rearm is spent, and the attempt proceeds by itself once the switch is on; `rebuildSchedules` finds every such obligation already dispatched (D19, E-56)
- limitDeferralDelay: [extension] 60 seconds, the same delay as the wrapper's maintenance deferral in `spec:obligations.local-reaction-wrapper`, provisionally; a deferred claim re-reads the switch once a minute, so the restore's last step is followed within a minute and the outstanding deferred claims stay far under the scheduling ceiling in F13 (E-51, E-56, F13)
- transactionBoundary: claim and settle are each one mutation; the action is not a transaction and each of its calls, a repeated settle call included, is a separate transaction (F10)
