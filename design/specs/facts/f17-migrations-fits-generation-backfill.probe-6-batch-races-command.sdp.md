---
id: spec:facts.f17-migrations-fits-generation-backfill.probe-6-batch-races-command
kind: example
altitude: story
readiness: defined
relations:
  refines: spec:facts.f17-migrations-fits-generation-backfill
  verifies:
    - spec:facts.f17-migrations-fits-generation-backfill
    - spec:facts.f01-serializable-mutations-under-occ
---
# Probe 6: a migration batch races a live command

Probe 6 · native backend tier · fixture composition.

Native backend `precompiled-2026-09-28-5c7cb5b`, `convex` 1.46.0, `convex-helpers` 0.1.124 and `@convex-dev/migrations` 0.3.6.

## Intent

- outcome: The race reaches overlapping mutation calls; conflict and retry counts are recorded as sizes. Sequential checks cover each commit order. Hosted contention and throughput are not answered. (Probe 6, F17)

```gwt
Given a document source at stream version 1 with its building summary missing
When a component-driven backfill races a live depot amendment in {trials: 6} trials
Then both generations end at stream version {version: 2} with the amended title
```

## Verification — executable

- The bound values are expectations written before the first native run on the pinned releases.
- Each test owns its disposable backend; failure to reach the named boundary fails the example.
- The native backend evidence on the pinned releases records five conflict entries and five requested retries across six trials; both commit orders occur, every target finishes at version 2, and overlap is checked from execution timestamps. These counts are recorded sizes, not asserted limits.
- The missing building row forces the racing batch to insert a summary; the command updates that row if the batch commits first and skips it if the command commits first, after which the batch reads the newest source.
- The missing-row race records six conflicts and six requested retries in its first native evidence; separate serial checks bind both batch-first and command-first order to the same final stream version 2.
