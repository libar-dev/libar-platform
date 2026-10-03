---
id: spec:facts.f20-pagination-checks-bytes-after-reading.probe-10-oversized-row
kind: example
altitude: story
readiness: defined
relations:
  refines: spec:facts.f20-pagination-checks-bytes-after-reading
  verifies: spec:facts.f20-pagination-checks-bytes-after-reading
---
# Probe 10: a page keeps the row that crosses its byte bound

Probe 10 · native backend tier · fixture composition.

## Intent

- outcome: A page read under a byte bound below one row's size, or equal to it, still reads and keeps that row and comes back `SplitRequired`. (Probe 10, F20)

```gwt
Given a component list with two rows larger than the requested byte bound
When the parent reads the component paginator with byte bounds below and at one row
Then the first page keeps {rows: 1} row and reports {status: "SplitRequired"}
And the bytes read are above every bound below the row's size {overshoot: true}
```

## Verification — executable

- Runs in the native backend tier on the fixture composition; every test owns its disposable backend. The stored size of the row and the bytes each page read, from `ctx.meta.getTransactionMetrics()`, are recorded in the run's evidence.
- The bound values are the expectation written before the first run, which held. The bounds are zero, one, one byte below the stored size and the stored size; a page that kept no row would not have reached the boundary, and the test fails it.
- The test also supplies a negative byte bound. The helper still reads and keeps one row, so the overshoot guarantee is stated only for finite non-negative bounds.
