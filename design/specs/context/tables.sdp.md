---
id: spec:context.tables
kind: contract
altitude: story
readiness: defined
relations:
  refines: spec:context.context-component
  dependsOn: spec:kernel.state-document-mapping
  decidedBy: spec:decisions.d02-context-owns-state-and-journal
  constrainedBy:
    - spec:facts.f13-transactions-have-limits
    - spec:laws.law11-tenant-scope-named
---
# The context tables

Layer 1 · Detail: full · Traces: D2, D5, D19, F13, S9, E-2, E-3, E-25, E-26.

Each context component owns a `streams` table and an `events` table, and a context whose stream type uses the derived mapping owns a `streamParts` table as well. The stream row holds the stream metadata and, in the default mapping, the whole state; the events table holds the journal with the envelope of `spec:context.event-envelope`. The indexes are the three the doc names, replay, identity and enumeration, plus the operation index the doc implies for diagnosis and receipts. Every index leads with `tenantId`. Nothing orders on `_creationTime`.

## Intent

- outcome: Pin the tables and indexes of a context as pasteable `defineTable` expressions, with the deleted-subject marker and the size budgets (D2, E-3)
- value: The adapter's version check, the rebuild's fold, the enumeration and the operation lookup each have one index whose field order matches the query (D2)
- risk: Every index is a write-path cost per event and per stream row; the doc adds an index only when a real query needs it, so a context that needs a filtered list adds its own index deliberately (D2)
- assumption: 32 indexes per table, 16 fields per index, and 1 MiB per document (F13, S9)

### Open questions

- [non-blocking] Extension E-3: the doc names three indexes and the fields of the envelope; this Spec fixes the concrete tables, the operation index, the `streamParts` table for the derived mapping, the deleted-subject marker as `deletedAt` on the stream row and the size budgets; the owner confirms (D2, E-3)

## Contract

- The `streams` table holds one row per stream with its identity, current version, saved state or head, state schema version, latest baseline version, deleted-subject marker and last operation (D2, E-3)
- The `events` table holds one row per event with exactly the envelope's fifteen fields (D2)
- The `streamParts` table exists only in a context with a derived mapping and holds one row per named part of a stream's state (E-2, E-3)
- The replay index is `by_stream` on the events table, ordered by stream version within one stream (D2)
- The identity index is `by_event_id` on the events table (D2)
- The enumeration index is `by_identity` on the streams table, which also serves the identity lookup and includes deleted subjects (D2)
- The operation index is `by_operation` on the events table, for diagnosis by operation ID and for a receipt's stream versions (D2, D19)
- Every index leads with `tenantId`; no query on tenant data runs without it (Law 11, D11)
- No query orders on `_creationTime` or `recordedAt`; order within a stream is `streamVersion` (D2)
- A deleted subject keeps its stream row with `deletedAt` set, so enumeration includes it and rebuild covers it (D2, E-3)
- [extension] A stream row stays under 256 KiB and a part under 256 KiB, and a stream's row and parts together stay under its mapping's `budgetBytes`, at most 256 KiB for a single mapping and 512 KiB for a derived one, the budgets of `spec:kernel.state-document-mapping` (E-2, F13)

## Design

- tableStreams: `streams: defineTable({ tenantId: v.string(), contextId: v.string(), streamType: v.string(), streamId: v.string(), streamVersion: v.number(), stateSchemaVersion: v.number(), state: v.any(), baselineVersion: v.optional(v.number()), deletedAt: v.optional(v.number()), lastOperationId: v.string(), updatedAt: v.number() }).index("by_identity", ["tenantId", "streamType", "streamId"])` (D2, E-3)
- indexStreamsByIdentityUse: identity lookup with `.eq` on all three fields and `.unique()`; enumeration with `.eq` on `tenantId` and `streamType`, ranging over `streamId`, paginated, deleted subjects included (D2)
- tableEvents: `events: defineTable({ eventId: v.string(), tenantId: v.string(), contextId: v.string(), streamType: v.string(), streamId: v.string(), streamVersion: v.number(), eventType: v.string(), eventSchemaVersion: v.number(), operationId: v.string(), correlationId: v.optional(v.string()), causedBy: causedByValidator, actor: actorValidator, recordedAt: v.number(), occurredAt: v.optional(v.number()), payload: v.any() }).index("by_stream", ["tenantId", "streamType", "streamId", "streamVersion"]).index("by_event_id", ["tenantId", "eventId"]).index("by_operation", ["tenantId", "operationId"])` (D2, E-26)
- indexEventsByStreamUse: replay in ascending `streamVersion` with `.eq` on the three identity fields; the expected-version check with the same `.eq` and `.gt("streamVersion", expected)` and `.first()`; the rebuild's range from the latest baseline with `.gte("streamVersion", baselineVersion ?? 1)`, which reads the baseline event first and the tail after it; the tail read of a history-reading migration step with `.gt("streamVersion", baselineVersion ?? 0)` (D2, D5, E-25)
- indexEventsByEventIdUse: resolving a cross-context reference `(tenantId, contextId, eventId)`; the context is known from the component being asked (D2)
- indexEventsByOperationUse: every event one operation produced in this context, for diagnosis by operation ID and for a receipt's list of stream versions (D2, D19)
- tableStreamParts: `streamParts: defineTable({ tenantId: v.string(), streamType: v.string(), streamId: v.string(), partKey: v.string(), part: v.any(), streamVersion: v.number() }).index("by_stream_part", ["tenantId", "streamType", "streamId", "partKey"])` registered only by a context with a derived mapping (E-2, E-3)
- indexStreamPartsByStreamPartUse: load every part of one stream with `.eq` on the three identity fields; write or delete one part with `.eq` on all four (E-2)
- deletedSubjectMarker: `deletedAt: v.optional(v.number())` on the stream row, set by the adapter when the mapping's `isDeleted(state)` becomes true; the row is never removed (D2, E-3)
- stateField: in the single mapping `state` holds the whole folded state; in the derived mapping it holds the head (E-2)
- stateSchemaVersionField: the meaning version the saved `state` was produced under, stamped by the adapter from the registration's `stateSchemaVersion` and compared with it on every load, so a row behind the registration is migrated through the baseline chain before it is decided on and a row ahead of it is a plain error (D5, E-25)
- lastOperationId: the `operationId` of the operation that last wrote the row, for diagnosis by operation ID (D19)
- schemaFile: the three `defineTable` expressions go in the component's `convex/schema.ts` inside `defineSchema({ ... })`; the parent's schema does not name them (D2, S4)
- limitStreamDocument: 256 KiB per stream row against the 1 MiB ceiling by default; the mapping's `budgetBytes` counts the row and, for a derived mapping, every part together, and is the one number every byte-derived bound reads (F13, E-2)
- limitPartDocument: 256 KiB per part and at most 32 parts per stream, with row and parts together at most the mapping's `budgetBytes`, which is at most 512 KiB for a derived mapping, so one load reads at most `budgetBytes` over at most 33 documents (F13, E-2)
- limitIndexes: four indexes across two tables, or five with the parts table, against 32 per table and 16 fields per index (F13, S9)
- noCreationTimeOrder: `_creationTime` and `recordedAt` are never used as an order across streams or as proof of delivery (D2)

## Verification — reviewed

- A reviewer confirms that the adapter's version check, the rebuild's fold and the queries' enumeration each use the index named here with `.eq` fields in the index's order.
- A reviewer confirms that the component's `schema.ts` contains exactly these tables and that no other table holds business state.
