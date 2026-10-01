---
id: spec:laws.law08-durable-capability-ships-operations
kind: rule
altitude: feature
readiness: defined
relations:
  refines: spec:platform.transactional-domain-platform
---
# Every durable capability ships with its operations

Law 8 · Detail: verbatim · Traces: Law 8; detailed by D13, D19.

The twelve laws of v0.1, one reworded, are the review surface; the decisions give the detail. The obligation module ships scoped inspect, retry, reconcile, cancel and abandon operations, a sweeper, a retention policy and handler versioning. Operations travel with the capability; they are not a later layer. Component Specs that cite this law point `constrainedBy` at it, so the graph answers which designs it bounds.

## Intent

- outcome: No durable capability is installed without the recovery, inspection, retention and compatibility behavior that keeps it operable (Law 8)
- value: Adding an effect costs its policy and handler while the module supplies dispatch, recovery, inspection and retention, which is what makes the durable profile done (Law 8, D13, D19)

## Rule

- Every installed durable capability ships with recovery, inspection, retention and compatibility behavior. (Law 8)
