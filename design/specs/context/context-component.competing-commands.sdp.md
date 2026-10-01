---
id: spec:context.context-component.competing-commands
kind: example
altitude: story
readiness: defined
relations:
  refines: spec:context.context-component
  verifies: spec:context.context-component
---
# Two commands compete for the same stock or unique value

Sc L1-11 · native tier.

## Intent

- outcome: Invariant holds; a logical conflict is told apart from an engine retry. (Sc L1-11)

```gwt
Given a context component mounted by the parent with a stream at version {version: 1} in state {state: "stock of 1"}
And {callers: 2} callers send the same kind of command at the same time
When the parent calls the context operation {operation: "claim one unit"} through the component API
Then the first caller's outcome is {first: "applied"}
And the second caller's outcome is {second: "rejection"}
And the rejection code is {code: "insufficientStock"}
And the stream version afterwards is {after: 2}
And the number of events appended is {appended: 1}
And decide ran against {evaluated: "the fresh state"}
And the callers saw {saw: "no engine retry and no version conflict"}
```

## Verification — executable

- Runs in the native tier; every test owns its disposable backend, and the two parent mutations are issued from two clients so that the backend runs them concurrently.
- Exactly one `claimed` event exists at version 2 and the stock reads 0; the loser's `ConvexError` carries the context's `insufficientStock` code and not `staleVersion`; neither caller received any error other than that rejection, which is what makes the engine retry invisible.
