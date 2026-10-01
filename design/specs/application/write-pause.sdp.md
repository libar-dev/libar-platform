---
id: spec:application.write-pause
kind: contract
altitude: story
readiness: defined
relations:
  refines: spec:application.rebuild
  decidedBy:
    - spec:decisions.d09-rebuild-online-by-default
    - spec:decisions.d04-four-outcomes
  constrainedBy:
    - spec:facts.f01-serializable-mutations-under-occ
    - spec:facts.f13-transactions-have-limits
    - spec:laws.law06-technical-failure-never-a-rejection
    - spec:facts.f11-components-have-no-ctx-auth
    - spec:facts.f12-backups-exclude-pending-scheduled-functions
    - spec:facts.f09-scheduled-mutation-and-action-retry-semantics
---
# Write pause

Story · Detail: full · Traces: D4, D9, D19, Law 6, F1, F9, F12, F13, Sc L2-6, Sc L2-8, E-8, E-42.

The write pause is the maintenance gate every writer in a scope reads inside its own mutation. It exists for the rebuild of a read model that depends on history across several streams, where a consistent cut is needed, and the restore procedure holds the same door closed for every scope through the environment, because the snapshot replaces the gate document, until its checks pass. A closed gate turns every write in scope into a transient refusal, retryable and never stored; a background batch scheduled before the close reads the closed gate when it starts, and a batch of a superseded chain is refused by its generation's fence. The rebuild closes the gate for its own scope in the mutation that registers its generation, the operator closes a tenant or the whole deployment, and the operator resumes and aborts. Nothing reopens the gate by itself. Optimistic concurrency makes the close a consistent cut, so the gate has one closed state and no drain.

## Intent

- outcome: Pin the maintenance gate document, the writer check every mutation in scope makes, the fencing of background writers, and the operator's close, resume and abort (D9, E-8)
- value: One document read per command gives the rebuild its consistent cut and the restore its closed door, with no lock protocol and no queue (D9, D1)
- risk: Every use case reads the gate document, one point read per command, and a gate change makes every concurrent command re-run once under optimistic concurrency (F1, E-8)
- assumption: Mutations are serializable under optimistic concurrency, so a writer that read the gate as open cannot commit after a close that committed first (F1)

### Open questions

- [non-blocking] Extension E-8: the doc names a maintenance gate every writer reads, fencing or draining of background writers, and operator resume and abort; the option taken here is one gate document per deployment holding the closed scopes, each in one `closed` state, with no fence of its own and no drain interval, because optimistic concurrency serializes every writer's gate read against the close and the generation row's fence already fences a rebuild's batches, and a refusal answered with `writePaused`, the transient code the outcome boundary reserves for this contract under its E-35, which this contract confirms; the scope a rebuild closes is the paused view's sources, one `source:` entry per context and stream type its bindings name, rather than the read model itself, because a consistent cut must hold every writer of those streams and a use case that writes a source stream without maintaining the view would otherwise pass the gate, which is why the command declaration names what it writes under E-38 and the pipeline proves the list at its step 9; the alternative, closing the tenant or `all` for every paused rebuild, is safe and coarser and stays the operator's manual option through `closeGate` (E-8, E-38, D9, D4, F1)

## Contract

