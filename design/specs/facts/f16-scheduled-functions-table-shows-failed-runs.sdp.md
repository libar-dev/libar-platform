---
id: spec:facts.f16-scheduled-functions-table-shows-failed-runs
kind: constraint
altitude: story
readiness: defined
relations:
  refines: spec:facts.fact-ledger
---
# The scheduled functions table shows failed runs for a retention window

F16 · Status: rechecked · Doc status: Assumed in the doc; found documented on S6 by the recheck of 2026-09-30 · Decisions: D13.

The scheduled-functions page documents five states and a seven-day completion-result window. The pinned native backend exposes `pending`, `inProgress`, `success`, `failed` and `canceled` through admin access in the parent, Orders and Inventory. Rows carry `name`, `args`, `scheduledTime` and `state`; terminal rows carry `completedTime`; failed rows carry `state.error`. The native test observes a short retention interval only. Seven-day retention and expiry remain documented and are not run, so the fact retains rechecked status. The do-nothing check must also distinguish a fresh replacement, which has no scheduler intent, from replacement in place, which preserves intent created after export.

## Intent

- outcome: Record that `_scheduled_functions` shows failed runs for some retention window, with its evidence status as a target, so that every design resting on it is found by its `constrainedBy` edge (F16)

### Open questions

- [non-blocking] Seven-day retention and expiry, hosted dashboard restore, Workpool and Workflow are not run; the short native retention observation does not establish the documented window. (F16, Probe 7, F12)

## Constraints

- statement: `_scheduled_functions` shows failed runs for some retention window (F16)
- flavor: convex-fact
- target: evidence.status:rechecked
- measurableBy: S6 https://docs.convex.dev/scheduling/scheduled-functions, read 2026-10-02; native backend release `precompiled-2026-09-28-5c7cb5b`, Convex 1.46.0; `npx vitest run --project native tests/native/f16-scheduled-functions-table-shows-failed-runs.probe-7-states.test.ts tests/native/f16-scheduled-functions-table-shows-failed-runs.probe-7-scan.test.ts`, `evidence/runs/native-20261002T205513Z-592f1dc-c8bbed5d-4726-482f-a875-5cde26210902.json`: states passed and scan expectation failed; doc status Assumed in the doc, states and seven-day retention documented on S6 (F16, D13)

## Design

- nativeStates: all five lowercase states are observed in each scope; a held action supplies `inProgress`, which is not a mutation state; completed rows remain readable across the recorded short observation interval (F16, Probe 7)
- scanFinding: the first native scan expected filtered-out scheduler rows to consume the 32000-document allowance; at 1000 rows it instead counted zero document reads and zero bytes, while `databaseQueries.used` grew by 1001; a subsequent run at 32000 rows failed with "Your request timed out performing too many system operations." in `evidence/runs/native-20261002T205553Z-592f1dc-97c74164-c3a8-4818-9f77-2f04b1456261.json`; this is an observed system-operation refusal, not evidence that 32000 is the scan boundary (F16, F13, Probe 7)
- scanBoundary: native backend `precompiled-2026-09-28-5c7cb5b`, `npx vitest run --project native tests/native/f16-scheduled-functions-table-shows-failed-runs.probe-7-scan.test.ts` as part of `evidence/runs/native-20261002T205857Z-592f1dc-194ec93d-d96c-4eb7-b639-f7e2c630e648.json`, observed 4091 rows scanning successfully and 4092 refused with "Too many reads in a single function execution (limit: 4096)"; bytes and documents read remain zero, but the scan adds N + 1 database queries to four already used; 32000 and 32001 are populated and refused, so the document ceiling is not the first boundary; the run failed because the expectation named only the system-operation timeout, and the example is rebound to the observed read refusal (F16, F13, Probe 7)
- scanConfirmation: `npx vitest run --project native tests/native/f16-scheduled-functions-table-shows-failed-runs.probe-7-scan.test.ts`, native backend `precompiled-2026-09-28-5c7cb5b`, `evidence/runs/native-20261002T210145Z-592f1dc-1f503d30-03eb-431b-b48b-e946c2866bd5.json`, passed both the instrumented and plain scan at 4091 total rows and refused both at 4092; three rows are terminal, so these correspond to 4088 and 4089 outstanding rows; the admin count also confirms 32001 total rows (F16, F13, Probe 7)
