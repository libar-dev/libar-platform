---
id: spec:facts.f15-parent-query-over-component-query-stays-reactive.probe-5-full-first-page-not-split
kind: example
altitude: story
readiness: defined
relations:
  refines: spec:facts.f15-parent-query-over-component-query-stays-reactive
  verifies: spec:facts.f15-parent-query-over-component-query-stays-reactive
---
# Probe 5: a full first page with a row cap of twice its size is not split

Probe 5 · native backend tier · fixture composition.

## Intent

- outcome: A row cap of twice the item cap lets a full first page come back whole and unmarked, which is why every list passes that cap. (Probe 5, F15, S4, F13)

```gwt
Given a component list of {rows: 30} rows
When a first page of {pageSize: 10} is read through the parent with maximumRowsRead {maximumRowsRead: 20}
Then the page holds {rowsHeld: 10} rows and carries pageStatus {pageStatus: "none"}
```

## Verification — executable

- Runs in the native backend tier on the fixture composition; every test owns its disposable backend.
- A `pageStatus` of none means the relayed page has no `pageStatus` or has it `null`; the test asserts `isDone` false and a `continueCursor` that starts the next page at the eleventh row.
- The sibling example with the row cap equal to the page size shows the reading this one rules out.
