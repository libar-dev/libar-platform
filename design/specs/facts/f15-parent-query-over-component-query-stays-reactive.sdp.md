---
id: spec:facts.f15-parent-query-over-component-query-stays-reactive
kind: constraint
altitude: story
readiness: scoped
relations:
  refines: spec:facts.fact-ledger
---
# A parent query over a component query stays reactive

F15 · Status: assumed · Doc status: Assumed · Decisions: D8.

The read-need table's default for one entity's detail is an authorized component query returning a DTO, and a small cross-context view is a parent query over bounded component reads. Both assume that a subscription to the parent query re-runs when the component's tables change. Nothing read so far states or denies it, so the fact is assumed and every Spec that rests on it names Probe 5. One neighbouring fact is documented rather than assumed: the components page, S4, states that the built-in `.paginate()` does not work in a component because of how Convex tracks reactive pagination, recommends `paginator` from `convex-helpers` inside a component and the `usePaginatedQuery` hook from `convex-helpers` on the client; the corpus designs its component lists that way, and Probe 5's pagination half is therefore narrowed to whether the helper's page, which does not subscribe to its end cursor, stays contiguous across the boundary under live writes.

## Intent

- outcome: Record that a parent query calling a component query stays reactive, with its evidence status as a target, so that every design resting on it is found by its `constrainedBy` edge (F15)
- assumption: The fact is assumed, not documented; every Spec that rests on it names this assumption and the probe plan carries the probe (F15, Probe 5)

### Open questions

- [blocking] Probe 5 pending: until it runs on a native backend this fact stays assumed, and the decisions it serves (D8) rest on the author's reading of the pages (F15, Probe 5)

## Constraints

- statement: A parent query calling a component query stays reactive (F15)
- flavor: convex-fact
- target: evidence.status:assumed
- measurableBy: no page states it; S2 and S5 describe reactivity and component isolation separately; doc status Assumed; Probe 5, which also shows whether a component list paginated with the `paginator` helper, the documented replacement for the built-in `.paginate()` that S4 says does not work in a component, stays contiguous across the boundary (F15, S4, D8)
