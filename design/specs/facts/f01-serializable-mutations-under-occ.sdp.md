---
id: spec:facts.f01-serializable-mutations-under-occ
kind: constraint
altitude: story
readiness: defined
relations:
  refines: spec:facts.fact-ledger
---
# Mutations are serializable under optimistic concurrency

F1 · Status: documented · Doc status: Documented, S1 · Decisions: D1, D9.

Convex runs every mutation as a serializable transaction and resolves conflicts by retrying the loser under optimistic concurrency control. The design rests on it twice: one mutation per business operation needs no lock protocol beside it, and a rebuild backfill can run online because each batch is ordered against live commands by the same mechanism. An engine retry caused by a conflict is invisible to the caller and is distinct from the logical version conflict the persistence adapter reports.

Probe 6, on the native backend `precompiled-2026-09-28-5c7cb5b` with `convex` 1.46.0, `convex-helpers` 0.1.124 and `@convex-dev/migrations` 0.3.6, races a backfill batch driven by the migrations component against a live command on one read-model row, with their executions overlapping: in every trial the row ends at the source's newest stream version, and the loser of a conflict is retried by the engine. F1 stays documented.

## Intent

- outcome: Record that mutations are serializable under optimistic concurrency, with its evidence status as a target, so that every design resting on it is found by its `constrainedBy` edge (F1)

## Constraints

- statement: Mutations are serializable under optimistic concurrency (F1)
- flavor: convex-fact
- target: evidence.status:documented
- measurableBy: S1 https://docs.convex.dev/database/advanced/occ; doc status Documented, S1; exercised by Probe 6, a backfill batch racing a live command (F1, D1, D9)
