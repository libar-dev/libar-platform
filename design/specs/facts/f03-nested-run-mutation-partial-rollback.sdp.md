---
id: spec:facts.f03-nested-run-mutation-partial-rollback
kind: constraint
altitude: story
readiness: defined
relations:
  refines: spec:facts.fact-ledger
---
# A nested runMutation gives partial rollback

F3 · Status: rechecked · Doc status: Documented, S10, rechecked 2026-09-29 · Decisions: D7, D13.

The best-practices page says that if you want partial rollback on an error you will want `ctx.runMutation` instead of a plain TypeScript function. A catch around an ordinary helper does not undo the helper's writes. The design uses the nested form in exactly two places: the worker wrapper that records an attempt after the body fails, and a refusal that must stay on record.

## Intent

- outcome: Record that `ctx.runMutation` inside a mutation gives partial rollback; the parent can catch and continue, with its evidence status as a target, so that every design resting on it is found by its `constrainedBy` edge (F3)

## Constraints

- statement: `ctx.runMutation` inside a mutation gives partial rollback; the parent can catch and continue (F3)
- flavor: convex-fact
- target: evidence.status:rechecked
- measurableBy: S10 https://docs.convex.dev/understanding/best-practices; doc status Documented, S10, rechecked 2026-09-29; Probe 2 exercises the error path across the same boundary (F3, D7, D13)
