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

A backup holds the tables and file storage; it excludes code and configuration, pending scheduled functions and environment variables, and a restore wipes existing data and replaces it with the backup. A restored deployment therefore has obligations but no dispatches, which is one of the four reasons the obligation table earns its cost and why restore starts with dispatch off and rebuilds schedules from obligations. The page does not say what restore does to component data or to the scheduler, so Probe 7 keeps that question.

## Intent

- outcome: Record that backups exclude pending scheduled functions, with its evidence status as a target, so that every design resting on it is found by its `constrainedBy` edge (F12)

## Constraints

- statement: Backups exclude pending scheduled functions (F12)
- flavor: convex-fact
- target: evidence.status:documented
- measurableBy: S8 https://docs.convex.dev/database/backup-restore, read again 2026-09-30; doc status Documented, S8; Probe 7 shows what a restore leaves of Workpool, Workflow and scheduler state (F12, D13, D19)
