---
id: spec:facts.f17-migrations-fits-generation-backfill.probe-6-operator-cancel
kind: example
altitude: story
readiness: defined
relations:
  refines: spec:facts.f17-migrations-fits-generation-backfill
  verifies: spec:facts.f17-migrations-fits-generation-backfill
---
# Probe 6: an operator cancels a committed successor

Probe 6 · native backend tier · fixture composition.

Native backend `precompiled-2026-09-28-5c7cb5b`, `convex` 1.46.0, `convex-helpers` 0.1.124 and `@convex-dev/migrations` 0.3.6.

## Intent

- outcome: Cancellation in a separate transaction stops a pending successor, preserves committed progress and permits resume for a parent table and a context enumeration. (Probe 6, F17)

```gwt
Given {rows: 24} depot documents and parent migrations capped at {batch: 2} source rows
When an operator observes each committed successor pending and cancels it in a separate mutation
Then both drivers report {state: "canceled"}, commit {laterBatches: 0} later batches and resume to {copies: 1} visit per source
```

## Verification — executable

- The bound values are expectations written before the first native run on the pinned releases.
- The cancel transaction must follow an admin read of a committed pending successor; a missing pending boundary or a migration already finished fails the example.
- The test compares the component row, scheduler state and parent rows after cancel and after a quiet interval, and compares the context generation cursor with the component cursor. Progress before cancel is a recorded size.
- Hosted scheduling, sustained contention and timeout exhaustion are not answered by this local example.
