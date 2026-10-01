---
id: spec:application.first-experiment.order-of-10-lines
kind: example
altitude: story
readiness: defined
relations:
  refines: spec:application.first-experiment
  verifies: spec:application.first-experiment
---
# An order of 10 lines

Sc L2-3 · native tier · the second of the three enumerated sizes.

## Intent

- outcome: One top-level commit each, zero projection jobs, one call per context, budgets hold. (Sc L2-3)

```gwt
Given the Orders and Inventory application built through Layer 2 on a native backend
And an order of {size: "10 lines"} with stock contention {contention: "absent"}
And the backend runs with {configuration: "production configuration"}
When {run: "the PlaceOrder use case"} runs
Then each successful command makes {commits: 1} top-level commit
And the core path runs {projectionJobs: 0} projection jobs
And the use case makes {callsPerContext: 1} call per context
And the budgets {budgets: "hold"}
```

## Verification — executable

- Runs in the native tier; every test owns its disposable backend.
- The test runs `PlaceOrder` with ten lines over ten stock items and asserts the same counts as the one-line case: one top-level commit, no projection job, one call per context.
- The test asserts that the Inventory call carried all ten lines in one list and that documents written grew linearly with the lines.
