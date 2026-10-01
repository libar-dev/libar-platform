---
id: spec:laws.law06-technical-failure-never-a-rejection
kind: rule
altitude: feature
readiness: defined
relations:
  refines: spec:platform.transactional-domain-platform
---
# A technical failure is never stored as a rejection

Law 6 · Detail: verbatim · Traces: Law 6; detailed by D4, D7.

The twelve laws of v0.1, one reworded, are the review surface; the decisions give the detail. The four-outcome model gives the law its shape: applied and business failure commit, rejection commits nothing, technical failure rolls back everything. Keeping a refused request as a fact is a business policy chosen per command, never a side effect of error handling. Component Specs that cite this law point `constrainedBy` at it, so the graph answers which designs it bounds.

## Intent

- outcome: A technical failure rolls back and stores nothing, and a transient refusal is a retryable error, so neither can be mistaken for a business rejection (Law 6)
- value: A caller whose request hit a limit or an unexpected throw can retry the same intent and succeed, and history holds no refusal that the business never made (Law 6, D4, D7)

## Rule

- A technical or transient failure is never stored as a business rejection. (Law 6)
