---
id: spec:command.outcome-boundary.rejected-then-retried-after-change
kind: example
altitude: story
readiness: defined
relations:
  refines: spec:command.outcome-boundary
  verifies: spec:command.outcome-boundary
---
# A rejected command's response is lost, and it is retried after state changed

Sc L1-12 · native tier.

The first run is rejected because the stream's state refuses the command, for example an allocation against empty stock. The response is dropped by the test harness. Another command then changes the stream, for example a restock. The retry carries the same request key and input and must run against the new state, because the first attempt stored nothing, not even its key.

## Intent

- outcome: It runs against current state; nothing of the first attempt remains. (Sc L1-12)

```gwt
Given a receipted command with request key {requestKey: "k-42"} against a stream at version {version: 5}
And the command is rejected on its first run and the response is lost
And the stream then advances to version {newVersion: 6} by another command
When the caller retries the same command with the same key and input
Then the retry runs against version {ranAgainst: 6} and the outcome is {outcome: "applied"}
And a receipt or record of the first attempt exists {firstAttemptRecorded: false}
```

## Verification — executable

- Runs in the native tier; every test owns its disposable backend.
- The test asserts that the first run's thrown error has `data.kind` equal to `"rejection"` and a domain code the command's declaration names.
- The test asserts that the receipts table holds no row for the key after the first run, and exactly one row with `replayed` false in the retry's response after the second.
- The test asserts that the retry's returned stream version is 7, one past the restock, which proves it decided against version 6 and not against the state the first attempt saw.
