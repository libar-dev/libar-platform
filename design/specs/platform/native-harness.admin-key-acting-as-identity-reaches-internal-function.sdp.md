---
id: spec:platform.native-harness.admin-key-acting-as-identity-reaches-internal-function
kind: example
altitude: story
readiness: defined
relations:
  refines: spec:platform.native-harness
  verifies: spec:platform.native-harness
---
# The admin key acting as an identity reaches an internal function

E-13 · native backend tier · fixture composition.

## Intent

- outcome: The call runs, which is why no caller under test carries the admin key. (E-13)

```gwt
Given a disposable backend running the fixture composition, which registers an internal mutation that writes one row
And a client holding the admin key and acting as the identity with subject {subject: "user-1"}
When the client calls the internal mutation by name
Then the call returns without an error
And the table the internal mutation writes holds {rows: 1} row
```

## Verification — executable

- Runs in the native backend tier on the fixture composition; every test owns its disposable backend.
- The test asserts that a public query called by the same client returns the identity it acts as, so the client is indistinguishable from an ordinary caller inside a handler.
- This is the one test in which a caller holds the admin key.
