---
id: spec:effects.external-effects
kind: behavior
altitude: feature
readiness: defined
relations:
  refines: spec:obligations.obligation-module
  dependsOn:
    - spec:obligations.record-contract
    - spec:obligations.lifecycle-transitions
    - spec:obligations.sweeper
  constrainedBy:
    - spec:laws.law07-deferred-work-never-reported-early
    - spec:laws.law12-one-retry-owner
    - spec:facts.f09-scheduled-mutation-and-action-retry-semantics
    - spec:facts.f10-action-mutation-calls-are-separate-transactions
    - spec:facts.f08-scheduling-commits-with-mutation
    - spec:facts.f12-backups-exclude-pending-scheduled-functions
  decidedBy:
    - spec:decisions.d14-external-effects-declare-safe-repetition
    - spec:decisions.d15-one-retry-owner-per-obligation
---
# External effects

Layer 3 · Detail: full where D14 and D15 rule; numbers provisional until the first experiment · Traces: D14, D15, D13, Law 7, Law 12, F8, F9, F10, Decision method rule 4, Sc L3-5, Sc L3-6.

An external effect is an obligation whose attempt must leave the transaction to reach a provider. The module claims the attempt in one transaction, calls the provider in an action, and settles in a second transaction. Nothing between the claim and the settle is atomic: the action's mutation calls are separate transactions and the action is never retried by Convex, so every retry belongs to the module and every effect declares how a repeated attempt stays safe. An ambiguous outcome with no safe policy goes to needs attention rather than to a blind retry.

## Intent

- actor: An obligation of kind `external`; the claim and settle mutations; the provider-calling action; the sweeper on lease expiry; the operator on reconcile (D14)
- problem: The provider succeeds but the reply is lost; an old worker reports after a new attempt or a cancellation; a retry that sends a fresh random key charges twice, and fencing database writes cannot recall a call already sent (Sc L3-5, Sc L3-6, D14)
- outcome: Every external effect is claimed in one transaction, called in an action and settled in a second transaction, declares one repetition policy, and never repeats an irreversible effect without the provider's key or a reconciliation (D14, Law 7)
- value: A second irreversible effect is prevented by the provider's key or by reconciliation, and an ambiguous outcome is parked for a person rather than retried blind (D14)
- risk: Each effect must pick and keep a policy, the lease duration must exceed the action timeout, and a stale worker's late evidence must be kept and reconciled rather than dropped (D14, F13)
- assumption: Scheduled actions are not retried by Convex, so the module is the only retry owner (F9, D15)
- assumption: An action's mutation calls are separate transactions, so the claim, the call and the settle are three boundaries (F10)
- assumption: Scheduling the action from the claim commits with the claim, so a claimed attempt always has a dispatch or the claim never happened (F8)

### Open questions

- [non-blocking] Extension E-58: the doc does not give the lease duration, the provider key derivation, the late evidence bound, the shape of a reconcile, or what the action does when its settle call throws; `spec:effects.claim-call-settle` pins them (D14, E-58)
- [non-blocking] Extension E-51: a declined provider report settles the obligation as cancelled with `businessRejection` evidence, by the same reading as the local wrapper (D14, D4, E-51)
- [non-blocking] Decision method rule 4: the doc writes Layer 3 from what the first experiment shows, and this Spec and `spec:effects.claim-call-settle` are written before it runs; the lease durations, the settle repeats and the late-evidence bound of E-58 and the backoff shared under E-51 are provisional defaults until the experiment's measurements and Probe 7 confirm or replace them, and the owner confirms that writing the structure now does not pre-empt the experiment (Decision method rule 4, D14, D15, E-51, E-58)

## Behavior

