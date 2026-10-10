---
id: spec:application.history-rebuild.write-pause-rebuild-installation
kind: example
altitude: story
readiness: defined
relations:
  refines: spec:application.history-rebuild
  verifies: spec:application.history-rebuild
---
# Install a history view through the handoff

E-8 · native backend tier · no acceptance row; the example verifies the handoff of `spec:application.history-rebuild#design.historyHandoff` for a deploy that adds a history view's first binding, an extension under E-8 and E-9.

## Intent

- outcome: A deploy that adds a history view's first binding leaves every caller an ordinary answer or the transient refusal `writePaused`, never a failure for a missing generation, and the view's first generation is verified, switched and written by the commands after it. (E-8, E-9, D9, D19)

```gwt
Given a deployed composition whose command declarations bind no {viewKind: "cross-stream history"} read model
And {generationRows: 0} generation rows of the view
And an order summary installed before the deploy, with {orderSummary: "an active generation"}
And {orders: 3} orders placed on stock items received before the deploy
And a composition ready to deploy that binds the view on every declaration that writes its sources
And a gate with {closedEntries: 0} closed entries
When the operator runs the handoff: closes all, deploys, starts a generation, waits for its first batch to park, reopens all, resumes the parked chain and switches the verified generation
Then every command that reaches step 7 while all is closed is {whileAllClosed: "refused with writePaused"}
And {missingGeneration: 0} commands fail for a missing generation
And generation {generation: 1} of the view is {state: "active"}
And the view holds {rows: 3} rows for the orders placed before it
And a command after the switch {afterSwitch: "writes its order's row in generation 1"}
```

## Verification — executable

- Runs in the native backend tier; every test owns its disposable backend.
- The test first deploys, through `deployTemporary`, a copy of the composition whose command declarations bind no history projection and whose rebuild targets hold no history target, installs the order summary, which `PlaceOrder` and `CancelOrder` bind, through `startGeneration`, its batches and `switchGeneration`, so that its commands have a generation to write, places three orders on stock items it received, and asserts that `generations` holds no row of the order allocation history.
- In this order the test closes `all` through `closeGate` and confirms it with `getGate`, deploys the composition that binds the order allocation history to the order stream type and the stock item stream type, sends `PlaceOrder` and asserts the refusal `writePaused` with `data.kind` `"transient"` and nothing stored, runs `startGeneration` for the view, confirms through `getGenerations` and `getGate` generation 1 with `pauseRequired` and one closed `source:` entry for each of the two stream types naming it, waits until `getGenerations` shows the first batch parked on `all`, the progress row's `lastError` naming `all` and its `batchesDone` 0, and only then reopens the `all` entry it closed through `resumeGate`.
- The test asserts that reopening `all` scheduled nothing, the progress row still showing the parked batch, runs `resumeGeneration`, waits until generation 1 is `verified`, and asserts that `PlaceOrder` sent while the source scopes are closed is refused with `writePaused`.
- The test switches the generation and asserts that the gate holds no closed entry, that generation 1 is `active`, and that the view holds one row for each of the three orders, equal to the fold of its order's events and its stock items' allocation events read from the two journals through `history`.
- The test sends `PlaceOrder` for a fourth order, asserts that it succeeds and that generation 1 holds that order's row, and asserts that no answer it received at any step was a technical failure.
