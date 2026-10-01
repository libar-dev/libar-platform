---
id: spec:effects.retry-ownership
kind: rule
altitude: story
readiness: defined
relations:
  refines: spec:effects.external-effects
  decidedBy: spec:decisions.d15-one-retry-owner-per-obligation
  constrainedBy:
    - spec:laws.law12-one-retry-owner
    - spec:facts.f01-serializable-mutations-under-occ
    - spec:facts.f09-scheduled-mutation-and-action-retry-semantics
    - spec:laws.law07-deferred-work-never-reported-early
---
# One retry owner per obligation

Layer 3 · Detail: full where D15 rules · Traces: D15, D13, D14, D16, Law 12, F1, F9, S11, S12, Sc L3-4, Sc L4-1.

The obligation module owns retry policy. Transport retries, Workpool retries, workflow retries and the engine's optimistic-concurrency retries never multiply an attempt. Where concurrency or provider limits call for Workpool, it runs with its own retries off, or ownership passes to it deliberately and its attempts are shown the same way on the obligation. The Workpool and Workflow READMEs were read on 2026-09-30: Workpool takes `retryActionsByDefault` and a per-call `retry` option, and `WorkflowManager` takes the same `workpoolOptions` with `retryActionsByDefault` false by default.

## Intent

- outcome: Each retried piece of work has one retry owner, the obligation module unless ownership is recorded on the obligation, and every attempt is shown the same way whoever ran it (D15, Law 12)
- assumption: Workpool exposes `retryActionsByDefault`, a per-enqueue `retry` option and a `status` with `previousAttempts`, and Workflow passes `workpoolOptions` through with retries off by default (S11, S12)

## Rule

- The obligation module owns retry policy; the wrapper, the settle mutation, the sweeper and the operator retry are the only writers of an attempt (D15, D13)
- Convex's internal transaction retries under optimistic concurrency are not business attempts and are never counted (D15, F1)
- Convex never retries a scheduled action, so the module's attempt record is the only retry of an external call (F9, D14)
- The provider-calling action contains no retry loop around the provider call and makes one call per attempt; its bounded repeat of the fenced settle mutation sends nothing to the provider and is not an attempt (D15, F9)
- When concurrency or provider limits call for Workpool, it is constructed with `retryActionsByDefault: false` and each enqueue passes `retry: false`, and the obligation keeps `retryOwner: "module"` (D15, S12)
- When ownership passes to Workpool deliberately, the obligation records `retryOwner: "workpool"`, the enqueue passes the module's backoff as its `retry` option, and every Workpool attempt is shown on the obligation as an attempt with the same number and fence, read from the pool's `onComplete` result and `status` (D15, S12)
- A Workpool `onComplete` result never decides whether the effect happened; it is one more report the settle mutation fences and classifies (D13, Law 7)
- A workflow waits on an obligation's result and never retries the same effect on its own; its external steps run with `retry: false` and the effect is an obligation the workflow observes (D15, D16, S11)
- A workflow's engine retries of a step are not attempts; an attempt is only what the obligation records (D15, D16)
- A client's transport retry of the creating command finds the receipt and never creates a second obligation, because the effect key is read before insert (D6, D13)
- Exhaustion has one owner to escalate to: the obligation's needs attention state and its operator exit (D15, Sc L3-4)
