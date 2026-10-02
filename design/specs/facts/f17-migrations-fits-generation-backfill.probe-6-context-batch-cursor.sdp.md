---
id: spec:facts.f17-migrations-fits-generation-backfill.probe-6-context-batch-cursor
kind: example
altitude: story
readiness: defined
relations:
  refines: spec:facts.f17-migrations-fits-generation-backfill
  verifies: spec:facts.f17-migrations-fits-generation-backfill
---
# Probe 6: a parent batch returns a context cursor to the migrations driver

Probe 6 · native backend tier · fixture composition.

Native backend `precompiled-2026-09-28-5c7cb5b`, `convex` 1.46.0, `convex-helpers` 0.1.124 and `@convex-dev/migrations` 0.3.6.

## Intent

- outcome: A parent internal mutation pages the context list and returns its cursor, processed count and completion flag to `runOne`, without `define` or a parent source table; its generation checkpoint and the component cursor commit with its rows. (Probe 6, F17)

```gwt
Given {rows: 5} depot documents and a parent batch capped at {batch: 2} source rows
When the migrations driver cancels and resumes the context batch and a later batch throws after writing its checkpoint
Then resume writes {rows: 5} distinct summaries and both saved cursors agree at each interrupted boundary
```

## Verification — executable

- The bound values are expectations written before the first native run on the pinned releases.
- The test reads the component's migrations table and the parent's generation row through admin access, checks the saved cursors at cancel and failure, and checks that a thrown batch rolls back its row writes and generation checkpoint while the component stores the error.
- Each batch makes one context list call, returns at most its bound, and writes no parent enumeration table; component-call counts are sizes recorded in evidence.
- Hosted quotas, throughput, backup replacement and projection coverage under changing tenants are not answered by this local example.
- The pinned native backend preserves equal saved cursors at cancel and failure, rolls the failed checkpoint and row writes back, and finishes five rows in three committed batches with no parent enumeration rows; the component reports success while the generation remains building.
