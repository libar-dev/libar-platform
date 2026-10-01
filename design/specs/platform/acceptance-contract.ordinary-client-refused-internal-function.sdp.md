---
id: spec:platform.acceptance-contract.ordinary-client-refused-internal-function
kind: example
altitude: story
readiness: defined
relations:
  refines: spec:platform.acceptance-contract
  verifies: spec:platform.acceptance-contract
---
# An ordinary client cannot call an internal function

E-13, E-15 · native tier · fixture composition.

## Intent

- outcome: Convex refuses the call before a handler runs. (E-13, Sc L1-7)

```gwt
Given a disposable backend running the fixture composition, which registers an internal mutation that writes one row
And an ordinary client carrying a token the harness signed for subject {subject: "user-1"}
When the client calls the internal mutation by name
Then Convex refuses the call {refused: true}
And the row the internal mutation writes is stored {stored: false}
```

## Verification — executable

- Runs in the native tier on the fixture composition; every test owns its disposable backend.
- The test repeats the call from a client with no token and asserts the same refusal and no row, read with the harness's admin access.
