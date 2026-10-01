---
id: spec:facts.f15-parent-query-over-component-query-stays-reactive.probe-5-hook-splits-across-boundary
kind: example
altitude: story
readiness: defined
relations:
  refines: spec:facts.f15-parent-query-over-component-query-stays-reactive
  verifies: spec:facts.f15-parent-query-over-component-query-stays-reactive
---
# Probe 5: the client hook splits a page across the boundary without a gap

Probe 5 · native tier · fixture composition.

## Intent

- outcome: The hook shows every row after the split. (Probe 5, F15, S4)

```gwt
Given a component list of {rows: 30} rows read through the parent by the usePaginatedQuery hook of convex-helpers/react, in pages of {pageSize: 10} with maximumRowsRead {maximumRowsRead: 20}
And the hook has loaded every page
When rows are inserted inside the first page's range until it holds {rowsInRange: 25} rows
Then the hook's results hold {rowsShown: 45} rows, every row of the list once and in order
```

## Verification — executable

- Runs in the native tier on the fixture composition, with a DOM environment for the hook; every test owns its disposable backend.
- The test shows through a second subscription that the capped page came back `SplitRequired`, so a pass cannot come from a page that never needed the split.
- The hook is the `usePaginatedQuery` of `convex-helpers/react`, whose pages carry an end cursor. Convex's own `usePaginatedQuery` is not the subject.
