---
id: spec:application.read-models
kind: behavior
altitude: feature
readiness: defined
relations:
  refines: spec:platform.transactional-domain-platform
  dependsOn:
    - spec:context.queries
  constrainedBy:
    - spec:laws.law09-no-invariant-on-late-read-model
    - spec:laws.law10-replay-never-runs-commands-or-effects
    - spec:laws.law11-tenant-scope-named
    - spec:facts.f07-queries-reactive-not-durable-delivery
    - spec:facts.f15-parent-query-over-component-query-stays-reactive
    - spec:facts.f04-nested-calls-cost-more-than-helpers
    - spec:constraints.zero-core-projection-jobs
    - spec:constraints.no-queue-recovery-for-essential-reads
    - spec:laws.law05-authorization-before-execution-and-disclosure
    - spec:facts.f11-components-have-no-ctx-auth
    - spec:laws.law06-technical-failure-never-a-rejection
    - spec:facts.f13-transactions-have-limits
  decidedBy:
    - spec:decisions.d08-read-models-in-command
    - spec:decisions.d01-one-mutation-per-operation
    - spec:decisions.d11-tenant-scope-and-authority
---
# Read models

Layer 2 · Detail: full · Traces: D1, D7, D8, D9, D11, Law 5, Law 6, Law 9, Law 10, Law 11, F4, F7, F13, F15, Probe 3, Probe 5, S4, Sc L2-2, E-6, E-9, E-24, E-45.

A read model is a stored, queryable shape the parent maintains for an essential list, summary or small cross-context view. It is written inside the command that changes its sources, from the DTOs and stream versions the contexts return, so the core path runs zero projection jobs and an authorized query after a successful command sees the committed state or a later one. Where no read model is needed, the read is an authorized component query returning a DTO or an indexed query, and the simplest read that works wins. Reactive queries carry freshness to clients; nothing pushes events to sockets.

This Spec carries the read-need table as rules, the properties of a projection, the visibility promise and the CQRS reading the doc fixes. The projection signature shared by live update and rebuild, and the row conventions every read model follows, are pinned by `spec:application.projection-contract`. Rebuild of a read model is `spec:application.rebuild`.

## Intent

- actor: The application developer who declares the read models a use case maintains, and the client that queries or subscribes to them (D8)
- problem: A successful command is followed by a query or subscription; if the read waits on a worker, the client sees stale data until a queue recovers, and an invariant that reads such a view decides on old state (Sc L2-2, Law 9)
- outcome: The core path runs zero projection jobs, the simplest read that works wins, and after a successful command an authorized query sees the committed state or a later one without any worker (D8)
- value: No event-to-WebSocket layer, no queue recovery for essential reads and no second copy of every field; a new feature adds only the read model it actually uses (D8, F7, Thesis)
- risk: Every parent read of context data is a component call whose cost Probe 3 measures; if it breaks the read budgets, OQ1 changes the context component's shape and this Spec's defaults move with it (D8, F4, Probe 3, OQ1)
- risk: A read model written in every command is one more write per command, counted against the command's budget (D8, Sc L2-3)
- assumption: Queries are reactive; subscriptions synchronize state and are not durable event delivery (F7)
- assumption: A parent query calling a component query stays reactive, which the docs state and Probe 5 showed, and a context list, built with `paginator` from `convex-helpers` because the built-in `.paginate()` throws in a component, stays contiguous across the boundary when each page is pinned by its end cursor, as Probe 5 showed on the pinned backend (F15, Probe 5, S4)

### Open questions

