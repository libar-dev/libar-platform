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
- measurableBy: S6 https://docs.convex.dev/scheduling/scheduled-functions, read 2026-10-02; native examples bind the five states and failed-function scan cost; the seven-day retention window remains documented on S6 (F16, D13, Probe 7)

## Design

- nativeStates: native backend release `precompiled-2026-09-28-5c7cb5b`, Convex 1.46.0, on 2026-10-02, all five states appear in the parent, Orders and Inventory; `completedTime` appears exactly on success, failed and canceled rows, and the failed reaction carries its error text; the held action supplies `inProgress` (F16, Probe 7)
- shortRetention: native backend release `precompiled-2026-09-28-5c7cb5b`, Convex 1.46.0, on 2026-10-02, the completed rows remain readable and unchanged across a measured short interval; this does not establish seven-day retention or expiry (F16, Probe 7)
- scanObservation: native backend release `precompiled-2026-09-28-5c7cb5b`, Convex 1.46.0, on 2026-10-02, the expectation was that filtered-out scheduler rows consume the 32000-document allowance; the release instead reports zero documents and bytes read and adds N + 1 database queries to four already used; both plain and instrumented scans accept 4091 total rows and refuse 4092 with "Too many reads in a single function execution (limit: 4096)" (F16, F13, Probe 7)
- populatedScan: native backend release `precompiled-2026-09-28-5c7cb5b`, Convex 1.46.0, on 2026-10-02, scans with 32000 and 32001 populated rows refuse on the read limit or time out performing too many system operations; the document ceiling is not the first boundary (F16, F13, Probe 7)
