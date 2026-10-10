---
id: spec:application.history-rebuild.write-pause-rebuild-version-change
kind: example
altitude: story
readiness: defined
relations:
  refines: spec:application.history-rebuild
  verifies: spec:application.history-rebuild
---
# Deploy a changed history projection version through the handoff

E-8 · native backend tier · no acceptance row; the example verifies the handoff of `spec:application.history-rebuild#design.historyHandoff` for a deploy that changes a history projection's version, an extension under E-8 and E-9.

## Intent

- outcome: A deploy that changes a history projection's version leaves every caller an ordinary answer or the transient refusal `writePaused`, never a technical failure, and the generation of the deployed version is verified and switched. (E-8, E-9, D9, D19)

```gwt
Given a {viewKind: "cross-stream history"} read model whose active generation records projection version {activeVersion: 1}
And an order summary installed before the first order is placed, with {orderSummary: "an active generation"}
And a composition ready to deploy that declares the view at projection version {deployedVersion: 2} with the same sources
And a gate with {closedEntries: 0} closed entries
When the operator runs the handoff: closes all, deploys, starts a generation, waits for its first batch to park, reopens all, resumes the parked chain and switches the verified generation
Then every command that reaches step 7 while all is closed is {whileAllClosed: "refused with writePaused"}
And every writer of the view's sources is {whileSourcesClosed: "refused with writePaused"} while the source scopes are closed
And {technicalFailures: 0} commands end in a technical failure
And the active generation records projection version {switchedVersion: 2}
And writes {writes: "reopen after the switch"}
```

## Verification — executable

- Runs in the native backend tier; every test owns its disposable backend.
- Before it places the first order, the test installs the order summary, which `PlaceOrder` and `CancelOrder` bind, through `startGeneration`, its batches and `switchGeneration`, so that its commands have a generation to write.
- The view is the order allocation history, a `HistoryProjection` bound to the order stream type and the stock item stream type, at projection version 1 with an active generation; the deployed composition is a copy, deployed through `deployTemporary`, that declares version 2 with the same rebuild target.
- In this order the test closes `all` through `closeGate` and confirms it with `getGate`, deploys the copy, runs `startGeneration` for the view, confirms through `getGenerations` and `getGate` the new generation with `pauseRequired` and one closed `source:` entry for each of the two stream types naming it, waits until `getGenerations` shows the first batch parked on `all`, the progress row's `lastError` naming `all` and its `batchesDone` 0, and only then reopens the `all` entry it closed through `resumeGate`.
- The test asserts that `PlaceOrder`, `CancelOrder` and `ReceiveStock` sent while `all` is closed, before the deploy and after it, are refused with `writePaused`, that the error's `data.kind` is `"transient"`, and that nothing is stored.
- The test asserts that reopening `all` scheduled nothing, the progress row still showing the parked batch, runs `resumeGeneration`, and waits until the generation is `verified`.
- The test asserts that `PlaceOrder` sent while the source scopes are closed is refused with `writePaused`, switches the generation, and asserts that the gate holds no closed entry, that `PlaceOrder` succeeds and that the active generation records projection version 2.
- The test asserts that no answer it received at any step was a technical failure.
