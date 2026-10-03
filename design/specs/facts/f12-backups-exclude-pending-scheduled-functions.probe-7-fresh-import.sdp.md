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
Given a production composition can store parent and context documents and typed scheduler references
When it creates documents and five scheduler states, then exports and imports the backup archive with replacement into a fresh backend with its own environment
Then documents including ids and creation times in {scopes: "parent,orders,inventory"} equal the exported documents {equal: true}
And the scheduler row counts are parent {parent: 0}, Orders {orders: 0} and Inventory {inventory: 0}
And the destination environment is unchanged {unchanged: true}
And each stored id validates as an argument and on a later write {valid: true}, system.get is null {missing: true}, and cancel succeeds {canceled: true}
```

## Verification — executable

- On the first run of this example, on 2026-10-02 on release `precompiled-2026-09-28-5c7cb5b` with `convex` 1.46.0, the bound values held: the documents came back in the parent, Orders and Inventory, the scheduler tables stayed empty, and the stored scheduler ids still validated.
- The exported file is the backup archive. Full document equality includes IDs and creation times. Hosted dashboard restore, file storage, Workpool and Workflow are not run.
