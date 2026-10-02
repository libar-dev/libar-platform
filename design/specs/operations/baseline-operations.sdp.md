---
id: spec:operations.baseline-operations
kind: rule
altitude: feature
readiness: defined
relations:
  refines: spec:platform.transactional-domain-platform
  decidedBy:
    - spec:decisions.d19-operations-travel-with-capability
    - spec:decisions.d18-everything-else-waits-for-trigger
    - spec:decisions.d11-tenant-scope-and-authority
  constrainedBy:
    - spec:laws.law08-durable-capability-ships-operations
    - spec:laws.law11-tenant-scope-named
    - spec:facts.f12-backups-exclude-pending-scheduled-functions
    - spec:facts.f13-transactions-have-limits
    - spec:constraints.events-stay-small
    - spec:constraints.bulk-operations-bounded
    - spec:laws.law05-authorization-before-execution-and-disclosure
    - spec:facts.f01-serializable-mutations-under-occ
---
# Baseline operations

Layer 1 to 2 · Detail: full · Traces: Thesis, D11, D13, D18, D19, Law 8, Law 11, F1, F12, F13, Sc ALL-1, Sc L2-8, E-43, E-48.

Operations travel with the capability. This Spec carries the part of D19 that applies from Layer 1: diagnostics that never cancel a valid write and audit that fails closed, bounds on every batch, small events with personal data behind references, a retention and deletion policy before production data, diagnosis by identifiers with stored receipts as the authority, the metric list, and a release that preserves, migrates or drains pending work. The restore procedure of the transactional profile is `spec:application.restore`. What applies to obligations, external dispatch and provider evidence is carried by the obligation module in Layer 3.

Security, bounded resource use, useful errors and tests start in Layer 1, so none of this waits for the durable profile.

## Intent

- actor: The operator who diagnoses a command, runs a batch or a release, and the maintainer who writes the diagnostic, audit and retention code (D19)
- problem: Metrics and logging break and a valid write is lost with them; separately, mandatory audit breaks and a security-sensitive command commits without its record; a batch runs at the platform limit and times out halfway; a deletion request meets events that hold personal data inline and nobody can say which claims survive (Sc ALL-1, D19)
- outcome: Diagnostics never abort valid work and an audit failure does; every batch has a stated bound; events stay small with personal data behind references; a retention and deletion policy exists before production data; diagnosis works by identifiers with stored receipts as the authority; the metrics the layers create are measured; and a release preserves, migrates or drains pending work (D19, Law 8)
- value: A maintainer traces one command's success or failure by its identifiers without unrelated machinery, and an operator knows a batch's bound before it runs (D19, Thesis)
- risk: The standing cost is an audit record per audited command, a diagnostic record per command, a metric list per installed layer, a retention policy and a recovery plan (D19)
- assumption: Backups exclude pending scheduled functions, environment variables, code and configuration (F12)
- assumption: Transactions have limits, and the mutation timeout is one second (F13)

### Open questions

- [non-blocking] Extension E-43: the doc says audit is written inside the transaction and fails closed, that diagnostics hold no raw prompts, credentials or unbounded payloads, and that personal data sits behind references; it does not give the audit record, the diagnostic record or the reference. The option taken here: an `auditRecords` table with indexes by operation, subject and request key, whose every field has a stated source in the command, an `operatorAudit` table for the gate changes an operator entry makes, which name no tenant when the scope is the whole deployment, a bounded diagnostic record emitted through a sink that never throws, and a `personalData` table that events point at by reference. The do-nothing option is Convex's own audit logging, which the pinned `convex` package declares as `audit(body)`; it is not taken as the record, because an entry in a log outside the database is not read by the operator's queries by operation, subject and request key, and whether such an entry proves a commit is not shown by the pinned package; a deployment may add it beside the tables as an export (E-43, D19)
- [non-blocking] The retention and deletion policy's content is the owner's: which historical claims survive deletion and how long receipts, audit records and diagnostics are kept; the design gives the hooks and states no periods (D19)

## Rule

