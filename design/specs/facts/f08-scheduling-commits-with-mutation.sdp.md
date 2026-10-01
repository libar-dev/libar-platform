---
id: spec:facts.f08-scheduling-commits-with-mutation
kind: constraint
altitude: story
readiness: defined
relations:
  refines: spec:facts.fact-ledger
---
# Scheduling from a mutation commits with it

F8 · Status: documented · Doc status: Documented, S6 · Decisions: D13.

The scheduling page states that scheduling functions from mutations is atomic with the rest of the mutation: if the mutation succeeds, the scheduled function is guaranteed to be scheduled, and if the mutation fails, no function will be scheduled. An obligation's first dispatch therefore joins the business transaction. The page also states that auth is not propagated from the scheduling to the scheduled function, which is why the obligation record carries the authority it runs under.

## Intent

- outcome: Record that scheduling from a mutation commits with it, with its evidence status as a target, so that every design resting on it is found by its `constrainedBy` edge (F8)

## Constraints

- statement: Scheduling from a mutation commits with it (F8)
- flavor: convex-fact
- target: evidence.status:documented
- measurableBy: S6 https://docs.convex.dev/scheduling/scheduled-functions, read again 2026-09-30; doc status Documented, S6; no probe assigned (F8, D13)
