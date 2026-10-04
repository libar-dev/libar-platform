---
id: spec:application.history-rebuild.write-pause-rebuild-abort
kind: example
altitude: story
readiness: defined
relations:
  refines: spec:application.history-rebuild
  verifies: spec:application.history-rebuild
---
# Rebuild a cross-stream history view under a write pause; interrupt, then abort

Sc L2-6 · native backend tier · the abort case, the doc's second enumerated case of the row.

## Intent

- outcome: Resume or abort safely; writes reopen only after verification. (Sc L2-6)

```gwt
Given a {viewKind: "cross-stream history"} read model with an active generation
And an order summary installed before the first order is placed, with {orderSummary: "an active generation"}
And a sample of {orders: 40} orders on {stockItems: 20} stock items, read in batches of {batchSize: 32} events, which the backfill takes at least {backfillBatches: 60} batches to read
And a new generation registered as {mode: "building under a write pause"}
And live commands {liveCommands: "are refused while paused"}
And the backfill held by closing all once {heldAfter: 2} batches are done, so it cannot end before the interrupt
When the backfill is interrupted after {batches: 2} batches and then {resumption: "aborted"}
Then no row of the new generation holds data older than its source stream version
And the new generation {coverage: "is discarded and read by no query"}
And no command or external effect ran during the rebuild
And the active generation {cutover: "stays the old one"}
And writes {writes: "reopen after the abort"}
```

## Verification — executable

- Runs in the native backend tier; every test owns its disposable backend.
- Before it places the first order, the test installs the order summary, which `PlaceOrder` and `CancelOrder` bind, through `startGeneration`, its batches and `switchGeneration`, so that its commands have a generation to write.
- The view is the order allocation history of `spec:application.orders-inventory-example`, a `HistoryProjection` bound to the order stream type and the stock item stream type. The sample holds 40 orders on 20 stock items, one stream each, and the view's batch size is 32 events, so the backfill takes at least one batch per stream, 60 in all, before it can end.
- The test starts a generation with `pauseRequired`, asserts that the gate holds one closed `source:` entry for each of the two stream types, each naming this generation, waits until the progress row's `batchesDone` is at least 2, closes `all` through `closeGate` to hold the backfill, waits until `getGenerations` shows the batch parked on `all`, interrupts with `interruptGeneration` while it is parked, and asserts that the pass is still `backfill` with fewer than 60 batches done; then, as `spec:application.history-rebuild#design.historyAbortHandoff` requires when the operator already holds `all` closed, it confirms `all` with `getGate`, keeps it closed and calls `abortGeneration`.
- The test asserts that the generation is `aborted`, that the active generation is unchanged and that `all` is still closed; since the deployed projection's version is the active generation's, it then reopens the `all` entry it closed through `resumeGate`, and asserts that `PlaceOrder` succeeds again, that both source entries are gone from the gate, and that no query returns a row of the aborted generation.
- The test runs `purgeGeneration` and asserts that its batches run until the generation is `purged` and that every batch deleted at most `limitPurgeBatch` rows.