- [non-blocking] Probe 5 showed that the built-in `.paginate` treats `maximumRowsRead` as advice once a page has an end cursor and that a cursor it issued is refused by any other query, so a subscription over the active generation threw `InvalidCursor` at a switch; a parent list therefore pages with `paginator` of `convex-helpers`, as a context list does, and a pinned page is bounded on every run by the row cap and by the byte cap as `spec:context.queries` states it, the helper stopping at the row that reaches it and admitting that row whole, and answers `SplitRequired` beyond them (Probe 5, F13, D8, D9)
- [non-blocking] Extension E-24, as it reaches read models: a list over a parent read-model table calls `paginator` of `convex-helpers` with the options of `boundedPage`, a row cap of twice the item cap, with each cursor of the client's pair moved into the active generation by `pageInGeneration`, and returns through `paginationResultValidator` with its rows mapped by `readModelView`, and a client pages every list by an explicit cursor pair with no hook; these are options taken here and the owner has not ruled (E-24, S4, Probe 5, D8)
- [non-blocking] Extension E-6, as it reaches queries: a parent query establishes and authorizes its actor through `authorizeQuery`, and its refusal is the command's rejection shape, `RejectionData` with the query's name in the field `commandType` and the codes `unauthenticated` or `forbidden`; the field keeps its name for a query, which the owner has not ruled on, and nothing else of the shape is new (E-6, D7, D11, Law 5)
- [non-blocking] Probe 3 pending: the cost of one component call in latency and function-call quota decides whether one entity's detail stays a component query or hot reads move, which is OQ1 (Probe 3, F4, OQ1)
- [non-blocking] Extension E-45: the doc says a small cross-context view is a parent query over bounded component reads and does not give the bound; the option taken here is at most 8 component reads per parent query and at most 4 read-model rows written per command, both measured by the first experiment (E-45, D8)

## Behavior

- rule: The core path runs zero projection jobs (D8)
- rule: The simplest read that works wins (D8)
- rule: One entity's detail is read by an authorized component query returning a DTO (D8)
- rule: An essential list or summary is read by an indexed query, or by a read model updated in the command (D8)
- rule: A small cross-context view is read by a parent query over bounded component reads, or by a read model updated in the command (D8)
- rule: Broad reporting is outside the baseline (D8)
- rule: A projection is named, versioned and deterministic (D8)
- rule: A projection never issues commands or causes effects (D8, Law 10)
- rule: Live update and rebuild share the projection's logic (D8, D9)
- rule: After a successful command, an authorized query sees the committed state or a later one (D8, Sc L2-2)
- rule: Command results carry affected stream versions so a client can compare what it wrote with what it reads (D8)
- rule: Reactive queries replace any event-to-WebSocket layer (D8, F7)
- rule: CQRS means separate contracts for commands and queries; it does not mean a second copy of every field (D8)
- rule: A context query returns a deliberate DTO, and its private schema stays private (D8)
- rule: No invariant depends on a read model that updates later; a command decides on context DTOs returned in its transaction or on a read model written in the same transaction (Law 9)
- rule: A read model is updated inside the command's mutation after the context calls, by the pipeline's step 9, from the DTOs and stream versions the contexts returned on their `streams` entries, never from a later event feed and never by the use case body (D8, D1, E-7)
- rule: Read models are parent tables; a context keeps its own indexed queries over its state and never writes a parent table (D1, D2)
- rule: Every read-model row names its tenant, and every query on a read model takes `tenantId` as an argument and reads through an index that leads with it; an absent tenant is never a wildcard (Law 11, D11)
- rule: A parent query establishes and authorizes its actor through `authorizeQuery` before its first read, then reads read-model rows by index or calls context queries with the tenant as argument; a refusal is a rejection and nothing is disclosed (D11, F11, Law 5, D7)
- rule: A subscription synchronizes state; it is not durable event delivery, and no consumer treats a query result as proof of having seen every event (F7, D2)
- rule: A client's page of a read-model list names its position by the rows' order field and `key` within the tenant and never by the generation, so across a switch and a switch back the first page and every later page show the active generation's rows from the same position, a pinned page the rows up to its end cursor, and no client restarts its paging (D9, D8, E-24)
- rule: A page is read in one transaction, so its rows are one generation's; a cursor used after a switch continues from the same position in the generation then active, so at the seam no row is shown twice or skipped when the two generations' projections give each subject the same order field and key, and a row the new generation holds differently appears as that generation holds it; a projection version that changes either is its author's choice, and a client may then see a row on both sides of the seam or on neither (D9, D8, F7)
- rule: [extension] A parent query makes at most 8 component reads, and a command writes at most 4 read-model rows; a read that needs more is a read model or is outside the baseline (E-45, D8)
- flow: A client subscribes to a parent query with its tenant scope and the key of the entity, list or view it needs (D8, Law 11)
- flow: The query authenticates and authorizes in the parent and returns nothing before authorization passes (Law 5, D11)
- flow: For one entity's detail the query calls the context's `get` through `ctx.runQuery` on the component API with the tenant, and returns the DTO, which carries its stream version as the context's `toDto` maps it (D8, F11, F15)
- flow: For an essential list, summary or small cross-context view the query reads the active generation's rows of the read model by index and returns them with their source stream versions (D8, D9)
- flow: The client compares the source versions in the result with the versions its last command returned and knows whether it reads its own write or a later state (D8)
- flow: When a later command changes a source, its mutation writes the row in the same transaction and every subscription on the query re-runs (D8, F7)

