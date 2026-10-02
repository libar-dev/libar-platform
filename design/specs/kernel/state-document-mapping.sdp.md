---
id: spec:kernel.state-document-mapping
kind: decision
altitude: story
readiness: defined
relations:
  refines: spec:kernel.domain-kernel
  dependsOn: spec:decisions.d03-events-only-source-of-next-state
  constrainedBy: spec:facts.f13-transactions-have-limits
---
# One document per stream, with a derived mapping above the budget

Provenance: new; the doc names the gap, states the preference and leaves the budget open. Story · Traces: D2, D3, D5, D10, D18, F13, OQ3, Sc L2-3, E-2, E-3, E-25.

Folding is simple when a stream's state is one document. When state spans several documents, such as an order with separate line rows or stock spread over rows, the adapter needs a mapping from folded state to documents, and if each command writes that mapping by hand a second source of state creeps back. This decision keeps one document per stream as the default while the state fits a size budget, and where it cannot, derives every document write from the folded state in one mapping per stream type. The budget, `budgetBytes`, is one number per stream type and means the whole stream: the one document of the single mapping, or the head and every part of the derived mapping together. Every bound in the corpus that multiplies stream documents multiplies that number. The budget is a design number. A command's declaration carries its own largest input, chosen by its author under the adapter's stream and byte ceilings, so the 100 lines of the example's `PlaceOrder` are that command's promise and no platform limit.

## Intent

- outcome: The saved representation of a stream's state is derived from the folded state by one mapping per stream type, and the default mapping is one document that holds the whole state and the stream metadata (D3, E-2)
- value: No command writes documents by hand, so the fold stays the one authority for state even when state spans documents (D3)
- risk: A state that outgrows the budget forces the derived mapping, which multiplies the documents one command reads and writes; the first experiment measures documents read and written per order size (D10, First experiment, Sc L2-3)
- risk: The document budget below is a design number, and a command's declared bound holds only while the stream state that bound produces fits it (OQ3, E-2)
- assumption: A document holds at most 1 MiB and a transaction reads at most 16 MiB and 32,000 documents (F13)

### Open questions

- [non-blocking] Extension E-2: the doc prefers one document per stream within a size budget and names no budget; this Spec sets `budgetBytes` as one number per stream type meaning the whole stream, the single document or the head and every part together, at most 256 KiB for the single mapping and at most 512 KiB over at most 32 parts for the derived mapping, provisionally, lets a stream type declare a smaller `budgetBytes` on its mapping, caps the derived budget at half the document ceiling because a baseline event holds the whole migrated state in one document, and derives every bound on streams per call, list page, backfill batch and baseline batch from that budget so that the 16 MiB read ceiling binds in bytes and not only in documents; the owner confirms the numbers (D3, D5, OQ3, F13, E-2, E-25)

## Decision

- context: The concern is how folded state reaches documents without a second source of state; Convex stores documents of up to 1 MiB and rewrites a whole document on `replace` or `patch`, so a large state costs its full size on every command, and the stream metadata may live in the same document while enumeration and deletion stay correct (D2, D3, F13)
- alternative: Do nothing beyond Convex: each command handler writes the documents it changes by hand and `evolve` exists beside it for rebuild; rejected, because a second source of state creeps back and nothing keeps it in step with the fold (D3, Decision method rule 2)
- alternative: Always one document per stream with no budget; rejected, because a stream whose state exceeds 1 MiB cannot be stored at all and one near it costs its whole size on every command (F13)
- alternative: Always a derived mapping into several documents; rejected, because it multiplies reads and writes for the common small stream and the doc prefers one document while it fits (D3)
- alternative: One document per stream within a budget, and above it a derived mapping declared once per stream type; this is the option chosen (D3, E-2)
- decision: A stream type declares a `StateDocumentMapping<S>`; the `single` mapping stores the whole state with the stream metadata in the stream row and is the default; the `derived` mapping splits the state into a small head kept on the stream row and named parts in the context's parts table, and assembles it back on load; both carry one `budgetBytes`, the size of the whole stream; the adapter is the only code that reads or writes either, and it derives every write from the folded state (D3, E-2)
- rationale: One mapping per stream type keeps the fold the one authority and puts the document shape in one reviewable place (D3)
- rationale: A budget below the 1 MiB ceiling leaves headroom for growth and keeps the per-command read and write cost of a stream bounded (F13, D19)
- consequence: The stream row carries the metadata that enumeration and deletion need, including the deleted-subject marker, in both mappings (D2, E-3)
- consequence: A context switching a stream type from `single` to `derived` rewrites its stream rows through the new mapping in bounded batches; no event changes and `stateSchemaVersion` does not move, so it is a change of representation, not of meaning (D5, E-25)
- consequence: The derived mapping writes only the parts whose value changed, compared against the loaded parts, so a command on a large state costs the parts it touched plus the head (E-2)
- consequence: One document per stream stays the default, with the derived mapping for state that outgrows its budget, and the largest order the placement command supports is the bound its declaration carries, 100 lines for the example's `PlaceOrder`, chosen under the adapter's stream and byte ceilings and no platform limit, which settles OQ3 (OQ3, D10, E-2)
- consequence: The standing cost is one mapping declaration per stream type and, for the derived mapping, one extra table, one index and one extra read per part on every load (E-2, E-3)

