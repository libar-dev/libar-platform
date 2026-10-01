---
id: spec:laws.law01-sanctioned-writes-only
kind: rule
altitude: feature
readiness: defined
relations:
  refines: spec:platform.transactional-domain-platform
---
# Business writes go only through sanctioned operations

Law 1 · Detail: verbatim · Traces: Law 1; detailed by D2, D10, D17.

The twelve laws of v0.1, one reworded, are the review surface; the decisions give the detail. The context API is the enforcement point: the context owns its tables, the parent reaches them only through the component's sanctioned mutations, and an agent cannot write state or journals at all. The general patch endpoint that a generic admin surface would offer is refused by this law, not by a lint rule. Component Specs that cite this law point `constrainedBy` at it, so the graph answers which designs it bounds.

## Intent

- outcome: No business write reaches a context's tables except through an operation the context sanctions, and no generic patch endpoint exists (Law 1)
- value: Trusted parent code, workers and agents cannot change business state by a path the context did not design, so every write has a decider and a journal entry behind it (Law 1, D2, D10, D17)

## Rule

- Business writes go only through a context's sanctioned operations. No generic patch endpoint exists. (Law 1)
