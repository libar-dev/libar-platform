---
id: spec:facts.f20-pagination-checks-bytes-after-reading.probe-10-stream-budget
kind: example
altitude: story
readiness: defined
relations:
  refines: spec:facts.f20-pagination-checks-bytes-after-reading
  verifies: spec:facts.f20-pagination-checks-bytes-after-reading
---
# A page includes stored system fields in its byte check

Probe 10 · Native backend tier · Fixture composition · Backend `precompiled-2026-09-28-5c7cb5b`, `convex` 1.46.0, `convex-helpers` 0.1.124.

## Intent

- outcome: Read rows at their declared application-field budget through the context library's page options and record the system-field bytes beyond the page bound.

```gwt
Given {count: 32} component rows whose application fields each occupy {budgetBytes: 262144} bytes
When the component paginator reads to the end cursor using the context library's page options
Then the page keeps {kept: 32} rows and marks {status: "SplitRequired"}
And its measured bytes are above the library byte bound by {exceeds: true}
```

## Verification — executable

- The test uses `boundedPage`, `limitListPage` and `limitListBytes` from `src/context/queries.ts`, with an end cursor that removes the item count as a stopping condition.
- The bound values are the expectation written before the first native run. Stored sizes and measured bytes are recorded, not bound as constants.
- The table has the same application-field budget as a default single-mapping stream. Its stored rows also carry `_id` and `_creationTime`, which the helper includes in the byte count.
