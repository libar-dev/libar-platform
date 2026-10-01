---
id: spec:facts.f14-convex-error-survives-nested-and-component-boundary.probe-2-nested-mutation
kind: example
altitude: story
readiness: defined
relations:
  refines: spec:facts.f14-convex-error-survives-nested-and-component-boundary
  verifies: spec:facts.f14-convex-error-survives-nested-and-component-boundary
---
# Probe 2: ConvexError data through a nested mutation

Probe 2 · native tier · fixture composition.

## Intent

- outcome: The parent and then the client read the same data. (Probe 2, F14)

```gwt
Given a mutation that writes one row and then throws a ConvexError carrying structured data with code {code: "staleVersion"}
And two parent mutations that call it through ctx.runMutation, one that writes a row of its own, catches the error and returns its data, and one that lets the error pass
When a client calls each parent
Then the catching parent returns the thrown data unchanged
And the client of the other parent reads the thrown data unchanged from the error it receives
And after the catching parent committed, the throwing mutation's table holds {childRows: 0} rows and the parent's own table holds {parentRows: 1} row
```

## Verification — executable

- Runs in the native tier on the fixture composition; every test owns its disposable backend.
- The thrown data holds a string, a number, a boolean, a null, an array, a nested object and a 64-bit integer, and the test compares decoded values, not messages.
- The test shows that the thrower had written its row before it threw, so a thrower that never wrote does not pass.
- The test also throws an ordinary `Error` with an added property through the same path, checks that the error it sees is the thrower's, and records whether the property arrives.
- On the first run of this example, on 2026-10-01 on release `precompiled-2026-09-28-5c7cb5b`, the bound values held.
