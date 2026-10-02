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
- The test seeds 350 orders across two tenants, 250 in the first and 100 in the second, with the order summary's generation 1 active, starts generation 2 with a batch size of 1 and a stated operator, runs `PlaceOrder` and `CancelOrder` concurrently with the batches in both tenants, and calls `interruptGeneration` once the progress row shows at least 3 batches; it asserts that `batchesDone` then stops advancing below 350 and that the cursor names a tenant.
- The test asserts that a command on an order whose row backfill had not yet written left no row in the building generation, and that a command on an order whose row existed updated it.
- After `resumeGeneration` the test asserts that the batch cursor advanced from the first tenant to the second and that, once the generation is `verified`, every order enumerated by the Orders context in either tenant has a row in the new generation whose `sourceVersions` equal the order's current stream version, that no row is older than the state read through the component query, that a batch scheduled under the fence the interrupt replaced wrote nothing, and that the backend's function log shows no context operation call and no action during the batches.
- The test asserts that no command of the run failed for reading the registry while the batches wrote their checkpoints, and that the generation rows changed only at the start, at the end of the backfill, at the end of the verify pass and at each operator entry.
- The test switches, asserts that the subscriptions on the list query in both tenants re-ran with the new generation and that generation 1 is `retired`, then runs one more `PlaceOrder` and deletes or cancels one earlier order so that its summary changes, rolls back by naming generation 1, asserts that the reopened generation reaches `verified` after one verify pass with a row for the new order and the changed order's current row before it becomes active, switches again, and asserts that generation 1 is active, generation 2 is `retired` and the subscriptions re-ran.
- A `convex-test` test of the same workflow runs each batch by calling it directly, so it interrupts after exactly 3 batches, rebuilds with a second projection version and asserts that each generation's rows carry their own generation's `projectionVersion` and that version's output under live writes, deletes a subject between the switch and the rollback and asserts that the reopened generation holds no row for it after its verify pass, and asserts every refusal of the operator entries by its message.
