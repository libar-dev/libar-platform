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
Given the production composition with temporary scheduler functions
When the native backend exercises in-place-import
Then the observation is {result: "documents replaced and schedules preserved"}
```

## Verification — executable

- Every scheduler state in the parent and both contexts survives replacement. A pending reaction created after export still runs at its scheduled time against restored data. A failed reaction created after export remains visible despite having no matching exported data. The system table alone cannot identify which intent belongs to the exported data. Hosted dashboard restore, Workpool and Workflow are not run.
- Bound values are expectations written before the first native run; measured durations and sizes are recorded, not asserted.
- A kept pending row referenced by an imported `v.id("_scheduled_functions")` is canceled after import; the cancellation is expected to prevent that reaction, while the uncanceled row created after export still runs against restored data.
- The first native run on 2026-10-02 on `precompiled-2026-09-28-5c7cb5b` held the original bound values.
- The uncanceled reaction is expected to commit no earlier than its recorded scheduled time; elapsed waiting time is recorded rather than bounded.
