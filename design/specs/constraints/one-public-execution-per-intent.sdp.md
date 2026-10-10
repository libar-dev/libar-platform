---
id: spec:constraints.one-public-execution-per-intent
kind: constraint
altitude: story
readiness: defined
relations:
  refines: spec:application.first-experiment
  decidedBy:
    - spec:decisions.d06-idempotency-client-and-receipts
---
# One public command execution per business intent

Cost target · Traces: First experiment, D6, Law 4, Sc L1-3, Sc L1-4.

The fourth cost target. One business intent, retried by a client, a worker or a UI double submit, runs once: the Convex client covers a lost response to a UI command, receipts cover callers outside that guarantee, and a client-generated ID with a uniqueness check covers a UI double submit of a create. The experiment counts effects and stored outcomes per intent under the idempotency scenarios.

## Intent

- outcome: Keep every business intent at one execution with one effect and one stored outcome, however many times it is sent (First experiment, D6)
- value: A retry is safe by construction and the caller never has to reason about whether the first attempt ran (D6, Law 4)

## Constraints

- statement: One business intent produces exactly one public command execution that takes effect, with one business effect and one stored outcome, across concurrent sends, lost responses and UI double submits; a duplicate is answered from its receipt and reaches no decider, so it is no execution that takes effect (First experiment, D6)
- flavor: cost
- target: public-command-executions.per-business-intent.eq:1
- measurableBy: the counts of business effects, receipts and events per intent in the idempotency scenarios of Layer 1 run inside the first experiment, and the experiment's count of executed commands per intent under contention; an execution counts toward the target when it takes effect, and the measurement record keeps the count of top-level executions, the original's and each duplicate's, beside it (First experiment, Sc L1-3, Sc L1-4, E-47)
