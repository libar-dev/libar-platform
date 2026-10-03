---
id: spec:application.aggregate-projection
kind: contract
altitude: story
readiness: scoped
relations:
  refines: spec:application.read-models
  dependsOn: spec:application.projection-contract
  decidedBy:
    - spec:decisions.d02-context-owns-state-and-journal
    - spec:decisions.d09-rebuild-online-by-default
  constrainedBy:
    - spec:laws.law11-tenant-scope-named
    - spec:facts.f01-serializable-mutations-under-occ
    - spec:facts.f13-transactions-have-limits
---
# Aggregate projection

Story · Detail: deferred until a read model needs an aggregate row · Traces: D2, D9, Law 11, F1, F13, E-8, E-9, E-45.

An aggregate projection is the form of a read model whose row sums a number over every entity under one key, the counts and sums of D9, such as order totals per status. The contract pins the `AggregateProjection` shape; the aggregate row, which carries `value` and `entityCount` and no `sourceVersions`; the per-entity marker that carries the source versions, so that live commands and the backfill never count one entity twice; `applyAggregate` in four steps; and `orderTotals` as the shape of an aggregate table. No read model of the example domain takes this form, so its detail stops at the signature and the steps until a read model needs an aggregate row.

## Intent

- outcome: Pin the aggregate form of a projection, which sums one contribution per entity into one row per key and never counts an entity twice (D9, E-9)

### Open questions

- [blocking] Deferred until a read model needs an aggregate row: OD-075 keeps this form a signature to which no read model of the example domain is bound, `orderTotals` is the shape of an aggregate table and not a read model, and the rebuild has no path for an aggregate; the first read model that needs a count or a sum over its entities is the trigger, and with it this contract takes its rebuild path, its tests and the owner's confirmation of the form under E-9 (OD-075, E-9)

## Contract

- [extension] An aggregate row derives from every entity under its key, so it carries no `sourceVersions`; it carries `value`, the sum of the recorded contributions, and `entityCount`, the number of markers, and the per-entity marker carries the `sourceVersions` the row conventions would otherwise hold (E-9, D9)
- An aggregate projection contributes a number per entity to an aggregate row and keeps a per-entity marker so live commands and backfill never count one entity twice (D9)
- [extension] `applyAggregate` ignores the mode: the marker's `sourceVersions` decide, a marker that is not older than the input makes the write `skipped-newer`, and otherwise the marker's recorded contribution leaves the row of the marker's `aggregateKey` and the new contribution joins the row of `aggregateKeyOf`, one row moved by the difference when the key is the same and two rows when it changed, a row whose `entityCount` reaches 0 being deleted, and a `null` contribution joins no row and removes the marker; a live update on an entity backfill has not reached is therefore not partial, because `contribute` sees the whole DTO, which is why the missing-row rule of the per-entity path does not apply (E-9, D9, F1)
- [extension] An aggregate's entity is its source stream: `applyAggregate` derives the marker's `entityKey` from the input's one `StreamVersion` as `JSON.stringify([contextId, streamType, streamId])`, so the live path and the backfill, which pass `entry.version` and `dto.version`, name one marker, and equal stream IDs in two contexts or two stream types name two (E-9, D9, D2)

## Design

The shapes are TypeScript in the parent. `StreamVersion` is the kernel's shape; `ApplyMode`, `ApplyResult`, `WritableGeneration` and the `by_key` index are those of `spec:application.projection-contract`; the marker is a row of the `projectionMarkers` table, read through its `by_entity` index, both pinned by `spec:application.generation-registry`; `MutationCtx` is Convex's mutation context.

