---
id: spec:application.generation-registry
kind: contract
altitude: story
readiness: defined
relations:
  refines: spec:application.rebuild
  decidedBy:
    - spec:decisions.d09-rebuild-online-by-default
  constrainedBy:
    - spec:facts.f01-serializable-mutations-under-occ
    - spec:facts.f12-backups-exclude-pending-scheduled-functions
    - spec:facts.f13-transactions-have-limits
    - spec:laws.law11-tenant-scope-named
    - spec:facts.f17-migrations-fits-generation-backfill
---
# Generation registry

Story · Detail: full · Traces: D9, D11, D19, F1, F12, F13, Law 11, E-8, E-9, E-40, E-42.

The registry is the parent table that records every generation of every read model, its state and its progress, plus the per-entity marker table that aggregate read models use. A generation is a build of the projection's code, which is the same for every tenant, so one generation row spans every tenant of the deployment and its batches iterate the tenants; there is no generation of one tenant, because a switch that made a one-tenant build the active generation would leave every other tenant reading an empty read model. A use case reads the registry once per read model it maintains to learn which generations to write; a query reads it once to learn which generation to read; the rebuild owns its rows. The registry is data that changes only during a rebuild, so it is not an application-wide counter in the write path.

## Intent

- outcome: Pin the generations table and its states, the per-entity marker document, and the reads a command and a query make against them (D9, E-8)
- value: One table answers which generation is active, which is building and which is still inside its rollback period, so live update, backfill, queries and operators agree without a second store (D9)
- risk: A registry read sits in every command that maintains a read model, one indexed read per read model; the first experiment counts it as a document read (D9, Sc L2-3)
- assumption: Mutations are serializable under optimistic concurrency, so a switch and a concurrent command that read the registry serialize (F1)

### Open questions

- [non-blocking] Extension E-8: the doc names a generation registry, a marker and a gate without their shapes, and says to keep the old generation for a rollback period without saying whether live commands keep writing it; the option taken here is the `generations` and `projectionMarkers` tables below with seven states, a rollback period of 7 days, one building generation per read model at a time, and a retired generation that is kept but not written, so that a rollback reopens it as `verifying` and one verify pass repairs the rows changed since the switch before it is active again; the other reading is write-through, where live commands keep writing the retired generation for the whole period so that rollback is one write, at the cost of a third point read and write per read model per command for 7 days after every cutover; the cheaper steady path is taken and the owner rules whether the product needs instant rollback (E-8, D9, Sc L2-5)
- [non-blocking] Extension E-8, reach of a generation: the doc says nothing about tenants and rebuild; the option taken here is one generation per read model spanning every tenant, so the registry has no tenant dimension, one row is active for all tenants and the batches iterate the tenant list; the other reading is one registry per read model and tenant, keyed by `readModel`, `tenantId` and `generation`, which lets one tenant rebuild while another keeps reading and lets a write pause close one tenant at a time, at the cost of one generation row, switch, rollback and purge per tenant, a projection-version rollout that is one generation per tenant, and a third index field on every registry read; the deployment-wide reading is taken because a generation is a build of the projection's code and the owner rules whether per-tenant rebuilds are a product need; a consequence the owner confirms with it is that the `generations` table is operational data whose scope is the whole deployment, not tenant data, so its two indexes `by_read_model` and `by_read_model_state` lead with the read model name rather than `tenantId`, a recorded deviation from Law 11's index rule and the review rubric's item 25, of the same kind the obligation module records under E-57, while the marker table, which is tenant data, leads with the tenant (E-8, D9, D11, Law 11, E-57)
- [non-blocking] Extension E-42, as it touches the registry: a restore brings back a generation row at its checkpoint and drops the scheduled batch that was driving it, so the row's fence at inventory time is the restore's proof that the generation is still stranded, and `resumeChain` bumping it is the proof that it is not; the owner confirms that the fence carries that meaning (E-42, F12)
- [non-blocking] Extension E-40: the batch runner writes its cursor and counts on the generation row; the migrations component keeps its own state in its own table when it drives a parent-table batch, and the two are reconciled by the reviewed check below (E-40, F17)

## Contract

- Every generation of a read model has one row keyed by read model name and generation number, and generation numbers increase by one per read model (E-8, D9)
- A generation is in exactly one of `building`, `verifying`, `verified`, `active`, `retired`, `aborted` or `purged` (E-8, D9)
- At most one generation per read model is `active`, and at most one is in `building`, `verifying` or `verified` (E-8, D9)
- The allowed transitions are building to verifying, verifying to verified, verified to active, active to retired, retired to verifying by rollback, retired to purged, and building, verifying or verified to aborted, aborted to purged; no other transition exists (E-8, D9)
- A command that maintains a read model writes the active generation and the building, verifying or verified generation if one exists; a retired generation is kept unchanged until `retireAfter` and never written, and a rollback reopens it as `verifying` so that live commands write it again while its verify pass repairs it (D9, E-8)
- A query reads the active generation and nothing else; a read model with no active generation reads as empty (D9, E-8)
- The generation row carries the backfill cursor, the verify cursor, the fence and the counts, and a batch writes them in the same mutation as its rows, so the row is the checkpoint (D9, E-40)
- [extension] A generation spans every tenant of the deployment and the registry row names none; the tenant is named on every read-model row and marker, on every context call a batch makes, and in the batch cursor, so no read or write of tenant data runs with an absent tenant as a wildcard, and no generation can be switched for one tenant alone (E-8, D11, Law 11)
- An aggregate read model keeps one marker per entity per generation with the contribution last recorded and the source versions it was computed from, and every aggregate write reads and writes the marker in the same mutation as the aggregate row; the marker's `sourceVersions` are compared like a row's, so a DTO older than the marker never adjusts the sum (D9, E-8, E-9)
- [extension] A generation in `building` or `verifying` has exactly one scheduled batch driving it, identified by the row's fence; a restore brings the row back at its checkpoint and drops that batch with every pending scheduled function, so the generation is stranded until `resumeChain` bumps the fence and reschedules from the saved cursor, which the restore procedure's pending-work inventory and accepted branch drive for every such row (E-42, E-8, F12, D19)
- The registry is read, never incremented, in the command path; it is not an application-wide counter (D2, E-8)
- Registry and marker rows are operational data owned by the parent; they are never written by a context (D2, E-8)

