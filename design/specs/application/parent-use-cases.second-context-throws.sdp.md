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

Sc L2-1 · native tier · fixture composition · the technical-failure case, the doc's second enumerated case of the row.

The fault needs a part the fixture composition supplies, so the scenario runs there: a fixture command calls the `depot` context, which writes, and then the second fixture context, `yard`, whose operation throws a plain Error after its own state write, through the fault its stream registration carries. The libraries carry no hook.

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

- Runs in the native tier on the fixture composition; every test owns its disposable backend.
- The test sends the fixture command with the title that makes the `yard` context's save fail, after the `depot` context's call has returned its versions.
- The test asserts that the caller sees a technical failure and no rejection data, that no receipt, no event and no stream row of either context exists for the operation, and that the same command without the fault is applied.
