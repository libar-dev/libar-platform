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
- limitScheduling: the limits page states 1000 scheduled functions per mutation, 4 MiB per scheduled argument set, 16 MiB summed arguments per mutation and 1000000 outstanding functions; the scheduling page states 8 MB total, both read 2026-10-02; the pinned native backend warns above 4 MiB per call, accepts calls above both 8 MB and 8 MiB, and refuses the sum above 16 MiB at `runAfter` (F13, S9, Probe 7)
- limitSchema: 32 indexes per table, 16 fields per index, 10,000 tables per deployment (F13, S9)
- limitNestedCalls: the limits page states no count of nested `runQuery` or `runMutation` calls per function; the page on writing data states that nested calls share the overall transaction limits, and Probe 4 showed the same across a component boundary for bytes read and bytes written; the pinned backend commits a call stack of nine functions and fails the tenth with "Cross component call depth limit exceeded", which is a backend default and not a documented limit (F13, S9, Probe 4)
- transactionMetrics: `ctx.meta.getTransactionMetrics()` is asynchronous and returns `used` and `remaining` per metric, and a nested call accepts `transactionLimits`; Probe 4 read the metrics in a parent around a child's read, nested and in a component, and they grew by what the child read (F13, Probe 4)
- limitsAreCeilings: platform limits are ceilings, not batch sizes; every bulk operation, sweeper and batch states a bound tested against the pinned Convex version (D19, F13)
- schedulingObservation: native backend release `precompiled-2026-09-28-5c7cb5b`, Convex 1.46.0, `npx vitest run --project native tests/native/f13-transactions-have-limits.probe-7-arguments.test.ts --testTimeout 300000` as part of `evidence/runs/native-20261002T205553Z-592f1dc-97c74164-c3a8-4818-9f77-2f04b1456261.json`; the original 4 MiB hard-limit expectation failed; values are constructed inside the mutation, and the caught `runAfter` refusal returns normally with the number of earlier successful schedules, distinguishing this refusal from commit (F13, Probe 7)
- schedulingBytes: native backend `precompiled-2026-09-28-5c7cb5b`, `npx vitest run --project native tests/native/f13-transactions-have-limits.probe-7-arguments.test.ts` as part of `evidence/runs/native-20261002T205857Z-592f1dc-194ec93d-d96c-4eb7-b639-f7e2c630e648.json`, passed exact-byte boundaries: one string, multibyte text, 1024 strings and eight calls each fit at 16777216 accounted bytes and refuse their first larger tested value; for the tested `{ payload: string }` shape accounting is UTF-8 content bytes plus 14 per call, and for `{ payload: string[] }` it is content bytes plus 14 plus two per element per call; three newline bytes count as three, unlike six JSON escape bytes, so this is Convex value accounting, not JSON text length (F13, Probe 7)
- cleanNativeEvidence: native backend `precompiled-2026-09-28-5c7cb5b`, SHA-256 `7ebc6a4696499640c2f2255395990b4f8b901b045388a0ced2ac765b81ebadae`, `npx vitest run --project native tests/native/f12-backups-exclude-pending-scheduled-functions.probe-7-fresh-import.test.ts tests/native/f12-backups-exclude-pending-scheduled-functions.probe-7-in-place-import.test.ts tests/native/f13-transactions-have-limits.probe-7-arguments.test.ts tests/native/f16-scheduled-functions-table-shows-failed-runs.probe-7-scan.test.ts tests/native/f16-scheduled-functions-table-shows-failed-runs.probe-7-states.test.ts tests/native/snapshot-replacement.test.ts`, `evidence/runs/native-20261002T210938Z-8e603b7-a3ef2d06-9562-4bb0-9963-c0b20231532f.json`, commit `8e603b748d6f95aecccfc15a1f9629b0756ec195`, clean true, all six native tests passed; earlier dirty records above retain exploratory expectation history and are not the evidence for the final behavior claims (Probe 7)
