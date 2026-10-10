---
id: spec:decisions.d19-operations-travel-with-capability
kind: decision
altitude: feature
readiness: defined
relations:
  refines: spec:platform.transactional-domain-platform
  dependsOn: spec:decisions.d13-deferred-work-is-an-obligation
  constrainedBy:
    - spec:laws.law08-durable-capability-ships-operations
    - spec:facts.f12-backups-exclude-pending-scheduled-functions
    - spec:facts.f13-transactions-have-limits
---
# Operations travel with the capability

Provenance: carried from v0.1. Feature · Traces: D19, Law 8, F12, F13, F16, Probe 7, Sc L2-8, Sc L3-7, Sc L3-8, Sc ALL-1.

Each installed capability carries its own operations: logging that never cancels a valid write and audit that fails closed, handler keys and versions with shims, a restore that starts with dispatch off and rebuilds schedules from obligations, a stated bound on every batch, small events with a retention and deletion policy, diagnosis by identifiers, a metric list, and a release that preserves, migrates or drains pending work. The parts that apply from Layer 1 are carried by Package D's baseline operations; the parts that apply to obligations by Package E. The decision depends on D13 because restore rebuilds schedules from the obligation record.

## Intent

- problem: Metrics and logging break, and separately mandatory audit breaks; a restore runs while provider state has moved past the backup; retention runs while retries are still possible; a release lands with pending work; without operations designed with each capability, each of these loses work or lies about it (Sc ALL-1, Sc L3-7, Sc L3-8, Sc L2-8)
- outcome: Every installed capability carries its own logging, audit, handler versioning, restore, bounds, retention and diagnosis rules, and a release preserves, migrates or drains pending work (D19, Law 8)
- value: Diagnosis works by request key, operation ID, tenant, subject and causation; stored receipts are the authority for what committed; restore is tested rather than assumed (D19)
- risk: The standing cost is a metric list per installed layer, a retention and deletion policy before production data, a recovery plan that covers code, schemas, configuration, credentials, data and external evidence, and a tested restore procedure (D19)
- assumption: Backups exclude pending scheduled functions (F12)
- assumption: Transactions have limits (F13)

### Open questions

- [non-blocking] Probe 7 pending: what a restore leaves of Workpool and Workflow state decides how much of the restore procedure the obligation module must rebuild (Probe 7, F12, D19)

## Decision

- context: The concern is operating what the layers create: logging, audit, restore, bounds, retention, diagnosis, release; Convex gives backups that exclude pending scheduled functions, per-transaction limits, a scheduled-functions table with 7-day retention, and dashboard logs that are observations, not authority (D19, F12, F13, F16)
- alternative: Do nothing beyond Convex: rely on the dashboard, its logs and its backups without design-level operations; rejected, because fresh CLI replacement has no scheduled intent and in-place replacement can keep intent outside restored data, logs are observations and not authority, and a telemetry failure must never cancel a valid write (D19, F12, Decision method rule 2)
- alternative: Telemetry that can veto a business write; rejected (D19, D18)
- alternative: Reset-only upgrades; rejected for anything but disposable environments (D19)
- alternative: Operations shipped with each capability as the rules below; this is the option chosen (D19)
- decision: Operations travel with the capability: logging and metrics failures never cancel a valid business write, while mandatory audit is written inside the transaction and fails closed; accepted work stores a logical handler key and version; restore starts with external dispatch off, reconciles the gap since the backup and rebuilds schedules from obligations; every bulk operation, sweeper and batch has a stated bound; events stay small and a retention and deletion policy exists before production data; diagnosis works by request key or operation ID, tenant, business subject and causation; a release preserves, migrates or drains pending work (D19)
- rationale: Logs are observations; stored receipts are the authority for what committed (D19)
- rationale: Platform limits are ceilings, not batch sizes, and every bound is tested against the pinned Convex version (D19, F13)
- consequence: Logging and metrics failures never cancel a valid business write; mandatory business or security audit is written inside the transaction and fails closed (D19, Sc ALL-1)
- consequence: Accepted work stores a logical handler key and version; stable shims stay while vendor jobs refer to old function handles; an unsupported version goes to needs attention, never an endless retry (D19, D13)
- consequence: Restore starts with external dispatch off, reconciles the gap since the backup, and rebuilds schedules from obligations; external idempotency keys survive restore (D19, F12, Sc L3-7)
- consequence: Every bulk operation, sweeper and batch has a stated bound, tested against the pinned Convex version; platform limits are ceilings, not batch sizes (D19, F13)
- consequence: Events stay small; personal data sits behind references where rebuild does not need it; a retention and deletion policy exists before production data and states which historical claims survive deletion; redacting a returned copy is not erasure; diagnostics hold no raw prompts, credentials or unbounded payloads (D19, Sc L3-8)
- consequence: Diagnosis works by request key or operation ID, tenant, business subject and causation (D19)
- consequence: The measured metrics are what the installed layers create: command latency and optimistic-concurrency retries, event writes, read model cost, age of the oldest unresolved obligation, retry and exhaustion counts, provider uncertainty, rebuild and restore progress (D19)
- consequence: A release preserves, migrates or drains pending work; reset-only upgrades are for disposable environments (D19)
- consequence: Code, schemas, configuration, credentials, data and external outcome evidence all belong to the recovery plan, and restore is tested, not only backup (D19, Sc L2-8)
- consequence: The standing cost is a metric list, a retention policy, a recovery plan and a tested restore per installed layer (D19)
