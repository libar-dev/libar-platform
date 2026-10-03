---
id: spec:context.event-envelope
kind: contract
altitude: story
readiness: defined
relations:
  refines: spec:context.journal
  dependsOn:
    - spec:command.actor-and-scope
  decidedBy: spec:decisions.d02-context-owns-state-and-journal
  constrainedBy:
    - spec:facts.f13-transactions-have-limits
    - spec:facts.f01-serializable-mutations-under-occ
    - spec:laws.law06-technical-failure-never-a-rejection
    - spec:constraints.events-stay-small
---
# The event envelope

Layer 1 · Detail: full · Traces: D2, D11, D19, F13, S4, E-6, E-12, E-26.

Every event carries the fifteen fields the doc fixes: a stable application identity, its ownership scope, its exact position within one subject's history, its historical contract, the operation and correlation that produced it, its immediate cause, the server-established actor, when it was recorded and optionally when it occurred, and validated, bounded fact data. This contract pins them as one validator and one type. The adapter builds the envelope from the decider's domain event, the operation reference the parent passed and the stream it appends to; the decider never sees envelope fields.

## Intent

- outcome: Pin the envelope as one validator and one type so that every event in every context has the same fifteen fields with the same meaning (D2)
- value: A cross-context reference, a diagnosis by operation, an actor trail and a rebuild all read the same shape (D2, D19)
- risk: The actor type is defined by the command family; a change there changes every stored event's shape, so the actor validator must stay backward compatible or events need an envelope schema version, which this design does not add (D11, E-6)

### Open questions

- [non-blocking] Extension E-26: the doc lists the fifteen fields and their meaning; this Spec fixes the validator shapes, the `CausedBy` union with a migration variant for baseline events, the `OperationRef` the parent passes, and the event ID as a version 4 UUID from the runtime's `crypto`; the owner confirms (D2, E-26)
- [non-blocking] Extension E-12: the doc says events stay small and gives no number for the envelope; this Spec bounds the envelope beside the payload at `limitEnvelopeBytes`, 4,096 bytes, and each text field of it that a caller can set at 256 bytes of UTF-8, 512 for an actor's ID, so the largest stored event, `limitEventBytes`, is derived and enforced and never assumed; the owner may set other numbers, and the fold bound of `spec:context.journal` moves with them (E-12, D19, F13)

## Contract

- `eventId` is the event's stable application identity (D2)
- `tenantId` and `contextId` are its ownership scope (D2)
- `streamType`, `streamId` and `streamVersion` give its exact order within one subject's history (D2)
- `eventType` and `eventSchemaVersion` are its historical contract (D2)
- `operationId` names the root command or use case that produced it (D2)
- `correlationId` is optional diagnostic grouping across operations (D2)
- `causedBy` is the immediate cause, a command or a triggering event (D2)
- `actor` is the server-established actor kind, identity and delegation reference (D2, D11)
- `recordedAt` is when the event was recorded, and `occurredAt` optionally when it happened in the domain if that differs (D2)
- `payload` is validated, bounded fact data (D2)
- The actor is the one type of `spec:command.actor-and-scope`; the envelope reuses its validator and never defines a second actor (D11, E-6)
- Every identity in the envelope is a plain string, because `Id` types become strings outside a component and a cross-context reference must survive the boundary (D2, S4)
- The payload is validated against the context's validator for its event type before the append (D2)
- The payload byte bound is the constraint `spec:constraints.events-stay-small` of Package D; the envelope beside the payload measures at most `limitEnvelopeBytes`, so a stored event has a largest size, `limitEventBytes`, and every fold, query and migration budget cites it (D19, F13, E-12)
- [extension] Every text field of the envelope that a caller can set has a bound in UTF-8 bytes, checked where it enters and before any event is written: the tenant ID, the correlation ID, the actor's fields and the cause at the pipeline's step 1, and the stream ID at the persistence adapter's step 1; a field above its bound is answered with rejection `invalidInput` naming the field (E-12, E-34, D19, F13)
- [extension] The journal's `append` measures the envelope of every event it inserts and throws a plain error above `limitEnvelopeBytes`, so the bound also holds for a context ID, a stream type, an event type and a migration's name, which are names of a declaration and no caller's input, and for a context operation that code other than the pipeline calls (E-12, D19, Law 6)
- [extension] `causedBy` has a third variant for a migration, so a baseline event names the migration that wrote it (E-26, D5)
- [extension] `eventId` is a version 4 UUID from `crypto.randomUUID()`, generated by the adapter at append; a rerun after an engine retry starts the transaction over, so a fresh value on rerun is harmless (E-26, D2, F1)

## Design

