---
id: spec:application.restore.restore-representative-dataset
kind: example
altitude: story
readiness: defined
relations:
  refines: spec:application.restore
  verifies: spec:application.restore
---
# Restore a representative dataset with matching code and configuration

Sc L2-8 · end to end tier.

## Intent

- outcome: Domain, journal and read-model invariants hold; the procedure runs. (Sc L2-8)

```gwt
Given a representative dataset restored from a backup with {codeMatch: "matching"} code and configuration
And every writer is refused while the restore door is closed
When the restore procedure runs its journal, domain, read-model and receipt checks and its pending-work inventory
Then the invariants {invariants: "hold"}
And writes {reopen: "reopen after the checks pass"}
And a generation stranded in the snapshot is {stranded: "resumed by the accepted branch"}
```

## Verification — executable

- Runs in the end-to-end tier on a disposable deployment with the production composition; every test owns its disposable backend.
- The test builds the representative dataset with `PlaceOrder` and `CancelOrder` across two tenants, starts an online generation of the order summary and stops the scheduler after its first batch so the generation is in `building` at backup time, takes a backup, records the commit and hashes, then restores into a second disposable deployment with the same commit.
- The test asserts that `PlaceOrder` is refused with `writePaused` while `MAINTENANCE_MODE` is `restore`, that all four checks reach `passed` with zero findings, that the pending-work inventory lists the building generation with its fence and no closed gate entry, that the Orders and Inventory components' tables came back with the parent's, which is the assumption the drill proves for Probe 7, and that `finishRestoreRun` refuses while the door is still set.
- The test clears the door, calls `finishRestoreRun`, and asserts that the run record is `accepted` with the generation item marked `resumed`, that the generation's fence was bumped and its next batch scheduled, that it reaches `verified` covering both tenants' orders, that `PlaceOrder` succeeds, and that a receipt from before the backup is still recognized as a duplicate.
