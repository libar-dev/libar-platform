---
id: spec:laws.law12-one-retry-owner
kind: rule
altitude: feature
readiness: defined
relations:
  refines: spec:platform.transactional-domain-platform
---
# Each retried piece of work has one retry owner

Law 12 · Detail: verbatim · Traces: Law 12; detailed by D15.

The twelve laws of v0.1, one reworded, are the review surface; the decisions give the detail. The obligation module is the owner by default. Workpool runs with its own retries off or takes ownership deliberately, a workflow waits on an obligation's result and never retries the same effect, and Convex's internal transaction retries are not business attempts. Component Specs that cite this law point `constrainedBy` at it, so the graph answers which designs it bounds.

## Intent

- outcome: One module owns the retry policy of a piece of work, and no transport, pool or workflow layer retries it on its own (Law 12)
- value: An attempt count means what it says, a paid provider call is not repeated by an engine that did not know it was paid, and the exhaustion path has one owner to escalate to (Law 12, D15)

## Rule

- Each retried piece of work has one retry owner. Transport and workflow retries never multiply it. (Law 12)
