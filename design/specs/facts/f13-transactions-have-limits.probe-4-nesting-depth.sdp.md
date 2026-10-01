---
id: spec:facts.f13-transactions-have-limits.probe-4-nesting-depth
kind: example
altitude: story
readiness: defined
relations:
  refines: spec:facts.f13-transactions-have-limits
  verifies: spec:facts.f13-transactions-have-limits
---
# Probe 4: how deep nested calls may go

Probe 4 · native tier · fixture composition.

## Intent

- outcome: Nested calls have a depth bound, and the run records it. (Probe 4, F13)

```gwt
Given a mutation that calls itself through ctx.runMutation until its call stack holds a requested number of functions
When a client asks for each number from 1 upward
Then the deepest call stack that commits holds {deepestStack: 8} functions, the top-level mutation included
```

## Verification — executable

- Runs in the native tier on the fixture composition; every test owns its disposable backend.
- The test records the error text of the first depth that fails.
