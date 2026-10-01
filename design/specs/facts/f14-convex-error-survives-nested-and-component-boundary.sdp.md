---
id: spec:facts.f14-convex-error-survives-nested-and-component-boundary
kind: constraint
altitude: story
readiness: defined
relations:
  refines: spec:facts.fact-ledger
---
# ConvexError data survives a nested mutation and a component boundary

F14 · Status: probed · Doc status: Assumed · Decisions: D7.

The design throws a rejection as a structured `ConvexError` from inside a context component and expects the parent, and then the client, to read the same data. The application-errors page, read on 2026-09-30, says that in mutations throwing an error prevents the transaction from committing and that the exception bubbles through `runQuery`, `runMutation` and `runAction`; it does not say the data arrives intact across a component boundary. Probe 2 ran on a native backend on 2026-10-01, release `precompiled-2026-09-28-5c7cb5b` with `convex` 1.46.0: data holding a string, a number, a boolean, a null, an array, a nested object and a 64-bit integer reached the parent's catch and the client unchanged, through a nested mutation and through a component boundary, and the thrower's write was rolled back while the catching parent committed. An ordinary `Error` with an added property arrived without the property. The doc keeps its own status until the owner edits it.

## Intent

- outcome: Record that `ConvexError` data survives a nested mutation and a component boundary, with its evidence status as a target, so that every design resting on it is found by its `constrainedBy` edge (F14)
- assumption: The fact is probed on one pinned backend release and no page states it, so the probe is rerun when the pin moves (F14, Probe 2)

## Constraints

- statement: `ConvexError` data survives a nested mutation and a component boundary (F14)
- flavor: convex-fact
- target: evidence.status:probed
- measurableBy: the application-errors page https://docs.convex.dev/functions/error-handling/application-errors states that the exception bubbles through runQuery, runMutation and runAction but not that the data survives a component boundary; doc status Assumed; Probe 2, run on a native backend on 2026-10-01 (F14, D7)