- typeAggregateProjection: `interface AggregateProjection<D> { name: string; version: number; table: string; rowBudgetBytes?: number; aggregateKeyOf(tenantId: string, dto: D): string; contribute(tenantId: string, dto: D): number | null }` where `null` means the entity no longer contributes, such as a deleted subject, and `rowBudgetBytes` bounds the aggregate row and the marker alike (E-9, D9, F13)
- fnApplyAggregate: `applyAggregate<D>(ctx: MutationCtx, projection: AggregateProjection<D>, input: { tenantId: string; dto: D; versions: StreamVersion[]; mode: ApplyMode; generations: readonly WritableGeneration[] }): Promise<ApplyResult[]>` answering, per generation in order, one result for each aggregate row it writes, the old key's row before the new key's on a key change, `inserted` for a row it created, `updated` for a row whose `value` or `entityCount` changed and `deleted` for a row whose `entityCount` reached 0, or one `skipped-newer` when the marker was not older and one `unchanged` when no row moved; `input.versions` holds the one `StreamVersion` of the entity's source stream, and another length throws a plain error; `mode` is accepted for symmetry with `applyProjection` and read by nothing (E-9, D9)
- aggregateStep1: for each generation it derives `entityKey` from `input.versions[0]` as the contract states, reads the marker by `by_entity` with the tenant, read model, generation and `entityKey`, and computes `contribution` as `contribute(tenantId, dto)` and, when that is not `null`, `aggregateKey` as `aggregateKeyOf(tenantId, dto)` (E-9, D9)
- aggregateStep2: when a marker exists and its `sourceVersions` are not older than `input.versions` for the same stream, the result is `skipped-newer` and nothing is written (E-9, D9, F1)
- aggregateStep3: when a marker exists and `contribution` is `null` or `aggregateKey` differs from the marker's, it reads the row of the marker's `aggregateKey` by `by_key`, throwing a plain error when it is missing, a defect, subtracts the marker's contribution from `value` and 1 from `entityCount`, and deletes the row when `entityCount` reaches 0 and replaces it otherwise; when `contribution` is not `null` and the marker is missing or its key differs, it reads the row of `aggregateKey`, inserts it with `value` equal to `contribution` and `entityCount` 1 when missing, and otherwise adds `contribution` to `value` and 1 to `entityCount`; when the marker exists with the same key and `contribution` is not `null`, it adds `contribution` minus the marker's to that row's `value`, leaves `entityCount`, and writes no row when the difference is 0; when the marker is missing and `contribution` is `null`, it reads and writes no row (E-9, D9)
- aggregateStep4: then it inserts or replaces the marker with `entityKey`, `contribution`, `aggregateKey` and `input.versions`, or deletes it when `contribution` is `null`, all in the same mutation; a key change reads and writes two aggregate rows and the marker in each generation, and its two rows count against `limitReadModelWritesPerCommand` of `spec:application.read-models` (E-9, D9, E-8, E-45)
- validatorAggregateRowConventions: `const aggregateRowConventions = { tenantId: v.string(), generation: v.number(), key: v.string(), projectionVersion: v.number(), value: v.number(), entityCount: v.number() }` spread into every aggregate read-model `defineTable`, with the same `by_key` index, where `key` is `aggregateKeyOf(tenantId, dto)` (E-9, Law 11, D9)
- tableOrderTotals: `orderTotals: defineTable({ ...aggregateRowConventions }).index("by_key", ["tenantId", "generation", "key"])` an aggregate of order totals per status, where `key` is the status, `value` the sum of the orders' totals and `entityCount` the number of orders in it, given as the shape of an aggregate table and not as a read model the first experiment builds (E-9, D9)
- deferred: the code of `AggregateProjection` and `applyAggregate`, a rebuild path for an aggregate read model and the tests of this contract, until a read model needs an aggregate row (E-9, OD-075)

## Verification — reviewed

- A reviewer confirms that `applyAggregate` compares the marker's `sourceVersions` before it touches `value`, that it reads no mode, that it derives `entityKey` from the input's stream version, that a key change moves the contribution and the count from the marker's key's row to the new key's row, and that a `null` contribution removes the marker and its recorded contribution and creates no row.
