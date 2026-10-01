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

Code inside a component cannot read data that is not explicitly provided to it, and that includes the caller's identity. The parent authenticates and authorizes, then passes the server-established actor and tenant scope into the component as arguments. That no component function reads `ctx.auth` or `process.env` is this design's rule under D11, enforced by a lint check, and not part of the fact: a component is isolated from the app's environment variables, but the documentation lets it declare typed ones of its own that the installing app supplies.

## Intent

- outcome: Record that components have no `ctx.auth`, with its evidence status as a target, so that every design resting on it is found by its `constrainedBy` edge (F11)

### Open questions

- [non-blocking] Observed against the documentation on 2026-10-01: the components page says `ctx.auth` is not available within a component; on the pinned native backend, release `precompiled-2026-09-28-5c7cb5b` with `convex` 1.46.0, `ctx.auth.getUserIdentity()` inside a component query returned the caller's identity, and `convex-test` 0.0.60 returns null for the same call; the design does not depend on which holds, because D11 passes the actor explicitly and no component function reads `ctx.auth`; whether this fact's wording and status follow the documentation or the backend is the owner's ruling; slice S1 took the provisional reading that the documentation's sentence stays the fact and that the Specs of the kernel, context and command families state no component function reads `ctx.auth` or `process.env` as the design's rule, which a lint check over `src/context` and every component directory of the fixture composition enforces (F11, D11)

## Constraints

- statement: Components have no `ctx.auth` (F11)
- flavor: convex-fact
- target: evidence.status:documented
- measurableBy: S4 https://docs.convex.dev/components/authoring; doc status Documented, S4; no probe assigned (F11, D11)
