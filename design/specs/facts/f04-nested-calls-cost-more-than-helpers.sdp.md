---
id: spec:facts.f04-nested-calls-cost-more-than-helpers
kind: constraint
altitude: story
readiness: defined
relations:
  refines: spec:facts.fact-ledger
---
# Nested calls cost more than helper calls

F4 · Status: rechecked · Doc status: Documented, S10, rechecked 2026-09-29; size unknown · Decisions: D2, D7.

The page states that nested calls in a mutation have extra overhead compared to plain TypeScript functions, and that components require `ctx.runQuery` or `ctx.runMutation`. The size of the overhead is not stated anywhere, which is why Layer 1's choice to put every context read behind a component call is measured by the first experiment before Layer 3 is designed. If the measured cost breaks the read budgets, OQ1's answer changes the context component's shape. Probe 3 gave a first reading on a native backend on 2026-10-01, release `precompiled-2026-09-28-5c7cb5b` with `convex` 1.46.0, on one machine: 50 reads of one document took about 3 ms through a helper, about 70 ms through nested queries and about 110 to 125 ms through component queries, from a parent mutation and from a parent query alike, which is about 2 ms more per component call than per helper call. A run earlier the same day read about half of that, so the size is an order of magnitude and not a number to budget with. It is a local backend's time, not a hosted deployment's, and function-call quota was not measured, because a local backend has none.

## Intent

- outcome: Record that `ctx.runQuery` and `ctx.runMutation` inside a mutation cost more than a helper call, with its evidence status as a target, so that every design resting on it is found by its `constrainedBy` edge (F4)

## Constraints

- statement: `ctx.runQuery` and `ctx.runMutation` inside a mutation cost more than a helper call (F4)
- flavor: convex-fact
- target: evidence.status:rechecked
- measurableBy: S10 https://docs.convex.dev/understanding/best-practices; doc status Documented, S10, rechecked 2026-09-29; size unknown in the docs; Probe 3 measured latency on a local backend on 2026-10-01 and leaves function-call quota to a hosted deployment (F4, D2, D7)
