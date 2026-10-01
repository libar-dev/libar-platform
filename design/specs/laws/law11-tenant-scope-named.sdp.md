---
id: spec:laws.law11-tenant-scope-named
kind: rule
altitude: feature
readiness: defined
relations:
  refines: spec:platform.transactional-domain-platform
---
# Every command and query names its tenant scope

Law 11 · Detail: verbatim · Traces: Law 11; detailed by D11.

The twelve laws of v0.1, one reworded, are the review surface; the decisions give the detail. The law reaches every function on tenant data and every index on it: the tenant leads the arguments and leads the index fields. Components receive the scope as an argument because they have no ambient auth. Component Specs that cite this law point `constrainedBy` at it, so the graph answers which designs it bounds.

## Intent

- outcome: Every command and query on tenant data carries its tenant explicitly, even in a single-tenant deployment (Law 11)
- value: Tenancy never has to be retrofitted, two tenants cannot collide on a request key or a local ID, and an absent tenant is never read as a wildcard (Law 11, D11)

## Rule

- Every command and query on tenant data names its tenant scope. (Law 11)
