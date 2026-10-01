---
id: spec:facts.f16-scheduled-functions-table-shows-failed-runs
kind: constraint
altitude: story
readiness: defined
relations:
  refines: spec:facts.fact-ledger
---
# The scheduled functions table shows failed runs for a retention window

F16 · Status: rechecked · Doc status: Assumed in the doc; found documented on S6 by the recheck of 2026-09-30 · Decisions: D13.

The doc lists this fact as assumed. The lead read S6 on 2026-09-30 and this package read it again the same day: the `_scheduled_functions` system table carries `name`, `args`, `scheduledTime`, `completedTime` and `state`; the states are Pending, InProgress, Success, Failed and Canceled; and scheduled function results are available for 7 days after they have completed. The corpus records the recheck here and the target states it; the doc keeps its own status until the owner edits it, which is why `measurableBy` still names the doc's status. The do-nothing check of D13 depends on this fact: a plain scheduled mutation plus a scan of this table may cover a local reaction, and the obligation table must earn its cost through restore, retention past the 7-day window, and business visibility and operator exits.

## Intent

- outcome: Record that `_scheduled_functions` shows failed runs for some retention window, with its evidence status as a target, so that every design resting on it is found by its `constrainedBy` edge (F16)

### Open questions

- [non-blocking] Probe 7 pending: the states and the 7-day retention are documented, so the probe need only confirm them on a native backend and show what a restore leaves of scheduler, Workpool and Workflow state (F16, Probe 7, F12)

## Constraints

- statement: `_scheduled_functions` shows failed runs for some retention window (F16)
- flavor: convex-fact
- target: evidence.status:rechecked
- measurableBy: S6 https://docs.convex.dev/scheduling/scheduled-functions, states Pending, InProgress, Success, Failed and Canceled, results available for 7 days after completion; doc status Assumed in the doc; found documented on S6 by the recheck of 2026-09-30; Probe 7 confirms the states and retention on a native backend and what a restore leaves (F16, D13)
