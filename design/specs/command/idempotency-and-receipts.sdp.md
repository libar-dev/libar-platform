---
id: spec:command.idempotency-and-receipts
kind: behavior
altitude: feature
readiness: defined
relations:
  refines: spec:command.command-pipeline
  dependsOn: spec:command.tenancy-and-authority
  constrainedBy:
    - spec:laws.law04-server-scoped-idempotency-key
    - spec:laws.law05-authorization-before-execution-and-disclosure
    - spec:facts.f01-serializable-mutations-under-occ
    - spec:facts.f05-react-client-retries-until-confirmed
    - spec:facts.f06-client-mutations-run-in-order
    - spec:facts.f13-transactions-have-limits
  decidedBy:
    - spec:decisions.d06-idempotency-client-and-receipts
    - spec:decisions.d07-rejections-thrown-not-stored
---
# Idempotency and receipts

Layer 1 · Detail: full · Traces: D6, D7, Law 4, Law 5, F1, F5, F6, F13, Probe 1, Sc L1-3, Sc L1-4, Sc L1-5, Sc L1-9, E-33, E-34, E-36, E-39.

Idempotency has two halves. The Convex React client retries a mutation until it is confirmed and the backend executes each mutation call once, so a lost response to a UI command is already handled and no receipt is written for it. Receipts cover every caller that guarantee does not reach: HTTP actions and webhooks, mutations called from actions, workers, workflow steps and agents, and any caller that is not a Convex client. A receipt is the thin stored outcome of a receipted command, keyed by a server-built key and guarded by a fingerprint, read and inserted inside the pipeline's one mutation. A UI double submit is two separate mutation calls outside the guarantee; for a command that creates something, a client-generated entity ID plus the context's uniqueness check covers it without a receipt, and the uniqueness check is the persistence adapter's expected-version read, which answers the second submit with the reserved rejection `entityExists`.

This Spec owns the rules: where receipts are required, how the key and the fingerprint are built, what a duplicate, a conflict and a tombstone mean, when expiry happens, and why the read-check-insert pair serializes concurrent identical requests. The table itself is `spec:command.receipt-table`, and the step at which the pipeline reads and inserts is fixed in `spec:command.command-pipeline`.

## Intent

- actor: A non-UI caller that can retry outside the Convex client's own retry, and the UI that may submit a create twice (D6)
- problem: A worker sends the same command twice at once, or again after a lost response; a caller reuses a key with changed input; a retry follows a rate refusal; the UI double-submits a create; without receipts each of these can execute twice, and without the fingerprint a reused key can silently mean a different command (Sc L1-3, Sc L1-4, Sc L1-5, Sc L1-9)
- outcome: Each business intent executes once: the client guarantee covers UI commands, a receipt covers every receipted caller, a create carries a client-generated ID, and a rejected or transiently refused command stores nothing so its key stays free (D6, D7)
- value: Public UI commands carry no receipt write, and where receipts exist they are thin, so no result format has to stay decodable for the retry window and the client reads state through reactive queries anyway (D6)
- risk: The standing cost is one `receipts` table in the parent, one indexed read and one insert per receipted command, an explicit expiry policy and a tombstone for irreversible commands (D6)
- risk: The exact set of callers that need receipts depends on where the client guarantee ends; Probe 1 showed that it does not reach a caller of `ConvexHttpClient` that retries after a lost response; the internal entry requires a key and the public entry accepts one, so such a caller executes twice unless it supplies a key (D6, Probe 1)
- assumption: The React client retries mutations until confirmed and the backend executes each call once (F5)
- assumption: React and Rust clients run one client's mutations one at a time, in order (F6)
- assumption: Mutations are serializable under optimistic concurrency, which is what makes the read-check-insert pair serialize (F1)

### Open questions

