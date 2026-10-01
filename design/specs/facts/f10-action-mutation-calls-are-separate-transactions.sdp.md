---
id: spec:facts.f10-action-mutation-calls-are-separate-transactions
kind: constraint
altitude: story
readiness: defined
relations:
  refines: spec:facts.fact-ledger
---
# An action's mutation calls are separate transactions

F10 · Status: documented · Doc status: Documented, S7 · Decisions: D14.

An action is not a transaction. Each `ctx.runMutation` or `ctx.runQuery` it makes runs in its own transaction, and nothing the action does between them is atomic with either. That is why an external effect is claimed in one mutation, called in an action and settled in a second mutation, and why fencing database writes cannot stop a network call already sent.

## Intent

- outcome: Record that an action's mutation calls are separate transactions, with its evidence status as a target, so that every design resting on it is found by its `constrainedBy` edge (F10)

## Constraints

- statement: An action's mutation calls are separate transactions (F10)
- flavor: convex-fact
- target: evidence.status:documented
- measurableBy: S7 https://docs.convex.dev/functions/actions; also S10, each runMutation from an action runs in its own transaction; doc status Documented, S7; no probe assigned (F10, D14)
