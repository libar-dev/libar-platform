---
id: spec:agents.budget-accounting.timed-out-paid-call-settles-once
kind: example
altitude: story
readiness: defined
relations:
  refines: spec:agents.budget-accounting
  verifies: spec:agents.budget-accounting
---
# A paid call times out and usage arrives later

Sc L5-3 · native tier.

## Intent

- outcome: Settles once; never zero cost; no slot lost for good. (Sc L5-3)

```gwt
Given a paid call reserved {reserved: 10} units of budget and one concurrency slot before dispatch
And the call's lease timed out with no usage report
And the provider's usage report arrives afterwards with {usage: 7} units
When the late report is reconciled
Then the reservation settles {settlements: 1} times at the reported usage and is never released as zero before the report
And the slot is released by reconciliation or by the operator exit, never lost for good
```

## Verification — executable

- Runs in the native tier; every test owns its disposable backend.
- The test asserts that between the timeout and the report the reservation shows unknown cost, not zero, and that a second copy of the same usage report is refused (D17, Law 7).
- The test asserts the slot is held until reconciliation and that the operator exit releases it with a repair record when no report ever arrives (D17, D13).