## Design

The read path has two shapes and the write path one. A parent `query` either reads read-model rows through an index that leads with the tenant, or calls context queries through `ctx.runQuery` with the tenant the parent authorized. The write path is the command pipeline's step 9, which calls `applyProjection` from the projection contract for every read model the declaration lists, from the `streams` entries the use case's executor returned, after its context calls and before the receipt. A query reads the read model's active generation from the generation registry in the same query, so a generation switch re-runs every subscription.

Nothing here schedules, and nothing here reads `ctx.auth` inside a component. The DTO shapes belong to the context that returns them; `StreamVersion` is the kernel's shape, which every context outcome carries, and `streamVersionValidator` is its validator.

- transactionBoundary: read-model writes happen inside the command's top-level mutation, after the context calls; reads are parent queries, reactive by subscription (D8, D1, F7)
- convexSurface: one static `query` export per read need in the parent; component queries are reached through `ctx.runQuery(components.orders.queries.order.get, args)`, its siblings `list`, `history` and `rebuild`, and `components.orders.queries.operations.byOperation`, as the queries contract names them; no scheduled function, no cron, no action (D8, F11)
- fnEntityDetail: `getOrder` as `spec:context.queries` pins it under `parentGet`: it calls `authorizeQuery` and then `ctx.runQuery(components.orders.queries.order.get, { tenantId, streamId: orderId })` (D8, D11, F15)
- fnListOrSummary: `export const listOrderSummaries = query({ args: { tenantId: v.string(), status: v.union(v.literal("placed"), v.literal("cancelled")), paginationOpts: paginationOptsValidator }, returns: paginationResultValidator(orderSummaryView), handler: async (ctx, { tenantId, status, paginationOpts }) => { await authorizeQuery(ctx, { name: "listOrderSummaries", tenantId, permission: "orders.read" }); const generation = await activeGeneration(ctx, "orderSummary"); if (generation === undefined) throw new Error("The read model orderSummary has no active generation"); const result = await paginator(ctx.db, schema).query("orderSummaries").withIndex("by_status", (q) => q.eq("tenantId", tenantId).eq("generation", generation).eq("status", status)).paginate(boundedPage(pageInGeneration(paginationOpts, [tenantId, generation, status], 5), limitReadModelList(orderSummary))); return { ...result, page: result.page.map(readModelView) }; } })` one `paginate` of `paginator` from `convex-helpers/server/pagination` with the composition's `schema`, over the active generation's rows in `placedAt` then `key` order within a status, where `orderSummary` is the read model, whose name is `"orderSummary"` and whose table is `orderSummaries` (D8, D9, Law 5, Law 11, E-24)
- fnPageInGeneration: `pageInGeneration(opts: PaginationOptions, prefix: Value[], indexFields: number): PaginationOptions` returns `opts` with its `cursor` and its `endCursor`, when set, each moved into the generation of `prefix`, the query's equality values in index order, `tenantId`, `generation` and the list's equality fields, the generation second: a cursor of `paginator` is the JSON of a row's index key, so the function replaces the key's second element, the generation that wrote the row, with the prefix's and drops the last two, `_creationTime` and `_id`, which belong to that generation's document, when the key carries them, which it tells by a length of `indexFields`, the index's own field count, plus two, so that a cursor already moved, which `paginator` returns as a pinned page's `continueCursor`, keeps its length and has only its generation replaced; a cursor whose key's length is neither `indexFields` nor `indexFields` plus two, whose generation is not a number, whose other equality elements differ from the prefix's, or that is not a key, throws a plain `Error` `"The cursor is not from this list"` before the list reads a row, so a saved cursor never overrides the query's tenant or status; `null`, `undefined` and `"[]"`, the helper's end of the list, are returned as they are, and the read-model library exports the function beside `readModelView` (D9, E-24, Probe 5, Law 11)
- indexReadModelList: the index a read-model list reads has `tenantId`, `generation` and the list's equality fields first, then its order field, then `key`, as `by_status` of `tableOrderSummaries` in `spec:application.projection-contract`, so a position within a tenant names at most one row of each generation and a cursor moved into another generation lands between the same rows there (D9, E-9, Law 11)
- fnReadModelView: `readModelView<Row extends { _id: unknown; _creationTime: number; generation: number }>(row: Row): Omit<Row, "_id" | "_creationTime" | "generation">` what a read-model query returns for a row: the tenant, the key, the projection version, the source versions and the projected fields; the built-in page's rows carry `_id` and `_creationTime`, which an object validator of the row's fields refuses, and no document ID or generation number leaves the parent (D8, D2, E-9)
- validatorReadModelView: `orderSummaryView = v.object({ tenantId: v.string(), key: v.string(), projectionVersion: v.number(), sourceVersions: v.array(streamVersionValidator), ...orderSummaryFields })` where `orderSummaryFields` are the projected fields `spec:application.projection-contract` declares for `tableOrderSummaries` (E-9, D8)
- noActiveGeneration: a query over a read model that has no active generation throws a plain `Error` that names the read model, a technical failure, and never answers an empty page (D9, Law 6)
- fnCrossContextView: `export const getOrderWithStock = query({ args: { tenantId: v.string(), orderId: v.string() }, returns: v.union(v.object({ data: orderWithStockDto, sourceVersions: v.array(streamVersionValidator) }), v.null()), handler })` making at most 8 component reads and returning a `VersionedResult` whose `sourceVersions` are the DTOs' stream versions, or reading one cross-context read-model row, which carries `sourceVersions` itself (D8, E-45)
- typeVersionedResult: `[extension] type VersionedResult<T> = { data: T; sourceVersions: StreamVersion[] }`, the result of a cross-context view composed from component reads, whose `data` is not a row; every query result carries source versions in one of three ways, a per-entity or cross-context read-model row carries `sourceVersions` by the row conventions so a list page needs no wrapper, an entity DTO carries its stream version from `toDto`, and a composed view is wrapped in this type, so the client can always compare with the versions its command returned; an aggregate row carries no comparable version, so a client that needs its own write reflected compares its entity's row, and the sum's freshness is the subscription's re-run when the command commits (E-45, D8, E-9)
- readModelRowShape: every read-model row carries `tenantId`, `generation`, `key`, `projectionVersion` and the projected fields, a per-entity or cross-context row carries `sourceVersions`, and an aggregate row carries `value` and `entityCount` with the versions on its markers, as the projection contract pins (E-9, D8, D9)
- indexReadModelByKey: `.index("by_key", ["tenantId", "generation", "key"])` on every read-model table (E-9, Law 11)
- indexReadModelByKeyUse: point read of one row by the parent query and by `applyProjection` before an update; the generation comes from the registry's active row, which is one per read model and the same for every tenant, so a query narrows by its own `tenantId` and never by a tenant's generation (D8, D9, E-8, Law 11)
- pagination: every list returns through `paginationResultValidator(item)` of `convex/server` and passes its one `paginate` call the options of `boundedPage`, as `spec:context.queries` pins; a list over a parent read-model table calls `paginator` of `convex-helpers` with the composition's schema, as a context list does, over the index of `indexReadModelList`, with the client's cursors moved into the active generation by `pageInGeneration`, relays `pageStatus` and `splitCursor` as the helper returns them, and maps the page's rows through `readModelView`; a list served by a context relays the context's page; a client pages either by an explicit cursor pair; a function runs at most one built-in `.paginate`, because Convex refuses a second with "Convex only supports a single paginated query in each function" (D8, S4, Probe 5, F15, E-24)
- limitReadModelList: `limitReadModelList(readModel) = { items: limitListPage(readModel.rowBudgetBytes), bytes: limitListBytes }`, a function of the read model, so 100 items at the default 16 KiB and 64 at the 64 KiB cap; `paginator` honours the item cap on a first run and the row cap and the byte cap on every run, and answers `SplitRequired` with a `splitCursor` for a page that reaches either cap (F13, E-9, Probe 5)
- limitComponentReadsPerQuery: `[extension]` 8 component reads per parent query (E-45, D8)
- limitReadModelWritesPerCommand: `[extension]` 4 read-model rows per command, counted as the rows step 9 inserts, replaces or deletes, a row in each generation once, and checked after each `streams` entry is applied; above it step 9 throws a plain error and nothing of the command commits (E-45, D8, Sc L2-3)
- readModelVisibility: a subscription re-runs when a row it read changes, including on generation switch, because the query reads the registry row too; after the switch and after a switch back each page shows the rows of the generation then active from the position its cursors name, so a client sees the same orders and never `InvalidCursor` (D8, F7, D9)
- noProjectionJob: no scheduled function, cron, action or component maintains a read model on the core path; the only batch writer of read models is the rebuild (D8, D9)

