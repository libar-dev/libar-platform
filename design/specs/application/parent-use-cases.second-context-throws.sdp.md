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

Sc L2-1 · native backend tier · fixture composition · the technical-failure case, the doc's second enumerated case of the row.

The fault needs a part the fixture composition supplies, so the scenario runs there: the fixture command `FileDocument` calls the `depot` context, which creates a document, and then the second fixture context, `yard`, to file a copy that names the document version the `depot` call returned; the `yard` operation throws a plain Error after its own state write, through the fault its stream registration carries, the copy stream's `toDto` refusing the fault title. The libraries carry no hook.

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

- Runs in the native backend tier on the fixture composition; every test owns its disposable backend.
- An ordinary client with a grant sends `FileDocument` with the title that makes the `yard` context's save fail, after the `depot` context's call has returned its versions; the test asserts that the thrown error names version 1 of the document, which only the completed `depot` call returned.
- The test asserts that the caller sees a technical failure and no rejection data, that the function log holds one completion record for the request, the parent mutation's own, carrying the fault's error, and that no receipt, no event and no stream row of either context exists for the operation.
- The test then sends the same command without the fault, under the same request key, and asserts that it is applied with one version in each of the two contexts, because nothing of the first attempt survived.
