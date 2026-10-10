---
id: spec:decisions.d09-rebuild-online-by-default
kind: decision
altitude: feature
readiness: defined
relations:
  refines: spec:platform.transactional-domain-platform
  dependsOn: spec:decisions.d08-read-models-in-command
  constrainedBy:
    - spec:facts.f01-serializable-mutations-under-occ
    - spec:facts.f17-migrations-fits-generation-backfill
---
# Rebuild online by default, pause writes only for history-dependent views

Provenance: changed by the review; v0.1 made a scoped write pause the default and online rebuild an advanced layer. Feature · Traces: D9, Law 10, F1, F17, Probe 6, Sc L2-5, Sc L2-6.

Because read models update inside commands, rebuilding a per-entity or current-state read model online is safe on Convex. A new generation is registered as building, live commands write it too, backfill batches fill it under optimistic concurrency, and one write switches the active generation. The write pause stays for read models that depend on history across several streams, where rebuild needs a consistent cut; it costs more, so it is the exception. Rebuild never runs commands or external effects. The decision depends on D8 because the online path is safe only when live commands maintain the read model themselves.

## Intent

- problem: A per-entity read model is rebuilt while commands run and the rebuild is interrupted and resumed; a cross-stream history view is rebuilt under a write pause and interrupted; a live command's incremental update on a row the backfill has not written yet builds a partial row, and a backfill batch can overwrite newer data (Sc L2-5, Sc L2-6)
- outcome: A per-entity or current-state read model rebuilds online as a new generation while commands run, with no stale overwrite, no missing entity and no side effects; a history-dependent view rebuilds under a write pause with resume and abort (D9)
- value: The common rebuild costs no downtime, and the write pause is paid only where a consistent cut is needed (D9)
- risk: The standing cost is a generation registry, a generation on every rebuildable row, a per-entity marker for counts and sums, a progress row per generation, and for the write pause a maintenance gate every writer reads (D9)
- assumption: Mutations are serializable under optimistic concurrency, so each backfill batch is ordered against live commands (F1)
- assumption: A self-scheduled internal mutation of the parent that keeps its cursor on a progress row gives resumable batching over a context's enumeration and a parent table alike; F17 records why `@convex-dev/migrations` is not used for it (F17)

### Open questions

- [non-blocking] Probe 6 ran a backfill batch racing a live command and the migrations component on the native backend, with its results on F17; a hosted deployment and sustained contention are not run (Probe 6, F1, F17, D9)

## Decision

- context: The concern is rebuilding a read model without stale overwrites, missing entities or side effects while commands keep running; Convex gives optimistic concurrency that orders each batch against live commands, and the migrations component gives resumable batching (D9, F1, F17)
- alternative: Do nothing beyond Convex: a plain one-off migration that rewrites rows in place while commands run; rejected, because a live command's incremental update on a missing row builds a partial one and the backfill can overwrite newer data (D9, Sc L2-5, Decision method rule 2)
- alternative: v0.1's rule, a scoped write pause as the default for every rebuild; rejected as the default and kept for read models that depend on history across several streams (D9)
- alternative: Online rebuild by generation for per-entity and current-state read models, write pause for history-dependent views; this is the option chosen (D9)
- decision: Rebuild is online by default in four steps: register a new generation of the read model as building; live commands also write the building generation, where a command that creates a stream writes its row and a command on an existing stream updates the row only if backfill has already written it; backfill batches read or fold each source at its current stream version and write the row only if the target is missing or older; verify coverage, then switch the active generation in one write and keep the old generation for a rollback period (D9)
- rationale: Because read models update inside commands, rebuilding a per-entity or current-state read model online is safe on Convex, and optimistic concurrency orders each batch against live commands so neither overwrites newer data (D9, D8, F1)
- rationale: The write pause costs more than the online path, so it is the exception, for read models that depend on history across several streams where rebuild needs a consistent cut (D9)
- consequence: An incremental update on a missing row would build a partial one, so a command on an existing stream updates the building generation's row only if backfill has already written it (D9)
- consequence: The rebuild's resumable batching is its own self-scheduled internal mutation, and `@convex-dev/migrations` is used for nothing, because Probe 6 showed that the component walks only the tables of the component it is defined in, drives a context's rows only through a parent internal mutation written by hand against a contract its README does not document, keeps a status apart from the generation's state, and leaves no error on its row when a batch fails past the read limit (D9, F17)
- consequence: Counts and sums need a per-entity marker so live commands and backfill never count one entity twice, which is still transactional (D9)
- consequence: Under the write pause every writer in the scope reads a maintenance gate, background writers are fenced or drained, and an operator can resume or abort (D9, Sc L2-6)
- consequence: Rebuild never runs commands or external effects (D9, Law 10)
- consequence: The standing cost is a generation registry and gate, a generation on every rebuildable row, markers for counts, a progress row per generation that is the one checkpoint, and operator duties for switch, rollback, resume and abort (D9)
