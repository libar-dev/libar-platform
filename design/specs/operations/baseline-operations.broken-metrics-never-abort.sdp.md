---
id: spec:operations.baseline-operations.broken-metrics-never-abort
kind: example
altitude: story
readiness: defined
relations:
  refines: spec:operations.baseline-operations
  verifies: spec:operations.baseline-operations
---
# Break metrics and logging

Sc ALL-1 · native tier · the first of the two enumerated cases; applies to every installed layer.

## Intent

- outcome: Diagnostics never abort valid work; an audit failure does. (Sc ALL-1)

```gwt
Given a valid command whose use case emits diagnostics and writes {audit: "a mandatory audit record"}
And the {subsystem: "metrics and logging"} subsystem is broken by fault injection
When the command runs
Then the command {result: "commits"}
And the failure is {surfaced: "reported as a diagnostic gap without touching the write"}
```

## Verification — executable

- Runs in the native tier; every test owns its disposable backend.
- The test replaces the fixture app's diagnostic sink with one that throws on every call and runs `PlaceOrder`.
- The test asserts that the command returned applied, that the order, its events, its receipt, its summary row and its audit record exist, and that the fixture's swallowed-error counter is one.
