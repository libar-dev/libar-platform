---
id: spec:obligations.record-contract
kind: contract
altitude: story
readiness: defined
relations:
  refines: spec:obligations.obligation-module
  dependsOn: spec:command.actor-and-scope
  constrainedBy:
    - spec:facts.f13-transactions-have-limits
    - spec:facts.f16-scheduled-functions-table-shows-failed-runs
    - spec:laws.law07-deferred-work-never-reported-early
    - spec:laws.law08-durable-capability-ships-operations
    - spec:laws.law11-tenant-scope-named
---
# Obligation record contract

Layer 3 · Detail: full where D13 rules; numbers provisional until the first experiment · Traces: D13, D2, D11, D14, D15, D19, F13, F16, E-10, E-57.

The `obligations` table is the one record of promised deferred work, and `obligationRepairs` is the one record of operator repairs. Every field D13 lists is a validator here, once, and every other Spec in the family reads these shapes rather than redefining them. The actor, scope and `Authority` validators come from `spec:command.actor-and-scope` and are never restated; the cross-context reference to a source event follows D2's `(tenantId, contextId, eventId)` with the tenant on the row.

## Intent

- outcome: Pin the `obligations` and `obligationRepairs` tables, their validators and their indexes so that the wrapper, the sweeper, the retention batch and the operator operations read one shape (D13, E-10)

### Open questions

- [non-blocking] Extension E-10: the doc lists the fields and the six states but not the concrete table, the index set, the payload bound or the evidence shapes; this Spec pins them, with the inline payload bounded at 64 KiB and completion evidence as a closed union; the doc names four meanings of needs attention, exhausted, uncertain, authority revoked and unsupported version, and this design adds two reasons the doc describes without naming, `recoveryFailing` for the sweeper's escalation when recovery itself keeps failing and `chainBound` for a reaction refused at the chain's depth bound, which the owner confirms (D13, E-10, E-52, E-54)
- [non-blocking] Extension E-57: the sweeper and the retention batch are deployment-wide, so `by_status_next_attempt`, `by_status_lease_expiry` and `by_status_settled_at` lead with `status` rather than `tenantId`; every index a tenant-scoped query reads still leads with `tenantId`, and tenant fairness in the sweeper's scan order stays a policy to add when one tenant can starve another (D13, Law 11, E-57)

## Contract

- One row is one promise; `effectKey` is unique per tenant and logical effect and the uniqueness check is an indexed read in the creating transaction, never an index alone (D13, D2)
- The row holds the source operation and, where there is one, the source event as a cross-context reference (D13, D2)
- The row holds the handler key, handler version and payload schema version, and the wrapper refuses an unsupported version with needs attention (D13, D19)
- The row holds the exact accepted payload inline, or an immutable versioned reference to an event, never a pointer to the latest payload (D13)
- The row holds the server-established authority the attempt runs under and the mode that says whether the delegating user's rights are rechecked, as the one `Authority` shape of `spec:command.actor-and-scope` (D13, D11, E-6)
- The row holds status, next attempt time, attempt count and deadline (D13)
- The row holds an attempt number and an active attempt ID that fence stale dispatches (D13)
- For an external call the row holds a lease expiry and the provider key; the lease marks execution ownership and proves nothing about provider cancellation (D13, D14)
- The row holds completion evidence or the last classified error, never both as the answer; late evidence from a stale worker is kept beside them (D13, D14)
- The scheduler ID on the row is execution metadata; a missing or failed dispatch row in `_scheduled_functions` never changes what the obligation proves (D13, F16)
- Every repair writes one `obligationRepairs` row with reason, actor, old and new attempt, and the exact subject, in the transaction of the repair (D13, Law 8)
- [extension] The inline payload is bounded at 64 KiB and `lastError.message` at 1 KiB so a row stays far below the 1 MiB document limit and diagnostics never hold unbounded payloads (D19, F13, E-10)
- [extension] `lateEvidence` keeps at most the ten most recent late reports; older ones are compacted by retention while the compact identity stays (D13, D19, E-10)

## Design

