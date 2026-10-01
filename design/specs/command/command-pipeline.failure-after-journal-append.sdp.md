---
id: spec:command.command-pipeline.failure-after-journal-append
kind: example
altitude: story
readiness: defined
relations:
  refines: spec:command.command-pipeline
  verifies: spec:command.command-pipeline
---
# Inject a failure after the journal append

Sc L1-2 · native tier · fixture composition · second of three injection points.

The fixture context `depot` registers its document stream with a mapping whose `isDeleted` throws a plain Error for a document whose title is the fixture's after-journal-append fault title. The adapter's `execute` calls `isDeleted` at its step 9, after `append` inserted the new event and before the stream row is written, so an ordinary client with a grant sends a receipted `AmendDocument` with that title to a document at version 3. The append and the state save sit in one sub-transaction, so a throw after the append rolls back the events together with the state.

## Intent

- outcome: Nothing from the command commits. (Sc L1-2)

```gwt
Given a receipted command on a context whose stream is at version {version: 3}
And a failure is injected {point: "after the journal append"}
When the command runs as one top-level mutation
Then the mutation throws and the caller sees {outcome: "technical failure"}
And the stream version afterwards is {versionAfter: 3}
And a receipt for the key exists {receiptExists: false}
And an event from the command exists in the journal {eventExists: false}
```

## Verification — executable

- Runs in the native tier on the fixture composition; every test owns its disposable backend.
- The test reads the depot's events table after the failure and asserts that the stream holds exactly the three events of its setup commands, each under an operation ID a setup response returned, because the failed command's operation ID never reaches the caller.
- The test asserts that the stream's metadata still names version 3, so a later command with expected version 3 succeeds.
- The test asserts that the function log holds one completion record for the request, the parent mutation's own, carrying the fault's error.
