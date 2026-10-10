---
id: spec:facts.f15-parent-query-over-component-query-stays-reactive.probe-5-hook-splits-across-boundary
kind: example
altitude: story
readiness: defined
relations:
  refines: spec:facts.f15-parent-query-over-component-query-stays-reactive
  verifies: spec:facts.f15-parent-query-over-component-query-stays-reactive
---
# Probe 5: the client hook splits a page across the boundary and loses rows

Probe 5 · native backend tier · fixture composition.

## Intent

- outcome: On this release the hook splits the page and does not show the rows between the capped page's continue cursor and its end cursor. (Probe 5, F15, S4)

```gwt
Given a component list of {rows: 30} rows read through the parent by the usePaginatedQuery hook of convex-helpers/react, in pages of {pageSize: 10} with maximumRowsRead {maximumRowsRead: 20}
And the hook has loaded every page
When rows are inserted inside the first page's range until it holds {rowsInRange: 25} rows
Then the hook's results hold {rowsShown: 40} rows, in order and each once
And {rowsMissing: 5} rows of the list are not shown, the ones between the capped page's continue cursor and its end cursor
```

## Verification — executable

- Runs in the native backend tier on the fixture composition, with a DOM environment for the hook; every test owns its disposable backend.
- The test shows through a second subscription that the capped page came back `SplitRequired`, so a pass cannot come from a page that never needed the split.
- The hook is the `usePaginatedQuery` of `convex-helpers/react`, whose pages carry an end cursor. Convex's own `usePaginatedQuery` is not the subject.
- The values are observed, not expected: the expectation written before the first run was 45 rows shown and none missing. The run on release `precompiled-2026-09-28-5c7cb5b` with `convex-helpers` 0.1.124 showed 40.
- The cause is read in the helper's source and not probed further: a capped page returns its `continueCursor` at the last row it read, and the hook ends the second half of the split at that cursor and not at the page's end cursor.
