---
id: spec:facts.f15-parent-query-over-component-query-stays-reactive.probe-5-pages-stay-contiguous
kind: example
altitude: story
readiness: defined
relations:
  refines: spec:facts.f15-parent-query-over-component-query-stays-reactive
  verifies: spec:facts.f15-parent-query-over-component-query-stays-reactive
---
# Probe 5: pages of a component list stay contiguous under live writes

Probe 5 · native tier · fixture composition.

## Intent

- outcome: The pages stay contiguous. (Probe 5, F15, S4)

```gwt
Given a component list of {rows: 30} rows that a parent query relays from paginator, read in pages of {pageSize: 10}
And a client subscribed to every page, each bounded by the end cursor its first load returned
When {inserted: 5} rows are inserted inside the first page's range
Then the subscribed pages together hold every row exactly once and in order {contiguous: true}
And the first page now holds {firstPageRows: 15} rows
```

## Verification — executable

- Runs in the native tier on the fixture composition; every test owns its disposable backend.
- The test also deletes a row inside the second page's range and asserts the same contiguity.
