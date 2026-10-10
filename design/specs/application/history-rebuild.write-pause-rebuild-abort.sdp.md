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
And a sample of {orders: 40} orders on {stockItems: 20} stock items, split evenly between {tenants: 2} tenants, read in batches of {batchSize: 32} events
And a new generation registered as {mode: "building under a write pause"}
And live commands {liveCommands: "are refused while paused"}
And the scope of the tenant the enumeration reaches second closed before the start, so the backfill {hold: "parks at the second tenant"}
When the backfill is interrupted while it is parked at the second tenant and then {resumption: "aborted"}
Then no row of the new generation holds data older than its source stream version
And the new generation {coverage: "is discarded and read by no query"}
And no command or external effect ran during the rebuild
And the active generation {cutover: "stays the old one"}
And writes {writes: "reopen after the abort"}
```

## Verification — executable

- Runs in the native backend tier; every test owns its disposable backend.
- Before it places the first order, the test installs the order summary, which `PlaceOrder` and `CancelOrder` bind, through `startGeneration`, its batches and `switchGeneration`, so that its commands have a generation to write.
- The view is the order allocation history of `spec:application.orders-inventory-example`, a `HistoryProjection` bound to the order stream type and the stock item stream type. The sample holds 40 orders on 20 stock items, one stream each, split evenly between two tenants, and the view's batch size is 32 events.
- Before `startGeneration` the test closes, through `closeGate`, the scope of the tenant whose ID sorts second, which the enumeration reaches second, so the backfill runs every batch of the first tenant and parks at the second, whose scope each batch reads, and cannot end before the interrupt; it then starts a generation with `pauseRequired`, asserts that the gate holds that tenant's scope and one closed `source:` entry for each of the two stream types, each naming this generation, waits until `getGenerations` shows the backfill parked at the second tenant, the progress row's cursor naming it and its `lastError` naming its scope, interrupts with `interruptGeneration` while it is parked, and asserts that the pass is still `backfill`; then, as `spec:application.history-rebuild#design.historyAbortHandoff` requires while `all` is open, it closes `all` through `closeGate`, confirms it with `getGate` and calls `abortGeneration`.
- The test asserts that the generation is `aborted`, that the active generation is unchanged and that `all` is still closed; since the deployed projection's version is the active generation's, it then reopens the `all` entry it closed and the tenant's scope through `resumeGate`, and asserts that `PlaceOrder` succeeds again in both tenants, that both source entries are gone from the gate, and that no query returns a row of the aborted generation.
- The test runs `purgeGeneration` and asserts that its batches run until the generation is `purged` and that every batch deleted at most `limitPurgeBatch` rows.
