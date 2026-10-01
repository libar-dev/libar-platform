---
id: spec:laws.law02-state-and-events-commit-together
kind: rule
altitude: feature
readiness: defined
relations:
  refines: spec:platform.transactional-domain-platform
---
# State and its required events commit together

Law 2 · Detail: verbatim · Traces: Law 2; detailed by D1, D2, D3.

The twelve laws of v0.1, one reworded, are the review surface; the decisions give the detail. The one mutation per business operation gives the transaction; the context API gives the coupling, because the rule that state never changes without its events is enforced inside the context rather than trusted to parent code. The three injection points of the Layer 1 failure scenario test this law directly. Component Specs that cite this law point `constrainedBy` at it, so the graph answers which designs it bounds.

## Intent

- outcome: A context's current state never changes without the events that explain it, and an unexpected failure leaves neither (Law 2)
- value: Rebuild from events equals saved state by construction, and a partial write after a failure cannot exist (Law 2, D1, D2, D3)

## Rule

- State and its required events commit together. An unexpected failure rolls back the whole command. (Law 2)
