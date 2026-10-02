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

Sc L2-3 · native tier · production composition · the third of the three enumerated sizes; the maximum is 100 lines, the bound `PlaceOrder`'s declaration carries.

## Intent

- outcome: One top-level commit each, zero projection jobs, one call per context, budgets hold. (Sc L2-3)

```gwt
Given the production composition on a native backend
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
- On the production composition, after grants, the first activation and `ReceiveStock` as setup, the test sends a one-line order on another stock item as the reference and then `PlaceOrder` at the maximum of 100 lines over 100 stock items; for each it reads the backend's function log from a mark before that command to a read of the order summary list that the same client sends after the command returned, and asserts that the log holds one top-level mutation execution for that command, which committed, and no other execution, so no scheduled function, cron or action ran for it inside that window, which an ordinary read after the command closes, and a job scheduled with a delay past the window is not seen, and that the list the read returned already holds the order's summary row; and it asserts that the completion record's execution time is under the 1 second mutation timeout.
- The call count is shown at the pure tier by the same executor, run on the order the test sent against a ctx whose `runMutation` counts calls by function reference and answers a canned operation outcome, which asserts one `runMutation` on the Orders operation and then one on the Inventory operation carrying all 100 lines in one list.
- The test reads the documents and bytes read and written from each completion record's `usageStats`, records them on the test's entry in the run's evidence record and not as a `Measurement` record, and asserts them under the F13 ceilings of 32,000 documents and 16 MiB read and 16,000 documents and 16 MiB written; that the stream rows and the summary row stayed inside their budgets is shown by the command having committed, because a row above its budget fails the command.
- The test then receives stock for 101 more stock items through `ReceiveStock`, sends `PlaceOrder` with one line on each, one line more than the maximum, and asserts the `operationTooLarge` rejection whose details carry 101 items against a maximum of 100, with the receipts, both contexts' stream rows and events and the order summaries unchanged.
- The test records the cost per added line, the difference from the one-line reference divided by the 99 added lines.
