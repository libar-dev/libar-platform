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

The numbers below were read from the limits page on 2026-09-30 and match the plan's section 9. Every batch, sweeper, fan-out and backfill in the design states its own bound below them, because platform limits are ceilings, not batch sizes. The limits page states no limit on nested `runQuery` or `runMutation` calls per function. The page on writing data, read on 2026-10-01, states that "a mutation or query called by another mutation or query share the overall transaction limits" and documents `ctx.meta.getTransactionMetrics()` and the `transactionLimits` option; it does not name components. Probe 4 ran on a native backend on 2026-10-01, release `precompiled-2026-09-28-5c7cb5b` with `convex` 1.46.0: the 16 MiB read limit and the 16 MiB write limit are each one budget across a nested call and across a component boundary, and a call stack of nine functions commits where ten fails.

## Intent

- outcome: Record that transactions have limits, with its evidence status as a target, so that every design resting on it is found by its `constrainedBy` edge (F13)

## Constraints

- statement: Transactions have limits (F13)
- flavor: convex-fact
- target: evidence.status:documented
- measurableBy: S9 https://docs.convex.dev/production/state/limits, read again 2026-09-30 and by this package the same day; https://docs.convex.dev/database/writing-data, read 2026-10-01, for the sharing across nested calls; doc status Documented, S9; Probe 4, run on a native backend on 2026-10-01, shows the limits shared across nested calls and components (F13, D10, D19)

## Design

The documented numbers bound batches. Probe 4 observes transaction budgets; Probe 7 distinguishes the scheduled-argument page values from the pinned backend's enforced budget. A warning on this release does not remove the documented ceiling from the design.

- limitDocument: 1 MiB per document, 1024 fields, nesting depth 16, 8192 array elements (F13, S9)
- limitTransactionRead: 16 MiB read, 32,000 documents scanned and 4,096 index ranges read per transaction (F13, S9)
- limitTransactionWrite: 16 MiB written and 16,000 documents written per transaction (F13, S9)
- limitFunctionPayload: 16 MiB per function argument set and 16 MiB per return value; a Node action's arguments are capped at 5 MiB (F13, S9)
- limitQueryMutationTimeout: 1 second of execution per query or mutation (F13, S9)
- limitActionTimeout: 30 minutes in the Convex runtime and 10 minutes in the Node runtime (F13, S9)
- limitScheduling: the limits page states 1000 scheduled functions per mutation, 4 MiB per scheduled argument set, 16 MiB summed arguments per mutation and 1000000 outstanding functions; the scheduling page states 8 MB total, both read 2026-10-02; the design keeps 4 MiB per call as its ceiling because this release names that limit as a future hard error (F13, S9, Probe 7)
- limitSchema: 32 indexes per table, 16 fields per index, 10,000 tables per deployment (F13, S9)
- limitNestedCalls: the limits page states no count of nested `runQuery` or `runMutation` calls per function; the page on writing data states that nested calls share the overall transaction limits, and Probe 4 showed the same across a component boundary for bytes read and bytes written; the pinned backend commits a call stack of nine functions and fails the tenth with "Cross component call depth limit exceeded", which is a backend default and not a documented limit (F13, S9, Probe 4)
- transactionMetrics: `ctx.meta.getTransactionMetrics()` is asynchronous and returns `used` and `remaining` per metric, and a nested call accepts `transactionLimits`; Probe 4 read the metrics in a parent around a child's read, nested and in a component, and they grew by what the child read (F13, Probe 4)
- limitsAreCeilings: platform limits are ceilings, not batch sizes; every bulk operation, sweeper and batch states a bound tested against the pinned Convex version (D19, F13)
- schedulingObservation: native backend release `precompiled-2026-09-28-5c7cb5b`, Convex 1.46.0, on 2026-10-02, the expectation of a hard 4 MiB per-call limit did not hold; the mutation constructs its values internally and catches the aggregate 16777216-byte refusal at `runAfter`, then returns normally with the number of accepted calls (F13, Probe 7)
- schedulingBytes: native backend release `precompiled-2026-09-28-5c7cb5b`, Convex 1.46.0, on 2026-10-02, one ASCII string, multibyte text, 1024 strings and eight calls fit at 16777216 accounted bytes and refuse their first larger tested value; the tested `{ payload: string }` shape costs UTF-8 content bytes plus 14 per call, and `{ payload: string[] }` adds two per element; newline and quote characters distinguish value accounting from JSON text length (F13, Probe 7)
- acceptedSingleCalls: native backend release `precompiled-2026-09-28-5c7cb5b`, Convex 1.46.0, on 2026-10-02, single calls with 8000000 and 8388608 content bytes are accepted (F13, Probe 7)
- schedulingWarnings: native backend release `precompiled-2026-09-28-5c7cb5b`, Convex 1.46.0, on 2026-10-02, the shorter per-call warning starts at 3355444 accounted bytes, with none at 3355443, and continues through 4194304; at 4194305 it adds "This will become a hard error in the future"; both forms name a limit of 4194304 bytes and the calls remain accepted (F13, Probe 7)