- rule: Claim the attempt in one transaction, call the provider in an action, settle in a second transaction (D14, F10)
- rule: Each effect picks one repetition policy: reuse the provider's idempotency key within its validity period, reconcile with the provider before any new irreversible attempt, or declare duplicates acceptable as a business property, still with bounded retries (D14)
- rule: With no safe policy, an ambiguous outcome goes to needs attention (D14, Law 7)
- rule: A fresh random provider key is not a retry; the provider key is derived once per obligation and reused across attempts within its validity (D14)
- rule: A stale worker cannot overwrite a newer decision, but its late provider evidence is kept and reconciled (D14, Sc L3-6)
- rule: Fencing database writes does not stop a network call already sent, so the claim records the provider key before the call and the settle never assumes the call did not happen (D14)
- rule: Compensation is a new business operation with its own identity, never a transition of the settled obligation (D14)
- rule: The action performs no retries of the provider call and makes at most one provider call per attempt; every retry of the effect is an attempt the module records; the action's bounded repeat of its fenced settle call after a throw sends nothing to the provider and is not a retry of the effect (D15, F9, Law 12)
- rule: A lease marks execution ownership and proves nothing about provider cancellation; an expired lease is an ambiguous outcome settled under the policy (D13, D14)
- rule: The claim rechecks the stored authority when the record asks for it, because the action runs with no auth of its own (D11, F9)
- rule: Every reconcile is a claimed attempt: the settle mutation, the lease expiry, the sweeper, the schedule rebuild and the operator reconcile reach the reconcile action only through the claim, which takes the lease that the settle's fence expects, so no reconcile report is stale for want of a claim (D14, Sc L3-6)
- rule: While external dispatch is off after a restore, a claim in call mode defers the same attempt and makes no provider call, and a claim in reconcile mode proceeds, because reconciling the gap is what the restore does while dispatch is off (D19, F12)
- flow: The claim mutation fences on the active attempt ID, sets running with a lease and the provider key, and schedules the action, all committing together (D14, F8)
- flow: The action reads the current record through an internal query, skips the call when the attempt is stale, calls the provider once, classifies the result as confirmed, declined, retryable or ambiguous, and calls the settle mutation, repeating only that call within a small bound when it throws (D14, D15, F10)
- flow: The settle mutation fences on the active attempt ID and the running status; a fenced report settles the obligation, and a stale report is appended as late evidence with a reconcile request and changes no status (D14, Sc L3-6)
- flow: On an ambiguous report the settle mutation follows the policy: same key and a new attempt under reuse, a reconcile attempt under reconcile first, a new attempt under acceptable duplicates, needs attention under none (D14)
- flow: The sweeper hands an expired lease to the lease expiry mutation, which settles it as an ambiguous report under the same policy (D14, D13)

## Design

Three boundaries per attempt: the claim commits the intent and the dispatch, the action holds no transaction, and the settle commits the result. The provider key lives on the obligation from the first claim, so a restore and every later attempt see the same key. The lease is the only thing that says an action may be running, and it expires by time, never by a callback.

- transactionBoundary: action plus two mutations per attempt; the reconcile path is the same shape with the reconcile action in the middle (D14, F10)
- convexSurface: `claimAttempt` internal mutation; `callProvider` and `reconcileAttempt` internal actions; `settleAttempt` and `expireLease` internal mutations; `readForCall` internal query (D14)
- providerKeyRule: derived once at the first claim from tenant and effect key, stored on the row with its issue time, reused within the policy's validity, and never regenerated by a retry or a restore (D14, D19)
- ambiguityRule: a thrown error from the provider call, a timeout and an expired lease are all ambiguous, because the request may have reached the provider (D14)
- lateEvidenceRule: a report whose attempt ID is not the active one is appended to `lateEvidence` and sets `reconcileRequested`; a confirmed late report on an obligation that is not succeeded is what the next reconcile resolves (D14, Sc L3-6)
- deferred: the durable circuit breaker for a provider that keeps failing is a Layer 6 capability on its own trigger; until then exhaustion goes to needs attention (D18)

## Example space

```gwt-vocabulary
Given an external effect declares the repetition policy {policy:"reuse provider key"|"reconcile first"|"duplicates acceptable"|"none"}
And attempt {attempt:number} has claimed the obligation with provider key {key:string}
And the provider {provider:"succeeds and the reply is lost"|"succeeds"|"declines"|"times out"}
And the obligation has since {since:"moved to a new attempt"|"been cancelled"|"stayed on the same attempt"}
When the obligation module runs the next attempt and settles every report that arrives
Then irreversible provider effects number {effects:number}
And the stale report {stale:"is kept and reconciled"|"overwrote the newer decision"|"is dropped"}
And the obligation is {status:"succeeded"|"pending"|"needs attention"|"cancelled"}
And the provider key on the next attempt is {nextKey:"the same key"|"a fresh random key"}
```

## Verification — reviewed

- A reviewer confirms that the action makes exactly one provider call per attempt and contains no retry loop around it, and that the only call it repeats is the fenced settle mutation within the bound `spec:effects.claim-call-settle` states (F9, D15).
- A reviewer confirms that every policy branch in the settle mutation either reuses the stored key, reconciles first, or is bounded by the policy's attempt count, and that the `none` policy always ends in needs attention on ambiguity (D14).
- A reviewer confirms that the lease duration in `spec:effects.claim-call-settle` exceeds the action timeout of the runtime the handler declares (F13).
