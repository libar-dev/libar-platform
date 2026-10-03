---
id: spec:facts.f18-commit-timestamps
kind: constraint
altitude: story
readiness: defined
relations:
  refines: spec:facts.fact-ledger
---
# Commit timestamps order committed transactions

F18 · Status: probed · Doc status: not in the doc's ledger · Decisions: D2, D18.

The pinned package declares `db.vars.commitTs`, a placeholder that a mutation writes into a field and that resolves at commit to a bigint ordered by commit order. Probe 8 ran it on the native backend, release `precompiled-2026-09-28-5c7cb5b` with `convex` 1.46.0: one transaction gets one timestamp in the parent and in two components, and later transactions get larger ones. D2 cites the doc's sentence that no deployment-wide order token exists, and whether this fact changes that sentence is the owner's. A timestamp is shared by every row one transaction writes, so it orders transactions and not the events inside one. The documentation describes `ctx.meta.getSnapshotTs()` as the reader's upper bound, the snapshot timestamp on the commit clock, and the public declarations of the pinned package omit it, so the bound is unavailable through the pinned public API and nothing here uses it.

## Intent

- outcome: Record that a commit timestamp orders committed transactions across the parent and its components, with its evidence status as a target, so that every design resting on it is found by its `constrainedBy` edge (F18)

### Open questions

- [non-blocking] The documented upper bound, `ctx.meta.getSnapshotTs()`, is absent from the pinned package's public declarations; ordering under overlapping transactions and behavior on a hosted deployment are outside the native example; a platform consumer adopts the bound only through a public declaration of a pinned package (F18, Probe 8)

## Constraints

- statement: On the pinned native backend, a transaction writes the same resolved bigint commit timestamp in the parent and two components, later sequential transactions have larger timestamps, and a top-level mutation may return its placeholder as the resolved bigint; within the mutation a read yields the unresolved placeholder and scheduling that placeholder is refused (F18)
- flavor: convex-fact
- target: evidence.status:probed
- measurableBy: Compiled tier: `convex` 1.46.0, `node_modules/convex/dist/esm-types/server/database.d.ts:308-318` declares the placeholder and `:199` keeps the schema type on insert, and `node_modules/convex/dist/esm-types/server/meta.d.ts:125-136` declares no snapshot timestamp method, while the page `docs.convex.dev/database/advanced/commit-timestamp`, section Snapshot timestamp, documents it; package source `node_modules/convex/src/server/meta.ts:137-160` describes the internal `getSnapshotTs()` upper bound, and `node_modules/convex/src/server/impl/meta_impl.ts:56-59,78,94` supplies it at runtime; `node_modules/convex/src/values/value.ts:98-127` defines unresolved numeric conversion; native backend tier: Probe 8 on the pinned release (F18)

## Design

- nativeOrder: Probe 8 commits three sequential transactions, each writing the parent and two component tables indexed by `commitTs`; each transaction has one timestamp across all three tables and the indexed query returns increasing timestamps. Rows in one transaction tie, so a timestamp alone is not a unique event cursor (F18, Probe 8)
- nativeUpperBound: A cast exposing the internal runtime `ctx.meta.getSnapshotTs()` returns the same upper bound in the parent and both component queries; every observed row is at or below it and a subsequent mutation's returned timestamp is above it. This is native backend evidence for the internal method, not a compiled public API promise (F18, Probe 8)
- placeholderBehavior: The writing mutation reads back the same placeholder and numeric conversion throws that it is unresolved. Returning the placeholder from a mutation resolves it to the committed row's bigint. Scheduling it fails with `Field name $commitTs starts with '$', which is reserved.` and rolls back the accompanying write (F18, Probe 8)
- firstObservation: The expectation that returning a mutation's placeholder would fail was refuted on the pinned native backend. The example binds the observed resolved bigint; refusal to schedule held (F18, Probe 8)
- schemaBoundary: The fixture uses `v.any()` for its timestamp field and asserts the committed value is a bigint. The pinned writer's insert declaration takes the schema's field type and does not widen an int64 field to accept `CommitTsPlaceholder` (F18, Probe 8)