## Example space

```gwt-vocabulary
Given a read model maintained by the {useCase:"PlaceOrder"|"CancelOrder"} use case
And a client subscribed to the first page of the read model's list for the tenant
And an order placed in a tenant
And a caller {caller:"with no identity"|"with an identity and no grant in the tenant"}
And {orders:number} orders placed in one tenant and {others:number} in another
When {action:"the use case commits one successful command"|"the caller reads the order through the parent"|"a client pins the tenant's order list in pages by cursor, and then orders are placed inside its first page"}
Then the subscription shows the committed state with source versions {versionMatch:"equal to the command's returned versions"|"older than the command's returned versions"}
And the number of workers, jobs or queues that ran is {workers:number}
And a read of the parent query over the context's get shows the committed state with stream version {versionMatch:"equal to the command's returned versions"|"older than the command's returned versions"}
And the read throws rejection {code:"unauthenticated"|"forbidden"} that names the query
And the number of receipts the read wrote is {receipts:number}
And pages of {pageSize:number} together hold {ordersHeld:number} orders, each once and in order of order ID, and none of the other tenant's
And the pinned first page keeps its range and holds {firstPageHeld:number} orders
And the number of pages that carry pageStatus SplitRequired is {splitPages:number}
```

## Verification — reviewed

- A reviewer confirms that every read need in the first experiment maps to one row of the read-need table and names its default.
- A reviewer confirms that no scheduled function, cron, action or component maintains a read model on the core path.
- A reviewer confirms that every read-model index leads with `tenantId`, that every query over a read model takes `tenantId` in its `args` and calls `authorizeQuery` before its first read, and that every list returns through `paginationResultValidator` with rows mapped by `readModelView`.
- A reviewer confirms that F15 is cited wherever a parent query calls a component query.
- A reviewer confirms that every read-model list pages with `paginator`, that the index it reads ends with `key` after its order field, and that it moves both cursors of the client's pair into the active generation.
