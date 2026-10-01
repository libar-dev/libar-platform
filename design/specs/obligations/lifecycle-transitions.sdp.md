---
id: spec:obligations.lifecycle-transitions
kind: rule
altitude: story
readiness: defined
relations:
  refines: spec:obligations.obligation-module
  dependsOn: spec:obligations.record-contract
  constrainedBy:
    - spec:laws.law07-deferred-work-never-reported-early
    - spec:laws.law08-durable-capability-ships-operations
---
# Obligation lifecycle transitions

Layer 3 · Detail: full where D13 rules; numbers provisional until the first experiment · Traces: D13, D14, D19, D4, D9, Law 7, Law 8, Sc L3-6, Sc L3-7, E-10, E-51, E-53, E-56.

D13 gives six states and their meaning. It does not list which transitions exist or who may cause each, so this rule Spec does, as extension E-10. Every transition below is caused by exactly one of six writers: the creating use case, the wrapper, the claim mutation, the settle mutation, the sweeper, or an operator operation. A retry is a timestamp on pending and not a state, so a retry is a transition from pending to pending that changes the attempt number, the next attempt time and the active attempt ID. An operator reconcile without supplied evidence is not a transition of its own into a settled state: it mints an attempt and moves the obligation to pending, and the claim and the settle then carry that attempt through running like any other.

## Intent

- outcome: Every change of an obligation's status is one of the transitions listed here, caused by the writer named, and no writer can produce a success without evidence (D13, Law 7, E-10)

### Open questions

- [non-blocking] Extension E-10: the doc names the six states but not the allowed transitions or their causes; this Spec lists them and refuses every other transition (D13, E-10)
- [non-blocking] Extension E-51: the doc says a known business rejection settles the business result but not which state it settles to; this design reads a body's business failure, which commits like a success, as succeeded with evidence naming its event, and a thrown rejection, which commits nothing, as cancelled with the settled result as `businessRejection` evidence, because cancelled means the effect will not happen and no call is in flight; the owner may prefer a seventh state (D13, D4, E-51)

## Rule

- A row is created only in `pending`, by the creating use case, with attempt number 1 and a fresh active attempt ID (D13)
- `pending` to `pending` is a retry or a rearm with four causes: the wrapper or the settle mutation on a retryable failure sets the next attempt time, increments the attempt count and mints a new attempt ID; the sweeper on a failed or missing dispatch keeps the attempt number, increments the rearm count and mints a new attempt ID; an operator retry on a pending obligation whose next attempt is past due, or an operator reconcile without supplied evidence on a pending obligation flagged `reconcileRequested`, mints a new attempt number and attempt ID, resets the rearm count to 0, schedules the dispatch now, in reconcile mode for the reconcile, and records a repair, so the old dispatch is fenced out if it ever runs (D13, Law 8, Sc L3-2, E-53)
- [extension] `pending` to `pending` is also a maintenance deferral, caused by the wrapper when the body was refused with the transient `writePaused` or `capacity`, and by the claim mutation of an external effect in call mode while external dispatch is off: it moves the next attempt time and reschedules the same attempt ID, and it changes neither the attempt number, the attempt count nor the rearm count, so a write pause, a restore or the dispatch switch never exhausts a budget or a rearm bound (E-51, E-56, D13, D9, D19, Sc L3-3, Sc L3-7)
- `pending` to `running` is caused only by the claim mutation of an external effect, in call or in reconcile mode, which sets the lease expiry and the provider key; a reconcile attempt minted by the settle mutation, the sweeper, the schedule rebuild or an operator reconcile takes this same transition, so no reconcile runs without a lease (D13, D14, Sc L3-6)
- `pending` to `succeeded` is caused only by the wrapper when the body committed, with `events` evidence in the same transaction (D13, Law 7)
- `pending` to `cancelled` is caused by the wrapper on a thrown business rejection, with `businessRejection` evidence, or by an operator cancel when no call is in flight (D13, E-51)
- `pending` to `needsAttention` is caused by the wrapper when the attempt budget or the deadline is exhausted, when the handler version is unsupported, or when a rechecked authority is revoked, and by the sweeper when the rearm bound is exceeded (D13, D19, D11)
- `running` to `succeeded` is caused only by the settle mutation with `provider` evidence whose attempt number equals the active attempt (D14, Law 7)
- `running` to `pending` is caused by the settle mutation on a retryable or a policy-covered ambiguous report, and by the sweeper on lease expiry under a policy that allows a new attempt (D14)
- `running` to `cancelled` is caused by the settle mutation on a declined report, with `businessRejection` evidence (D14, E-51)
- `running` to `needsAttention` is caused by the settle mutation or the sweeper when the outcome is ambiguous and no safe policy exists, or when the budget is exhausted (D14, D13)
- `running` never transitions by an operator while the lease is live, because cancelled means no call is still in flight (D13, D14)
- `needsAttention` to `pending` is caused only by an operator retry or by an operator reconcile without supplied evidence, each minting a new attempt and recorded as a repair; the reconcile sets `reconcileRequested` so the claim that follows runs in reconcile mode, and a reconcile report of retryable then reaches pending from running through the settle mutation like any other report (D13, D14, Law 8, Sc L3-6)
- `needsAttention` to `succeeded` is caused only by an operator reconcile that supplies `provider` evidence, recorded as a repair; a reconcile without evidence leaves needs attention through pending and running, and late evidence confirmed by that claimed reconcile attempt settles succeeded from running through the settle mutation; an operator decision alone is not evidence (D13, D14, Law 7, Sc L3-6)
- `needsAttention` to `cancelled` is caused only by an operator cancel, recorded as a repair (D13)
- `needsAttention` to `abandoned` is caused only by an operator abandon, recorded as a repair, and abandoned is never shown as success (D13)
- `succeeded`, `cancelled` and `abandoned` are terminal; compensation is a new business operation with its own identity (D13, D14)
- Late evidence never changes a terminal status or a status owned by a newer attempt; it is appended to `lateEvidence` and sets `reconcileRequested` (D14, Sc L3-6)
- Every transition sets `updatedAt`; every transition into a terminal state sets `settledAt` and clears `activeAttemptId`, `dispatchId` and `leaseExpiresAt` (D13, D19)
