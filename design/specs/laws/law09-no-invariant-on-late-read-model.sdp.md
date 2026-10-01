---
id: spec:laws.law09-no-invariant-on-late-read-model
kind: rule
altitude: feature
readiness: defined
relations:
  refines: spec:platform.transactional-domain-platform
---
# No invariant depends on a late read model

Law 9 · Detail: verbatim · Traces: Law 9; detailed by D8, D9, D10.

The twelve laws of v0.1, one reworded, are the review surface; the decisions give the detail. Read models update inside the command, so the essential ones are never late. A view that is recomputed later, such as a coalesced view in Layer 6, shows its staleness and no command decides from it. Component Specs that cite this law point `constrainedBy` at it, so the graph answers which designs it bounds.

## Intent

- outcome: Every invariant a command decides on reads authoritative state or a read model updated in the same transaction (Law 9)
- value: The core path needs no projection job to be correct, and a rebuild of a read model cannot change what a command decides (Law 9, D8, D9, D10)

## Rule

- No invariant depends on a read model that updates later. (Law 9)
