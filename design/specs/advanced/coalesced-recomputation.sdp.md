---
id: spec:advanced.coalesced-recomputation
kind: behavior
altitude: story
readiness: scoped
relations:
  refines: spec:advanced.trigger-table
  constrainedBy:
    - spec:laws.law09-no-invariant-on-late-read-model
    - spec:facts.f01-serializable-mutations-under-occ
    - spec:laws.law10-replay-never-runs-commands-or-effects
---
# Coalesced recomputation of a view

Layer 6 · Detail: deferred until recomputing a nonessential view per command costs too much and only the latest state matters · Traces: D18, D8, D9, Law 9, F1, Sc L6-1.

A command marks a scoped view key dirty in its own transaction, and several changes can share one pending recompute. A recompute reads authoritative state, updates the view and clears only the work it covered; optimistic concurrency keeps a newer mark from being cleared. The view shows its staleness, no command decides from it, and it cannot serve a view that needs every event.

## Intent

- actor: A command that dirties a view key; the recompute that serves the latest state (D18)
- problem: Recomputing a nonessential view per command costs too much, and a source change during a recompute could be lost if the recompute cleared a mark it did not cover (D18, Sc L6-1)
- outcome: Several changes share one recompute, a newer mark is never cleared by an older recompute, and the view shows its staleness (D18)
- value: A nonessential view costs one dirty mark per command instead of a recompute per command (D18)
- risk: The view is late by design, so no invariant may depend on it (Law 9)

### Open questions

- [blocking] The dirty-mark table, the recompute scheduling and the staleness field are deferred to the build on this trigger (D18, Decision method rule 4)

## Behavior

- rule: [deferred] The build writes the dirty-mark table, the recompute function and the staleness field after the activation record (D18, Decision method rule 4)
- rule: The command marks a scoped view key dirty in its own transaction, and several changes can share one pending recompute (D18)
- rule: A recompute reads authoritative state, updates the view and clears only the work it covered; optimistic concurrency keeps a newer mark from being cleared (D18, F1)
- rule: If the computation must leave the transaction, it captures every source version and membership it depends on and validates them before publishing (D18)
- rule: The view shows its staleness, no command decides from it, and it cannot serve a view that needs every event (D18, Law 9)
- rule: The recompute never runs commands or external effects (D18, Law 10)

## Design

- deferred: the dirty-mark table with its scoped key, the recompute scheduling, the staleness field on the view and the validation of captured versions, written by the build after the activation record (D18)
