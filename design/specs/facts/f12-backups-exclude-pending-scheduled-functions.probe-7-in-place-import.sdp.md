---
id: spec:facts.f12-backups-exclude-pending-scheduled-functions.probe-7-in-place-import
kind: example
altitude: story
readiness: defined
relations:
  refines: spec:facts.f12-backups-exclude-pending-scheduled-functions
  verifies: spec:facts.f12-backups-exclude-pending-scheduled-functions
---
# Probe 7: replacement in place preserves schedules that run against restored data

Probe 7 · native backend tier · temporary copy of the production composition.

## Intent

- outcome: Replacement in place preserves schedules that run against restored data. (Probe 7)

```gwt
Given a production composition has temporary functions for scheduler references and reactions
When it exports business documents and five scheduler states, adds orders and schedules, then imports the snapshot in place before pending reactions are due
Then documents including ids and creation times in {scopes: "parent,orders,inventory"} equal the exported documents {equal: true}
And every scheduler row in each scope is unchanged {unchanged: true}
And later business changes are gone {removed: true} and the destination environment is unchanged {environmentUnchanged: true}
And kept reactions read {value: "exported"} no earlier than their scheduled time {onTime: true}
And each restored scheduler reference resolves to the kept row {found: true} and cancellation leaves state {state: "canceled"}
```

## Verification — executable

- On the first run of this example, on 2026-10-02 on release `precompiled-2026-09-28-5c7cb5b` with `convex` 1.46.0, the bound values held: the scheduler rows were unchanged in all three scopes and the kept pending reactions read the restored value at or after their time.
- The test changes business data in the parent and both contexts before import and fails if it does not reach that boundary. It records execution times; it binds only that execution is no earlier than the due time.
- The exported snapshot is the archive. Hosted dashboard restore, file storage, Workpool and Workflow are not run.
