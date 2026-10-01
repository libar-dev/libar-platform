---
id: spec:facts.f14-convex-error-survives-nested-and-component-boundary
kind: constraint
altitude: story
readiness: defined
relations:
  refines: spec:facts.fact-ledger
---
# ConvexError data survives a nested mutation and a component boundary

F14 · Status: assumed · Doc status: Assumed · Decisions: D7.

The design throws a rejection as a structured `ConvexError` from inside a context component and expects the parent, and then the client, to read the same data. The application-errors page, read on 2026-09-30, says that in mutations throwing an error prevents the transaction from committing and that the exception bubbles through `runQuery`, `runMutation` and `runAction`; it does not say the data arrives intact across a component boundary. The fact stays assumed and Probe 2 stands.

## Intent

- outcome: Record that `ConvexError` data survives a nested mutation and a component boundary, with its evidence status as a target, so that every design resting on it is found by its `constrainedBy` edge (F14)
- assumption: The fact is assumed, not documented; every Spec that rests on it names this assumption and the probe plan carries the probe (F14, Probe 2)

### Open questions

- [non-blocking] Probe 2 pending: until it runs on a native backend this fact stays assumed, and the decisions it serves (D7) rest on the author's reading of the pages (F14, Probe 2)

## Constraints

- statement: `ConvexError` data survives a nested mutation and a component boundary (F14)
- flavor: convex-fact
- target: evidence.status:assumed
- measurableBy: the application-errors page https://docs.convex.dev/functions/error-handling/application-errors states that the exception bubbles through runQuery, runMutation and runAction but not that the data survives a component boundary; doc status Assumed; Probe 2 (F14, D7)
