---
id: spec:laws.law05-authorization-before-execution-and-disclosure
kind: rule
altitude: feature
readiness: defined
relations:
  refines: spec:platform.transactional-domain-platform
---
# Authorization comes before execution and disclosure

Law 5 · Detail: verbatim · Traces: Law 5; detailed by D6, D11, D17.

The twelve laws of v0.1, one reworded, are the review surface; the decisions give the detail. Two checks follow from the law: the parent authorizes before it calls any context, and the receipt path re-authorizes before it discloses a stored outcome. Grants are authoritative data read in the transaction, never a read model that updates later. Component Specs that cite this law point `constrainedBy` at it, so the graph answers which designs it bounds.

## Intent

- outcome: No command executes and no stored outcome is returned before the caller's authority is checked in the same transaction (Law 5)
- value: A revoked caller cannot learn a stored result by retrying, and an agent cannot bypass policy by presenting a well-formed command (Law 5, D6, D11, D17)

## Rule

- Authorization comes before execution and before any stored outcome is disclosed. (Law 5)