- Logging and metrics failures never cancel a valid business write (D19, Sc ALL-1)
- Mandatory business or security audit is written inside the transaction and fails closed (D19, Sc ALL-1)
- Telemetry that can veto a business write is not a standing requirement; a diagnostic sink is called after the business writes and its failure is swallowed and counted (D18, D19)
- Every bulk operation, sweeper and batch has a stated bound, tested against the pinned Convex version; platform limits are ceilings, not batch sizes (D19, F13)
- Events stay small, and personal data sits behind references where rebuild does not need it (D19)
- A retention and deletion policy exists before production data, and it states which historical claims survive deletion (D19)
- Redacting a returned copy is not erasure (D19)
- Diagnostics hold no raw prompts, credentials or unbounded payloads (D19)
- Diagnosis works by request key or operation ID, tenant, business subject and causation (D19)
- Logs are observations; stored receipts are the authority for what committed (D19)
- The measured metrics are what the installed layers create: command latency and optimistic-concurrency retries, event writes, read model cost, age of the oldest unresolved obligation, retry and exhaustion counts, provider uncertainty, rebuild and restore progress (D19)
- A release preserves, migrates or drains pending work; reset-only upgrades are for disposable environments (D19)
- Code, schemas, configuration, credentials, data and external outcome evidence all belong to the recovery plan, and restore is tested, not only backup (D19, Sc L2-8)
- Restore starts with external dispatch off, reconciles the gap since the backup and rebuilds schedules from obligations, and external idempotency keys survive restore; the transactional profile's procedure is the restore workflow and the durable profile's additions are the obligation module's (D19, F12)
- Accepted deferred work stores a logical handler key and version, stable shims stay while vendor jobs refer to old function handles, and an unsupported version goes to needs attention, never an endless retry; this applies from Layer 3 and its detail is the obligation module's (D19, D13)
- Security, bounded resource use, useful errors and tests start in Layer 1 (Thesis)
- Every audit record of a command and every diagnostic record names its tenant, and every operator query over them takes the tenant scope; an `operatorAudit` record of a gate change names a tenant only through a tenant scope, and its query takes the scope (Law 11, D11, E-43)
- Operator entries that read audit records are internal functions, so only admin access reaches them, as the operator entry contract of `spec:command.actor-and-scope` rules; each one over tenant data takes the tenant, so a client cannot read another tenant's audit (D11, Law 5, E-48)
- [extension] A diagnostic record is emitted per command through a sink that never throws, is bounded to 4 KiB, and holds identifiers, outcome kind, error code, versions and timings only (E-43, D19)
- [extension] An audit record is one document written by the command pipeline's step 10 through `writeAudit` for every declaration whose `audit` field is set, after an applied command and after a business failure alike, with every field taken from the command as `auditRecordSources` lists, and the failure of that write throws and rolls back the command (E-43, D19, E-38)
- [extension] An operator entry that changes the maintenance gate writes one `operatorAudit` record through `writeOperatorAudit` in the same mutation, with the stated operator, and the failure of that write throws and rolls the change back; the generation row and the restore's run record carry their operator themselves and write no audit record (E-43, E-48, E-8, D19)
- [extension] Personal data that rebuild does not need lives in the `personalData` table and is referenced from events by a stable reference; deleting the row leaves the event's claim intact and its personal fields unreadable (E-43, D19)

## Design

Diagnostics and audit are two paths with opposite failure rules. `emitDiagnostic` runs at the end of the command's mutation, after the business writes, inside a try and catch that swallows every error and increments a counter in memory; nothing it does can throw into the mutation. `writeAudit` runs inside the mutation with the business writes, uses `ctx.db.insert` with a validator, and any failure, including a validator refusal or a document too large, throws and rolls the whole command back. Both are parent code; components neither log nor audit for the parent.

Optimistic-concurrency retries cannot be observed from inside a mutation, because a retried mutation re-runs from the start; the metric comes from the platform's function logs and insights. Rebuild progress is read from the generation's progress row and restore progress from the restore run row. The Layer 3 metrics are listed so the list is complete; they are measured once the obligation module is installed.

