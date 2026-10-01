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

Sc L2-1 · native tier · the rejection case.

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

- Runs in the native tier; every test owns its disposable backend.
- The test drives `PlaceOrder` with a line whose stock is short, so Orders writes `OrderPlaced` and Inventory returns a rejection.
- The test asserts that the caller's error is a `ConvexError` with the rejection code and data, that no receipt row exists for the request key, and that the Orders context has no stream, event or state document for the order.
- The test then re-sends the same command after stock is added and asserts that it succeeds, which shows the first attempt left nothing behind.
