---
id: spec:application.parent-use-cases.second-context-rejects
kind: example
altitude: story
readiness: defined
relations:
  refines: spec:application.parent-use-cases
  verifies: spec:application.parent-use-cases
---
# The first context writes, then the second rejects

Sc L2-1 · native tier · production composition · the rejection case.

## Intent

- outcome: Everything rolls back; the caller gets the rejection; nothing is stored. (Sc L2-1)

```gwt
Given a use case that calls {contexts: 2} contexts in one mutation
And the first context has written its state and events
When the second context {secondOutcome: "rejects"}
Then the mutation {commit: "rolls back"}
And the caller receives {response: "the rejection"}
And the number of stored receipts, events and state changes is {stored: 0}
```

## Verification — executable

- Runs in the native tier on the production composition; every test owns its disposable backend.
- The test creates stock through `ReceiveStock`, then sends `PlaceOrder` with a line that asks for more than is available, so the Orders context's call returns before the Inventory context throws `insufficientStock`.
- The test asserts that the caller's error is a `ConvexError` whose data has `kind` `rejection`, `code` `insufficientStock` and `commandType` `PlaceOrder`, that no receipt row exists for the request key, that the Orders context has no stream row and no event for the order, that no order summary row exists, and that no document of the parent or of either context changed.
- The test reads the function log and asserts that the request ran one top-level mutation, recorded as failed with no document written.
- The test then receives the missing quantity through `ReceiveStock`, re-sends the same command and asserts that it is applied, as one top-level mutation whose returned versions name both contexts, which shows the first attempt left nothing behind.
