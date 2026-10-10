---
id: spec:facts.f20-pagination-checks-bytes-after-reading
kind: constraint
altitude: story
readiness: defined
relations:
  refines: spec:facts.fact-ledger
---
# Pagination checks bytes after reading

F20 · Status: probed · Doc status: not in the doc's ledger · Decisions: D8, D10.

`paginator` of `convex-helpers` 0.1.124 adds each row's size to the bytes it has read after it has read and kept the row, and only then compares the sum with `maximumBytesRead`. So the option is a threshold at which a page stops, not a ceiling on what the page reads: a page reads the row that reaches the threshold, whatever its size. Probe 10 ran it on the native backend, release `precompiled-2026-09-28-5c7cb5b` with `convex` 1.46.0, through a component's `paginator` as a context's list reads it. The size the helper adds is the stored document's, `_id` and `_creationTime` included, so rows that fill a budget counted in application fields carry a page past a byte bound computed from those budgets.

## Intent

- outcome: Record that `paginator` checks `maximumBytesRead` after it has read the row that reaches it, with its evidence status as a target, so that every design resting on it is found by its `constrainedBy` edge (F20)

### Open questions

- [non-blocking] The bound applies to a plain index stream. Filtered, joined or mapped streams may charge reads whose rows are not retained, and the examples do not establish an overshoot bound for those compositions. A hosted deployment is not measured (F20, Probe 10)

## Constraints

- statement: For a plain component index stream with a finite non-negative byte bound, convex-helpers keeps the next row and adds its stored document size before comparing the total with maximumBytesRead using greater-than-or-equal; a page can therefore keep and read beyond that bound by up to the last row's size and then report SplitRequired (F20)
- flavor: convex-fact
- target: evidence.status:probed
- measurableBy: Package source: `convex-helpers` 0.1.124, `node_modules/convex-helpers/server/stream.js:292-315` for the late check and `:513-525` for `getDocumentSize`; native backend tier: Probe 10 on the pinned release; `src/context/queries.ts:49,100` passes `maximumBytesRead` through `boundedPage` and `spec:context.queries` is the Spec that rests on this fact (F20)

## Design

- nativeOvershoot: With two stored rows of 8,281 bytes each, native queries with byte bounds of zero, one, 8,280 and 8,281 each read and keep the first row and report `SplitRequired`; the bound of zero does not mean read nothing, and equality also requests a split. The size is recorded, not asserted as a release limit (F20, Probe 10)
- storedFields: `getDocumentSize` includes `_id` and `_creationTime`. A page computed from application-field budgets can exceed the claimed whole-page byte size even if each row's application fields fits its budget; the stream-budget example uses the actual `boundedPage`, `limitListPage` and `limitListBytes` helpers to measure that case (F20, Probe 10)
- scopeOfBound: The last row is retained, so this option is a stopping threshold rather than a hard maximum of bytes already read or returned. A transaction that begins close to its backend read ceiling can fail while fetching that row before the helper gets to check the threshold (F20, Probe 10)
