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

Probe 4 · native backend tier · fixture composition.

## Intent

- outcome: Nested calls have a depth bound, which this backend release sets at eight calls below the top-level function. (Probe 4, F13)

```gwt
Given a mutation that calls itself through ctx.runMutation until its call stack holds a requested number of functions
When a client asks for each number from 1 upward
Then the deepest call stack that commits holds {deepestStack: 9} functions, the top-level mutation included
And the first stack that does not commit is refused with an error whose text holds {depthRefusal: "Cross component call depth limit exceeded"}
```

## Verification — executable

- Runs in the native backend tier on the fixture composition; every test owns its disposable backend.
- The value is observed, not expected: the expectation written before the first run was 8 functions, and the run on release `precompiled-2026-09-28-5c7cb5b` showed 9.
- The bound is a limit the backend enforces, a default of this release and not a platform contract. Its error text names components, although the recursion crosses none.
