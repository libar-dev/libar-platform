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
  decidedBy:
    - spec:decisions.d08-read-models-in-command
    - spec:decisions.d01-one-mutation-per-operation
    - spec:decisions.d11-tenant-scope-and-authority
---
# Read models

Layer 2 · Detail: full · Traces: D1, D8, D11, Law 9, Law 10, Law 11, F4, F7, F15, Probe 3, Probe 5, Sc L2-2.

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
- assumption: A parent query calling a component query stays reactive, which the docs state and Probe 5 showed, and a component's paginated list, built with `paginator` from `convex-helpers` because the built-in `.paginate()` does not work in a component, stays contiguous across the boundary when each page is pinned by its end cursor, as Probe 5 showed on the pinned backend (F15, Probe 5, S4)

### Open questions

- [non-blocking] Probe 5 ran on 2026-10-01: pinned pages stay contiguous under live writes, and the `usePaginatedQuery` hook of `convex-helpers/react` lost rows after a page capped by `maximumRowsRead` split; until slice S2 decides how a context list is capped, the small cross-context view stays a parent query over a bounded number of component reads (Probe 5, F15, S4, D8)
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
- rule: Every read-model row names its tenant, and every query on a read model takes the tenant scope as an argument; an absent tenant is never a wildcard (Law 11, D11)
- rule: A parent query authenticates and authorizes in the parent, then reads read-model rows by index or calls component queries with tenant and scope as arguments (D11, F11)
- rule: A subscription synchronizes state; it is not durable event delivery, and no consumer treats a query result as proof of having seen every event (F7, D2)
- rule: [extension] A parent query makes at most 8 component reads, and a command writes at most 4 read-model rows; a read that needs more is a read model or is outside the baseline (E-45, D8)
- flow: A client subscribes to a parent query with its tenant scope and the key of the entity, list or view it needs (D8, Law 11)
- flow: The query authenticates and authorizes in the parent and returns nothing before authorization passes (Law 5, D11)
- flow: For one entity's detail the query calls the context's `get` through `ctx.runQuery` on the component API with tenant and scope, and returns the DTO, which carries its stream version as the context's `toDto` maps it (D8, F11, F15)
- flow: For an essential list, summary or small cross-context view the query reads the active generation's rows of the read model by index and returns them with their source stream versions (D8, D9)
- flow: The client compares the source versions in the result with the versions its last command returned and knows whether it reads its own write or a later state (D8)
- flow: When a later command changes a source, its mutation writes the row in the same transaction and every subscription on the query re-runs (D8, F7)

## Design

The read path has two shapes and the write path one. A parent `query` either reads read-model rows through an index that leads with the tenant, or calls component queries through `ctx.runQuery` with the tenant, scope and actor the parent established. The write path is the command pipeline's step 9, which calls `applyProjection` from the projection contract for every read model the declaration lists, from the `streams` entries the use case's executor returned, after its context calls and before the receipt. A query reads the read model's active generation from the generation registry in the same query, so a generation switch re-runs every subscription.

Nothing here schedules, and nothing here reads `ctx.auth` inside a component. The DTO shapes belong to the context that returns them; `StreamVersion` is the kernel's shape, which every context outcome carries, and `streamVersionValidator` is its validator.

