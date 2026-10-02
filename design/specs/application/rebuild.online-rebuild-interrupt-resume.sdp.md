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
- The test seeds 350 orders across two tenants, 250 in the first and 100 in the second, starts a generation of the order summary with the default batch size, which the order stream's default 256 KiB budget caps at 16 items per `list` page, runs `PlaceOrder` and `CancelOrder` concurrently with the batches in both tenants, and kills the backend's scheduler after the third batch, so at most 48 orders of the first tenant are backfilled and the second tenant is untouched.
- The test asserts that a command on an order whose row backfill had not yet written left no row in the building generation, and that a command on an order whose row existed updated it.
- After `resumeGeneration` the test asserts that the batch cursor advanced from the first tenant to the second and that every order enumerated by the Orders context in either tenant has a row in the new generation whose `sourceVersions` equal the order's current stream version, that no row is older than the state read through the component query, and that the backend's function log shows no context operation call and no action during the batches.
- The test switches, asserts that the subscriptions on the list query in both tenants re-ran with the new generation, runs one more `PlaceOrder`, rolls back, asserts that the reopened generation reaches `verified` with a row for the new order before it becomes active, and then asserts that the old generation is active and the subscriptions re-ran with it.
