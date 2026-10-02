---
id: spec:command.receipt-table
kind: contract
altitude: story
readiness: defined
relations:
  refines: spec:command.idempotency-and-receipts
  dependsOn: spec:command.actor-and-scope
  constrainedBy:
    - spec:facts.f13-transactions-have-limits
    - spec:laws.law11-tenant-scope-named
  decidedBy: spec:decisions.d06-idempotency-client-and-receipts
---
# The receipts table

Layer 1 · Detail: full · Traces: D6, D2, D19, Law 11, F13, E-4.

The `receipts` table lives in the parent, as the doc's ownership table assigns it, and holds one thin row per receipted command execution. Its key is four indexed fields, its fingerprint is a digest, and its payload is the outcome kind, the operation ID, the affected application IDs and the stream versions. A tombstone is the same row compacted: the key, the fingerprint and the outcome kind stay, the lists are emptied, and the expiry moves to the tombstone horizon.

## Intent

- outcome: Pin the `receipts` table, its indexes, the tombstone shape and the expiry defaults, so that the pipeline's lookup and the sweep are answered by one index each (D6, E-4)
- value: A reviewer can check that the key index supports the pipeline's lookup and that every index leads with the tenant (D6, Law 11)
- risk: A receipt with many affected refs grows; the bound of 1,000 refs keeps it under the document limit only while each ref's IDs stay short, which nothing enforces, and a command that touches more streams is too large for one transaction anyway (F13, D10)

### Open questions

- [non-blocking] Extension E-4: the doc fixes what a receipt holds and that expiry is explicit; the concrete fields, the three indexes, the tombstone shape and the defaults are the design's, and the expiry number is a product decision the declaration overrides (E-4, D6)

## Contract

- The table is owned by the parent, never by a context (D2)
- Every row names its tenant, and every index leads with `tenantId` (Law 11, D11)
- The key is the four fields `tenantId`, `namespace`, `commandType` and `requestKey`, indexed together, so the pipeline's lookup is one index range read with `.unique()` (D6)
- A row holds the outcome kind, the operation ID, the affected application IDs and the stream versions, and never the full original result (D6)
- A row holds the fingerprint and the contract version it was computed under, so a conflict is detected without the original input and a retry recorded under another contract version is refused explicitly as `unsupportedContractVersion` instead of compared (D6, E-5)
- A row holds `recordedAt` and `expiresAt`; a lookup treats a row at or past `expiresAt` as expired (D6, E-4)
- A tombstone is a row with `tombstone` true, `affected` and `versions` empty, and `expiresAt` at the tombstone horizon (D6, E-4)
- Rows are found for diagnosis by operation ID through `by_operation`, because stored receipts are the authority for what committed (D19)
- The per-tenant sweep reads `by_tenant_expiry` up to the current time and handles at most 1,000 rows per run (D19, F13, E-4)
- [extension] The default retry window is 7 days and the default tombstone horizon is never, both per declaration (E-4)

## Design

- tableReceipts: `receipts: defineTable({ tenantId: v.string(), namespace: callerNamespaceValidator, commandType: v.string(), requestKey: v.string(), fingerprint: v.string(), contractVersion: v.number(), outcome: v.union(v.literal("applied"), v.literal("businessFailure")), operationId: v.string(), affected: v.array(affectedRefValidator), versions: v.array(streamVersionValidator), actorId: v.string(), recordedAt: v.number(), expiresAt: v.number(), tombstone: v.boolean() }).index("by_key", ["tenantId", "namespace", "commandType", "requestKey"]).index("by_operation", ["tenantId", "operationId"]).index("by_tenant_expiry", ["tenantId", "expiresAt"])` (D6, F13, E-4)
- validatorAffectedRef: `affected: v.array(affectedRefValidator)` uses the kernel's `affectedRefValidator` from `spec:kernel.outcome-model`, whose fields are `contextId`, `streamType` and `streamId`; it is imported, never redefined here, and the pipeline derives the list from the versions the operation returned (D2, D6, E-21)
- validatorStreamVersion: `versions: v.array(streamVersionValidator)` uses the kernel's `streamVersionValidator` from `spec:kernel.outcome-model`, whose fields are `tenantId`, `contextId`, `streamType`, `streamId` and `version`; it is imported, never redefined here (D2, D8)
- indexReceiptsByKey: `.index("by_key", ["tenantId", "namespace", "commandType", "requestKey"])` (D6)
- indexReceiptsByKeyUse: the pipeline's step 5 lookup, four equalities and `.unique()`; the four fields are the whole key, so at most one row matches and a second would be a bug the `.unique()` call surfaces (D6)
- indexReceiptsByOperation: `.index("by_operation", ["tenantId", "operationId"])` (D19)
- indexReceiptsByOperationUse: diagnosis by operation ID and the conflict response's pointer to the original (D19, D6)
- indexReceiptsByTenantExpiry: `.index("by_tenant_expiry", ["tenantId", "expiresAt"])` (E-4)
- indexReceiptsByTenantExpiryUse: the sweep's range read of rows with `expiresAt` at or below now, one tenant per run (D19, E-4)
- typeReceipt: `type Receipt = Doc<"receipts">` (D6)
- tombstoneShape: the same document with `tombstone: true`, `affected: []`, `versions: []`, `expiresAt: tombstoneHorizon`, and every key, fingerprint, outcome and operation field unchanged (D6, E-4)
- expiryDefaults: `expiresAt = recordedAt + retention.window` with a default window of 7 days; `tombstoneHorizon` defaults to `Number.MAX_SAFE_INTEGER`, meaning never, and a declaration may set a finite horizon (D6, E-4)
- limitRowSize: [extension] at most 1,000 affected refs and 1,000 versions, the counts `insertReceipt` checks, keep a row under 400 KiB, below the 1 MiB document limit with room for the key fields, only while each entry measures under 200 bytes; the tenant ID, the request key and the command type are each at most `limitIdLength` bytes of UTF-8, checked at the pipeline's step 1; a stream ID inside an entry is at most 256 bytes, checked at the persistence adapter's step 1, and no check holds an entry under 200 bytes, so a row above the document limit fails at its insert as a technical failure; this is the one figure for receipt size in the corpus, and `spec:command.idempotency-and-receipts` cites it rather than restating it (F13, E-4)
- limitIndexes: three indexes of at most four fields, within the 32 indexes and 16 fields per index the platform allows (F13)
- fnSweep: `export const sweep = internalMutation({ args: { tenantId: v.string(), now: v.number(), limit: v.number() }, returns: v.object({ deleted: v.number(), compacted: v.number(), more: v.boolean() }), handler })` with `limit` capped at 1,000 (D19, E-4)

## Verification — reviewed

- A reviewer confirms that the pipeline's lookup uses `by_key` with all four equality fields and `.unique()`, and that no other code path reads receipts by a subset of the key.
- A reviewer confirms that no field of the table holds business input or a result, and that the tombstone keeps only what a conflict check and a duplicate answer need.
