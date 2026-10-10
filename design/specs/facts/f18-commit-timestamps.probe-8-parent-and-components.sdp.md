---
id: spec:facts.f18-commit-timestamps.probe-8-parent-and-components
kind: example
altitude: story
readiness: defined
relations:
  refines: spec:facts.f18-commit-timestamps
  verifies: spec:facts.f18-commit-timestamps
---
# Probe 8: commit timestamps in the parent and two components

Probe 8 · native backend tier · fixture composition.

## Intent

- outcome: One transaction writes one commit timestamp in the parent and in two components, later transactions write larger ones, and the placeholder resolves when a mutation returns it and is refused as a scheduled argument. (Probe 8, F18)

```gwt
Given a parent and two components that write commit timestamp placeholders
When three mutations commit in sequence and a query reads their indexed rows
Then each transaction has {shared: true} timestamp across the three tables and later transactions have larger timestamps
And returning a placeholder {returned: "resolves to a bigint"} and scheduling it is {refused: true}
```

## Verification — executable

- Runs in the native backend tier on the fixture composition, where `annex` is mounted twice so that two components write; every test owns its disposable backend.
- Inside the writing mutation the test asserts that a read of the row yields the unresolved placeholder, in the parent and in each component, and in each component that converting it to a number throws.
- The expectation written before the first run was that returning the placeholder is refused; the pinned release returned the committed bigint, and the example is bound to that observed value. The refusal to schedule it held, with `Field name $commitTs starts with '$', which is reserved.`
- The query uses the internal runtime `getSnapshotTs()` through an explicit cast. A compiled type assertion checks that the public `QueryMeta` declaration has no such method. A local backend cannot say whether a hosted deployment behaves the same, and no public upper bound is shown; both stay open on F18.
- The returned bigint equals the stored row timestamp and exceeds the earlier query upper bound; the failed scheduled call leaves no row and no scheduled function.
