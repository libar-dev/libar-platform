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
Given the production composition with temporary scheduler functions
When the native backend exercises fresh-import
Then the observation is {result: "documents preserved and schedules absent"}
```

## Verification — executable

- The archive carries parent, Orders and Inventory documents with their IDs and creation times, but no scheduler rows. Destination environment variables remain unchanged. Stored scheduler IDs validate at import, on a later write and as an argument; system.get returns null and cancel succeeds without a row. These are expectations before the first run. Hosted dashboard restore, Workpool and Workflow are not run.
- Bound values are expectations written before the first native run; measured durations and sizes are recorded, not asserted.
- The first native run on 2026-10-02 on `precompiled-2026-09-28-5c7cb5b` held the original bound values.
