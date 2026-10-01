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

A lost response to a UI command is already handled by the client: it retries the mutation until the backend confirms it, and the backend executes each mutation call once. This is the fact that lets D6 drop v0.1's receipt on every public command. Probe 1 showed where the guarantee ends, on a native backend on 2026-10-01, release `precompiled-2026-09-28-5c7cb5b` with `convex` 1.46.0, with the `ConvexClient` of `convex/browser`, which sends mutations through the same `BaseConvexClient` as the React client; the React client itself was not run. A client closed with a pending mutation left its row once or not at all, never twice, so a closed tab can lose a command and can also have committed one it never saw confirmed. Across a kill and restart of the backend on the same storage, every pending mutation resolved and left exactly one row, whether the kill came before the commit or after it. `ConvexHttpClient` sends each mutation in one request and does not retry, so a caller that retries after a lost response executes the mutation a second time.

## Intent

- outcome: Record that the React client retries mutations until confirmed, and the backend executes each call once, with its evidence status as a target, so that every design resting on it is found by its `constrainedBy` edge (F5)

## Constraints

- statement: The React client retries mutations until confirmed, and the backend executes each call once (F5)
- flavor: convex-fact
- target: evidence.status:rechecked
- measurableBy: S14 https://docs.convex.dev/client/react; doc status Documented, S14, rechecked 2026-09-29; Probe 1, run on a native backend on 2026-10-01, shows where the guarantee ends (F5, D6)
