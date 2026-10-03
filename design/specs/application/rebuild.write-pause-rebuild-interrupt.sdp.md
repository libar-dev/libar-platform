---
id: spec:application.rebuild.write-pause-rebuild-interrupt
kind: example
altitude: story
readiness: defined
relations:
  refines: spec:application.rebuild
  verifies: spec:application.rebuild
---
# Rebuild a cross-stream history view under a write pause; interrupt, then resume

Sc L2-6 · native tier · the resume case.

## Intent

- outcome: Resume or abort safely; writes reopen only after verification. (Sc L2-6)

```gwt
Given a {viewKind: "cross-stream history"} read model with an active generation
And a new generation registered as {mode: "building under a write pause"}
And live commands {liveCommands: "are refused while paused"}
When the backfill is interrupted after {batches: 2} batches and then {resumption: "resumed"}
Then no row of the new generation holds data older than its source stream version
And the new generation {coverage: "covers every stream enumerated at cutover"}
And no command or external effect ran during the rebuild
And the active generation {cutover: "switches in one write and refuses a rollback"}
And writes {writes: "reopen only after verification"}
```

## Verification — executable

- Runs in the native tier; every test owns its disposable backend.
- The view is the order allocation history of `spec:application.orders-inventory-example`, a `HistoryProjection` bound to the order stream type and the stock item stream type, whose rebuild target lists the stock item source first, so the backfill folds every stock event of an order before its `OrderPlaced`.
- The test starts a generation with `pauseRequired` and asserts that the gate holds one closed `source:` entry for each of the two stream types, each naming this generation.
- The test asserts that `PlaceOrder` and `CancelOrder` are refused with `writePaused` because their declarations' `writes` name a closed source, that the error's `data.kind` is `"transient"`, and that nothing is stored.
- The test interrupts after the second history batch, asserts the gate is still closed, resumes with `resumeGeneration`, and asserts the generation reaches `verified` with zero misses.
- The test asserts that every row of the new generation equals the fold of its order's events and its stock items' allocation events read from the two journals through `history`, and that its `sourceVersions` hold, per stream, the version of that stream's last event with the order's key; the sample holds a cancelled order whose stock items were released after the cancel, a stock item received and never allocated, and a stock item that allocated to a second order after the first.
- The test asserts that each row of the new generation equals, beside `generation`, the row the old generation holds for the same order, which live commands wrote.
- The test asserts that a `PlaceOrder` sent once the generation is `verified` and before the switch is still refused, then switches, which resumes both source scopes, and asserts that the same command now succeeds and that the active generation is the new one.
- The test calls `rollbackGeneration` on the generation the switch retired and asserts the refusal `"Generation " + n + " of orderAllocationHistory needs a write pause and cannot be rolled back"`, a gate with no closed entry, and the new generation still active.
