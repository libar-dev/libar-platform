---
id: spec:application.rebuild.write-pause-rebuild-abort
kind: example
altitude: story
readiness: defined
relations:
  refines: spec:application.rebuild
  verifies: spec:application.rebuild
---
# Rebuild a cross-stream history view under a write pause; interrupt, then abort

Sc L2-6 · native backend tier · the abort case, the doc's second enumerated case of the row.

## Intent

- outcome: Resume or abort safely; writes reopen only after verification. (Sc L2-6)

```gwt
Given a {viewKind: "cross-stream history"} read model with an active generation
And a new generation registered as {mode: "building under a write pause"}
And live commands {liveCommands: "are refused while paused"}
When the backfill is interrupted after {batches: 2} batches and then {resumption: "aborted"}
Then no row of the new generation holds data older than its source stream version
And the new generation {coverage: "is discarded and read by no query"}
And no command or external effect ran during the rebuild
And the active generation {cutover: "stays the old one"}
And writes {writes: "reopen after the abort"}
```

## Verification — executable

- Runs in the native backend tier; every test owns its disposable backend.
- The view is the order allocation history of `spec:application.orders-inventory-example`, a `HistoryProjection` bound to the order stream type and the stock item stream type.
- The test starts a generation with `pauseRequired`, asserts that the gate holds one closed `source:` entry for each of the two stream types, each naming this generation, interrupts after the second history batch and calls `abortGeneration`.
- The test asserts that the generation is `aborted`, that the active generation is unchanged, that both source entries are gone from the gate, that `PlaceOrder` succeeds again, and that no query returns a row of the aborted generation.
- The test runs `purgeGeneration` and asserts that its batches run until the generation is `purged` and that every batch deleted at most `limitPurgeBatch` rows.
