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
Given temporary functions provide a local reaction, a failed reaction and unrelated scheduled calls
When a local reaction succeeds and a query filters the system table for one function and failed state while unrelated schedules grow past the read boundary
Then the last accepted total is {accepted: 4091} and the first refused total is {refused: 4092} with text {refusal: "Too many reads in a single function execution (limit: 4096)"}
And each successful scan reads {documents: 0} documents and {bytes: 0} bytes, adding {queriesPerRow: 1} database query per row plus {extraQueries: 1}
And the table reaches {total: 32001} rows and scans at {documentCeiling: 32000} and above are refused before any document bound is measured
```

## Verification — executable

- The value is observed, not expected: the expectation written before the first run was that filtered-out rows consumed the 32000-document allowance, and the run on release `precompiled-2026-09-28-5c7cb5b` with Convex 1.46.0 on 2026-10-02 showed zero documents and bytes read, with 4091 rows accepted and 4092 refused at 4096 reads in both plain and instrumented scans.
- The scan adds N + 1 database queries to four already used. Three rows are terminal, so the boundary is 4088 accepted and 4089 refused outstanding rows.
- A local scheduled mutation completes. Populating beyond 32000 rows does not show a document boundary because system reads or system-operation time refuse first. Workpool, Workflow and hosted limits are not run.
