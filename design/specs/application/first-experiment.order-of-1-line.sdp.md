---
id: spec:application.first-experiment.order-of-1-line
kind: example
altitude: story
readiness: defined
relations:
  refines: spec:application.first-experiment
  verifies: spec:application.first-experiment
---
# An order of 1 line

Sc L2-3 · native tier · production composition · the first of the three enumerated sizes.

## Intent

- outcome: One top-level commit each, zero projection jobs, one call per context, budgets hold. (Sc L2-3)

```gwt
Given the Orders and Inventory application built through Layer 2 on a native backend
And an order of {size: "1 line"} with stock contention {contention: "absent"}
And the backend runs with {configuration: "production configuration"}
When {run: "the PlaceOrder use case"} runs
Then each successful command makes {commits: 1} top-level commit
And the core path runs {projectionJobs: 0} projection jobs
And the use case makes {callsPerContext: 1} call per context
And the budgets {budgets: "hold"}
```

## Verification — executable

- Runs in the native tier on the production composition; every test owns its disposable backend.
- On the production composition, after grants, the first activation and `ReceiveStock` as setup, the test sends `PlaceOrder` with one line, reads the backend's function log from a mark before the command to a read of the order summary list that the same client sends after the command returned, and asserts that the log holds one top-level mutation execution for the command, which committed, and no other execution, so no scheduled function, cron or action ran for it, and that the list the read returned already holds the order's summary row.
- The call count is shown at the pure tier by the same executor, run on the order the test sent against a ctx whose `runMutation` counts calls by function reference and answers a canned operation outcome, which asserts one `runMutation` on the Orders operation and then one on the Inventory operation for this size.
- The test reads the documents and bytes read and written from the completion record's `usageStats`, records them on the test's entry in the run's evidence record and not as a `Measurement` record, asserts them under the F13 ceilings of 32,000 documents and 16 MiB read and 16,000 documents and 16 MiB written, and asserts six documents written: the receipt, the order's state and event, the stock item's state and event, and the summary row; that the stream rows and the summary row stayed inside their budgets is shown by the command having committed, because a row above its budget fails the command.
