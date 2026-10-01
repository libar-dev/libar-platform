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

- Runs in the native tier; every test owns its disposable backend.
- The `ConvexError` carries `data.code` equal to `staleVersion` with `details.expected` of 2 and `details.current` of 3; a spy on the decider records zero calls to `decide`; the stream row still reads version 3.
