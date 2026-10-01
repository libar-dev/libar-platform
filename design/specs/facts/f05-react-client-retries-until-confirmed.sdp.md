---
id: spec:facts.f05-react-client-retries-until-confirmed
kind: constraint
altitude: story
readiness: defined
relations:
  refines: spec:facts.fact-ledger
---
# The React client retries a mutation until it is confirmed

F5 · Status: rechecked · Doc status: Documented, S14, rechecked 2026-09-29 · Decisions: D6.

A lost response to a UI command is already handled by the client: it retries the mutation until the backend confirms it, and the backend executes each mutation call once. This is the fact that lets D6 drop v0.1's receipt on every public command. Where the guarantee ends, a tab closed with a pending mutation, a server restart, the HTTP client, is what Probe 1 must show.

## Intent

- outcome: Record that the React client retries mutations until confirmed, and the backend executes each call once, with its evidence status as a target, so that every design resting on it is found by its `constrainedBy` edge (F5)

## Constraints

- statement: The React client retries mutations until confirmed, and the backend executes each call once (F5)
- flavor: convex-fact
- target: evidence.status:rechecked
- measurableBy: S14 https://docs.convex.dev/client/react; doc status Documented, S14, rechecked 2026-09-29; Probe 1 finds where the guarantee ends (F5, D6)
