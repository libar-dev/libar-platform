---
id: spec:context.context-component.invalid-transition
kind: example
altitude: story
readiness: defined
relations:
  refines: spec:context.context-component
  verifies: spec:context.context-component
---
# A command asks for an invalid state transition

Sc L1-1 · native tier.

## Intent

- outcome: Documented rejection; no state or event change. (Sc L1-1)

```gwt
Given a context component mounted by the parent with a stream at version {version: 1} in state {state: "draft"}
And {callers: 1} callers send the same kind of command at the same time
When the parent calls the context operation {operation: "ship"} through the component API
Then the first caller's outcome is {first: "rejection"}
And the second caller's outcome is {second: "absent"}
And the rejection code is {code: "invalidTransition"}
And the stream version afterwards is {after: 1}
And the number of events appended is {appended: 0}
And decide ran against {evaluated: "the fresh state"}
```

## Verification — executable

- Runs in the native tier; every test owns its disposable backend, and the parent mutation calls the context operation through `ctx.runMutation` on the component API.
- The rejection arrives as a `ConvexError` whose `data.code` is the context's documented `invalidTransition`; the stream row and the events index are read afterwards and match their state before the call.
