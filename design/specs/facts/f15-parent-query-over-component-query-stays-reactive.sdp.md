---
id: spec:facts.f15-parent-query-over-component-query-stays-reactive
kind: constraint
altitude: story
readiness: defined
relations:
  refines: spec:facts.fact-ledger
---
# A parent query over a component query stays reactive

F15 · Status: probed · Doc status: Assumed · Decisions: D8.

The read-need table's default for one entity's detail is an authorized component query returning a DTO, and a small cross-context view is a parent query over bounded component reads. Both rest on a subscription to the parent query re-running when the component's tables change. The doc lists this as assumed. Two things settle it: the page on using components states that "queries into components are reactive by default", and Probe 5 showed a subscription to a parent query that reads no table of its own receive a value changed inside a component, on a native backend, release `precompiled-2026-09-28-5c7cb5b` with `convex` 1.46.0. Pagination across the boundary is a neighbouring matter that Probe 5 also ran. The components page, S4, states that the built-in `.paginate()` does not work in a component, and recommends `paginator` from `convex-helpers` inside a component and the `usePaginatedQuery` hook from `convex-helpers` on the client. Probe 5 showed the built-in call throw inside a component. The corpus takes `paginator` and does not take the hook: a client pages by an explicit cursor pair. On the same release with `convex-helpers` 0.1.124, pages pinned by their end cursors stayed contiguous under an insert and a delete, a page capped by `maximumRowsRead` came back through the parent as `SplitRequired`, and its two halves, read to the page's end cursor, held every row. The hook then showed 40 of 45 rows: it did not load the rows between the capped page's continue cursor and its end cursor. A first page read with a row cap of twice its item cap carried no split status, and one read with the cap equal to its item cap came back `SplitRequired`. On a parent table, the built-in call returned a pinned page of 25 rows whole, marked `SplitRecommended`, under a row cap of 20.

## Intent

- outcome: Record that a parent query calling a component query stays reactive, with its evidence status as a target, so that every design resting on it is found by its `constrainedBy` edge (F15)
- assumption: The fact is documented and was probed on one pinned backend release; the pagination results are observations of one release of `convex-helpers` and are rerun when either pin moves (F15, Probe 5)

## Constraints

- statement: A parent query calling a component query stays reactive (F15)
- flavor: convex-fact
- target: evidence.status:probed
- measurableBy: https://docs.convex.dev/components/using states that queries into components are reactive by default; doc status Assumed; Probe 5, run on a native backend, release `precompiled-2026-09-28-5c7cb5b` with `convex` 1.46.0, which also shows how a component list paginated with the `paginator` helper, the documented replacement for the built-in `.paginate()` that S4 says does not work in a component, behaves across the boundary (F15, S4, D8)
