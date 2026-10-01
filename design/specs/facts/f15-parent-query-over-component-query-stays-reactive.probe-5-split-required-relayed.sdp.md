---
id: spec:facts.f15-parent-query-over-component-query-stays-reactive.probe-5-split-required-relayed
kind: example
altitude: story
readiness: defined
relations:
  refines: spec:facts.f15-parent-query-over-component-query-stays-reactive
  verifies: spec:facts.f15-parent-query-over-component-query-stays-reactive
---
# Probe 5: a page that outgrows its read cap splits across the boundary

Probe 5 · native tier · fixture composition.

## Intent

- outcome: The split crosses the boundary without a gap. (Probe 5, F15, S4)

```gwt
Given a subscribed page of a component list, bounded by an end cursor and read through the parent with maximumRowsRead {maximumRowsRead: 20}
When rows are inserted inside the page's range until it holds {rowsInRange: 25} rows
Then the page the parent relays carries pageStatus {pageStatus: "SplitRequired"} and a split cursor
And the two pages on either side of the split cursor together hold every row exactly once and in order {contiguous: true}
```

## Verification — executable

- Runs in the native tier on the fixture composition; every test owns its disposable backend.
- The test also runs the `usePaginatedQuery` hook of `convex-helpers/react` against the same parent query and records whether it shows every row after the split; if the hook cannot run in the test process, the run records that gap.
