---
id: spec:command.command-pipeline.failure-after-state-write
kind: example
altitude: story
readiness: defined
relations:
  refines: spec:command.command-pipeline
  verifies: spec:command.command-pipeline
---
# Inject a failure after the state write

Sc L1-2 · native tier · first of three injection points.

The fixture context's adapter `execute` saves the folded state and then throws on a fault flag the test sets. The throw happens inside the component's sub-transaction, so the sub-transaction rolls back and, uncaught by the parent, the whole mutation with it.

## Intent

- outcome: Nothing from the command commits. (Sc L1-2)

```gwt
Given a receipted command on a context whose stream is at version {version: 3}
And a failure is injected {point: "after the state write"}
When the command runs as one top-level mutation
Then the mutation throws and the caller sees {outcome: "technical failure"}
And the stream version afterwards is {versionAfter: 3}
And a receipt for the key exists {receiptExists: false}
And an event from the command exists in the journal {eventExists: false}
```

## Verification — executable

- Runs in the native tier; every test owns its disposable backend.
- The test asserts that the context's state document is byte-identical to its pre-command value, not only that the version is unchanged.
- The test asserts that the thrown error is not a `ConvexError`, so the client cannot mistake the technical failure for a rejection.