- There is one gate document per deployment, read by the command pipeline at its step 7 for every command through `assertWritable`, which throws, and by every background batch at the start of its mutation through `gateAllows`, which answers and lets the batch park, never cached across mutations; the background readers are the rebuild's backfill, verify and purge batches and the journal's baseline driver of `spec:context.journal`, which writes a source stream and reschedules itself when refused; the only mutations that skip the read are the restore procedure's `startRestoreRun`, its check batches, its pending-work inventory and `finishRestoreRun`, which write only the `restoreRuns` record and the generation rows the accepted branch resumes while the restore door is closed, as `spec:application.restore` states (D9, E-8, E-25, E-42)
- A scope is `all`, one tenant, one read model, or one source stream type of one context; the gate holds the set of closed scopes, each with a reason, the generation it serves if any, and who changed it (E-8, D9)
- A writer in a closed scope refuses before any write with the transient refusal `writePaused`, marked retryable, carrying the scope and the reason; nothing is stored (D9, D4, Law 6)
- A use case is in scope when `all` is closed, when its tenant is closed, when a read model it maintains is closed, or when a stream type its declaration's `writes` names is closed (E-8, E-38, D9)
- [extension] A rebuild that needs a consistent cut closes the sources of the paused view, one `source:` scope per context and stream type its bindings name, so every writer of those streams is held whether or not it maintains the view; the closed entries name the generation, and `abortGeneration` and the switch's resume reopen every entry that names it (E-8, E-38, D9, Sc L2-6)
- Background writers are fenced, not drained: a batch scheduled before the close reads the closed gate when it starts and refuses, a batch running when the close commits loses the optimistic-concurrency race on the gate document and re-runs into the refusal, a batch that committed first wrote before the cut, and a batch of a superseded chain returns without writing because the generation row's fence, bumped by every resume and abort, differs from its argument (D9, E-8, F1)
- The gate has one `closed` state per scope and no draining state, drain interval or confirmation step, because the serialization above already gives the consistent cut and a second state would only add an operator duty (E-8, F1)
- The rebuild the gate was closed for is the one background writer allowed through, identified by its generation on the closed scopes; `startGeneration` closes one entry per source of the view and records its own generation on each in the mutation that inserts the generation row, so every entry names a row that exists (D9, E-8)
- The operator resumes a scope only after the rebuild it served is verified and switched, or aborted; a resume during a build is refused by the operator function unless the operator states abort (D9, Sc L2-6)
- Abort marks the generation aborted and resumes the scope in one mutation (D9, Sc L2-6)
- The restore procedure cannot use the gate document, because the snapshot replaces it; the same writer check also refuses every write while the deployment's `MAINTENANCE_MODE` environment variable is `restore`, which survives a restore because backups exclude environment variables; the restore procedure's own mutations, which write only `restoreRuns` and the generation rows the accepted branch resumes, are the one exemption, and that workflow states it (D19, F12, Sc L2-8, E-42)
- [extension] A closed entry the snapshot brings back is as closed as one written live: an entry that names a generation stays closed until the restore's pending-work step resumes that generation or the operator aborts it, which resumes the scope, and an operator-closed tenant or `all` entry stays closed until the operator resumes it, so the gate never reopens by itself through a restore either, and the restore's accepted branch is what keeps a restored entry from outliving the rebuild it served (E-8, E-42, F12, D19)
- [extension] Gate changes are treated as mandatory audit: every close, resume and abort writes an audit record inside the same mutation and fails closed, because a gate change stops or reopens every writer in a scope and an operator must be able to find who did it; the doc fails closed only for mandatory business or security audit and does not name gate changes among them (E-8, D19)
- A local reaction refused by the gate is delayed, not counted: the obligation wrapper reschedules the same attempt without incrementing its attempt count, as `spec:obligations.local-reaction-wrapper` rules, so a pause never turns pending work into needs attention (D13, D9, E-51)

## Design

The gate is one document so that a command pays one point read. Scopes are strings so that the same document serves tenants, read models and the whole deployment without a table per kind. The refusal is a `ConvexError` whose data is the outcome boundary's `TransientData`, `kind` equal to `"transient"` and `code` equal to `"writePaused"`, the shape the boundary gives every transient refusal. `Actor` is the pipeline's actor type and `actorValidator` its validator.

