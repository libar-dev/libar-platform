---
id: spec:context.context-component.stale-version-rejected
kind: example
altitude: story
readiness: defined
relations:
  refines: spec:context.context-component
  verifies: spec:context.context-component
---
# A command names a stale, explicitly reviewed version

Sc L1-10 · native tier.

The fixture composition binds it. An ordinary client creates a document in the depot context, amends it and submits it, so its stream stands at version 3. It then sends the AmendDocument command through its public entry naming version 2, the version it reviewed, and the depot's amendDocuments operation plans the amend at that expected version.

## Intent

- outcome: Rejected as stale, never reinterpreted against fresh state. (Sc L1-10)

```gwt
Given a context component mounted by the parent with a stream at version {version: 3} in state {state: "submitted"}
And the caller last reviewed the stream at version {reviewed: 2}
And {callers: 1} callers send the same kind of command at the same time
When the parent calls the context operation {operation: "amend naming the reviewed version"} through the component API
Then the first caller's outcome is {first: "rejection"}
And the second caller's outcome is {second: "absent"}
And the rejection code is {code: "staleVersion"}
And the stream version afterwards is {after: 3}
And the number of events appended is {appended: 0}
And decide ran against {evaluated: "nothing"}
And the callers saw {saw: "a version conflict and no engine retry"}
```

## Verification — executable

- Runs in the native tier; every test owns its disposable backend; the caller is an ordinary client holding a fixture-issuer token and a grant, and admin access only grants and reads the depot's tables and the function log.
- The `ConvexError` carries `data.code` equal to `staleVersion` with `details.expected` of 2 and `details.current` of 3; the stream row still reads version 3, and the depot's streams and events tables equal their contents before the call.
- In place of a spy on the decider, the same client sends the fixture's FailIfDecided command, whose `decide` throws a plain Error if it is reached, to the same document: naming version 2 it receives the same `staleVersion` data, and naming version 3 it fails with that Error, so the version check answers before `decide`, which is reachable at the current version; neither call changes the tables.
- The function log holds one attempt of the amend's parent mutation, final and with no OCC conflict behind it, which is the no engine retry the caller saw.
