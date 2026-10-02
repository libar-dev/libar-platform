---
id: spec:facts.f12-backups-exclude-pending-scheduled-functions.probe-7-fresh-import
kind: example
altitude: story
readiness: defined
relations:
  refines: spec:facts.f12-backups-exclude-pending-scheduled-functions
  verifies: spec:facts.f12-backups-exclude-pending-scheduled-functions
---
# Probe 7: replacement into a fresh backend restores context data without schedules

Probe 7 · native backend tier · temporary copy of the production composition.

## Intent

- outcome: Replacement into a fresh backend restores context data without schedules. (Probe 7)

```gwt
Given a production composition has parent and context documents, stored scheduler ids and all five scheduler states
When its exported snapshot is imported with replacement into a fresh backend with its own environment
Then documents including ids and creation times in {scopes: "parent,orders,inventory"} equal the exported documents {equal: true}
And the scheduler row counts are parent {parent: 0}, Orders {orders: 0} and Inventory {inventory: 0}
And the destination environment is unchanged {unchanged: true}
And each stored id validates as an argument and on a later write {valid: true}, system.get is null {missing: true}, and cancel succeeds {canceled: true}
```

## Verification — executable

- The value is observed, not expected: the expectation written before the first run was restored documents and empty scheduler tables in a fresh destination, and the run on release `precompiled-2026-09-28-5c7cb5b` with Convex 1.46.0 on 2026-10-02 showed that result in the parent, Orders and Inventory, with stored scheduler IDs still validating.
- The exported snapshot is the archive. Full document equality includes IDs and creation times. Hosted dashboard restore, file storage, Workpool and Workflow are not run.