- [non-blocking] Probe 1 showed on the pinned backend that a closed client leaves its mutation executed once or not at all, that a backend restart leaves it executed once, and that `ConvexHttpClient` does not retry, so a caller's retry is a second execution; whether the public entry requires a request key from callers of the HTTP client, or leaves it optional, is the owner's ruling; the design takes it optional on the public entry and required on the internal entry, a provisional reading the owner rules (Probe 1, D6, E-33)
- [non-blocking] Extension E-33: a public caller may supply a request key to opt into a receipt, and the internal entry always requires one; the doc lists the callers that need receipts and does not say whether a UI caller may opt in (E-33, D6)
- [non-blocking] Extension E-34: the doc says expiry is explicit and names no number; here the default retry window is 7 days per command, expiry is checked lazily at lookup so the core path needs no job, and a bounded per-tenant sweep deletes expired receipts in batches of at most 1,000; the tenant ID and the request key are bounded to 256 bytes of UTF-8, a declaration name above that bound is a defect and a plain error, and a receipt is bounded to 1,000 affected refs; the owner has not ruled (E-34, D6, D19, F13)
- [non-blocking] Extension E-36: the doc says the fingerprint covers business input and its contract version; here it is the SHA-256 digest, computed with the Convex runtime's `crypto.subtle.digest`, over the canonical JSON of the business input with object keys sorted, followed by the contract version; the outside facts the executor captures travel beside the input and are excluded, so a retry that captures a fresher fact is not a conflict, which the decider contract cites; a change to the canonical form is a contract version bump (E-36, D6, D3)
- [non-blocking] Extension E-39: the doc says a client-generated entity ID plus a uniqueness check gives one entity on a UI double submit and does not say what the second submit is told; here the second submit is answered with the rejection `entityExists` naming the existing entity, not with an idempotent success, because no receipt exists on the UI path to replay an outcome from and the client already holds the entity ID it needs to read the result; the owner may prefer an idempotent success, which would need a receipt on every create (E-39, D6, Sc L1-4)

## Behavior

- rule: The Convex client's own retry covers a UI command; the backend executes each mutation call once, so a lost response to a UI command needs no receipt (D6, F5)
- rule: A receipt is required for HTTP actions and webhooks, mutations called from actions, workers, workflow steps and agents, and any caller that is not a Convex client (D6, Law 4)
- rule: Every command a caller can retry outside the Convex client's own retry carries a server-scoped idempotency key (Law 4)
- rule: The server builds the key from tenant, caller namespace, command type and request key; a public caller cannot choose a system namespace (D6, Law 4)
- rule: The fingerprint covers the business input and its contract version, never retry timestamps, the request key, the actor or client metadata; the same key with a different fingerprint is a conflict, and the original outcome and state stay unchanged (D6, Sc L1-5)
- rule: Authorization is checked again before a stored outcome is disclosed; a duplicate from a caller whose grant was revoked receives `forbidden` and no part of the receipt (D6, Law 5, Sc L1-8)
- rule: Holding a request key gives no authority over the receipt stored under it; a conflict answer and an unsupported-version answer say that the key is taken and disclose nothing of the stored receipt, no operation ID, no outcome, no affected ref, no stream version and no actor, because the current call's authorization covers its own input and not the subject the receipt was recorded for (D6, Law 5, Sc L1-5)
- rule: Expiry is explicit and declared per command; an irreversible command keeps a compact tombstone or relies on a domain uniqueness rule, and a reversible command's receipt is deleted at expiry (D6)
- rule: One transaction reads, checks and inserts the receipt, so concurrent identical requests serialize and only one effect commits; the second of two concurrent identical requests is retried by the engine after the first commits and then finds the receipt (D6, F1, Sc L1-3)
- rule: A single-transaction command needs no pending state; the receipt is inserted with the outcome, never before it (D6)
- rule: Rate admission for new intent runs after a duplicate is recognized, so a valid retry is never refused for capacity (D6, Sc L1-9)
- rule: Receipts are thin: outcome kind, operation ID, affected IDs and stream versions; they never store the full original result (D6)
- rule: A rejected command stores nothing, so its key stays unused, and a transient refusal stores nothing either (D6, D7)
- rule: A UI double submit is two separate mutation calls outside the guarantee; a create command carries a client-generated entity ID and the context's uniqueness check, the persistence adapter's expected-version read at version 0, refuses the second submit with the reserved rejection `entityExists` that names the existing entity (D6, E-21, Sc L1-4)
- rule: [extension] The second submit of a create is answered with a rejection, never with an idempotent success, because the UI path writes no receipt to replay from and the client holds the entity ID (E-39, D6, Sc L1-4)
- rule: A duplicate is answered with the stored thin outcome and `replayed` true; when only a tombstone survives, the answer carries the outcome kind and operation ID with empty affected IDs and versions, and the caller reads current state through a query (D6, E-30)
- rule: A replay answers with `result` null, and the entry's returns validator admits it on its replayed member, so a duplicate is a value under the command's closed wire type and never a validator failure at the boundary (D6, E-30)
- rule: A receipt recorded under a contract version other than the declaration's cannot have its fingerprint compared; the retry is refused explicitly as rejection `unsupportedContractVersion`, which carries no details and names neither version, never replayed blindly and never reported as a conflict of input (D6, Law 5, E-5)
- rule: [extension] A public caller may supply a request key to opt into a receipt; when the key is absent the command relies on the client guarantee; the internal entry requires a request key (E-33)
- rule: [extension] A receipt whose `expiresAt` is at or before the mutation's `now` is treated as absent at lookup and deleted or compacted in the same mutation, so the core path runs no job; a bounded per-tenant sweep removes what lookups never touch (E-34)
- rule: [extension] The fingerprint is the SHA-256 digest of the canonical JSON of the business input followed by the contract version (E-36)
- flow: The pipeline builds the key from `tenantId`, `namespace`, `commandType` and `requestKey` and reads `receipts` by `by_key` with `.unique()` in the same transaction (D6, Law 4)
- flow: No receipt, or an expired non-tombstone receipt, classifies as new intent; the expired row is deleted in this mutation (D6, E-34)
- flow: A receipt or tombstone whose `contractVersion` differs from the declaration's throws rejection `unsupportedContractVersion` before the fingerprint is compared, with no details (D6, Law 5, E-5)
- flow: A receipt with the same fingerprint classifies as duplicate and returns the stored outcome with `replayed` true; a tombstone with the same fingerprint returns the outcome kind and operation ID with empty lists (D6, E-30)
- flow: A receipt or tombstone with a different fingerprint throws rejection `idempotencyConflict` with no details, so the answer carries nothing of the stored receipt (D6, Law 5, Sc L1-5)
- flow: New intent passes admission, executes, updates read models, and inserts the receipt with the outcome kind, operation ID, affected IDs, stream versions, fingerprint, contract version and expiry, all in the same transaction (D6, D8)
- flow: Two concurrent identical requests both read no receipt; the first commits its insert; the second's read set is invalidated, the engine retries it, and the retry finds the receipt and answers as a duplicate (F1, D6, Sc L1-3)

