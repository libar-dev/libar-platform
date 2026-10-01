---
id: spec:platform.native-harness.ordinary-client-refused-component-function
kind: example
altitude: story
readiness: defined
relations:
  refines: spec:platform.native-harness
  verifies: spec:platform.native-harness
---
# An ordinary client cannot call a component's function

E-13, E-15 · native tier · fixture composition.

## Intent

- outcome: Convex refuses the call on both routes a client has, each with its own error, nothing is stored, and the same function runs for the harness's admin access. (E-13, E-15, D2)

```gwt
Given a disposable backend running the fixture composition, which mounts a component with a mutation that writes one row
And an ordinary client carrying a token the harness signed for subject {subject: "user-1"}
When the client calls the component's mutation by each of the two routes a client has
Then the call to the public endpoint with a component-qualified name fails with an error whose text holds {publicRouteRefusal: "Could not find public function"}
And the call to the endpoint that takes a component path fails with an error whose text holds {componentRouteRefusal: "BadDeployKey"}
And the table the component's mutation writes holds {rowsAfterRefusal: 0} rows
And the same mutation called with the harness's admin access writes {rowsAfterAdminCall: 1} row
```

## Verification — executable

- Runs in the native tier on the fixture composition; every test owns its disposable backend.
- Each refusal is identified by the text of Convex's own error, so a call that fails for another reason does not pass.
- The test repeats both refused calls from a client with no token and asserts the same errors, and reads the component's table with the harness's admin access.
- The admin call comes last and on the same deployment, so the refused function is shown to exist and to write its row.
