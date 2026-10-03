---
id: spec:operations.baseline-operations.broken-audit-aborts
kind: example
altitude: story
readiness: defined
relations:
  refines: spec:operations.baseline-operations
  verifies: spec:operations.baseline-operations
---
# Break mandatory audit

Sc ALL-1 · native backend tier · the second of the two enumerated cases; applies to every installed layer.

## Intent

- outcome: Diagnostics never abort valid work; an audit failure does. (Sc ALL-1)

```gwt
Given a valid command whose use case emits diagnostics and writes {audit: "a mandatory audit record"}
And the {subsystem: "mandatory audit"} subsystem is broken by fault injection
When the command runs
Then the command {result: "rolls back"}
And the failure is {surfaced: "returned to the caller as a technical failure"}
```

## Verification — executable

- Runs in the native backend tier; every test owns its disposable backend.
- The test points the fixture app's audit writer at a table whose validator refuses the record and runs `PlaceOrder`.
- The test asserts that the caller sees a technical failure, not a rejection code, and that no order, event, receipt, summary row or audit record exists for the operation.
