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
- measurableBy: S8 https://docs.convex.dev/database/backup-restore and https://docs.convex.dev/database/import-export/import, read 2026-10-02; native examples for replacement into a fresh backend and in place bind the local observations below (F12, D13, D19, Probe 7)

## Design

- freshReplacement: native backend release `precompiled-2026-09-28-5c7cb5b`, Convex 1.46.0, on 2026-10-02, replacement into a fresh destination restores the parent, Orders and Inventory documents with their IDs and creation times and leaves all three scheduler tables empty (F12, Probe 7)
- inPlaceReplacement: native backend release `precompiled-2026-09-28-5c7cb5b`, Convex 1.46.0, on 2026-10-02, replacement in place restores the exported documents and keeps every destination scheduler row in each scope, including the rows created after export (F12, Probe 7)
- exportedArchive: native backend release `precompiled-2026-09-28-5c7cb5b`, Convex 1.46.0, on 2026-10-02, archive entries contain the parent and component tables and no `_scheduled_functions` table (F12, Probe 7)
- destinationEnvironment: native backend release `precompiled-2026-09-28-5c7cb5b`, Convex 1.46.0, on 2026-10-02, replacement leaves the destination environment variables unchanged in both cases (F12, Probe 7)
- schedulerReferences: native backend release `precompiled-2026-09-28-5c7cb5b`, Convex 1.46.0, on 2026-10-02, a stored `v.id("_scheduled_functions")` imports into the fresh destination, validates as a function argument and on another document write, returns null from `ctx.db.system.get`, and `ctx.scheduler.cancel` succeeds without making a row (F12, Probe 7)
- keptReference: native backend release `precompiled-2026-09-28-5c7cb5b`, Convex 1.46.0, on 2026-10-02, an imported scheduler ID in place resolves to its kept row and cancellation changes that row to canceled and prevents its pending reaction (F12, Probe 7)
- keptReactions: native backend release `precompiled-2026-09-28-5c7cb5b`, Convex 1.46.0, on 2026-10-02, pending mutations created after export survive import in place and execute no earlier than their scheduled time against the restored value `exported` (F12, D13, D19, Probe 7)
- reactionIntent: a failed row created after export survives import in place while the exported documents replace later business changes; the system table alone does not identify which intent belongs to the exported data (F12, D13, D19, Probe 7)
- statusScope: local CLI export and replacement are observed at the native backend tier; documented status remains because hosted dashboard backup and restore are not run, and the local observation is not a confirmed defect in that path (F12, Probe 7)
