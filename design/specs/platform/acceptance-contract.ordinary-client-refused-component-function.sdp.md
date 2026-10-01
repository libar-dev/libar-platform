---
id: spec:platform.acceptance-contract.ordinary-client-refused-component-function
kind: example
altitude: story
readiness: defined
relations:
  refines: spec:platform.acceptance-contract
  verifies: spec:platform.acceptance-contract
---
# An ordinary client cannot call a component's function

E-13, E-15 · native tier · fixture composition.

## Intent

- outcome: Convex refuses the call before a handler runs. (E-13, D2)

```gwt
Given a disposable backend running the fixture composition, which mounts a component with a mutation that writes one row
And an ordinary client carrying a token the harness signed for subject {subject: "user-1"}
When the client calls the component's mutation directly by component path and name
Then Convex refuses the call {refused: true}
And the row the component's mutation writes is stored {stored: false}
```

## Verification — executable

- Runs in the native tier on the fixture composition; every test owns its disposable backend.
- The test repeats the call from a client with no token and asserts the same refusal, and reads the component's table with the harness's admin access.
