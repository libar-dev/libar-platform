---
id: spec:application.first-experiment.order-of-max-lines
kind: example
altitude: story
readiness: defined
relations:
  refines: spec:application.first-experiment
  verifies: spec:application.first-experiment
---
# An order of the maximum number of lines

Sc L2-3 · native tier · the third of the three enumerated sizes; the maximum is the provisional 100 until OQ3 is decided.

## Intent

- outcome: One top-level commit each, zero projection jobs, one call per context, budgets hold. (Sc L2-3)

```gwt
Given the Orders and Inventory application built through Layer 2 on a native backend
And an order of {size: "the maximum"} with stock contention {contention: "absent"}
And the backend runs with {configuration: "production configuration"}
When {run: "the PlaceOrder use case"} runs
Then each successful command makes {commits: 1} top-level commit
And the core path runs {projectionJobs: 0} projection jobs
And the use case makes {callsPerContext: 1} call per context
And the budgets {budgets: "hold"}
```

## Verification — executable

- Runs in the native tier; every test owns its disposable backend.
- The test runs `PlaceOrder` at the provisional maximum of 100 lines and asserts the same counts as the smaller sizes, plus that the run finished inside the mutation timeout and under the F13 ceilings for documents read and written.
- The test then runs `PlaceOrder` with one line more than the maximum and asserts the `operationTooLarge` rejection with nothing stored.
- The measurement records the per-line cost so the owner can decide OQ3 from numbers.
