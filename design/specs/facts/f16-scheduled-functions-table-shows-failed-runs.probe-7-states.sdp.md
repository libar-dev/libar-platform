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
Given the production composition with temporary scheduler functions
When the native backend exercises states
Then the observation is {result: "all five states readable"}
```

## Verification — executable

- Native observations include names, arguments, times and failure errors in the parent and both contexts. Completion rows remain readable during the measured interval. Seven-day expiry and hosted retention are not run.
- Bound values are expectations written before the first native run; measured durations and sizes are recorded, not asserted.
- The first native run on 2026-10-02 on `precompiled-2026-09-28-5c7cb5b` held the original bound values.
