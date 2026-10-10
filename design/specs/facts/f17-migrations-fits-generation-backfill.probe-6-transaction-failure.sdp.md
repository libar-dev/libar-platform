---
id: spec:facts.f17-migrations-fits-generation-backfill.probe-6-transaction-failure
kind: example
altitude: story
readiness: defined
relations:
  refines: spec:facts.f17-migrations-fits-generation-backfill
  verifies: spec:facts.f17-migrations-fits-generation-backfill
---
# Probe 6: a transaction failure preserves the saved cursor

Probe 6 · native backend tier · fixture composition.

Native backend `precompiled-2026-09-28-5c7cb5b`, `convex` 1.46.0, `convex-helpers` 0.1.124 and `@convex-dev/migrations` 0.3.6.

## Intent

- outcome: A scheduled batch that exhausts the read budget rolls back its parent rows, generation checkpoint and component writes; its failed scheduler entry permits resume from the preceding cursor. (Probe 6, F17)

```gwt
Given {rows: 6} depot documents, batches of {batch: 2} and {blobs: 18} payloads of {kib: 960} KiB
When the scheduled context batch exceeds the read budget after attempting its rows and checkpoint
Then status is {state: "failed"}, the component stores {errors: 0} errors, {committed: 2} rows remain and resume visits every source {copies: 1} time
```

## Verification — executable

- The bound values are expectations written before the first native run on the pinned releases.
- The payload read occurs after the first committed batch and after attempted row and checkpoint writes in its successor. The scheduler must report a failed execution with the bytes-read error; a caught callback error alone does not reach this boundary.
- The test reads the component migration and scheduled function through admin access, compares both cursors and parent rows, then removes the fault and resumes without a cursor override.
- Hosted scheduling, sustained contention and timeout exhaustion are not answered by this local example.
