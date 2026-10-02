---
id: spec:facts.f20-pagination-checks-bytes-after-reading.probe-10-oversized-row
kind: example
altitude: story
readiness: defined
relations:
  refines: spec:facts.f20-pagination-checks-bytes-after-reading
  verifies: spec:facts.f20-pagination-checks-bytes-after-reading
---
# A page keeps the row that crosses its byte bound

Native backend tier · Fixture composition · Backend `precompiled-2026-09-28-5c7cb5b`, `convex` 1.46.0, `convex-helpers` 0.1.124.

## Intent

- outcome: Establish the observed behavior on the pinned local backend.

```gwt
Given a component list with two rows larger than the requested byte bound
When the parent reads the component paginator with byte bounds below and at one row
Then the first page keeps {rows: 1} row and reports {status: "SplitRequired"}
And the recorded bytes exceed the smaller requested bound by {overshoot: true}
```

## Verification — executable

- Every test owns a disposable native backend. Timings and call counts are recorded, not asserted, and say nothing about a hosted deployment.
- The bound values are the expectation written before the first native run. A run that never reaches its boundary fails.
- The test also supplies a negative byte bound. The helper still reads and keeps one row, so the overshoot guarantee is stated only for finite non-negative bounds.
