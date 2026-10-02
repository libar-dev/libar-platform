---
id: spec:facts.f16-scheduled-functions-table-shows-failed-runs.probe-7-states
kind: example
altitude: story
readiness: defined
relations:
  refines: spec:facts.f16-scheduled-functions-table-shows-failed-runs
  verifies: spec:facts.f16-scheduled-functions-table-shows-failed-runs
---
# Probe 7: the five scheduler states remain readable

Probe 7 · native backend tier · temporary copy of the production composition.

## Intent

- outcome: The five scheduler states remain readable. (Probe 7)

```gwt
Given the parent and Orders and Inventory have temporary functions for pending, held, successful, failed and canceled schedules
When admin access reads each scheduler table before and after a short interval
Then each scope {scopes: "parent,orders,inventory"} contains state kinds {kinds: "canceled,failed,inProgress,pending,success"}
And rows have names, arguments and scheduled times, and completedTime is present exactly for {terminal: "canceled,failed,success"}
And each failed row has error text containing {failure: "Uncaught Error: reaction refused: exported-failed"}
And all scheduler rows remain unchanged across the interval {retained: true}
```

## Verification — executable

- The value is observed, not expected: the expectation written before the first run was all five states with completion times only on terminal rows, and the run on release `precompiled-2026-09-28-5c7cb5b` with Convex 1.46.0 on 2026-10-02 showed those states and fields in all three scopes.
- The held action supplies inProgress. The test records the retention interval; seven-day retention and expiry and hosted retention are not run.
