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

Sc L1-2 · native tier · fixture composition · first of three injection points.

The fixture context `depot` registers its document stream with a `toDto` that throws a plain Error for a document whose title is the fixture's after-state-write fault title. The adapter's `execute` calls `toDto` at its step 10, after it appended the event and saved the folded state, so an ordinary client with a grant sends a receipted `AmendDocument` with that title to a document at version 3. The throw happens inside the component's sub-transaction, so the sub-transaction rolls back and, uncaught by the parent, the whole mutation with it.

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

- Runs in the native tier on the fixture composition; every test owns its disposable backend.
- The test asserts that the context's state document is byte-identical to its pre-command value, not only that the version is unchanged.
- The test asserts that the thrown error is not a `ConvexError`, so the client cannot mistake the technical failure for a rejection.
- The test asserts that the function log holds one completion record for the request, the parent mutation's own, carrying the fault's error.
