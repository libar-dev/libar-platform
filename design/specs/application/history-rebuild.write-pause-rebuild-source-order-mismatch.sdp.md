---
id: spec:application.history-rebuild.write-pause-rebuild-source-order-mismatch
kind: example
altitude: story
readiness: defined
relations:
  refines: spec:application.history-rebuild
  verifies: spec:application.history-rebuild
---
# Reorder a history view's sources while its generation is interrupted

E-8 · native backend tier · no acceptance row; the example verifies the check of `spec:application.history-rebuild#design.historyCompatibility` and its recovery for a deploy that reorders a history view's sources while a generation of it is interrupted, an extension under E-8 and E-9.

## Intent

- outcome: A generation whose sources a deploy reordered parks with a `lastError` naming the difference and is never resumed, and the protected abort and a fresh generation bring the view back. (E-8, E-9, D9, D19)

```gwt
Given a {viewKind: "cross-stream history"} read model with an active generation
And an order summary installed before the first order is placed, with {orderSummary: "an active generation"}
And a sample of {orders: 40} orders on {stockItems: 20} stock items, split evenly between {tenants: 2} tenants, read in batches of {batchSize: 32} events
And a new generation building under a write pause over sources in the order {startedOrder: "stock item, then order"}
And the scope of the tenant the enumeration reaches second closed before the start, so the backfill {hold: "parks at the second tenant"} before the deploy
And its backfill interrupted while it is parked at the second tenant
And a deploy, at the same projection version, that lists the sources in the order {deployedOrder: "order, then stock item"}
When a batch carrying the generation's fence runs under the deployed code
Then the batch {batch: "parks with a lastError naming the source order"}
And the cursor, the rows and the gate {unchanged: "stay as the interruption left them"}
And resumeGeneration {resume: "is refused naming the difference"}
And the abort under all {abort: "succeeds and reopens both sources"}
And a fresh generation {fresh: "is verified and switched"}
```

## Verification — executable

- Runs in the native backend tier; every test owns its disposable backend.
- Before it places the first order, the test installs the order summary, which `PlaceOrder` and `CancelOrder` bind, through `startGeneration`, its batches and `switchGeneration`, so that its commands have a generation to write.
- The view is the order allocation history, a `HistoryProjection` bound to the order stream type and the stock item stream type, at one projection version in both compositions; the composition the generation starts under lists the stock item source first in its rebuild target, and the copy the test deploys through `deployTemporary` lists the order source first. The sample holds 40 orders on 20 stock items, one stream each, split evenly between two tenants, and the view's batch size is 32 events.
- Before `startGeneration` the test closes, through `closeGate`, the scope of the tenant whose ID sorts second, which the enumeration reaches second, so the backfill runs every batch of the first tenant and parks at the second, whose scope each batch reads, and cannot end before the interrupt and the deploy; it then starts a generation with `pauseRequired`, asserts that the gate holds that tenant's scope and one closed `source:` entry for each of the two stream types, each naming this generation, the stock item entry first, waits until `getGenerations` shows the backfill parked at the second tenant, the progress row's cursor naming it and its `lastError` naming its scope, interrupts with `interruptGeneration` and deploys the copy while it is parked, and asserts that the pass is still `backfill`.
- The test runs `backfillBatch` through its admin access with the generation's ID and its fence, standing for a batch scheduled before the deploy, since no batch carries the live fence after `interruptGeneration`, and asserts that the progress row's `lastError` names the generation and the two source orders, that the batch scheduled nothing, and that the cursor, the counts, the rows, the generation's state and the gate are as they were before it.
- The test asserts that `resumeGeneration` is refused with a plain `Error` naming the difference and that the fence, the progress row and the gate are unchanged.
- In this order the test closes `all` through `closeGate` and confirms it with `getGate`, as `spec:application.history-rebuild#design.historyAbortHandoff` requires while `all` is open, runs `abortGeneration`, asserts that the generation is `aborted`, that the active generation is unchanged and that both source entries are gone while `all` stays closed, and, since the deployed projection's version is the active generation's, reopens the `all` entry it closed and the tenant's scope through `resumeGate` and asserts that `PlaceOrder` succeeds.
- The test runs `startGeneration` again, asserts that the gate holds the two source entries naming the fresh generation, the order entry first, waits until it is `verified`, switches it, and asserts that every row of it equals the fold of its order's events and its stock items' allocation events read from the two journals through `history`.
