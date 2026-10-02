---
id: spec:facts.f20-pagination-checks-bytes-after-reading.probe-10-stream-budget
kind: example
altitude: story
readiness: defined
relations:
  refines: spec:facts.f20-pagination-checks-bytes-after-reading
  verifies: spec:facts.f20-pagination-checks-bytes-after-reading
---
# Probe 10: a page of full stream rows reads past the library's byte bound

Probe 10 · native tier · fixture composition.

## Intent

- outcome: Rows that fill the default stream budget in application fields, read to an end cursor with the context library's page options, carry the page past the library's byte bound by their system fields. (Probe 10, F20)

```gwt
Given {count: 32} component rows whose application fields each occupy {budgetBytes: 262144} bytes
When the component paginator reads to the end cursor using the context library's page options
Then the page keeps {kept: 32} rows and marks {status: "SplitRequired"}
And the bytes the page read are above the library's byte bound {exceeds: true}
```

## Verification — executable

- Runs in the native tier on the fixture composition; every test owns its disposable backend.
- The test uses `boundedPage`, `limitListPage` and `limitListBytes` from `src/context/queries.ts`, with an end cursor that removes the item count as a stopping condition.
- The bound values are the expectation written before the first run. Stored sizes and measured bytes are recorded, not bound as constants.
- The table has the same application-field budget as a default single-mapping stream. Its stored rows also carry `_id` and `_creationTime`, which the helper includes in the byte count. The row cap of twice the item cap is reached on the same row as the byte bound, so the example shows what the page read and not which cap stopped it.