## Design

- typeStateDocumentMapping: `type StateDocumentMapping<S> = { kind: "single"; budgetBytes: number; isDeleted: (state: S) => boolean } | { kind: "derived"; budgetBytes: number; isDeleted: (state: S) => boolean; split: (state: S) => { head: unknown; parts: Record<string, unknown> }; assemble: (head: unknown, parts: Record<string, unknown>) => S }` where `budgetBytes` is the largest size, measured with `getConvexSize`, of the whole stream the stream type allows, the one document of the single mapping or the head and every part of the derived mapping together, at most 262,144 for `single` and at most 524,288 for `derived`; no code checks these caps, and the adapter's step 9 checks the saved row against `budgetBytes` (D3, F13, E-2)
- budgetDerivedBounds: every bound that multiplies a number of stream documents, the adapter's streams per call, the queries' list page, the rebuild's backfill batch and the journal's baseline batch, is computed from `budgetBytes`, the whole stream at its budget with head and parts together, so that the documents it admits stay under 8 MiB, half the 16 MiB read ceiling, or under 4 MiB where the batch also writes each stream twice; a stream type with a small state, such as a stock item, declares a small budget and gets a larger count, and a derived stream type at the 512 KiB cap gets half the default count (F13, E-2, E-22, E-24, E-25)
- singleMapping: the stream row's `state` field holds `S` whole; load reads one document by the identity index and save writes one document (D2, E-2)
- derivedMapping: the stream row's `state` field holds `head`; each entry of `parts` is one document in the parts table keyed by stream and part name; load reads the row and every part by the parts index and calls `assemble`; save calls `split`, writes the head and only the parts whose value differs from the loaded one, and deletes parts no longer present (E-2, E-3)
- isDeletedMarker: after every fold the adapter sets `deletedAt` on the stream row when `isDeleted(next)` first becomes true and clears it if a later fold makes it false; the row is never removed, so enumeration includes deleted subjects (D2, E-2, E-3)
- stateSchemaVersion: the version of the meaning the saved state was produced under is declared once, as `stateSchemaVersion` on the `StreamRegistration` of `spec:context.journal`, not on the mapping, which describes shape only; the adapter stamps it on the stream row and compares it on every load, every bump of it is one registered baseline migration, and a change of representation without a change of meaning does not move it, because a version field alone is not schema evolution (D5, E-25)
- limitStreamDocument: 256 KiB per stream document by default, one quarter of the 1 MiB ceiling; the `budgetBytes` of a single mapping is at most that, and a stream type whose state can exceed it declares the derived mapping, whose `budgetBytes` covers head and parts together (F13, OQ3, E-2)
- limitPartsPerStream: at most 32 parts of at most 256 KiB each, and head and parts together at most `budgetBytes`, which is at most 512 KiB for the derived mapping, half the document ceiling, because a baseline event holds the whole migrated state in one document; one load therefore reads at most `budgetBytes` over at most 33 documents, a call at that cap admits 16 such streams, a list page 16 rows and a baseline batch 8, and a state that needs more is the snapshot or archive tier trigger (F13, D18, E-2, E-25)
- budgetCheck: a native test writes the largest state the product allows for each stream type and asserts that the saved document, or head and parts together, stays under the stream type's `budgetBytes`; at run time the adapter's step 9 enforces it, measuring the row it writes with `getConvexSize` and throwing a plain error, a technical failure, above `budgetBytes` (OQ3, Sc L2-3, E-2)

## Verification — reviewed

- A reviewer confirms that no context code outside the adapter writes stream rows or parts, and that every stream type declares its mapping once.
