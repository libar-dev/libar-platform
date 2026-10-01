---
id: spec:command.command-pipeline.failure-before-receipt
kind: example
altitude: story
readiness: defined
relations:
  refines: spec:command.command-pipeline
  verifies: spec:command.command-pipeline
---
# Inject a failure before the receipt insert

Sc L1-2 · native tier · third of three injection points.

The fault sits in the parent, after the context's sub-transaction has returned its DTO and versions and after the read models were updated, immediately before the receipt insert of step 10. This point proves that a component's sub-transaction does not commit on its own: the context call completed without error, and still nothing of it survives the parent's throw.

## Intent

- outcome: Nothing from the command commits. (Sc L1-2)

```gwt
Given a receipted command on a context whose stream is at version {version: 3}
And a failure is injected {point: "before the receipt insert"}
When the command runs as one top-level mutation
Then the mutation throws and the caller sees {outcome: "technical failure"}
And the stream version afterwards is {versionAfter: 3}
And a receipt for the key exists {receiptExists: false}
And an event from the command exists in the journal {eventExists: false}
```

## Verification — executable

- Runs in the native tier; every test owns its disposable backend.
- The test asserts that the parent's read-model row for the entity is absent or unchanged, which proves the read-model write of step 9 rolled back with the mutation.
- The test then sends the same command with the same request key and asserts that it executes as new intent and returns `replayed` false, because no receipt survived.
