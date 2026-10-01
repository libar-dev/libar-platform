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

The page states that nested calls in a mutation have extra overhead compared to plain TypeScript functions, and that components require `ctx.runQuery` or `ctx.runMutation`. The size of the overhead is not stated anywhere, which is why Layer 1's choice to put every context read behind a component call is measured by the first experiment before Layer 3 is designed. If the measured cost breaks the read budgets, OQ1's answer changes the context component's shape.

## Intent

- outcome: Record that `ctx.runQuery` and `ctx.runMutation` inside a mutation cost more than a helper call, with its evidence status as a target, so that every design resting on it is found by its `constrainedBy` edge (F4)

## Constraints

- statement: `ctx.runQuery` and `ctx.runMutation` inside a mutation cost more than a helper call (F4)
- flavor: convex-fact
- target: evidence.status:rechecked
- measurableBy: S10 https://docs.convex.dev/understanding/best-practices; doc status Documented, S10, rechecked 2026-09-29; size unknown; Probe 3 measures the size in latency and function-call quota (F4, D2, D7)