- transactionBoundary: read-model writes happen inside the command's top-level mutation, after the context calls; reads are parent queries, reactive by subscription (D8, D1, F7)
- convexSurface: one static `query` export per read need in the parent; component queries are reached through `ctx.runQuery(components.orders.queries.order.get, args)`, its siblings `list`, `history` and `rebuild`, and `components.orders.queries.operations.byOperation`, as the queries contract names them; no scheduled function, no cron, no action (D8, F11)
- fnEntityDetail: `export const getOrder = query({ args: { tenantId: v.string(), orderId: v.string() }, returns: v.union(orderDto, v.null()), handler })` where the handler authorizes in the parent and then calls `ctx.runQuery(components.orders.queries.order.get, { tenantId, scope, streamId: orderId })` (D8, D11, F15)
- fnListOrSummary: `export const listOpenOrders = query({ args: { tenantId: v.string(), paginationOpts: paginationOptsValidator }, returns: v.object({ page: v.array(orderSummaryRow), isDone: v.boolean(), continueCursor: v.string() }), handler })` reading the active generation by index (D8, D9)
- fnCrossContextView: `export const getOrderWithStock = query({ args: { tenantId: v.string(), orderId: v.string() }, returns: v.union(v.object({ data: orderWithStockDto, sourceVersions: v.array(streamVersionValidator) }), v.null()), handler })` making at most 8 component reads and returning a `VersionedResult` whose `sourceVersions` are the DTOs' stream versions, or reading one cross-context read-model row, which carries `sourceVersions` itself (D8, E-45)
- typeVersionedResult: `[extension] type VersionedResult<T> = { data: T; sourceVersions: StreamVersion[] }`, the result of a cross-context view composed from component reads, whose `data` is not a row; every query result carries source versions in one of three ways, a per-entity or cross-context read-model row carries `sourceVersions` by the row conventions so a list page needs no wrapper, an entity DTO carries its stream version from `toDto`, and a composed view is wrapped in this type, so the client can always compare with the versions its command returned; an aggregate row carries no comparable version, so a client that needs its own write reflected compares its entity's row, and the sum's freshness is the subscription's re-run when the command commits (E-45, D8, E-9)
- readModelRowShape: every read-model row carries `tenantId`, `generation`, `key`, `projectionVersion` and the projected fields, a per-entity or cross-context row carries `sourceVersions`, and an aggregate row carries `value` and `entityCount` with the versions on its markers, as the projection contract pins (E-9, D8, D9)
- indexReadModelByKey: `.index("by_key", ["tenantId", "generation", "key"])` on every read-model table (E-9, Law 11)
- indexReadModelByKeyUse: point read of one row by the parent query and by `applyProjection` before an update; the generation comes from the registry's active row, which is one per read model and the same for every tenant, so a query narrows by its own `tenantId` and never by a tenant's generation (D8, D9, E-8, Law 11)
- pagination: list queries over parent read-model tables take `paginationOpts` from `paginationOptsValidator` and return `page`, `isDone` and `continueCursor` from the built-in `.paginate`; a list served by a context relays the component's `paginator` page instead, `pageStatus` and `splitCursor` included, because the built-in `.paginate()` does not work in a component, its page is bounded on every re-run by the component's `maximumRowsRead` and `maximumBytesRead` rather than by `numItems`, and its client subscribes through `usePaginatedQuery` from `convex-helpers/react`, which splits a `SplitRequired` page; whether that page stays contiguous across the boundary under live writes and whether the split path works there is what Probe 5 shows (D8, S4, Probe 5, F15, E-24)
- limitComponentReadsPerQuery: `[extension]` 8 component reads per parent query (E-45, D8)
- limitReadModelWritesPerCommand: `[extension]` 4 read-model rows written per command, counted by the first experiment beside the command's context calls (E-45, D8, Sc L2-3)
- readModelVisibility: a subscription re-runs when a row it read changes, including on generation switch, because the query reads the registry row too (D8, F7, D9)
- noProjectionJob: no scheduled function, cron, action or component maintains a read model on the core path; the only batch writer of read models is the rebuild (D8, D9)

## Example space

```gwt-vocabulary
Given a read model maintained by the {useCase:"PlaceOrder"|"CancelOrder"} use case
And a client subscribed to the read model's query with the tenant scope
When the use case commits {commands:number} successful command
Then the subscription shows the committed state with source versions {versionMatch:"equal to the command's returned versions"|"older than the command's returned versions"}
And the number of workers, jobs or queues that ran is {workers:number}
```

## Verification — reviewed

- A reviewer confirms that every read need in the first experiment maps to one row of the read-need table and names its default.
- A reviewer confirms that no scheduled function, cron, action or component maintains a read model on the core path.
- A reviewer confirms that every read-model index leads with `tenantId` and that every query over a read model takes `tenantId` in its `args`.
- A reviewer confirms that F15 is cited wherever a parent query calls a component query.