## Design

The receipt read and insert are helpers inside the pipeline's mutation, not registered functions. The key is four indexed fields rather than a concatenated string, so no delimiter can collide and the index answers the lookup in one range. The fingerprint is a digest so that a receipt never holds business input or personal data; a conflict answer names nothing of the original, and the caller that sent the original finds it by sending the same key with the same input, which is answered as a duplicate.

Expiry is lazy on the core path and swept in the background. A lookup that finds an expired reversible receipt deletes it and proceeds as new intent; a lookup that finds an expired irreversible receipt compacts it to a tombstone and answers as a duplicate. The sweep is one bounded batch per tenant that removes expired reversible receipts and compacts expired irreversible ones; it is an operations duty and never decides an outcome.

- transactionBoundary: read-check-insert inside the pipeline's one top-level mutation; the sweep is a separate bounded mutation per tenant (D6, D19)
- convexSurface: helpers `lookupReceipt`, `classifyReceipt`, `insertReceipt`, `fingerprintOf`; one `internalMutation` `receipts.sweep` per deployment, scheduled by operations, never on the command path (D6, E-34)
- typeReceiptKey: `type ReceiptKey = { tenantId: string; namespace: CallerNamespace; commandType: string; requestKey: string }` (D6, Law 4)
- typeReceiptClass: `type ReceiptClass = { class: "new" } | { class: "duplicate"; receipt: Doc<"receipts"> } | { class: "tombstone"; receipt: Doc<"receipts"> } | { class: "conflict" } | { class: "unsupportedVersion" }`, where the conflict and the unsupported-version members carry nothing of the row, so no caller of `classifyReceipt` holds anything of the stored receipt to relay (D6, Law 5, E-5)
- fnFingerprintOf: `fingerprintOf(input: unknown, contractVersion: number): Promise<string>` returns the lowercase hex SHA-256 of `canonicalJson(input) + "\n" + contractVersion` (D6, E-36)
- fnCanonicalJson: `canonicalJson(value: unknown): string` serializes `convexToJson(value)` of `convex/values` with object keys sorted at every depth, `undefined` members omitted and no whitespace, so the same business input always yields the same bytes and an int64, bytes, NaN, an infinity or -0 gets the one tagged encoding `convexToJson` gives it, and a value that is not a Convex value throws (E-36)
- fnLookupReceipt: `lookupReceipt(ctx: MutationCtx, key: ReceiptKey): Promise<Doc<"receipts"> | null>` reads `by_key` with `.unique()` (D6)
- fnClassifyReceipt: `classifyReceipt(found: Doc<"receipts"> | null, fingerprint: string, contractVersion: number, now: number): ReceiptClass` where `contractVersion` is the declaration's, compared with the row's before the fingerprint, and `now` is the mutation's `Date.now()`, which is constant for the whole execution (D6, E-34, E-5)
- fnInsertReceipt: `insertReceipt(ctx: MutationCtx, receipt: ReceiptInsert, retention: Retention = defaultRetention): Promise<Id<"receipts">>` inserts the thin receipt with `recordedAt` the mutation's `Date.now()`, `expiresAt` that plus `retention.window`, the declaration's `retention` passed by the pipeline, and `tombstone: false`, and throws a plain error when the receipt holds more than 1,000 affected refs or versions (D6, E-34)
- typeReceiptInsert: `type ReceiptInsert = ReceiptKey & { fingerprint: string; contractVersion: number; outcome: "applied" | "businessFailure"; operationId: string; affected: AffectedRef[]; versions: StreamVersion[]; actorId: string }` (D6)
- fingerprintInputs: the business input after step 1's parse and the declaration's `contractVersion`; excluded are `requestKey`, `tenantId`, `namespace`, the actor, timestamps, correlation IDs, any client metadata, and the outside facts the executor captures, which travel on the context call beside the input and never inside it (D6, Sc L1-5, E-36)
- duplicateResponse: `{ kind: receipt.outcome, result: null, operationId: receipt.operationId, affected: receipt.affected, versions: receipt.versions, replayed: true }`, the replayed member of the pipeline's `CommandResponse<R>`, where `result` is `null` because a receipt stores no result and the client reads state through a query, and the entry's returns validator admits it through its `v.null()` branch (D6, D8, E-30)
- tombstoneResponse: the same as `duplicateResponse` with `affected` and `versions` empty (D6, E-30)
- uiDoubleSubmit: a create command's input carries `entityId`, a client-generated UUID, which becomes the context's `streamId`; the operation plans the create at expected version 0, the adapter's identity read finds the first submit's row and throws the reserved `entityExists` with `details.existing` inside the sub-transaction, the whole second mutation rolls back, and no receipt is involved (D6, E-21, E-39, Sc L1-4)
- retentionDefault: `retention: { window: 7 * 24 * 60 * 60 * 1000, afterExpiry: "delete" | "tombstone" }` per declaration; `"tombstone"` is required when `irreversible` is true and the command has no domain uniqueness rule (D6, E-34)
- limitIdLength: `limitIdLength` is 256 bytes of UTF-8, measured with `utf8Length` of `spec:command.command-pipeline`, for the tenant ID and the request key, a longer one is rejection `invalidInput` at step 1, and for the declaration's name, a longer one is a plain error; the count is of bytes, never of characters, so one number sizes the receipt row and the event envelope (E-34)
- limitAffectedRefs: at most 1,000 affected refs and 1,000 stream versions per receipt, checked by `insertReceipt`; the row-size arithmetic against the 1 MiB document limit is `limitRowSize` in `spec:command.receipt-table`, and this Spec states no figure of its own (F13, E-34)
- limitSweepBatch: `receipts.sweep` handles at most 1,000 receipts per run for one tenant, reading `by_tenant_expiry` up to `now`, so one run stays far under the 16,000 documents written per transaction; the limit is a ceiling, not a target (D19, F13, E-34)
- serializationArgument: both concurrent requests read the `by_key` range and find nothing; the first to commit inserts into that range; the second's commit is refused because its read set changed, a read set that holds the receipt range and the context's rows, so the conflict the engine reports may name either, the engine retries it, and the retry reads the receipt; the engine retry is invisible to the caller and is not a business attempt (F1, D15)
- exampleActorKinds: the examples of this Spec's space run a caller in namespace `public` as a `human` actor, `worker` and `service` as a `service` actor and `agent` as an `agent` actor; the internal entry takes the actor and the namespace as two arguments, so the namespace alone fixes no actor kind (Sc L1-3, D11, E-6)

