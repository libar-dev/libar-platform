---
id: spec:facts.f17-migrations-fits-generation-backfill.probe-6-interruption-and-resume
kind: example
altitude: story
readiness: defined
relations:
  refines: spec:facts.f17-migrations-fits-generation-backfill
  verifies: spec:facts.f17-migrations-fits-generation-backfill
---
# Probe 6: a migration resumes after interruption

Probe 6 · native backend tier · fixture composition.

Native backend `precompiled-2026-09-28-5c7cb5b`, `convex` 1.46.0, `convex-helpers` 0.1.124 and `@convex-dev/migrations` 0.3.6.

## Intent

- outcome: Cancel preserves the committed cursor, resume continues it, and a thrown batch preserves its preceding cursor and rolls back its row writes. A restart on the same storage preserves pending work. A backup replacement and hosted failures are not answered. (Probe 6, F17)

```gwt
Given {rows: 12} document summaries and a migration with batch size {batch: 2}
When the migration is canceled, resumed, failed inside a batch and resumed, then the backend restarts with a batch pending
Then every source has exactly {copies: 1} target row and a successful visit after each completed migration
```

## Verification — executable

- The bound values are expectations written before the first native run on the pinned releases.
- Each test owns its disposable backend; failure to reach the named boundary fails the example.
- On the pinned native backend, the values held: cancel at two processed rows, failed batch at the same cursor with its writes absent, resume at twelve rows with one committed visit each, and a pending worker finishing after a process kill and restart on the same storage.
