---
id: spec:effects.external-effects.stale-worker-after-cancellation
kind: example
altitude: story
readiness: defined
relations:
  refines: spec:effects.external-effects
  verifies: spec:effects.external-effects
---
# An old worker reports after a cancellation

Sc L3-6 · native tier · second of two cases: the report arrives after an operator cancelled the obligation.

## Intent

- outcome: No stale overwrite; its provider evidence is kept and reconciled. (Sc L3-6)

```gwt
Given an external effect declares the repetition policy {policy: "none"}
And attempt {attempt: 1} has claimed the obligation with provider key {key: "eff-6b"}
And the provider {provider: "succeeds"}
And the obligation has since {since: "been cancelled"}
When the obligation module runs the next attempt and settles every report that arrives
Then irreversible provider effects number {effects: 1}
And the stale report {stale: "is kept and reconciled"}
And the obligation is {status: "cancelled"}
```

## Verification — executable

- Runs in the native tier; every test owns its disposable backend.
- The test holds attempt 1's action past its lease so `expireLease` moves the obligation to needs attention under policy `none`, then cancels it as an operator, then releases the old action so its confirmed report arrives (D14, D13).
- The test asserts the status is still cancelled, the report is in `lateEvidence`, `reconcileRequested` is true, and no new attempt or call was made (D14, Sc L3-6).
- The test asserts `reconcile` as an operator with the provider's evidence is refused on a terminal obligation and that compensation must be a new operation, so the stub still shows one effect (D14, D13).
