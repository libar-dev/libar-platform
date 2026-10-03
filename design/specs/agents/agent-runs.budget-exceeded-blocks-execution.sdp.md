---
id: spec:agents.agent-runs.budget-exceeded-blocks-execution
kind: example
altitude: story
readiness: defined
relations:
  refines: spec:agents.agent-runs
  verifies: spec:agents.agent-runs
---
# The run exceeds its budget

Sc L5-2 · native backend tier · second of two cases: a run bound is exhausted.

## Intent

- outcome: Approval is void; execution is blocked. (Sc L5-2)

```gwt
Given an agent run has a spend bound of {spendBound: 100} and has settled spend of {settledSpend: 100}
And the run holds an approved proposal
When execution is attempted
Then execution is blocked by the run bound before the command boundary is reached
And the run is marked exhausted with an operator exit
```

## Verification — executable

- Runs in the native backend tier; every test owns its disposable backend.
- The test repeats the case for the attempts, elapsed time and call-count bounds and asserts each blocks execution and that no partial command commits (D17, Sc L5-2).
