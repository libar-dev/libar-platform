---
id: spec:facts.f16-scheduled-functions-table-shows-failed-runs.probe-7-hosted-retention
kind: example
altitude: story
readiness: defined
relations:
  refines: spec:facts.f16-scheduled-functions-table-shows-failed-runs
  verifies: spec:facts.f16-scheduled-functions-table-shows-failed-runs
---
# Probe 7: completed schedules on a hosted deployment are read at the ages runs reach

Probe 7 · native backend tier · temporary copy of the fixture composition · hosted deployment.

## Intent

- outcome: Terminal schedules that earlier runs planted are read or found missing at their recorded age, so that the records of runs at different ages bracket the window the deployment keeps them for. (Probe 7, F16, E-59)

```gwt
Given the hosted deployment running the hosted driver's temporary copy of the fixture composition, which keeps the parent's schedules earlier runs planted and, in the table `plantedSchedules`, a planting record for each that names the run that planted it
When a run reads `plantedSchedules` and the parent's `_scheduled_functions` before it deploys or imports anything, then plants one succeeded, one failed and one canceled schedule
Then each planting record is recorded with its age and whether its schedule was read {recorded: true}
And the run's own schedules are read in states {states: "success,failed,canceled"} each with a `completedTime` {completedTime: true}
```

## Verification — executable

- Runs first in the hosted driver, and reads before any deploy or import; it starts no local backend. After its read it deploys the copy, so that the planting module is the one of the run's commit; when the deployment holds no planting record, the run records that it read nothing.
- A planted schedule's age is the reading's time less the `completedTime` its planting record holds, so it is known after the scheduler row is gone; the ages are read, never assumed from the schedule, because GitHub may delay or drop a scheduled run.
- No age is bound: the ages are measured times, recorded in the run's evidence and on the fact and not asserted. The run reaches its boundary when it has planted its three schedules and recorded every earlier planting record, and its test result is failed otherwise; it is never skipped. A run's test result can be passed without showing a retention window, and the window stays open on F16 until records show it.
- The records show the window when one shows a schedule present at one age and a later one shows it missing; with runs on Monday and Thursday the nominal ages are 3, 4, 7, 10, 11 and 14 days, and each recorded age uses the actual completion and reading times, so a bracket is no finer than those steps.
- The run records whether a backup archive was imported on the deployment since a schedule was planted. Only the parent's schedules are planted, because a later deploy of another composition may unmount a component.
