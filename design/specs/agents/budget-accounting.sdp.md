---
id: spec:agents.budget-accounting
kind: rule
altitude: story
readiness: scoped
relations:
  refines: spec:agents.agent-runs
  dependsOn: spec:effects.external-effects
  constrainedBy: spec:laws.law07-deferred-work-never-reported-early
---
# Agent budget accounting

Layer 5 · Detail: deferred until a model's judgment is part of a product capability · Traces: D17, D14, D15, Law 7, Sc L5-3.

A paid call reserves budget before dispatch and settles once from evidence. Concurrency slots and money are separate resources. A timed-out lease proves nothing about the provider, and unknown cost is never released as zero, yet an uncertain call still gets reconciliation and an operator exit so its slot is not lost for good. A provider retry may cost money even when the domain command is idempotent. The reservation and settlement records are written on the trigger.

## Intent

- outcome: Every paid call reserves before dispatch, settles once from evidence, never releases unknown cost as zero, and never loses a slot for good (D17, Sc L5-3)

### Open questions

- [blocking] The reservation and usage records, the slot allocator and the reconciliation operation are deferred to the build on the agent trigger (D17, Decision method rule 4)

## Rule

- [deferred] The build writes the budget reservation and usage records, the slot allocator and the reconciliation operation on the trigger (D17, Decision method rule 4)
- A paid call reserves budget before dispatch and settles once from evidence (D17)
- Concurrency slots and money are separate resources with separate reservations (D17)
- A timed-out lease proves nothing about the provider, and unknown cost is never released as zero (D17, D14)
- An uncertain call gets reconciliation and an operator exit, so its slot is not lost for good (D17, Sc L5-3)
- Usage that arrives after a timeout settles the same reservation once; a second settlement of the same attempt is refused (D17, Law 7)
- A provider retry may cost money even when the domain command is idempotent, so each provider attempt is accounted separately and database idempotency is not exactly-once billing (D17, D15)
- A paid call records provider and model, input artifact versions or a protected payload reference, request fingerprint, prompt and policy version, attempt identity and observed usage, within what the product's data policy allows (D17)
- Diagnostics hold no raw prompts or credentials (D19)
- A paid call is an external effect: claimed in one transaction, called in an action, settled in a second, with the obligation module as retry owner (D17, D14, D15)

## Design

- deferred: the budget reservation and usage records, the slot allocator and the reconciliation operation, written by the build on the trigger that a model's judgment is part of a product capability (D17, Decision method rule 4)