- typeCausedBy: `type CausedBy = { kind: "command"; commandType: string } | { kind: "event"; tenantId: string; contextId: string; eventId: string } | { kind: "migration"; migrationName: string }` (D2, E-26)
- validatorCausedBy: `const causedByValidator = v.union(v.object({ kind: v.literal("command"), commandType: v.string() }), v.object({ kind: v.literal("event"), tenantId: v.string(), contextId: v.string(), eventId: v.string() }), v.object({ kind: v.literal("migration"), migrationName: v.string() }))` (D2, E-26)
- causedByProducers: the `command` variant is minted by the command pipeline's step 7 from the declaration's name; the `event` variant is minted by the same step from the optional `causedBy` argument of the internal entry, which a reaction issuing a derived command passes with its obligation's source event, so a derived command's events name the publication event as their cause; the `migration` variant is written only by the journal's baseline writer; no other code builds a `CausedBy` (D2, D13, E-26, E-31)
- typeOperationRef: `type OperationRef = { operationId: string; correlationId?: string; causedBy: CausedBy }` is what the parent passes with every context call and what the adapter copies onto every event (D2, E-26)
- validatorOperationRef: `const operationRefValidator = v.object({ operationId: v.string(), correlationId: v.optional(v.string()), causedBy: causedByValidator })` (D2, E-26)
- typeEventEnvelope: `type EventEnvelope<P = unknown> = { eventId: string; tenantId: string; contextId: string; streamType: string; streamId: string; streamVersion: number; eventType: string; eventSchemaVersion: number; operationId: string; correlationId?: string; causedBy: CausedBy; actor: Actor; recordedAt: number; occurredAt?: number; payload: P }` (D2)
- validatorEventEnvelope: `const eventEnvelopeValidator = v.object({ eventId: v.string(), tenantId: v.string(), contextId: v.string(), streamType: v.string(), streamId: v.string(), streamVersion: v.number(), eventType: v.string(), eventSchemaVersion: v.number(), operationId: v.string(), correlationId: v.optional(v.string()), causedBy: causedByValidator, actor: actorValidator, recordedAt: v.number(), occurredAt: v.optional(v.number()), payload: v.any() })` (D2)
- typeEnvelopeInput: `type EnvelopeInput = { tenantId: string; contextId: string; streamType: string; streamId: string; operation: OperationRef; actor: Actor; recordedAt: number }` is what the adapter hands `append`, which adds `eventId`, `streamVersion` and the domain event's own fields (D2, E-26)
- eventIdGeneration: `crypto.randomUUID()` in the component's mutation; the default Convex runtime lists `crypto` among its Web Crypto APIs (E-26, D2)
- recordedAtSource: `Date.now()` in the mutation, which Convex freezes for the whole function, so every event of one call carries the same `recordedAt` (D2)
- occurredAtSource: copied from the domain event when the decider set it, otherwise absent (D2)
- limitPayloadStructure: a payload is a Convex value inside a document of at most 1 MiB, 1024 fields, nesting depth 16 and 8192 array elements; the design bound in bytes is E-12, and the journal's `append` is the one place that measures it (F13, E-12)
- envelopeTextBounds: [extension] the text fields of the envelope a caller can set, their bounds in UTF-8 bytes measured with `utf8Length` and the place each is checked: `tenantId` 256, `correlationId` 256, `actor.id` 512, `actor.issuer` 256, `actor.onBehalfOf.id` 512, `actor.delegationRef` 256 and each text field of `causedBy` 256, all at step 1 of `spec:command.command-pipeline` as its `limitCallText` lists them; `streamId` 256, at step 1 of `spec:context.persistence-adapter`; `eventId` and the pipeline's `operationId` are version 4 UUIDs of 36 bytes; `contextId`, `streamType`, `eventType` and a migration's name are names of a declaration, bounded by `limitEnvelopeBytes` alone (D2, D11, F13, E-12, E-34)
- limitEnvelopeBytes: [extension] `limitEnvelopeBytes` is 4,096 bytes for the envelope of one event beside its payload, measured as `getConvexSize(event) - getConvexSize(event.payload)` over the fifteen-field value `append` inserts; the journal's `append` is the one place that measures it, for every event type, `baseline` included, and throws a plain error, a technical failure, whose message names the event type, the measured bytes and the bound, each number in decimal digits with no separator; an envelope whose caller-set text fields are all at their bounds, with an actor of kind `reviewer` that carries every optional field, `causedBy` of kind `event`, `occurredAt` set and the two UUIDs, measures 3,486 bytes with an empty context ID, stream type and event type, which leaves those three names 610 bytes together, so no command the pipeline accepted meets this error while each of the three names is at most 200 bytes (F13, D19, Law 6, E-12)
- limitEventBytes: [extension] `limitEventBytes` is 20,480 bytes, `limitPayloadBytes` of `spec:context.journal` plus `limitEnvelopeBytes`, the largest `getConvexSize` of an event other than a `baseline` as `append` inserts it; the stored document adds its two system fields, 61 bytes as `getDocumentSize` of `convex/values` counts them, so one stored event reads as at most 20,541 bytes, and every budget that multiplies a count of events by a size cites this figure; a `baseline` event measures at most its stream type's `budgetBytes` plus `limitEnvelopeBytes` and the same 61 bytes; the context library exports both constants beside `limitPayloadBytes` (F13, D19, E-12, E-25)
- payloadValidation: `registration.eventValidators[event.eventType]` is applied to `event.payload` before the insert through `validate` of `convex-helpers/validators`, because `convex/values` exports no run-time validator, and a payload it refuses or a missing validator for an event type is a defect that throws (D2, D12)

## Verification — reviewed

- A reviewer confirms that the events table's validator in `spec:context.tables` is this envelope and nothing else, and that no field is ordered on `recordedAt` or `_creationTime`.
