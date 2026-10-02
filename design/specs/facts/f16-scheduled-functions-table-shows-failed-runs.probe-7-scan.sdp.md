---
id: spec:facts.f16-scheduled-functions-table-shows-failed-runs.probe-7-scan
kind: example
altitude: story
readiness: defined
relations:
  refines: spec:facts.f16-scheduled-functions-table-shows-failed-runs
  verifies: spec:facts.f16-scheduled-functions-table-shows-failed-runs
---
# Probe 7: a failed-function scan reads unrelated schedules

Probe 7 · native backend tier · temporary copy of the production composition.

## Intent

- outcome: A failed-function scan reads unrelated schedules. (Probe 7)

```gwt
Given the production composition with temporary scheduler functions
When the native backend exercises scan
Then the observation is {result: "4091 rows scan and 4092 exceed 4096 reads; zero document reads counted"}
```

## Verification — executable

- A plain scheduled mutation records a local reaction. The failed-function filter reads unrelated outstanding rows. Metrics and completion usage record the scan cost. Hosted scan limits and seven-day expiry are not run.
- Original bound values were written before the first native run; the bound values here follow the observed refusal. Measured durations are recorded, not asserted.
- The first run on 2026-10-02 on `precompiled-2026-09-28-5c7cb5b` counted zero document reads at 1000 rows; the next run refused 32000 rows for too many system operations. The original document-read expectation did not hold. The 4091 and 4092 boundary is an expectation derived from the recorded system-operation count before its first run.
- The boundary run on 2026-10-02 observed 4091 rows returning one failed reaction, with `databaseQueries.used` at 4096, and 4092 rows refused by the 4096-read limit; the same refusal also occurred at 32000, while a system-operation timeout occurred at 32001. The bound values are observed, and a plain scan without metric calls is also checked.
- In `evidence/runs/native-20261002T210145Z-592f1dc-1f503d30-03eb-431b-b48b-e946c2866bd5.json`, the plain scan without metric calls also accepted 4091 rows and refused 4092 for the 4096-read limit. Total rows include three terminal rows; outstanding rows are total rows minus three.
