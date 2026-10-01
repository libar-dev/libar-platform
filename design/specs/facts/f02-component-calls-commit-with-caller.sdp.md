---
id: spec:facts.f02-component-calls-commit-with-caller
kind: constraint
altitude: story
readiness: defined
relations:
  refines: spec:facts.fact-ledger
---
# Component calls commit or roll back with the calling mutation

F2 · Status: documented · Doc status: Documented, S2 · Decisions: D1, D2.

The components page states that each mutation call to a component is a sub-transaction isolated from other calls, that a thrown exception always rolls back the component's sub-transaction, and that data changes commit transactionally across calls to components. The lead read the page again on 2026-09-30 and the plan's section 9 quotes it. This is what lets a use case call two contexts and commit or roll back both with its own writes.

## Intent

- outcome: Record that component calls commit or roll back with the calling mutation, with its evidence status as a target, so that every design resting on it is found by its `constrainedBy` edge (F2)

## Constraints

- statement: Component calls commit or roll back with the calling mutation (F2)
- flavor: convex-fact
- target: evidence.status:documented
- measurableBy: S2 https://docs.convex.dev/components/understanding; doc status Documented, S2; no probe assigned; Probe 4 showed that the transaction limits are shared across the boundary (F2, D1, D2)