- typeObligationStatus: `type ObligationStatus = "pending" | "running" | "succeeded" | "needsAttention" | "cancelled" | "abandoned"` (D13)
- validatorObligationStatus: `const obligationStatusValidator = v.union(v.literal("pending"), v.literal("running"), v.literal("succeeded"), v.literal("needsAttention"), v.literal("cancelled"), v.literal("abandoned"))` (D13)
- validatorAttentionReason: [extension] `const attentionReasonValidator = v.union(v.literal("exhausted"), v.literal("uncertain"), v.literal("authorityRevoked"), v.literal("unsupportedVersion"), v.literal("recoveryFailing"), v.literal("chainBound"))` where the first four are D13's meanings and the last two are the design's, written by the sweeper's escalation and by the chain bound of `spec:obligations.fan-out-and-chains` (D13, D19, E-10, E-52, E-54)
- validatorObligationKind: `const obligationKindValidator = v.union(v.literal("local"), v.literal("external"))` (D13, D14)
- validatorSourceEvent: `const sourceEventValidator = v.object({ contextId: v.string(), eventId: v.string() })` (D2, D13)
- typePayload: `type Payload = { kind: "inline"; value: unknown } | { kind: "eventRef"; contextId: string; eventId: string; eventSchemaVersion: number }` the type the wrapper's `HandlerArgs` and the effect's `CallInput` carry (D13, E-10)
- validatorPayload: `const payloadValidator = v.union(v.object({ kind: v.literal("inline"), value: v.any() }), v.object({ kind: v.literal("eventRef"), contextId: v.string(), eventId: v.string(), eventSchemaVersion: v.number() }))` (D13)
- validatorAuthority: `authorityValidator` and its type `Authority` are the ones `spec:command.actor-and-scope` pins under E-6, `{ actor, scope, mode }` with the modes `recheckDelegator` and `serviceAuthority`, imported by this table and never redefined (D11, D13, E-6)
- typeCompletionEvidence: `type CompletionEvidence = { kind: "events"; events: { contextId: string; eventId: string; streamVersion: number }[] } | { kind: "provider"; providerKey: string; providerRef: string; observedAt: number; attemptNumber: number } | { kind: "businessRejection"; code: string; attemptNumber: number } | { kind: "operatorDecision"; repairId: Id⟨"obligationRepairs"⟩ }` the type the wrapper's `HandlerResult` and the settle carry (D13, D14, Law 7, E-10)
- validatorCompletionEvidence: `const completionEvidenceValidator = v.union(v.object({ kind: v.literal("events"), events: v.array(v.object({ contextId: v.string(), eventId: v.string(), streamVersion: v.number() })) }), v.object({ kind: v.literal("provider"), providerKey: v.string(), providerRef: v.string(), observedAt: v.number(), attemptNumber: v.number() }), v.object({ kind: v.literal("businessRejection"), code: v.string(), attemptNumber: v.number() }), v.object({ kind: v.literal("operatorDecision"), repairId: v.id("obligationRepairs") }))` (D13, D14, Law 7)
- validatorLastError: `const lastErrorValidator = v.object({ class: v.union(v.literal("retryable"), v.literal("rejection"), v.literal("ambiguous"), v.literal("wrapper")), code: v.string(), message: v.string(), attemptNumber: v.number(), at: v.number() })` (D13, D4)
- validatorRetryOwner: `const retryOwnerValidator = v.union(v.literal("module"), v.literal("workpool"))` (D15)
- tableObligations: `obligations: defineTable({ tenantId: v.string(), effectKey: v.string(), kind: obligationKindValidator, operationId: v.string(), sourceEvent: v.optional(sourceEventValidator), causedByObligation: v.optional(v.id("obligations")), causationDepth: v.number(), handlerKey: v.string(), handlerVersion: v.number(), payloadSchemaVersion: v.number(), payload: payloadValidator, authority: authorityValidator, status: obligationStatusValidator, attentionReason: v.optional(attentionReasonValidator), nextAttemptAt: v.optional(v.number()), attemptCount: v.number(), maxAttempts: v.number(), deadline: v.optional(v.number()), attemptNumber: v.number(), activeAttemptId: v.optional(v.string()), dispatchId: v.optional(v.id("_scheduled_functions")), rearmCount: v.number(), retryOwner: retryOwnerValidator, leaseExpiresAt: v.optional(v.number()), providerKey: v.optional(v.string()), providerKeyIssuedAt: v.optional(v.number()), completionEvidence: v.optional(completionEvidenceValidator), lateEvidence: v.optional(v.array(completionEvidenceValidator)), reconcileRequested: v.optional(v.boolean()), lastError: v.optional(lastErrorValidator), createdAt: v.number(), updatedAt: v.number(), settledAt: v.optional(v.number()) })` (D13, D14, D15, F13)
- indexObligationsByEffectKey: `.index("by_effect_key", ["tenantId", "effectKey"])` (D13)
- indexObligationsByEffectKeyUse: the read-check-insert in `createObligation` and the reactive completion query by effect key (D13, D6)
- indexObligationsByOperation: `.index("by_operation", ["tenantId", "operationId"])` (D19)
- indexObligationsByOperationUse: diagnosis by operation ID and the receipt's view of what one operation promised (D19, D2)
- indexObligationsByCausation: `.index("by_causation", ["tenantId", "causedByObligation"])` (D19, D13)
- indexObligationsByCausationUse: diagnosis by causation along a reaction chain (D19)
- indexObligationsByTenantStatus: `.index("by_tenant_status", ["tenantId", "status", "updatedAt"])` (D13, Law 11)
- indexObligationsByTenantStatusUse: operator listing of needs attention and pending work for one tenant, paginated by `updatedAt` (D13, Law 8)
- indexObligationsByStatusNextAttempt: `.index("by_status_next_attempt", ["status", "nextAttemptAt"])` (D13, E-57)
- indexObligationsByStatusNextAttemptUse: [extension] the sweeper's scan of pending obligations whose next attempt is past due plus grace (D13, E-57)
- indexObligationsByStatusLeaseExpiry: `.index("by_status_lease_expiry", ["status", "leaseExpiresAt"])` (D14, E-57)
- indexObligationsByStatusLeaseExpiryUse: [extension] the sweeper's scan of running obligations whose lease has expired (D14, E-57)
- indexObligationsByStatusSettledAt: `.index("by_status_settled_at", ["status", "settledAt"])` (D19, E-57)
- indexObligationsByStatusSettledAtUse: [extension] the retention batch's scan of completed obligations past their horizon (D19, E-57)
- tableObligationRepairs: `obligationRepairs: defineTable({ tenantId: v.string(), obligationId: v.id("obligations"), effectKey: v.string(), operation: v.union(v.literal("retry"), v.literal("reconcile"), v.literal("cancel"), v.literal("abandon")), reason: v.string(), actor: actorValidator, oldAttemptNumber: v.number(), newAttemptNumber: v.optional(v.number()), oldStatus: obligationStatusValidator, newStatus: obligationStatusValidator, evidence: v.optional(completionEvidenceValidator), at: v.number() })` (D13, Law 8)
- indexRepairsByObligation: `.index("by_obligation", ["tenantId", "obligationId", "at"])` (D13)
- indexRepairsByObligationUse: the repair history shown by `inspect` (D13, Law 8)
- indexRepairsByTenantTime: `.index("by_tenant_time", ["tenantId", "at"])` (D19)
- indexRepairsByTenantTimeUse: audit listing of repairs for one tenant in time order (D19)
- limitInlinePayload: [extension] 64 KiB per inline payload, a provisional default checked at `createObligation`; larger payloads use an event reference (D19, F13, E-10)
- limitLateEvidence: [extension] 10 entries in `lateEvidence`, provisionally; an eleventh report drops the oldest after retention compacts it into a count (D13, E-10)
- limitIndexes: 7 indexes on `obligations`, the seven `index` bullets above, and 2 on `obligationRepairs`, under the 32 per table, with at most 3 fields each (F13)
