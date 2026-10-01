---
id: spec:facts.f11-components-have-no-ctx-auth
kind: constraint
altitude: story
readiness: defined
relations:
  refines: spec:facts.fact-ledger
---
# Components have no ctx.auth

F11 · Status: documented · Doc status: Documented, S4 · Decisions: D11.

Code inside a component cannot read data that is not explicitly provided to it, and that includes the caller's identity. The parent authenticates and authorizes, then passes the server-established actor and tenant scope into the component as arguments. No component function reads `ctx.auth` or environment variables.

## Intent

- outcome: Record that components have no `ctx.auth`, with its evidence status as a target, so that every design resting on it is found by its `constrainedBy` edge (F11)

## Constraints

- statement: Components have no `ctx.auth` (F11)
- flavor: convex-fact
- target: evidence.status:documented
- measurableBy: S4 https://docs.convex.dev/components/authoring; doc status Documented, S4; no probe assigned (F11, D11)
