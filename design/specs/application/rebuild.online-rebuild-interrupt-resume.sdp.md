---
id: spec:application.rebuild.online-rebuild-interrupt-resume
kind: example
altitude: story
readiness: defined
relations:
  refines: spec:application.rebuild
  verifies: spec:application.rebuild
---
# Rebuild a per-entity read model online while commands run; interrupt and resume

Sc L2-5 · native tier.

## Intent

- outcome: No stale overwrite, no missing entity, no side effects; cutover and rollback work. (Sc L2-5)

```gwt
Given a {viewKind: "per-entity"} read model with an active generation
And a new generation registered as {mode: "building online"}
And live commands {liveCommands: "keep running"}
When the backfill is interrupted after {batches: 3} batches and then {resumption: "resumed"}
Then no row of the new generation holds data older than its source stream version
And the new generation {coverage: "covers every stream enumerated at cutover"}
And no command or external effect ran during the rebuild
And the active generation {cutover: "switches in one write and can roll back"}
And writes {writes: "never stopped"}
```

## Verification — executable

- Runs in the native tier; every test owns its disposable backend.
- The test, in a file whose own timeout is 300 s, installs the order summary's generation 1 through its first rebuild, seeds 350 orders across two tenants, 250 in the first in tenant-ID order and 100 in the second, starts generation 2 with `projectionVersion` 1 stated, a batch size of 1 and a stated operator, runs `PlaceOrder` and `CancelOrder` concurrently with the batches in both tenants, and calls `interruptGeneration` once the progress row shows at least 3 batches; it asserts that `batchesDone` then stops advancing below 350 and that the cursor names a tenant; while a chain is expected to run, a progress row whose `batchesDone` has not advanced for 30 s fails the test with the generation row and the progress row in the message.
- While the chain is interrupted the test sends `CancelOrder` to one of the second tenant's 100 seeded orders and to an order of the first tenant whose row generation 2 already holds, read from the table before the command; it asserts at once that the first tenant's order has its row in generation 2 `cancelled`, and, once generation 2 is `verified`, that the second tenant's order has its row in generation 2 `cancelled`, whichever pass wrote it.
- After `resumeGeneration` the test asserts that the batch cursor advanced from the first tenant to the second and that, once the generation is `verified`, every order the Orders context's `list` enumerates in either tenant, read with admin access and `includeDeleted`, has a row in the new generation whose `sourceVersions` equal the order's current stream version, that no row is older than the state read through the component query, that `backfillBatch` run with admin access under the fence the interrupt replaced leaves the progress row unchanged, that the function log shows no action and no completion during the batches other than a batch, an operator entry or a live command, and that the journals, read by operation, hold the event and receipt counts the live commands produced.
- The test asserts that no command of the run ends in a failure, that no completion record's `occInfo` names `generationProgress`, and that the completion records whose `occInfo` names `generations` number at most the operator entries and pass ends of the run times the callers the test keeps in flight plus one for the chain, and records those reruns with their `occInfo` as a measurement; it reads generation 2's row at the interrupt, after the resume and at `verified`, and asserts that the interrupt and the resume changed only `fence`, `changedAt` and `changedBy` and that from the resume to `verified` only `state` changed.
- The test switches, asserts from the function log that the list query ran again for each tenant's subscription after the switch and that each subscription's value holds the same rows, and that generation 1 is `retired`, then runs one more `PlaceOrder` and cancels one earlier order so that its summary changes, rolls back by naming generation 1, asserts that the reopened generation reaches `verified` after one verify pass with a row for the new order and the cancelled order's row `cancelled` before it becomes active, switches again, and asserts that generation 1 is active, generation 2 is `retired` and the list query ran again for each subscription.
- A `convex-test` test of the same workflow runs on the fixture composition with `documentTitle` and calls each batch directly, so it interrupts after exactly 3 batches; in one run generation 1 is installed at version 1 stated and generation 2 built at version 2 under live `CreateTwiceSummarizedDocument` writes, and it asserts that each generation's rows carry their own generation's `projectionVersion` and that a document whose `title` is the depot's `deletedTitle` has a row at version 1 and none at version 2; in a second run both generations are at version 2 and, after the switch, it deletes a document by `AmendDocument` with the depot's `deletedTitle`, rolls back by naming generation 1 and asserts that the reopened generation holds no row for it after its verify pass; and it asserts every refusal of the operator entries by its message.
