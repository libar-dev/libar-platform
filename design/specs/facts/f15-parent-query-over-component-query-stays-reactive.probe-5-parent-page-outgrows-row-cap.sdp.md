---
id: spec:facts.f15-parent-query-over-component-query-stays-reactive.probe-5-parent-page-outgrows-row-cap
kind: example
altitude: story
readiness: defined
relations:
  refines: spec:facts.f15-parent-query-over-component-query-stays-reactive
  verifies: spec:facts.f15-parent-query-over-component-query-stays-reactive
---
# Probe 5: a pinned page of a parent table outgrows its row cap and comes back whole

Probe 5 · native backend tier · fixture composition.

## Intent

- outcome: The built-in `.paginate()` treats the row cap as advice once a page has an end cursor: the page comes back whole and marked `SplitRecommended`, and its two halves hold every row. (Probe 5, F15, S4, F13)

```gwt
Given a parent table of {rows: 30} rows and a subscribed first page of {pageSize: 10}, read by the built-in paginate with maximumRowsRead {maximumRowsRead: 20}
When rows are inserted inside the page's range until it holds {rowsInRange: 25} rows
Then the subscribed page holds {rowsHeld: 25} rows and carries pageStatus {pageStatus: "SplitRecommended"}
And the page from the start to the split cursor and the page from the split cursor to the first page's end cursor together hold {halvesHeld: 25} rows, every row once and in order
```

## Verification — executable

- Runs in the native backend tier on the fixture composition; every test owns its disposable backend.
- The table is a table of the fixture composition's parent, read by a parent query with no component call, so the subject is the built-in call that a read-model list makes.
- The test subscribes to the first page with the `endCursor` its first read returned, which is how a client pins a page.
