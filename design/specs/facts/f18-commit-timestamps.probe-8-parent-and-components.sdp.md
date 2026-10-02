---
id: spec:facts.f18-commit-timestamps.probe-8-parent-and-components
kind: example
altitude: story
readiness: defined
relations:
  refines: spec:facts.f18-commit-timestamps
  verifies: spec:facts.f18-commit-timestamps
---
# Commit timestamps in the parent and two components

Native backend tier · Fixture composition · Backend `precompiled-2026-09-28-5c7cb5b`, `convex` 1.46.0, `convex-helpers` 0.1.124.

## Intent

- outcome: Establish the observed behavior on the pinned local backend.

```gwt
Given a parent and two components that write commit timestamp placeholders
When three mutations commit in sequence and a query reads their indexed rows
Then each transaction has {shared: true} timestamp across the three tables and later transactions have larger timestamps
And returning a placeholder {returned: "resolves to a bigint"} and scheduling it is {refused: true}
```

## Verification — executable

- Every test owns a disposable native backend. Timings and call counts are recorded, not asserted, and say nothing about a hosted deployment.
- The first native run refuted the expectation that returning a mutation placeholder is refused. The returned value is the committed bigint, which this example binds as observed; the scheduling refusal held.
- The query uses the internal runtime `getSnapshotTs()` through an explicit cast. A compiled type assertion checks that the public `QueryMeta` declaration has no such method. This example does not establish a supported public upper bound or hosted behavior.
- The returned bigint equals the stored row timestamp and exceeds the earlier query upper bound; the failed scheduled call leaves no row and no scheduled function.
