---
id: spec:facts.f13-transactions-have-limits
kind: constraint
altitude: story
readiness: defined
relations:
  refines: spec:facts.fact-ledger
---
# Transactions have limits

F13 · Status: documented · Doc status: Documented, S9 · Decisions: D10, D19.

The numbers below were read from the limits page on 2026-09-30 and match the plan's section 9. Every batch, sweeper, fan-out and backfill in the design states its own bound below them, because platform limits are ceilings, not batch sizes. The page states no limit on nested `runQuery` or `runMutation` calls per function and does not say whether the per-transaction limits add up across a component boundary, so Probe 4 stands.

## Intent

- outcome: Record that transactions have limits, with its evidence status as a target, so that every design resting on it is found by its `constrainedBy` edge (F13)

## Constraints

- statement: Transactions have limits (F13)
- flavor: convex-fact
- target: evidence.status:documented
- measurableBy: S9 https://docs.convex.dev/production/state/limits, read again 2026-09-30 and by this package the same day; doc status Documented, S9; Probe 4 checks whether the limits add up across nested calls and components (F13, D10, D19)

## Design

The numbers are the ceilings the design treats as such; every batch states a bound below them. The page's values were read on 2026-09-30 and match the plan's section 9.

- limitDocument: 1 MiB per document, 1024 fields, nesting depth 16, 8192 array elements (F13, S9)
- limitTransactionRead: 16 MiB read, 32,000 documents scanned and 4,096 index ranges read per transaction (F13, S9)
- limitTransactionWrite: 16 MiB written and 16,000 documents written per transaction (F13, S9)
- limitFunctionPayload: 16 MiB per function argument set and 16 MiB per return value; a Node action's arguments are capped at 5 MiB (F13, S9)
- limitQueryMutationTimeout: 1 second of execution per query or mutation (F13, S9)
- limitActionTimeout: 30 minutes in the Convex runtime and 10 minutes in the Node runtime (F13, S9)
- limitScheduling: 1000 scheduled functions per mutation, 4 MiB per scheduled argument set, 16 MiB of scheduled arguments per mutation, 1,000,000 outstanding scheduled functions (F13, S9)
- limitSchema: 32 indexes per table, 16 fields per index, 10,000 tables per deployment (F13, S9)
- limitNestedCalls: the page states no limit on nested `runQuery` or `runMutation` calls per function, and does not say whether the per-transaction limits add up across nested calls and components; Probe 4 stands (F13, S9, Probe 4)
- limitsAreCeilings: platform limits are ceilings, not batch sizes; every bulk operation, sweeper and batch states a bound tested against the pinned Convex version (D19, F13)
