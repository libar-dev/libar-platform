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

Sc L1-2 · native tier · second of three injection points.

The fixture context's adapter `execute` appends the new events to the journal and then throws on a fault flag. The append and the state save sit in one sub-transaction, so a throw after the append rolls back the events together with the state.

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

- Runs in the native tier; every test owns its disposable backend.
- The test reads the journal by the stream replay index after the failure and asserts that no event with the command's operation ID exists.
- The test asserts that the stream's metadata still names version 3, so a later command with expected version 3 succeeds.
