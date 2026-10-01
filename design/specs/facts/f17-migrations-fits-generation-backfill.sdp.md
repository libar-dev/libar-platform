---
id: spec:facts.f17-migrations-fits-generation-backfill
kind: constraint
altitude: story
readiness: scoped
relations:
  refines: spec:facts.fact-ledger
---
# The migrations component fits a generation backfill

F17 · Status: assumed · Doc status: Assumed · Decisions: D9.

Online rebuild registers a new generation and backfills it in batches that read or fold each source at its current stream version and write the row only if the target is missing or older. The migrations component provides resumable batching, which the product page states. Whether a batch of it races a live command the way D9 needs, and whether its batch size can be set below the transaction limits, is not stated, so the fact stays assumed and Probe 6 stands.

## Intent

- outcome: Record that `@convex-dev/migrations` fits a generation backfill, with its evidence status as a target, so that every design resting on it is found by its `constrainedBy` edge (F17)
- assumption: The fact is assumed, not documented; every Spec that rests on it names this assumption and the probe plan carries the probe (F17, Probe 6)

### Open questions

- [blocking] Probe 6 pending: until it runs on a native backend this fact stays assumed, and the decisions it serves (D9) rest on the author's reading of the pages (F17, Probe 6)

## Constraints

- statement: `@convex-dev/migrations` fits a generation backfill (F17)
- flavor: convex-fact
- target: evidence.status:assumed
- measurableBy: the component's product page states batches with saved progress, resume from the last checkpoint after a timeout, and running over all documents or a subset; batch size configuration is not on the page; doc status Assumed; Probe 6 (F17, D9)