## Design

Tables live in the parent's `schema.ts`. `actorValidator` is the actor shape the command pipeline establishes. `streamVersionValidator` is the kernel's validator for `StreamVersion`. The registry has no `tenantId` because every generation spans all tenants; the marker table is tenant data and leads with the tenant.

- validatorGenerationState: `const generationStateValidator = v.union(v.literal("building"), v.literal("verifying"), v.literal("verified"), v.literal("active"), v.literal("retired"), v.literal("aborted"), v.literal("purged"))` (E-8, D9)
- validatorBatchCursor: `const batchCursorValidator = v.object({ tenantId: v.string(), pageCursor: v.union(v.string(), v.null()), streamId: v.optional(v.string()), eventCursor: v.optional(v.union(v.string(), v.null())) })` the position of a backfill or verify pass, the tenant being iterated and the `paginator` cursor within it, `null` at the start of a tenant, plus, for a history view, the stream whose history is being paged and the `history` cursor within it; the rebuild's `tenantIteration` moves it to the next tenant when a page reports `isDone` (E-8, E-40, Law 11)
- tableGenerations: `generations: defineTable({ readModel: v.string(), generation: v.number(), projectionVersion: v.number(), state: generationStateValidator, pauseRequired: v.boolean(), batchSize: v.number(), fence: v.number(), cursor: v.optional(batchCursorValidator), verifyCursor: v.optional(batchCursorValidator), batchesDone: v.number(), rowsWritten: v.number(), rowsSkipped: v.number(), misses: v.number(), startedAt: v.number(), startedBy: actorValidator, switchedAt: v.optional(v.number()), retireAfter: v.optional(v.number()), lastError: v.optional(v.string()), updatedAt: v.number() })` (E-8, D9, F13)
- indexGenerationsByReadModel: `.index("by_read_model", ["readModel", "generation"])` (E-8)
- indexGenerationsByReadModelUse: the next generation number at `startGeneration`, and the operator listing (E-8, D9)
- indexGenerationsByReadModelState: `.index("by_read_model_state", ["readModel", "state"])` (E-8)
- indexGenerationsByReadModelStateUse: `generationsToWrite` in every command that maintains the read model, and `activeGeneration` in every query over it (D9, E-8)
- tableProjectionMarkers: `projectionMarkers: defineTable({ tenantId: v.string(), readModel: v.string(), generation: v.number(), entityKey: v.string(), aggregateKey: v.string(), contribution: v.number(), sourceVersions: v.array(streamVersionValidator) })` (E-8, D9, Law 11)
- indexMarkersByEntity: `.index("by_entity", ["tenantId", "readModel", "generation", "entityKey"])` (E-8)
- indexMarkersByEntityUse: point read by `applyAggregate` before every aggregate write, and the purge batch's range for a generation (D9, E-8)
- fnGenerationsToWrite: `generationsToWrite(ctx: MutationCtx, readModel: string): Promise⟨{ active?: number; building?: number }⟩` making at most two indexed reads, where `building` is the generation in `building`, `verifying` or `verified`; the answer is the same for every tenant, so a command on any tenant writes the same generations (E-8, D9)
- fnActiveGeneration: `activeGeneration(ctx: QueryCtx, readModel: string): Promise⟨number | undefined⟩` making one indexed read; the answer is the same for every tenant, and the query narrows the rows it reads by its own `tenantId` argument (E-8, D9, Law 11)
- markerVersionCompare: `applyAggregate` treats the marker's `sourceVersions` as a row's: a marker whose versions are not older than the input's makes the write `skipped-newer` and leaves the sum alone, so a stale DTO on either path never adjusts an aggregate twice or backwards (E-9, E-8, D9, F1)
- fnGetGenerations: `export const getGenerations = internalQuery({ args: { readModel: v.string() }, returns: v.array(generationDoc), handler })` for the operator (E-8, D19)
- limitRegistryReadsPerCommand: at most 2 indexed reads per read model per command, and one per query (E-8, F13)
- limitRollbackPeriod: 7 days by default; `switchGeneration` takes an override, and `rollbackGeneration` is refused after `retireAfter` because the rows may be purged (E-8, D9)
- limitMarkerCount: one marker per entity per generation, purged with the generation; a read model with N entities costs N markers per generation (E-8, F13)
- migrationsState: when the migrations component drives a parent-table batch, its own status table holds the batch cursor and the generation row records only the state change; the reviewed check confirms the two never disagree on `state` (E-40, F17)

## Verification — reviewed

- A reviewer confirms that every transition in the rebuild workflow is one of the transitions listed here and that no function sets a state outside them.
- A reviewer confirms that `generationsToWrite` and `activeGeneration` are the only readers of the registry in the command and query paths, and that neither writes it.
- A reviewer confirms that the marker table's index leads with the tenant, that `applyAggregate` reads it before every aggregate write, and that it compares the marker's `sourceVersions` before adjusting the sum.
- A reviewer confirms that no field, index or function of the registry carries a tenant, that every batch cursor names one, and that the restore's inventory reads `by_read_model_state` for the three in-flight states and nothing else.
