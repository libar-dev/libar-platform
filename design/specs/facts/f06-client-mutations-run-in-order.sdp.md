---
id: spec:facts.f06-client-mutations-run-in-order
kind: constraint
altitude: story
readiness: defined
relations:
  refines: spec:facts.fact-ledger
---
# A client's mutations run one at a time, in order

F6 · Status: rechecked · Doc status: Documented, S15, rechecked 2026-09-29 · Decisions: D6.

One client's mutations form an ordered queue, so two submits from the same client never race each other on the wire. A UI double submit is still two separate mutation calls, outside the exactly-once guarantee, which is why a create command uses a client-generated entity ID and a uniqueness check rather than a receipt.

## Intent

- outcome: Record that react and Rust clients run one client's mutations one at a time, in order, with its evidence status as a target, so that every design resting on it is found by its `constrainedBy` edge (F6)

## Constraints

- statement: React and Rust clients run one client's mutations one at a time, in order (F6)
- flavor: convex-fact
- target: evidence.status:rechecked
- measurableBy: S15 https://docs.convex.dev/functions/mutation-functions; doc status Documented, S15, rechecked 2026-09-29; Probe 1 covers the same client boundary (F6, D6)
