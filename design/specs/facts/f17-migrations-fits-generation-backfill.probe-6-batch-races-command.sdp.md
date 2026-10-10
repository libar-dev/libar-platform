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

- outcome: A batch the component drives and a live command that write one read-model row are ordered by optimistic concurrency, so neither overwrites newer data. (Probe 6, F17, F1)

```gwt
Given a document source at stream version 1 with its building summary missing
When a component-driven backfill races a live depot amendment in {trials: 6} trials
Then both generations end at stream version {version: 2} with the amended title
```

## Verification — executable

- The bound values are expectations written before the first native run on the pinned releases.
- Each test owns its disposable backend; failure to reach the named boundary fails the example.
- The building generation's row is missing when the race starts, so the batch must insert it: the command skips a building row that does not exist yet and updates it when the batch has written it, as the rebuild's rule says, and the batch reads the newest source when it commits second.
- The test requires the batch's and the command's executions to overlap in the backend's function log, and records each trial's conflicts and engine retries as sizes. On the pinned releases each trial recorded zero or one conflict, on the context's `streams` table or the parent's `documentSummaries` table.
- Two runs without overlap, batch first and then command first, end at the same stream version 2.
- What a hosted deployment does under sustained contention is not answered by this local example.
