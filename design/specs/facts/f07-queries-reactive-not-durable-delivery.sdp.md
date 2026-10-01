---
id: spec:facts.f07-queries-reactive-not-durable-delivery
kind: constraint
altitude: story
readiness: defined
relations:
  refines: spec:facts.fact-ledger
---
# Queries are reactive, subscriptions are not durable delivery

F7 · Status: documented · Doc status: Documented, S5 · Decisions: D8.

A subscription delivers the current result of a query whenever it changes. It is state synchronization: a client that reconnects sees the latest state, not every intermediate event. Reactive queries therefore replace any event-to-WebSocket layer for screens, and never stand in for an ordered consumer that must see every event.

## Intent

- outcome: Record that queries are reactive; subscriptions synchronize state and are not durable event delivery, with its evidence status as a target, so that every design resting on it is found by its `constrainedBy` edge (F7)

## Constraints

- statement: Queries are reactive; subscriptions synchronize state and are not durable event delivery (F7)
- flavor: convex-fact
- target: evidence.status:documented
- measurableBy: S5 https://docs.convex.dev/realtime; doc status Documented, S5; Probe 5 checks reactivity across a component boundary (F7, D8)
