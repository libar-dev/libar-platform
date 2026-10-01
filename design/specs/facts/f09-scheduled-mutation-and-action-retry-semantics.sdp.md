---
id: spec:facts.f09-scheduled-mutation-and-action-retry-semantics
kind: constraint
altitude: story
readiness: defined
relations:
  refines: spec:facts.fact-ledger
---
# Scheduled mutations run once, scheduled actions are not retried

F9 · Status: documented · Doc status: Documented, S6 · Decisions: D13, D14.

Scheduled mutations are guaranteed to be executed exactly once; Convex retries internal errors and fails only on developer errors. Scheduled actions are not automatically retried, so they execute at most once and permanently fail on a transient error. The design follows: a local reaction is a scheduled mutation, an external call is claim, call, settle, and every retry of an action belongs to the obligation module because the engine will not retry it.

## Intent

- outcome: Record that scheduled mutations retry internal errors and run once; developer errors end them; scheduled actions are not retried, with its evidence status as a target, so that every design resting on it is found by its `constrainedBy` edge (F9)

## Constraints

- statement: Scheduled mutations retry internal errors and run once; developer errors end them; scheduled actions are not retried (F9)
- flavor: convex-fact
- target: evidence.status:documented
- measurableBy: S6 https://docs.convex.dev/scheduling/scheduled-functions, read again 2026-09-30; doc status Documented, S6; no probe assigned (F9, D13, D14)
