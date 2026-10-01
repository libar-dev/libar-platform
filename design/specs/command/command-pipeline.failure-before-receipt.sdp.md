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

Sc L1-2 · native tier · fixture composition · third of three injection points.

The fault sits in the parent, in the fixture composition's executor for `AmendDocument`: after the `depot` context's sub-transaction has returned its DTO and versions, the executor throws a plain Error that names the returned versions while the command's `failBeforeReceipt` switch, a fixture table row the test sets with admin access, is on. Slice S1 builds no read model, so step 9 writes nothing and the throw is the last thing before the receipt insert of step 10. An ordinary client with a grant sends the receipted `AmendDocument` to a document at version 3. This point proves that a component's sub-transaction does not commit on its own: the context call completed without error, and still nothing of it survives the parent's throw.

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

- Runs in the native tier on the fixture composition; every test owns its disposable backend.
- The test asserts that the thrown error names version 4 of the document, which only the completed context call returned, and that the context's state document is byte-identical to its pre-command value.
- The test asserts that the function log holds one completion record for the request, the parent mutation's own, carrying the fault's error.
- The test then turns the switch off, sends the same command with the same request key and asserts that it executes as new intent and returns `replayed` false, because no receipt survived.
