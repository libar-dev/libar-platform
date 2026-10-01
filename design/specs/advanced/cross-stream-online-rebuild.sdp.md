---
id: spec:advanced.cross-stream-online-rebuild
kind: behavior
altitude: story
readiness: scoped
relations:
  refines: spec:advanced.trigger-table
  dependsOn: spec:application.rebuild
  constrainedBy:
    - spec:laws.law10-replay-never-runs-commands-or-effects
    - spec:facts.f01-serializable-mutations-under-occ
---
# Online rebuild of cross-stream history views

Layer 6 · Detail: deferred until the write pause is unacceptable for a cross-stream history view · Traces: D18, D9, Law 10, F1, Sc L6-4.

The rebuild class is declared first: per entity, bounded current state, or history across streams. The first two rebuild online under `spec:application.rebuild`. History across streams needs a dependency protocol or a real consistent source cut, because a vector of per-stream positions is bookkeeping and does not prove a consistent cut. Until that exists, these views rebuild under the write pause.

## Intent

- actor: A cross-stream history view whose write pause has become unacceptable (D18)
- problem: A cross-stream backfill races live writes and new subjects, then cuts over; a position vector cannot prove that the cut was consistent (Sc L6-4, D18)
- outcome: A cross-stream history view rebuilds online only with a dependency protocol or a consistent source cut, with no overwrite, no missing subject and no side-effect replay (D18)
- value: The write pause stays the default and is removed only where its cost is proven (D18, D9)
- risk: The dependency protocol is unwritten; an activation without it would trade the write pause for an unprovable cut (D18)

### Open questions

- [non-blocking] The dependency protocol or the consistent source cut, and the online cutover for this class, are deferred to the build on this trigger (D18, Decision method rule 4)

## Behavior

- rule: [deferred] The build writes the dependency protocol or the consistent source cut and the online cutover for cross-stream history views after the activation record (D18, Decision method rule 4)
- rule: Declare the rebuild class first: per entity, bounded current state, or history across streams (D18)
- rule: A vector of per-stream positions is bookkeeping and does not prove a consistent cut (D18)
- rule: History across streams needs a dependency protocol or a real consistent source cut; until that exists, these views rebuild under the write pause (D18, D9)
- rule: A backfill that races live writes never overwrites newer data, never misses a subject created during the backfill, and never replays a side effect (D18, F1, Law 10)
- rule: Cutover switches the active generation in one write and keeps the old generation for a rollback period, as the online rebuild already does (D18, D9)

## Design

- deferred: the dependency protocol or consistent cut, the generation handling for this class and the cutover verification, written by the build after the activation record (D18)