- tableMaintenanceGates: `maintenanceGates: defineTable({ key: v.literal("gates"), closed: v.array(v.object({ scopeKey: v.string(), reason: v.string(), generationId: v.optional(v.id("generations")), changedAt: v.number(), changedBy: actorValidator })), updatedAt: v.number() })` (E-8, D9)
- indexGatesByKey: `.index("by_key", ["key"])` (E-8)
- indexGatesByKeyUse: the one point read every writer makes; the document is created open on first use (E-8, D9)
- typeScopeKey: `type ScopeKey = "all" | string` where a tenant scope is written `tenant:` followed by the tenant ID, a read-model scope `read-model:` followed by the read model name, and a source scope `source:` followed by the context ID, a colon and the stream type, built only by `scopesOfUseCase`, `startGeneration`, the journal's baseline driver and the operator functions (E-8, E-38, D11)
- fnGateAllows: `gateAllows(ctx: MutationCtx, scopes: ScopeKey[], allowGeneration?: Id⟨"generations"⟩): Promise⟨{ allowed: true } | { allowed: false; scopeKey: ScopeKey; reason: string }⟩` the one gate read: it reads `process.env.MAINTENANCE_MODE` and then the gate document once, and answers not allowed with the scope `all` and the reason `restore` while the variable is `restore`, and with the first closed entry that covers one of `scopes` unless that entry's `generationId` equals `allowGeneration`; a background batch calls it directly and parks when the answer is not allowed, as the rebuild's `step2` states, because a scheduled mutation that threw the refusal would end its chain instead of waiting (E-8, E-42, D9, F9)
- fnAssertWritable: `assertWritable(ctx: MutationCtx, scopes: ScopeKey[]): Promise⟨void⟩` calling `gateAllows` with no generation and throwing `writePaused` with the answer's scope and reason when it is not allowed; the command pipeline's step 7 calls it, and nothing else does (E-8, D9)
- restoreDoor: `gateAllows` runs in the parent and reads `process.env.MAINTENANCE_MODE` before the gate document; the value `restore` refuses every write with `writePaused` and the scope `all`, so the restore procedure keeps writers out even though the snapshot replaced the gate, and parks every rebuild batch until the accepted branch resumes it; the procedure's own six mutations do not call `gateAllows` or `assertWritable` and write only `restoreRuns` and the generation rows they resume, as `spec:application.restore` states; no component reads the variable (E-42, D19, F11)
- fnScopesOfUseCase: `scopesOfUseCase(tenantId: string, readModels: string[], writes: SourceRef[]): ScopeKey[]` returning `all`, the tenant scope, one read-model scope per maintained read model and one source scope per `SourceRef` of the declaration's `writes`, so a command is held by a paused rebuild of any view whose sources it writes (E-8, E-38, D9)
- errorCodeWritePaused: `writePaused`, the transient code the outcome boundary reserves, thrown through the boundary's `refuseTransient({ code: "writePaused", message: "write paused for " + scopeKey + ": " + reason })`, so its data is `TransientData` with `kind` equal to `"transient"`; a transient refusal for capacity, never a stored rejection (D4, Law 6, E-35)
- fnCloseScope: `closeScope(ctx: MutationCtx, scopeKey: ScopeKey, reason: string, actor: Actor, generationId?: Id⟨"generations"⟩): Promise⟨void⟩` adding the scope to `closed` and writing the audit record in the caller's mutation; called by `closeGate` and by the rebuild's `startGeneration`, which passes the ID of the generation row it has just inserted (E-8, D9, D19)
- fnCloseGate: `export const closeGate = internalMutation({ args: { scopeKey: v.string(), reason: v.string(), actor: actorValidator }, returns: v.null(), handler })` the operator's entry to `closeScope` for a tenant, a source stream type or the `all` scope, with no generation, which is also how a meaning migration's sweep is run under a pause when the operator wants one; the source scopes of a paused rebuild are closed by `startGeneration` and never ahead of it, because a closed entry can only admit a generation that exists (E-8, E-25, D9, D19)
- fnResumeScope: `resumeScope(ctx: MutationCtx, scopeKey: ScopeKey, actor: Actor): Promise⟨void⟩` removing the scope from `closed` and writing the audit record in the caller's mutation; called by `resumeGate` and by the rebuild's `abortGeneration` (E-8, D9, D19)
- fnResumeGate: `export const resumeGate = internalMutation({ args: { scopeKey: v.string(), actor: actorValidator, abort: v.optional(v.boolean()) }, returns: v.null(), handler })` the operator's entry to `resumeScope`, refusing while the served generation is still building, verifying or verified unless `abort` is set, in which case it aborts the generation in the same mutation (E-8, D9, Sc L2-6)
- fnGetGate: `export const getGate = internalQuery({ args: {}, returns: gateDoc, handler })` for the operator and the acceptance tests (E-8, D19)
- occSerialization: a writer's mutation reads the gate document; a close that commits first invalidates that read, the writer re-runs, reads the closed gate and refuses; a writer that commits first wrote before the close, which is the consistent cut; a batch scheduled before the close but started after it reads the closed gate like any writer, so no closing state, drain interval or confirmation is needed, and the one-second mutation timeout plays no part (F1, D9, E-8)
- limitClosedScopes: at most 16 scopes closed at once, so the gate document stays a few kilobytes and the writer check scans an array in memory (E-8, F13)
- limitGateReadsPerCommand: 1 point read per command; the first experiment counts it (E-8, Sc L2-3)

## Verification — reviewed

- A reviewer confirms that `assertWritable` is called by the command pipeline's step 7 for every command, that `gateAllows` is called by every background batch before its first write and that the batch parks rather than throws on a refusal, that the two are one read because `assertWritable` is `gateAllows` plus the throw, that the restore procedure's six mutations are the only exemption and write only `restoreRuns` and the generation rows they resume, and that no function caches the gate across mutations.
- A reviewer confirms that no function other than `startGeneration` closes a source scope for a rebuild, so every closed entry that serves a rebuild names a generation row that exists, and that the journal's baseline driver reads the gate with the source scope of the stream type it migrates before every batch.
- A reviewer confirms that `writePaused` appears in the outcome boundary's closed code list as a transient refusal and is never stored as a rejection.
- A reviewer confirms that the restore workflow sets `MAINTENANCE_MODE` before the snapshot is restored and clears it only after its checks, and that `assertWritable` reads the variable before the gate document.