- transactionBoundary: audit is written inside the command's top-level mutation and fails closed; diagnostics are emitted from the same mutation after the business writes and never throw (D19, Sc ALL-1)
- convexSurface: `getAuditByOperation`, `getAuditBySubject`, `getAuditByRequestKey` as internal queries for operators, each taking `tenantId` first, and `getGateAudit` of `spec:application.write-pause` over `operatorAudit`; the diagnostic sink is `console.log` of one JSON line, read through the platform's logs (E-43, D19)
- tableAuditRecords: `auditRecords: defineTable({ tenantId: v.string(), operationId: v.string(), requestKey: v.optional(v.string()), commandType: v.string(), actor: actorValidator, subject: v.object({ contextId: v.string(), streamType: v.string(), streamId: v.string() }), kind: v.union(v.literal("security"), v.literal("business")), decision: v.union(v.literal("applied"), v.literal("businessFailure")), causedBy: causedByValidator, recordedAt: v.number() })` in `auditTables`, the schema fragment the library exports, where `causedByValidator` is the envelope's (E-43, D19, Law 11)
- typeAuditRecordInput: `type AuditRecordInput = { tenantId: string; operationId: string; requestKey?: string; commandType: string; actor: Actor; subject: SubjectRef; kind: "security" | "business"; decision: "applied" | "businessFailure"; causedBy: CausedBy }`, the table's document without `recordedAt`, which `writeAudit` sets to the mutation's `Date.now()` (E-43, D19)
- auditRecordSources: step 10 builds the input from the command alone: `tenantId`, `requestKey` and `actor` from the `PipelineCall`, `operationId` and `causedBy` from the `OperationRef` step 7 minted, `commandType` from the declaration's `name`, `kind` from the declaration's `audit.kind`, `decision` from the outcome's kind, and `subject` from the declaration's `permission.subjectFrom(input)` when it is declared and otherwise from the first entry of the outcome's `versions`, its `contextId`, `streamType` and `streamId`; a declaration that sets `audit`, declares no `subjectFrom` and returns no version throws a plain error, so the command fails closed (E-43, E-38, D19)
- indexAuditByOperation: `.index("by_operation", ["tenantId", "operationId"])` (E-43)
- indexAuditByOperationUse: diagnosis by operation ID (D19)
- indexAuditBySubject: `.index("by_subject", ["tenantId", "subject.contextId", "subject.streamType", "subject.streamId", "recordedAt"])` (E-43)
- indexAuditBySubjectUse: diagnosis by business subject, newest first (D19)
- indexAuditByRequestKey: `.index("by_request_key", ["tenantId", "requestKey"])` (E-43)
- indexAuditByRequestKeyUse: diagnosis by request key when the receipt has expired (D19, D6)
- typeDiagnosticRecord: `[extension] interface DiagnosticRecord { tenantId: string; operationId: string; requestKey?: string; commandType: string; actorKind: string; actorId: string; outcome: "applied" | "businessFailure" | "rejection" | "technicalFailure" | "transientRefusal"; errorCode?: string; versions: StreamVersion[]; causedBy?: string; durationMs: number; layer: number }` (E-43, D19)
- fnEmitDiagnostic: `emitDiagnostic(record: DiagnosticRecord, sink: DiagnosticSink = consoleSink): void` truncating to 4 KiB and swallowing every error the sink throws (E-43, D19, Sc ALL-1)
- fnWriteAudit: `writeAudit(ctx: { db: GenericDatabaseWriter<AuditDataModel> }, record: AuditRecordInput): Promise<Id<"auditRecords">>` inserting the record with `recordedAt` through `ctx.db.insert` and letting every failure propagate; `AuditDataModel` is the data model of `auditTables` (E-43, D19, Sc ALL-1)
- tableOperatorAudit: `operatorAudit: defineTable({ action: v.union(v.literal("gate.close"), v.literal("gate.resume")), scopeKey: v.string(), reason: v.string(), generationId: v.optional(v.id("generations")), operator: v.string(), recordedAt: v.number() }).index("by_scope", ["scopeKey", "recordedAt"])` in `auditTables`; operational data of the deployment like the generation registry, so its index leads with the scope and not with a tenant, the deviation from Law 11's index rule that the registry records under E-8 (E-43, E-48, E-8, D19)
- indexOperatorAuditByScopeUse: `getGateAudit`, who closed and who reopened one scope, newest first; no command reads the table (E-43, D19)
- fnWriteOperatorAudit: `writeOperatorAudit(ctx: { db: GenericDatabaseWriter<AuditDataModel> }, record: OperatorAuditInput): Promise<Id<"operatorAudit">>` inserting the record with `recordedAt` at the mutation's `Date.now()` and letting every failure propagate, where `type OperatorAuditInput = { action: "gate.close" | "gate.resume"; scopeKey: string; reason: string; generationId?: Id<"generations">; operator: string }`; called by the write pause's `closeScope` and `resumeScope` and by nothing else (E-43, E-48, D19)
- faultInjection: `DiagnosticSink` and the audit table name are injectable in the fixture app only, so the acceptance test can break each subsystem; the production composition has no injection point; the gate's audit is broken without an injection point, by a `convex-test` schema whose `operatorAudit` table has a validator that refuses the record (Sc ALL-1, Acceptance scenarios, E-43)
- tablePersonalData: `personalData: defineTable({ tenantId: v.string(), ref: v.string(), subject: v.object({ contextId: v.string(), streamType: v.string(), streamId: v.string() }), fields: v.any(), createdAt: v.number(), deletedAt: v.optional(v.number()) }).index("by_ref", ["tenantId", "ref"]).index("by_subject", ["tenantId", "subject.contextId", "subject.streamType", "subject.streamId"])` (E-43, D19, Law 11)
- personalDataReference: an event payload that would hold personal data rebuild does not need holds `personalRef` instead; a deletion sets `deletedAt` and clears `fields`, and the retention policy states which claims the event still makes afterward (E-43, D19)
- retentionHooks: receipts expire by the receipt contract, audit records and diagnostics by the retention policy, personal data by deletion requests; the design sets no period (D19, D6)
- diagnosisPath: request key to receipt, operation ID to events by the journal's operation index and to audit by operation, subject to audit by subject, causation through `causedBy` on events and audit records (D19, D2)
- metricCommandLatency: duration of each top-level mutation, from the diagnostic record's `durationMs` and the platform's function logs (D19)
- metricOccRetries: optimistic-concurrency retries per function, from the platform's logs and insights, since a mutation cannot observe its own re-execution (D19, F1)
- metricEventWrites: events appended per command, from the versions in the diagnostic record (D19)
- metricReadModelCost: read-model rows written per command and documents read per query, from the first experiment's measurements and the diagnostic record (D19, D8)
- metricOldestUnresolvedObligation: age of the oldest unresolved obligation, measured once Layer 3 is installed (D19, D13)
- metricRetryAndExhaustion: retry and exhaustion counts, measured once Layer 3 is installed (D19, D13)
- metricProviderUncertainty: obligations in needs attention for an ambiguous provider outcome, measured once Layer 3 is installed (D19, D14)
- metricRebuildProgress: batches done, rows written and misses per generation, from the generation's `generationProgress` row in the registry (D19, D9, E-40)
- metricRestoreProgress: checks passed, examined counts and findings per restore run, from the restore run record (D19, Sc L2-8)
- releaseRule: a release keeps a building generation's cursor, a retired generation's rows and an import's progress row readable; a schema change to any of them ships with a migration that runs before the new code reads them (D19)
- limitDiagnosticRecord: 4 KiB per diagnostic record; larger records are truncated, never dropped (E-43, D19)
- limitOperatorQuery: audit queries are paginated with at most 100 records per page (E-43, F13)

## Example space

```gwt-vocabulary
Given a valid command whose use case emits diagnostics and writes {audit:"a mandatory audit record"|"no audit record"}
And the {subsystem:"metrics and logging"|"mandatory audit"} subsystem is broken by fault injection
When the command runs
Then the command {result:"commits"|"rolls back"}
And the failure is {surfaced:"reported as a diagnostic gap without touching the write"|"returned to the caller as a technical failure"}
```

## Verification — reviewed

- A reviewer confirms that `emitDiagnostic` is the only path from a command to logs or metrics, that it cannot throw into the mutation, and that no code path decides a business outcome from a diagnostic.
- A reviewer confirms that the command pipeline's step 10 calls `writeAudit` for every declaration whose `audit` field is set, inside the mutation, and that no catch surrounds it.
- A reviewer confirms that every batch in the corpus states its bound and that every index of `auditRecords` and of personal data leads with the tenant, and that the `operatorAudit` index leads with the scope.
- A reviewer confirms that a retention and deletion policy document exists before any production data and that it names which claims survive deletion.
