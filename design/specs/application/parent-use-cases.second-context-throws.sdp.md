---
id: spec:application.parent-use-cases.second-context-throws
kind: example
altitude: story
readiness: defined
relations:
  refines: spec:application.parent-use-cases
  verifies: spec:application.parent-use-cases
---
# The first context writes, then the second throws

Sc L2-1 · native tier · the technical-failure case, the doc's second enumerated case of the row.

## Intent

- outcome: Everything rolls back; the caller gets the rejection; nothing is stored. (Sc L2-1)

```gwt
Given a use case that calls {contexts: 2} contexts in one mutation
And the first context has written its state and events
When the second context {secondOutcome: "throws"}
Then the mutation {commit: "rolls back"}
And the caller receives {response: "a technical failure"}
And the number of stored receipts, events and state changes is {stored: 0}
```

## Verification — executable

- Runs in the native tier; every test owns its disposable backend.
- The test injects a plain throw inside the Inventory component's `allocate` operation after Orders has appended its events.
- The test asserts that the caller sees a technical failure and not a rejection code, that no receipt, event or state document exists for the operation, and that a retry with the fault removed succeeds.
