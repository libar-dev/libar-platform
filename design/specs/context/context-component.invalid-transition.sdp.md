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

Sc L1-1 · native backend tier · fixture composition.

The fixture composition binds it. An ordinary client creates a document in the depot context and then sends the ShipDocument command through its public entry; the parent mutation calls the depot's shipDocuments operation through `ctx.runMutation` on the component API, and the document stream's transition table has no ship from draft.

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

- Runs in the native backend tier; every test owns its disposable backend; the caller is an ordinary client holding a fixture-issuer token and a grant, and admin access only grants and reads the depot's tables and the function log.
- The rejection arrives as a `ConvexError` whose `data.code` is the context's documented `invalidTransition` and whose `data.details` are the ones `decide` gives, `from` naming the status stored before the call and `trigger` naming ship; the depot's streams and events tables are read afterwards and equal their contents before the call.
- The function log holds one attempt of the parent mutation, not rerun by the engine, and it failed with that rejection.
