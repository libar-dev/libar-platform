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

Probe 5 · native tier · fixture composition.

## Intent

- outcome: The parent relays the split, and the pages on either side of it leave no gap. (Probe 5, F15, S4)

```gwt
Given a subscribed page of a component list, bounded by an end cursor and read through the parent with maximumRowsRead {maximumRowsRead: 20}
When rows are inserted inside the page's range until it holds {rowsInRange: 25} rows
Then the page the parent relays carries pageStatus {pageStatus: "SplitRequired"} and a split cursor
And the two pages on either side of the split cursor together hold {rowsHeld: 25} rows, every row of the range once and in order
```

## Verification — executable

- Runs in the native tier on the fixture composition; every test owns its disposable backend.
- This example reads the relayed pages directly. Whether the client hook acts on the split is the next example's question.
