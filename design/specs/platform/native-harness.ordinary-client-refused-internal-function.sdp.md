---
id: spec:platform.native-harness.ordinary-client-refused-internal-function
kind: example
altitude: story
readiness: defined
relations:
  refines: spec:platform.native-harness
  verifies: spec:platform.native-harness
---
# An ordinary client cannot call an internal function

E-13, E-15 · native tier · fixture composition.

## Intent

- outcome: Convex refuses the call with its own error, nothing is stored, and the same function runs for the harness's admin access. (E-13, E-15)

```gwt
Given a disposable backend running the fixture composition, which registers an internal mutation that writes one row
And an ordinary client carrying a token the harness signed for subject {subject: "user-1"}
When the client calls the internal mutation by name
Then the call fails with an error whose text holds {refusal: "Could not find public function"}
And the table the internal mutation writes holds {rowsAfterRefusal: 0} rows
And the same mutation called with the harness's admin access writes {rowsAfterAdminCall: 1} row
```

## Verification — executable

- Runs in the native tier on the fixture composition; every test owns its disposable backend.
- The refusal is identified by the text of Convex's own error, so a call that fails for another reason does not pass.
- The test repeats the refused call from a client with no token and asserts the same error, and reads the table with the harness's admin access.
- The admin call comes last and on the same deployment, so the refused function is shown to exist and to write its row.
