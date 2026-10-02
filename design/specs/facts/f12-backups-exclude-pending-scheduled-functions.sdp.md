---
id: spec:facts.f12-backups-exclude-pending-scheduled-functions
kind: constraint
altitude: story
readiness: defined
relations:
  refines: spec:facts.fact-ledger
---
# Backups exclude pending scheduled functions

F12 · Status: documented · Doc status: Documented, S8 · Decisions: D13, D19.

The backup page excludes scheduled functions, code, configuration and environment variables. On the pinned native backend, CLI snapshot export and replacement import carry the parent, Orders and Inventory documents, including their IDs and creation times, but no scheduler table. Import into a fresh backend leaves its scheduler tables empty; import in place preserves its scheduler rows, including rows created after export. The inference that every restore leaves no dispatches does not hold for this CLI import. The destination environment variables are unchanged. Hosted dashboard restore is not run, so the fact retains documented status for that wider claim. Here snapshot means the exported archive, not current state or a baseline event.

## Intent

- outcome: Record that backups exclude pending scheduled functions, with its evidence status as a target, so that every design resting on it is found by its `constrainedBy` edge (F12)

### Open questions

- [non-blocking] Hosted dashboard restore, file storage, Workpool and Workflow are not run; local CLI import does not settle those paths. (F12, Probe 7)

## Constraints

- statement: Backups exclude pending scheduled functions (F12)
- flavor: convex-fact
- target: evidence.status:documented
- measurableBy: S8 https://docs.convex.dev/database/backup-restore and https://docs.convex.dev/database/import-export/import, read 2026-10-02; native backend release `precompiled-2026-09-28-5c7cb5b`, Convex 1.46.0; `npx vitest run --project native tests/native/f12-backups-exclude-pending-scheduled-functions.probe-7-fresh-import.test.ts tests/native/f12-backups-exclude-pending-scheduled-functions.probe-7-in-place-import.test.ts --testTimeout 300000` as part of `evidence/runs/native-20261002T205553Z-592f1dc-97c74164-c3a8-4818-9f77-2f04b1456261.json`, both import cases passed; the same record includes unrelated probe failures (F12, D13, D19)

## Design

- nativeRestore: replacement into both destinations restores the observed parent, Orders and Inventory tables exactly; archive entries contain no `_scheduled_functions`; all five scheduler states in each scope remain in place, and none appear in the fresh destination (F12, Probe 7)
- schedulerReferences: a stored `v.id("_scheduled_functions")` imports into the fresh destination, validates as a function argument and on another document write, returns null from `ctx.db.system.get`, and `ctx.scheduler.cancel` succeeds without making a row; in place the same ID resolves to the kept row and cancellation prevents that pending reaction; an uncanceled row still executes against restored data (F12, Probe 7)
- keptReactions: pending mutations created after export survive import in place and execute at their scheduled time against the restored data; a failed row created after export also survives while its document reference does not, so the system table alone does not say which intent belongs to the exported data (F12, D13, D19, Probe 7)
- statusScope: local CLI export and replacement are observed at the native backend tier; documented status remains because hosted dashboard backup and restore are not run, and the local observation is not a confirmed defect in that path (F12, Probe 7)
- cleanNativeEvidence: native backend `precompiled-2026-09-28-5c7cb5b`, SHA-256 `7ebc6a4696499640c2f2255395990b4f8b901b045388a0ced2ac765b81ebadae`, `npx vitest run --project native tests/native/f12-backups-exclude-pending-scheduled-functions.probe-7-fresh-import.test.ts tests/native/f12-backups-exclude-pending-scheduled-functions.probe-7-in-place-import.test.ts tests/native/f13-transactions-have-limits.probe-7-arguments.test.ts tests/native/f16-scheduled-functions-table-shows-failed-runs.probe-7-scan.test.ts tests/native/f16-scheduled-functions-table-shows-failed-runs.probe-7-states.test.ts tests/native/snapshot-replacement.test.ts`, `evidence/runs/native-20261002T210938Z-8e603b7-a3ef2d06-9562-4bb0-9963-c0b20231532f.json`, commit `8e603b748d6f95aecccfc15a1f9629b0756ec195`, clean true, all six native tests passed; earlier dirty records above retain exploratory expectation history and are not the evidence for the final behavior claims (Probe 7)
