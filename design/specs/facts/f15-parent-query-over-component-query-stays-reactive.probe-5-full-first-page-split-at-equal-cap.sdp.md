---
id: spec:facts.f15-parent-query-over-component-query-stays-reactive.probe-5-full-first-page-split-at-equal-cap
kind: example
altitude: story
readiness: defined
relations:
  refines: spec:facts.f15-parent-query-over-component-query-stays-reactive
  verifies: spec:facts.f15-parent-query-over-component-query-stays-reactive
---
# Probe 5: a full first page with a row cap equal to its size comes back split

Probe 5 · native tier · fixture composition.

## Intent

- outcome: With the row cap equal to the item cap, `paginator` marks an ordinary full first page `SplitRequired`, so a list never passes a row cap that low. (Probe 5, F15, S4, F13)

```gwt
Given a component list of {rows: 30} rows
When a first page of {pageSize: 10} is read through the parent with maximumRowsRead {maximumRowsRead: 10}
Then the page holds {rowsHeld: 10} rows and carries pageStatus {pageStatus: "SplitRequired"}
```

## Verification — executable

- Runs in the native tier on the fixture composition; every test owns its disposable backend.
- The test asserts that the relayed page carries a `splitCursor`, so the status is the helper's and not an artifact of the relay.
