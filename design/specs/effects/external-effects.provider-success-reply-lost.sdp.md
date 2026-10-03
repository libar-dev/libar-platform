---
id: spec:effects.external-effects.provider-success-reply-lost
kind: example
altitude: story
readiness: defined
relations:
  refines: spec:effects.external-effects
  verifies: spec:effects.external-effects
---
# The provider succeeds but the reply is lost

Sc L3-5 · native backend tier.

## Intent

- outcome: Reconciliation or the same provider key prevents a second irreversible effect. (Sc L3-5)

```gwt
Given an external effect declares the repetition policy {policy: "reuse provider key"}
And attempt {attempt: 1} has claimed the obligation with provider key {key: "eff-5"}
And the provider {provider: "succeeds and the reply is lost"}
And the obligation has since {since: "stayed on the same attempt"}
When the obligation module runs the next attempt and settles every report that arrives
Then irreversible provider effects number {effects: 1}
And the obligation is {status: "succeeded"}
And the provider key on the next attempt is {nextKey: "the same key"}
```

## Verification — executable

- Runs in the native backend tier; every test owns its disposable backend.
- The provider stub records the effect under the idempotency key and drops the reply, so the action's settle never runs; the test advances past the lease and runs `sweep`, which settles the attempt as ambiguous (D14, D13).
- The test asserts the next claim carries the same `providerKey`, that the provider stub answers with the stored result, and that the obligation settles succeeded with `provider` evidence (D14, Sc L3-5).
- The test repeats the scenario with policy `reconcile first` and asserts the reconcile attempt finds the effect and settles without a second call, and with policy `none` asserts the obligation is in needs attention with reason `uncertain` and no second call (D14).
