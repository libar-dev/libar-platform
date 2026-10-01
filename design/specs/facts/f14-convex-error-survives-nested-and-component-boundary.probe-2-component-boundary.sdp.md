---
id: spec:facts.f14-convex-error-survives-nested-and-component-boundary.probe-2-component-boundary
kind: example
altitude: story
readiness: defined
relations:
  refines: spec:facts.f14-convex-error-survives-nested-and-component-boundary
  verifies: spec:facts.f14-convex-error-survives-nested-and-component-boundary
---
# Probe 2: ConvexError data through a component boundary

Probe 2 · native tier · fixture composition.

## Intent

- outcome: The parent and then the client read the same data. (Probe 2, F14)

```gwt
Given a mutation inside a component that writes one row and then throws a ConvexError carrying structured data with code {code: "staleVersion"}
When a parent mutation calls it through the component API and a client calls the parent
Then the parent's catch reads the thrown data unchanged {parentReadsData: true}
And a client whose parent lets the error pass reads the thrown data unchanged {clientReadsData: true}
And the row the component's mutation wrote is stored after the parent caught the error and committed {childRowStored: false}
```

## Verification — executable

- Runs in the native tier on the fixture composition; every test owns its disposable backend.
- The thrown data holds a string, a number, a boolean, a null, an array, a nested object and a 64-bit integer, and the test compares decoded values, not messages.
- The test also throws an ordinary `Error` with an added property through the same path and records whether the property arrives.
