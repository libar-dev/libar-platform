---
id: spec:facts.f15-parent-query-over-component-query-stays-reactive.probe-5-split-required-relayed
kind: example
altitude: story
readiness: defined
relations:
  refines: spec:facts.f15-parent-query-over-component-query-stays-reactive
  verifies: spec:facts.f15-parent-query-over-component-query-stays-reactive
---
# Probe 5: a page that outgrows its read cap comes back through the parent as a split

Probe 5 · native backend tier · fixture composition.

## Intent

- outcome: The parent relays the split, and the pages on either side of it leave no gap. (Probe 5, F15, S4)

```gwt
Given a component list of {rows: 30} rows and a subscribed page of {pageSize: 10}, bounded by its end cursor and read through the parent with maximumRowsRead {maximumRowsRead: 20}
When rows are inserted inside the page's range until it holds {rowsInRange: 25} rows
Then the page the parent relays carries pageStatus {pageStatus: "SplitRequired"} and a split cursor
And the page from the start to the split cursor and the page from the split cursor to the first page's end cursor together hold {rowsHeld: 25} rows, every row of the range once and in order
```

## Verification — executable

- Runs in the native backend tier on the fixture composition; every test owns its disposable backend.
- This example reads the relayed pages directly. Whether the client hook acts on the split is the next example's question.
- The second half ends at the end cursor the page was subscribed with. The capped page's own `continueCursor` sits at the last row it read, and a second half that ends there holds 20 rows and leaves the rest of the range out.
- On the first run of this example, on 2026-10-01 on release `precompiled-2026-09-28-5c7cb5b`, the bound values held.
