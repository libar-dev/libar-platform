---
id: spec:obligations.retention-and-restore.retention-keeps-unresolved
kind: example
altitude: story
readiness: defined
relations:
  refines: spec:obligations.retention-and-restore
  verifies: spec:obligations.retention-and-restore
---
# Retention runs while retries or redelivery are still possible

Sc L3-8 · native backend tier.

## Intent

- outcome: Dedup and obligation evidence survives; no unresolved work is erased. (Sc L3-8)

```gwt
Given an obligation is {status: "succeeded"} with provider key {key: "eff-8"}
And it settled {settledDaysAgo: 3} days ago
And the longest repetition horizon is {horizonDays: 30} days
And another obligation is still unresolved
And the module operation under test is {operation: "retention"}
When the module operation runs
Then the obligation evidence {evidence: "survives"}
And unresolved work {unresolved: "is untouched"}
```

## Verification — executable

- Runs in the native backend tier; every test owns its disposable backend.
- The test seeds a succeeded obligation settled 3 days ago, a pending one, a running one and one in needs attention, sets the registry's longest validity to 30 days, and runs `retain` to completion (D13, D19).
- The test asserts the succeeded row and its `completionEvidence` still exist, that the three unresolved rows are byte-identical to their seeds, and that a retried attempt with the same effect key still finds the existing row (D13, Sc L3-8).
- The test advances 31 days, runs `retain` again, and asserts only the succeeded row is deleted (D13, E-55).
