---
id: spec:effects.external-effects.stale-worker-late-evidence
kind: example
altitude: story
readiness: defined
relations:
  refines: spec:effects.external-effects
  verifies: spec:effects.external-effects
---
# An old worker reports after a new attempt

Sc L3-6 · native tier · first of two cases: the report arrives after a new attempt claimed the obligation.

## Intent

- outcome: No stale overwrite; its provider evidence is kept and reconciled. (Sc L3-6)

```gwt
Given an external effect declares the repetition policy {policy: "reconcile first"}
And attempt {attempt: 1} has claimed the obligation with provider key {key: "eff-6"}
And the provider {provider: "succeeds"}
And the obligation has since {since: "moved to a new attempt"}
When the obligation module runs the next attempt and settles every report that arrives
Then irreversible provider effects number {effects: 1}
And the stale report {stale: "is kept and reconciled"}
And the obligation is {status: "succeeded"}
```

## Verification — executable

- Runs in the native tier; every test owns its disposable backend.
- The test holds attempt 1's action past its lease, lets `expireLease` claim a reconcile attempt, then releases the old action so its confirmed report reaches `settleAttempt` with the old attempt ID (D14).
- The test asserts `settleAttempt` returned `stale`, the report is in `lateEvidence`, `reconcileRequested` is true, and the status and active attempt were not overwritten (D14, Sc L3-6).
- The test asserts the reconcile attempt finds the provider's record under the same key and settles succeeded, with exactly one irreversible effect recorded by the stub (D14).
- The test repeats the scenario with the reconcile attempt reporting ambiguous, so the obligation parks in needs attention with reason `uncertain`, then calls `reconcile` as an operator without evidence and asserts that a new attempt is minted with `reconcileRequested` set, that `claimAttempt` sets running with a lease, that the reconcile action's confirmed report returns `settled` rather than `stale`, that the obligation settles succeeded from the provider's record under the same key with the repair recorded, and that the stub still shows one effect (D14, D13, Law 8, Sc L3-6).
