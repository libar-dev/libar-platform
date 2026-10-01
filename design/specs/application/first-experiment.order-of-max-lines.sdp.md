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

- Runs in the native tier on the production composition; every test owns its disposable backend.
- On the production composition, after grants, the first activation and `ReceiveStock` as setup, the test sends `PlaceOrder` at the provisional maximum of 100 lines, reads the backend's function log, and asserts one top-level mutation execution for the command, no scheduled function, cron or action, and that the run finished inside the mutation timeout.
- The call count is shown by a pure test of the same executor, which asserts one `runMutation` on the Orders operation and one on the Inventory operation carrying all 100 lines in one list.
- The test records the documents and bytes read and written from the completion record's `usageStats` and asserts them under the F13 ceilings; that the stream rows and the summary row stayed inside their budgets is shown by the command having committed, because a row above its budget fails the command.
- The test then runs `PlaceOrder` with one line more than the maximum and asserts the `operationTooLarge` rejection with nothing stored.
- The measurement records the per-line cost so the owner can decide OQ3 from numbers.
