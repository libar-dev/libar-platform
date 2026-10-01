---
id: spec:platform.acceptance-contract.admin-key-acting-as-identity-reaches-internal-function
kind: example
altitude: story
readiness: defined
relations:
  refines: spec:platform.acceptance-contract
  verifies: spec:platform.acceptance-contract
---
# The admin key acting as an identity reaches an internal function

E-13 · native tier · fixture composition.

## Intent

- outcome: The call runs, which is why no caller under test carries the admin key. (E-13)

```gwt
Given a disposable backend running the fixture composition, which registers an internal mutation that writes one row
And a client holding the admin key and acting as the identity with subject {subject: "user-1"}
When the client calls the internal mutation by name
Then Convex runs the call {runs: true}
And the row the internal mutation writes is stored {stored: true}
```

## Verification — executable

- Runs in the native tier on the fixture composition; every test owns its disposable backend.
- The test asserts that a public query called by the same client returns the identity it acts as, so the client is indistinguishable from an ordinary caller inside a handler.
