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

E-13, E-15 · native backend tier · fixture composition.

## Intent

- outcome: Convex refuses the call on the two HTTP routes with its own error and closes the connection on the WebSocket route without an answer; nothing is stored, and the same function runs for the harness's admin access. (E-13, E-15, D2)

```gwt
Given a disposable backend running the fixture composition, which mounts a component with a mutation that writes one row
And an ordinary client carrying a token the harness signed for subject {subject: "user-1"}
When the client calls the component's mutation by each of the three routes a client has
Then the call to the public endpoint with a component-qualified name fails with an error whose text holds {publicRouteRefusal: "Could not find public function"}
And the call to the endpoint that takes a component path fails with an error whose text holds {componentRouteRefusal: "BadDeployKey"}
And the call over the WebSocket protocol with a component path is sent, gets no answer within {socketWaitMs: 3000} ms, and the backend closes the connection at least {leastSocketCloses: 1} time
And the table the component's mutation writes holds {rowsAfterRefusal: 0} rows
And the same mutation called with the harness's admin access writes {rowsAfterAdminCall: 1} row
```

## Verification — executable

- Runs in the native backend tier on the fixture composition; every test owns its disposable backend.
- Each HTTP refusal is identified by the text of Convex's own error, so a call that fails for another reason does not pass.
- On the public route the test checks that the refused call named the same function the admin call runs, so a call to another name does not pass.
- `BadDeployKey` is the gate of the endpoint that takes a component path: it answers every caller without the admin key, whatever the path, so on that route the error says nothing about the function, and the admin call is what shows that the function exists.
- The WebSocket route has no error to show: on the pinned release the backend closes the connection, and the client reconnects and sends again without end. The test shows that the mutation left the client on the socket, that no answer came within the wait and that the backend closed the connection, so a call that was never sent does not pass. A call that ran would leave a row, and the row counts before and after the admin call would show it.
- The test repeats the two HTTP calls from a client with no token and asserts the same errors, and reads the component's table with the harness's admin access.
- The admin call comes last and on the same deployment, so the refused function is shown to exist and to write its row.
