---
id: spec:laws.law03-events-only-source-of-state
kind: rule
altitude: feature
readiness: defined
relations:
  refines: spec:platform.transactional-domain-platform
---
# Events are the only source of the next state

Law 3 · Detail: verbatim · Traces: Law 3; detailed by D3, D5.

The twelve laws of v0.1, one reworded, are the review surface; the decisions give the detail. The law is scoped to rebuildable domains. Non-domain state and contexts that chose audit-only history explicitly are outside it, and they never advertise rebuild from events. Past business events are never invented to satisfy it. Component Specs that cite this law point `constrainedBy` at it, so the graph answers which designs it bounds.

## Intent

- outcome: In a rebuildable domain the next state is computed from events by the fold and by nothing else (Law 3)
- value: One authority for state means state and history cannot drift apart, and a rebuild from the journal is a test rather than a hope (Law 3, D3, D5)

## Rule

- In a rebuildable domain, events are the only source of the next state. (Law 3)