## Example space

```gwt-vocabulary
Given a tenant {tenantId:string} and a caller in namespace {namespace:"public"|"worker"|"service"|"agent"}
And a receipted command {commandType:string} with request key {requestKey:string} and business input fingerprint {fingerprint:string}
And a create command from the UI with client-generated entity ID {entityId:string}
And a receipt for the same key already exists with {priorReceipt:"no receipt"|"the same fingerprint"|"a different fingerprint"}
And the admission policy {admission:"admits every call"|"refuses the first call as transient and then admits"|"refuses the first call for capacity and then admits"}
When the caller sends the command {sends:"once"|"twice concurrently"|"again after a lost response"|"twice from the UI"|"again after the transient refusal"}
Then the first answer is {first:"applied"|"conflict"|"transient refusal"}
And the second answer is {second:"applied"|"replayed"|"conflict"|"entity exists"|"none"}
And the business effects committed number {effects:number}
And the receipts stored for the key number {receipts:number}
And the original outcome and state are unchanged {unchanged:boolean}
```

## Verification — reviewed

- A reviewer confirms that the key is built from exactly tenant, namespace, command type and request key, that the public entry hard-codes the namespace, and that the fingerprint excludes the request key and every retry-varying field.
- A reviewer confirms that the receipt read and the receipt insert are in the same mutation as the execution, with no pending state between them.
- A reviewer confirms that a rejection and a transient refusal write no receipt, that the duplicate answer carries no stored result, and that the answer passes the entry's returns validator on its replayed member.
