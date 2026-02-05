# Business Rules

**Purpose:** Domain constraints and invariants extracted from feature files
**Detail Level:** standard

---

**Domain constraints and invariants extracted from feature specifications. 114 rules from 24 features across 2 product areas.**

---

## Example App / Phase 23

### ExampleAppModernization

_The `order-management` example app has grown organically during platform_

#### Order submission uses DCB for multi-product inventory reservation

The order submission flow should demonstrate Dynamic Consistency Boundaries (DCB)
by atomically reserving inventory across multiple products in a single operation.

#### Order detail view uses reactive projection for instant updates

The order detail page should demonstrate ReactiveProjections by showing
instant UI updates without polling.

| Component             | Purpose                               | Location                                 |
| --------------------- | ------------------------------------- | ---------------------------------------- |
| Durable Projection    | Workpool-processed, always consistent | convex/orders/projections/orderDetail.ts |
| Shared Evolve         | Same logic client + server            | convex/orders/projections/evolve.ts      |
| useReactiveProjection | Hook with optimistic updates          | src/hooks/useOrderDetail.ts              |
| Event Stream Query    | Recent events for client apply        | convex/orders/queries/recentEvents.ts    |

#### OrderSubmitted event includes customer snapshot for downstream consumers

The OrderSubmitted event should demonstrate Fat Events (ECST) by including
relevant customer data at the time of submission.

| Field         | Source            | Purpose                  |
| ------------- | ----------------- | ------------------------ |
| customerName  | CustomerCMS       | Display in notifications |
| customerEmail | CustomerCMS       | Delivery receipts        |
| submittedAt   | Command timestamp | Audit trail              |

#### README documents the app as a Reference Implementation

The README should clearly communicate that this is a reference implementation,
not a production application.

| Section                        | Content                                          |
| ------------------------------ | ------------------------------------------------ |
| Reference Implementation Badge | Clear designation at top                         |
| Patterns Demonstrated          | Table of patterns with code links                |
| Architecture Diagram           | Visual diagram showing BCs and pattern locations |
| Running Locally                | Development setup instructions                   |
| Development Guidelines         | Link to ADR-008 for purpose and change criteria  |

| Pattern                   | Phase | Location                                              | Documentation Link                |
| ------------------------- | ----- | ----------------------------------------------------- | --------------------------------- |
| CMS Dual-Write            | 02    | convex/orders/mutations.ts                            | CLAUDE.md#cms-is-the-snapshot     |
| Pure Deciders             | 14    | convex/orders/deciders/                               | CLAUDE.md#pure-deciders           |
| Projection Categories     | 15    | convex/projections/definitions.ts                     | docs/PROJECTION-CATEGORIES.md     |
| DCB                       | 16    | convex/inventory/mutations.ts                         | docs/DCB-ARCHITECTURE.md          |
| Reactive Projections      | 17    | convex/orders/projections/                            | docs/REACTIVE-PROJECTIONS.md      |
| Durable Function Adapters | 18a   | convex/inventoryInternal.ts, convex/infrastructure.ts | docs/DURABLE-FUNCTION-ADAPTERS.md |
| Fat Events                | 20    | convex/orders/events/                                 | CLAUDE.md#ecst-fat-events         |
| Reservation Pattern       | 20    | convex/inventory/reservations/                        | docs/RESERVATION-PATTERN.md       |

_[example-app-modernization.feature](libar-platform/delivery-process/specs/example-app/example-app-modernization.feature)_

---

## Platform / Phase 2

### EventStoreFoundation

_Event Sourcing requires centralized storage for domain events with_

#### Events are immutable once appended

Once an event is appended to a stream, it cannot be modified or deleted.

#### Streams provide per-entity ordering via version numbers

Each stream represents a single entity (aggregate) and maintains its own
version sequence starting at 1.

#### globalPosition enables total ordering across all streams

While version provides per-stream ordering, globalPosition provides a
monotonically increasing counter across ALL events from ALL streams.

#### OCC prevents concurrent modification conflicts

When appending events, callers must provide an expectedVersion: - If expectedVersion matches the stream's currentVersion, append succeeds - If expectedVersion mismatches, append returns a conflict result - For new streams, expectedVersion = 0

    This enables safe concurrent access without locks while ensuring
    business invariants are validated against consistent state.

#### Checkpoints enable projection resumption with exactly-once semantics

Projections track their lastProcessedPosition (a globalPosition value).

_[event-store-foundation.feature](libar-platform/delivery-process/specs/platform/event-store-foundation.feature)_

---

## Platform / Phase 3

### CommandBusFoundation

_Command execution requires idempotency (same command = same result),_

#### Commands are idempotent via commandId deduplication

Every command has a unique commandId.

#### Status tracks the complete command lifecycle

Commands progress through well-defined states: - **pending**: Command received, execution in progress - **executed**: Command succeeded, event(s) emitted - **rejected**: Business rule violation, no event emitted - **failed**: Unexpected error during execution

    The status is updated atomically with the command result, ensuring
    consistent state even under concurrent access.

#### The CommandOrchestrator is the only command execution path

Every command in the system flows through the same 7-step orchestration:

    This standardized flow ensures:
    - Consistent dual-write semantics (CMS + Event in same transaction)
    - Automatic projection triggering
    - Consistent error handling and status reporting

| Step | Action             | Component       | Purpose                              |
| ---- | ------------------ | --------------- | ------------------------------------ |
| 1    | Record command     | Command Bus     | Idempotency check                    |
| 2    | Middleware         | -               | Auth, logging, validation            |
| 3    | Call handler       | Bounded Context | CMS update via Decider               |
| 4    | Handle rejection   | -               | Early exit if business rule violated |
| 5    | Append event       | Event Store     | Audit trail                          |
| 6    | Trigger projection | Workpool        | Update read models                   |
| 7    | Update status      | Command Bus     | Final status + result                |

#### correlationId links commands, events, and projections

Every command carries a correlationId that flows through the entire
execution path: - Command -> Handler -> Event metadata -> Projection processing - Enables tracing a user action through all system components - Supports debugging and audit trail reconstruction

    The commandEventCorrelations table tracks which events were produced
    by each command, enabling forward (command -> events) lookups.

#### Middleware provides composable cross-cutting concerns

The CommandOrchestrator supports a middleware pipeline that wraps
command execution with before/after hooks:

    - **Validation middleware**: Schema validation before handler
    - **Authorization middleware**: Permission checks
    - **Logging middleware**: Structured command logging
    - **Rate limiting**: Throttling by user/context

    Middleware executes in registration order, with early exit on failure.

_[command-bus-foundation.feature](libar-platform/delivery-process/specs/platform/command-bus-foundation.feature)_

---

## Platform / Phase 6

### SagaOrchestration

_Cross-BC operations (e.g., Order -> Inventory -> Shipping) cannot_

#### Sagas orchestrate operations across multiple bounded contexts

When a business process spans multiple bounded contexts (e.g., Orders,
Inventory, Shipping), a Saga coordinates the steps:

    1.

#### @convex-dev/workflow provides durability across server restarts

Sagas use Convex Workflow for durable execution: - Workflow state is persisted automatically - Server restarts resume from the last completed step - External events (awaitEvent) allow pausing for external input

    This durability is critical for long-running processes that may span
    minutes or hours (e.g., waiting for payment confirmation).

#### Compensation reverses partial operations on failure

If step N fails after steps 1..N-1 succeeded, compensation logic
must undo the effects of the completed steps:

    Compensation runs in reverse order of the original steps.

| Step              | Success Action   | Compensation        |
| ----------------- | ---------------- | ------------------- |
| Reserve inventory | Stock reserved   | Release reservation |
| Charge payment    | Payment captured | Refund payment      |
| Update order      | Order confirmed  | Cancel order        |

#### Saga idempotency prevents duplicate workflows via sagaId

Each saga has a unique sagaId (typically the entity ID triggering it).

#### Saga status is updated via onComplete callback, not inside workflow

The workflow's onComplete handler updates the saga's status in the
sagas table.

_[saga-orchestration.feature](libar-platform/delivery-process/specs/platform/saga-orchestration.feature)_

---

## Platform / Phase 11

### BoundedContextFoundation

_DDD Bounded Contexts need clear boundaries with physical enforcement,_

#### Components have isolated databases that parent cannot query directly

Each Convex component (bounded context) has its own isolated database.

#### Sub-transactions are atomic within components

When a component handler is called, all writes within that handler
commit atomically.

#### ctx.auth does not cross component boundaries

Authentication context (ctx.auth) is NOT passed to component handlers.

#### Id<"table"> inside component becomes string at API boundary

Convex typed IDs (Id<"table">) are scoped to their database.

#### DualWriteContextContract formalizes the bounded context API

Each bounded context should define a contract that specifies: - **identity**: Name, description, version, streamTypePrefix - **executionMode**: "dual-write" for CMS + Event pattern - **commandTypes**: List of commands the context handles - **eventTypes**: List of events the context produces - **cmsTypes**: CMS tables with schema versions - **errorCodes**: Domain errors that can be returned

    This contract serves as documentation and enables type-safe integration.

_[bounded-context-foundation.feature](libar-platform/delivery-process/specs/platform/bounded-context-foundation.feature)_

---

## Platform / Phase 13

### PackageArchitecture

_The original @convex-es/core package grew to 25+ modules, creating issues:_

#### Layer 0 packages have no framework dependencies

#### Consumers can install individual packages

#### Tests ship with framework packages

#### Backward compatibility is maintained

#### No naming conflicts with libar-ai project

_[package-architecture.feature](libar-platform/delivery-process/specs/platform/package-architecture.feature)_

---

## Platform / Phase 14

### DeciderPattern

_Domain logic embedded in handlers makes testing require infrastructure._

#### Deciders must be pure functions

Pure functions have no I/O, no ctx access, no side effects.

#### DeciderOutput encodes three outcomes

- **Success:** Command executed, event emitted, state updated
  - **Rejected:** Business rule violation, no event, clear error code
  - **Failed:** Unexpected failure, audit event, context preserved

  **Executable tests:** platform-decider/tests/features/behavior/decider-outputs.feature
  - Scenarios covering success, rejected, failed outputs
  - Type guard tests (isSuccess, isRejected, isFailed)
  - Edge cases for mutually exclusive outcomes

#### FSM enforces valid state transitions

State machines prevent invalid transitions at runtime with clear errors.

#### Evolve functions use event payload as source of truth

Evolve must not recalculate values - events are immutable source of truth.

#### Handler factories wrap deciders with infrastructure

- `createDeciderHandler()` for modifications (loads existing state)
  - `createEntityDeciderHandler()` for creation (handles null state)

_[decider-pattern.feature](libar-platform/delivery-process/specs/platform/decider-pattern.feature)_

---

## Platform / Phase 15

### ProjectionCategories

_Projections exist but categories are implicit._

#### Projections are classified into four distinct categories

- **Invariant:** Every projection must belong to exactly one of four categories: Logic, View, Reporting, or Integration. Categories are mutually exclusive.

- **Rationale:** Without explicit categories, developers must guess which projection to use for which purpose, leading to misuse (e.g., using Logic projections for UI) and performance issues (e.g., subscribing to Reporting projections reactively). | Category | Purpose | Query Pattern | Example | | Logic | Minimal data for command validation | Internal only | orderExists(id) | | View | Denormalized for UI queries | Client queries | orderSummaries | | Reporting | Analytics and aggregations | Async/batch | dailySalesReport | | Integration | Cross-context synchronization | EventBus | orderStatusForShipping |

| Category    | Purpose                             | Query Pattern  | Example                |
| ----------- | ----------------------------------- | -------------- | ---------------------- |
| Logic       | Minimal data for command validation | Internal only  | orderExists(id)        |
| View        | Denormalized for UI queries         | Client queries | orderSummaries         |
| Reporting   | Analytics and aggregations          | Async/batch    | dailySalesReport       |
| Integration | Cross-context synchronization       | EventBus       | orderStatusForShipping |

#### Categories determine projection characteristics

- **Invariant:** Each category prescribes specific characteristics for cardinality, freshness requirements, and client exposure. These are not suggestions but enforced at registration time.

- **Rationale:** Consistent characteristics per category enable infrastructure optimizations (e.g., reactive subscriptions only for View) and security enforcement (e.g., Logic projections never exposed to clients). | Category | Cardinality | Freshness | Client Exposed | | Logic | Minimal fields | Always current | No | | View | Denormalized | Near real-time | Yes | | Reporting | Aggregated | Eventual | Admin only | | Integration | Contract-defined | Event-driven | No (EventBus) |

| Category    | Cardinality      | Freshness      | Client Exposed |
| ----------- | ---------------- | -------------- | -------------- |
| Logic       | Minimal fields   | Always current | No             |
| View        | Denormalized     | Near real-time | Yes            |
| Reporting   | Aggregated       | Eventual       | Admin only     |
| Integration | Contract-defined | Event-driven   | No (EventBus)  |

#### Projections must declare explicit category

- **Invariant:** Category must be specified at projection definition time. Projections without explicit category fail registration with CATEGORY_REQUIRED.

- **Rationale:** Implicit categories (guessed from naming or usage) lead to inconsistent behavior. Explicit declaration forces developers to think about the projection's purpose and enables compile-time validation.

#### Category determines client exposure

- **Invariant:** Client exposure is determined solely by category. Logic and Integration projections are never client-accessible. View projections are always client-accessible. Reporting projections require admin role.

- **Rationale:** Security and performance concerns require clear boundaries. Logic projections contain internal validation state that shouldn't leak. Integration projections are for cross-BC communication, not direct queries.

#### Only View projections require reactive subscriptions

- **Invariant:** Reactive subscriptions (real-time push updates) are only supported for View category projections. Other categories reject subscription attempts with SUBSCRIPTIONS_NOT_SUPPORTED.

- **Rationale:** Reactive infrastructure is expensive (WebSocket connections, change detection, client memory). Limiting reactivity to View projections ensures resources are used only where instant UI feedback is needed.

_[projection-categories.feature](libar-platform/delivery-process/specs/platform/projection-categories.feature)_

---

## Platform / Phase 16

### DynamicConsistencyBoundaries

_Cross-entity invariants within a bounded context currently require_

#### DCB defines four core concepts for scope-based coordination

These concepts work together to enable multi-entity invariants within
a bounded context.

| Concept        | Description                                                                                     |
| -------------- | ----------------------------------------------------------------------------------------------- |
| Scope Key      | Unique identifier for consistency boundary (format: tenant:${tenantId}:${scopeType}:${scopeId}) |
| Scope Table    | dcbScopes in Event Store for scope-level version tracking                                       |
| Virtual Stream | Logical composition of events within scope across physical streams                              |
| Scope OCC      | expectedVersion checked on commit to prevent concurrent modifications                           |

#### Scope key uniquely identifies consistency boundary with OCC

All entities within a scope are validated together with scope-level OCC.

#### Virtual streams compose events across scope

Virtual streams provide a logical view of all events within a scope,
regardless of which physical stream (entity) they belong to.

#### DCB enforces three mandatory constraints

These constraints ensure DCB operates safely within the Convex-Native ES model.

| Constraint       | Reason                                              |
| ---------------- | --------------------------------------------------- |
| Single-BC only   | Cross-BC invariants must use Sagas for compensation |
| Tenant-aware     | Multi-tenant isolation enforced at scope level      |
| Decider required | Pure validation logic via Decider pattern           |

#### Operations must use Decider pattern

DCB builds on pure deciders for validation logic.

_[dynamic-consistency-boundaries.feature](libar-platform/delivery-process/specs/platform/dynamic-consistency-boundaries.feature)_

---

## Platform / Phase 17

### ReactiveProjections

_Workpool-based projections have 100-500ms latency._

#### Hybrid model combines durability with speed

Workpool handles persistence, reactive layer handles instant feedback.

| Current State                    | Target State                                  |
| -------------------------------- | --------------------------------------------- |
| Workpool only: 100-500ms latency | Hybrid: 10-50ms reactive + durable background |
| Client polls or waits            | Client sees instant optimistic update         |
| No optimistic UI                 | Full optimistic UI with rollback              |

#### Shared evolve logic runs on client and server

Same evolve() function ensures consistent state transformation.

| Input                                        | Output          |
| -------------------------------------------- | --------------- |
| (state: ProjectionState, event: DomainEvent) | ProjectionState |

#### Conflict detection triggers rollback

Optimistic updates are discarded if they conflict with durable state.

| Scenario                    | Detection                                  | Resolution              |
| --------------------------- | ------------------------------------------ | ----------------------- |
| Optimistic ahead of durable | Check globalPosition                       | Merge with durable base |
| Conflicting branch          | Different event IDs at same globalPosition | Discard optimistic      |
| Stale optimistic            | Age exceeds stale threshold (30s default)  | Rollback to durable     |

#### Only View projections need reactive layer

Logic, Reporting, and Integration projections use Workpool only.

| Category    | Reactive Eligible | Reason                                |
| ----------- | ----------------- | ------------------------------------- |
| view        | Yes               | Client-facing, needs instant feedback |
| logic       | No                | Internal validation, no UI            |
| reporting   | No                | Analytics, eventual consistency OK    |
| integration | No                | Cross-BC sync via EventBus            |

#### useReactiveProjection merges durable and optimistic state

The hook provides a unified interface for hybrid reactive projections.

| Field           | Type      | Description                         |
| --------------- | --------- | ----------------------------------- |
| state           | T or null | Merged state (durable + optimistic) |
| isOptimistic    | boolean   | True if optimistic events applied   |
| durablePosition | number    | Last processed global position      |
| pendingEvents   | number    | Count of optimistic events          |

_[reactive-projections.feature](libar-platform/delivery-process/specs/platform/reactive-projections.feature)_

---

## Platform / Phase 18

### AdminToolingConsolidation

_Admin functionality is scattered across the codebase:_

#### Admin directory provides unified location for operational endpoints

All cross-cutting admin operations live in `convex/admin/`.

#### DLQ endpoints provide inspection, retry, and ignore operations

Dead letter queue management enables operations teams to: - View failed projection updates - Retry individual or bulk items - Ignore items that cannot be processed

    **Existing Operations (to be moved):**

    **New Operations:**

    **Enhanced DLQ Operations:**

| Operation                  | Current Location           | New Location         |
| -------------------------- | -------------------------- | -------------------- |
| getPendingDeadLetters      | projections/deadLetters.ts | admin/deadLetters.ts |
| replayDeadLetter           | projections/deadLetters.ts | admin/deadLetters.ts |
| ignoreDeadLetter           | projections/deadLetters.ts | admin/deadLetters.ts |
| prepareDeadLetterRetrigger | projections/deadLetters.ts | admin/deadLetters.ts |

| Operation          | Purpose                                  |
| ------------------ | ---------------------------------------- |
| getDeadLetterById  | Get single dead letter with full details |
| getDeadLetterStats | Count by projection and status           |
| bulkRetry          | Retry all pending for a projection       |
| bulkIgnore         | Ignore all pending for a projection      |
| purgeResolved      | Delete resolved items older than N days  |

#### Event flow trace enables debugging across the command-event-projection chain

When issues occur, operators need to trace: - Which command created an event - Which projections processed the event - Where in the chain a failure occurred

    **Trace Query:**

#### System state snapshot provides full health picture

Operators need a single query to understand overall system state, combining: - Component health (Event Store, projections, Workpools) - Projection lag across all projections - DLQ statistics - Active rebuilds - Circuit breaker states

    **Snapshot Query:**

#### Durable function queries enable Workpool and Workflow debugging

When background work fails or stalls, operators need visibility into: - Workpool queue contents and status - Workflow execution history - Action Retrier run status

    **Durable Function Queries:**

#### Admin endpoints require authorization

Admin operations are powerful and should be protected.

_[admin-tooling-consolidation.feature](libar-platform/delivery-process/specs/platform/admin-tooling-consolidation.feature)_

### CircuitBreakerPattern

_External API failures (Stripe, SendGrid, webhooks) cascade through the system._

#### Circuit breaker follows three-state machine

The circuit breaker is a state machine with well-defined transitions:

    **State Diagram:**


    **State Behaviors:**

    **Pure State Machine:**

| State     | Request Handling                 | Transitions                            |
| --------- | -------------------------------- | -------------------------------------- |
| CLOSED    | Execute normally, track failures | → OPEN after threshold failures        |
| OPEN      | Reject immediately (fail fast)   | → HALF_OPEN after timeout              |
| HALF_OPEN | Allow single probe request       | → CLOSED on success, → OPEN on failure |

#### Circuit state persists in Convex table

Convex functions are stateless across invocations.

#### Open-to-half-open transition uses scheduler

The OPEN → HALF_OPEN transition happens after `resetTimeoutMs` elapses.

#### Half-open probes use Action Retrier with zero retries

When circuit enters HALF_OPEN, we need to test if the service recovered.

#### Each external service has independent circuit configuration

Different services have different failure characteristics.

| Option           | Default | Description                           |
| ---------------- | ------- | ------------------------------------- |
| failureThreshold | 5       | Consecutive failures before opening   |
| resetTimeoutMs   | 30000   | Time in open state before half-open   |
| successThreshold | 1       | Successes in half-open before closing |

_[circuit-breaker-pattern.feature](libar-platform/delivery-process/specs/platform/circuit-breaker-pattern.feature)_

### DurableFunctionAdapters

_Platform has well-defined interfaces (RateLimitChecker, DCB conflict handling) but uses_

#### Rate limit adapter bridges middleware to component

- **Invariant:** Rate limiting decisions must persist across server restarts and scale horizontally via sharding—no in-memory implementations in production.

- **Rationale:** In-memory rate limiters lose state on cold starts and cannot enforce consistent limits across multiple server instances. The `@convex-dev/rate-limiter` component provides persistence, sharding, and correct token bucket/fixed window semantics without middleware pipeline changes.

| Expected QPS | Recommended Shards |
| ------------ | ------------------ |
| < 50         | None (default)     |
| 50-200       | 5-10               |
| 200-1000     | 10-50              |
| > 1000       | 50+                |

**Implementation:** `@libar-dev/platform-core/src/middleware/rateLimitAdapter.ts`

#### DCB retry helper automatically handles OCC conflicts

- **Invariant:** OCC conflicts from DCB operations must be retried automatically with exponential backoff and scope-based serialization—callers must not implement retry logic.

- **Rationale:** Manual retry leads to inconsistent patterns, missing jitter (thundering herd), and no partition ordering (OCC storms). Workpool provides durable retry with partition keys that serialize retries per scope, preventing concurrent attempts.

**Implementation:** `@libar-dev/platform-core/src/dcb/withRetry.ts`

#### Adapters integrate with existing platform infrastructure

- **Invariant:** Adapters must plug into existing platform interfaces without requiring changes to middleware pipeline, command configs, or core orchestration logic.

- **Rationale:** The platform already has well-defined interfaces (RateLimitChecker, DCB execution flow). Adapters bridge these to Convex durable components without disrupting working code—minimizing risk and maximizing adoption.

**Implementation:** `examples/order-management/convex/rateLimits.ts`

_[durable-function-adapters.feature](libar-platform/delivery-process/specs/platform/durable-function-adapters.feature)_

### EventReplayInfrastructure

_When projections become corrupted, require schema migration, or drift from_

#### Replay must resume from last successful checkpoint

- **Invariant:** A replay operation must never reprocess events that have already been successfully applied to the projection—resume from last checkpoint, not from scratch.

- **Rationale:** Replaying millions of events wastes compute, risks projection corruption if handlers aren't idempotent, and extends recovery time. Checkpoints enable reliable long-running rebuilds that survive transient failures.

| Field           | Type              | Purpose                                       |
| --------------- | ----------------- | --------------------------------------------- |
| replayId        | string            | Unique identifier for this replay operation   |
| projection      | string            | Target projection name                        |
| lastPosition    | number            | Last successfully processed globalPosition    |
| targetPosition  | number (optional) | End position (null = current max)             |
| status          | enum              | running, paused, completed, failed, cancelled |
| eventsProcessed | number            | Total events processed so far                 |
| chunksCompleted | number            | Number of chunks completed                    |
| error           | string (optional) | Error message if failed                       |
| startedAt       | number            | Timestamp when replay started                 |
| updatedAt       | number            | Last checkpoint update timestamp              |
| completedAt     | number (optional) | Timestamp when completed                      |

**Implementation:** `@libar-dev/platform-core/src/projections/replay/types.ts`

#### Replay uses dedicated low-priority Workpool

- **Invariant:** Replay operations must not starve live projection updates—dedicated low-priority pool with maxParallelism ≤ 50% of projectionPool.

- **Rationale:** Live user-facing projections must maintain low latency. Replay is background recovery work that can tolerate higher latency. Separate Workpool with lower parallelism ensures budget preservation.

| Parameter                             | Value | Rationale                                        |
| ------------------------------------- | ----- | ------------------------------------------------ |
| maxParallelism                        | 5     | Low priority, preserves 50%+ budget for live ops |
| retryActionsByDefault                 | false | Replay mutations, not actions                    |
| defaultRetryBehavior.maxAttempts      | 5     | More retries for background work                 |
| defaultRetryBehavior.initialBackoffMs | 1000  | Longer backoff for batch work                    |
| logLevel                              | INFO  | Production observability                         |

**Implementation:** `examples/order-management/convex/infrastructure.ts`

#### Events are processed in configurable chunks

- **Invariant:** Each replay chunk must complete within Convex mutation timeout limits (10s)—chunk size must be configurable based on projection complexity.

- **Rationale:** Large event stores have millions of events. Processing all in one mutation would timeout. Chunked processing with complexity-aware sizing ensures reliable completion: simple projections use 100, complex ones use 10-25.

| Projection Complexity           | Chunk Size | Rationale                        |
| ------------------------------- | ---------- | -------------------------------- |
| Simple (single table update)    | 100        | Fast processing, high throughput |
| Medium (multiple tables)        | 50         | More writes per event            |
| Complex (cross-context joins)   | 25         | Avoid timeout, more I/O          |
| Very complex (external lookups) | 10         | Maximum safety margin            |

**Implementation:** `processReplayChunk`

#### Replay progress is queryable in real-time

- **Invariant:** Operations teams must be able to query replay progress at any time— status, percentage complete, and estimated remaining time.

- **Rationale:** Long-running rebuilds (hours for large projections) need visibility. Without progress tracking, operators cannot estimate completion, detect stuck replays, or plan maintenance windows.

**Implementation:** `@libar-dev/platform-core/src/projections/replay/progress.ts`

#### Admin mutations enable operational control

- **Invariant:** Replay operations must only be triggerable via internal mutations— no public API exposure for admin operations.

- **Rationale:** Replay can be expensive (compute, time) and disruptive if misused. Internal mutations ensure only authorized code paths can trigger rebuilds, preventing accidental or malicious replay triggering.

| Operation       | Mutation/Query     | Purpose                         |
| --------------- | ------------------ | ------------------------------- |
| Trigger rebuild | triggerRebuild     | Start new rebuild from position |
| Cancel rebuild  | cancelRebuild      | Stop in-progress rebuild        |
| Get status      | getRebuildStatus   | Query single rebuild progress   |
| List active     | listActiveRebuilds | Query all running rebuilds      |
| Pause rebuild   | pauseRebuild       | Temporarily pause (future)      |
| Resume rebuild  | resumeRebuild      | Resume paused rebuild (future)  |

**Implementation:** `examples/order-management/convex/admin/projections.ts`

_[event-replay-infrastructure.feature](libar-platform/delivery-process/specs/platform/event-replay-infrastructure.feature)_

### EventStoreDurability

_The dual-write pattern (CMS + Event) works when both operations are in the_

#### Action results are captured as events via onComplete mutation

- **Invariant:** Every external API result (success or failure) must be captured as a domain event within the bounded context's event stream.

- **Rationale:** Actions are at-most-once by default. If an action succeeds but the subsequent event append fails, the side effect is orphaned. The outbox pattern uses `onComplete` callbacks which are guaranteed to be called after the action finishes.

**Implementation:** `@libar-dev/platform-core/src/durability/outbox.ts`

#### Event append is idempotent using idempotency keys

- **Invariant:** Each logical event is stored exactly once in the event store, regardless of how many times the append operation is retried.

- **Rationale:** Retries (Workpool, manual, saga compensation) can cause duplicate append attempts. Without idempotency keys, the same business event could be stored multiple times, corrupting projections and causing double-processing in downstream systems.

| Event Source   | Idempotency Key Pattern                 | Example                                  |
| -------------- | --------------------------------------- | ---------------------------------------- |
| Command result | `{commandType}:{entityId}:{commandId}`  | `SubmitOrder:ord-123:cmd-456`            |
| Action result  | `{actionType}:{entityId}`               | `payment:ord-123`                        |
| Saga step      | `{sagaType}:{sagaId}:{step}`            | `OrderFulfillment:saga-789:reserveStock` |
| Scheduled job  | `{jobType}:{scheduleId}:{runTimestamp}` | `expireReservations:job-001:1704067200`  |

**Implementation:** `@libar-dev/platform-core/src/durability/idempotentAppend.ts`

#### Cross-context events use Workpool-backed publication with tracking

- **Invariant:** Every cross-context event publication must be tracked, retried on failure, and dead-lettered if undeliverable after maximum attempts.

- **Rationale:** Fire-and-forget publication loses events when subscribers fail. For event-driven architectures to be reliable, cross-context communication must be durable with guaranteed delivery or explicit failure tracking.

**Implementation:** `@libar-dev/platform-core/src/durability/publication.ts`

#### Long-running operations bracket with intent and completion events

- **Invariant:** Operations that span multiple steps, external calls, or significant time must record an "intent" event at start and "completion" event at end.

- **Rationale:** Without bracketing, partially-completed operations are invisible to monitoring, undetectable by reconciliation, and create audit trail gaps. Intent events enable timeout detection and manual intervention for stuck operations.

| Operation          | Intent Event             | Completion Events                                               |
| ------------------ | ------------------------ | --------------------------------------------------------------- |
| Order submission   | OrderSubmissionStarted   | OrderSubmitted, OrderSubmissionFailed, OrderSubmissionAbandoned |
| Payment processing | PaymentProcessingStarted | PaymentCompleted, PaymentFailed                                 |
| Stock reservation  | ReservationRequested     | StockReserved, ReservationFailed                                |

**Implementation:** `@libar-dev/platform-core/src/durability/intentCompletion.ts`

#### Failed event appends are recovered via Workpool actions

- **Invariant:** Event append failures from async contexts (scheduled jobs, saga steps) are retried with exponential backoff until success or dead letter.

- **Rationale:** Workpool only retries actions, not mutations. By wrapping the idempotent append mutation in an action, we get Workpool retry semantics while the underlying idempotent check prevents duplicates.

| Scenario                    | Use durableAppendEvent? | Why                                      |
| --------------------------- | ----------------------- | ---------------------------------------- |
| Synchronous command handler | No                      | Atomic dual-write handles this           |
| Action onComplete           | Recommended             | Mutation can fail after action succeeded |
| Saga step                   | Yes                     | Step result must be captured             |
| Scheduled job               | Yes                     | Job completion must be recorded          |

**Implementation:** `@libar-dev/platform-core/src/durability/durableAppend.ts`

#### Malformed events are quarantined after repeated failures

- **Invariant:** Events that cause projection processing failures are tracked; after N failures, they are quarantined and skipped to prevent infinite retry loops.

- **Rationale:** A single malformed event should not block all downstream projections indefinitely. Quarantine allows progress while alerting operators for manual investigation.

| Attempt | Action                                             |
| ------- | -------------------------------------------------- |
| 1       | Process event, catch error, record attempt         |
| 2       | Retry with backoff, catch error, record attempt    |
| 3       | Quarantine event, skip in future processing, alert |

**Implementation:** `@libar-dev/platform-core/src/durability/poisonEvent.ts`

#### Failed publications are tracked and recoverable

- **Invariant:** When cross-context event delivery fails after all retries, a dead letter record is created. Operations teams can investigate and retry manually or automatically.

- **Rationale:** Dead letters provide visibility into integration failures and enable recovery without data loss. Context-specific stats help identify systemic issues (e.g., analytics service down).

| Operation                     | Purpose                                  |
| ----------------------------- | ---------------------------------------- |
| listPublicationDeadLetters    | View failed deliveries by target context |
| retryPublicationDeadLetter    | Re-enqueue delivery via publicationPool  |
| ignorePublicationDeadLetter   | Mark as ignored (e.g., obsolete event)   |
| getPublicationDeadLetterStats | Count by target context and status       |

_[event-store-durability.feature](libar-platform/delivery-process/specs/platform/event-store-durability.feature)_

### HealthObservability

_No Kubernetes integration (readiness/liveness probes), no metrics for_

#### Health endpoints support Kubernetes probes

Kubernetes requires HTTP endpoints for orchestration: - **Readiness probe** (`/health/ready`) - Is the service ready to receive traffic? - **Liveness probe** (`/health/live`) - Is the process alive and responsive?

    **Endpoint Specifications:**

    **Implementation via httpAction:**

| Endpoint      | HTTP Method | Success | Failure                 | Checks                                   |
| ------------- | ----------- | ------- | ----------------------- | ---------------------------------------- |
| /health/ready | GET         | 200 OK  | 503 Service Unavailable | Event Store, projections, Workpool depth |
| /health/live  | GET         | 200 OK  | (always 200)            | Process responsive                       |

#### Workpool queue depth signals backpressure

When Workpool queue depth exceeds threshold, the system is under stress.

#### Projection lag tracks distance from Event Store head

Projection lag = (Event Store max globalPosition) - (Projection checkpoint position)

    Lag indicates how far behind projections are from the source of truth.

| Threshold | Status   | Action                         |
| --------- | -------- | ------------------------------ |
| 0-10      | healthy  | Normal operation               |
| 11-100    | warning  | Monitor, may indicate burst    |
| 101-1000  | degraded | Investigate, consider scaling  |
| 1000+     | critical | Alert, projection may be stuck |

#### Metrics are collected as structured JSON for Log Streams export

Convex doesn't support OpenTelemetry SDK directly.

| Metric                | Labels               | Unit         | Purpose                      |
| --------------------- | -------------------- | ------------ | ---------------------------- |
| projection.lag_events | projection_name      | count        | Projection processing delay  |
| events.throughput     | stream_type          | events/min   | Event Store write rate       |
| command.latency_ms    | command_type, status | milliseconds | Command processing time      |
| dlq.size              | projection_name      | count        | Failed events awaiting retry |
| workpool.queue_depth  | pool_name            | count        | Pending items                |

#### System health aggregates component statuses

Overall system health is derived from individual component health.

| Component State | System Impact                      |
| --------------- | ---------------------------------- |
| All healthy     | System healthy (200)               |
| Any degraded    | System degraded (200 with warning) |
| Any unhealthy   | System unhealthy (503)             |

_[health-observability.feature](libar-platform/delivery-process/specs/platform/health-observability.feature)_

### ProductionHardening

_Structured logging (Phase 13) exists but no metrics collection, distributed tracing,_

#### Metrics track system health indicators

Projection lag, event throughput, command latency, and DLQ size are the core metrics.

| Metric                 | Labels                         | Unit         | Purpose                           |
| ---------------------- | ------------------------------ | ------------ | --------------------------------- |
| projection.lag_events  | projection_name, partition_key | count        | Projection processing delay       |
| events.throughput      | stream_type                    | events/min   | Event store write rate            |
| command.latency_ms     | command_type, status           | milliseconds | Command processing time           |
| dlq.size               | projection_name                | count        | Failed events awaiting retry      |
| circuit_breaker.state  | breaker_name                   | enum         | Current circuit state             |
| retrier.attempts       | operation_name, status         | count        | Retry attempts per operation      |
| workpool.queue_depth   | pool_name                      | count        | Pending items awaiting processing |
| workflow.step_failures | workflow_name, step            | count        | Saga compensation triggers        |

#### Distributed tracing visualizes event flow

Trace context propagates from command through events to projections using correlation IDs.

#### Health endpoints support Kubernetes probes

/health/ready for readiness (dependencies OK), /health/live for liveness (process running).

| Endpoint      | Purpose         | Checks                                   | Response      |
| ------------- | --------------- | ---------------------------------------- | ------------- |
| /health/ready | Readiness probe | Event store, projections, workpool depth | 200 OK or 503 |
| /health/live  | Liveness probe  | Process alive                            | 200 OK always |

#### Circuit breakers prevent cascade failures

Open circuit after threshold failures, half-open for recovery testing.

| State     | Behavior                         | Transition                             |
| --------- | -------------------------------- | -------------------------------------- |
| CLOSED    | Normal operation, track failures | → OPEN after threshold failures        |
| OPEN      | Fail fast, no requests           | → HALF_OPEN after timeout              |
| HALF_OPEN | Allow one test request           | → CLOSED on success, → OPEN on failure |

#### Admin tooling enables operational tasks

Projection rebuild, DLQ inspection/retry, event flow tracing, system diagnostics.

| Operation            | Endpoint                                | Purpose                          |
| -------------------- | --------------------------------------- | -------------------------------- |
| Trigger rebuild      | admin.projections.triggerRebuild        | Re-process events from position  |
| Cancel rebuild       | admin.projections.cancelRebuild         | Stop in-progress rebuild         |
| Rebuild status       | admin.projections.getRebuildStatus      | Check rebuild progress           |
| DLQ list             | admin.deadLetters.getPending            | View failed events               |
| DLQ retry            | admin.deadLetters.retryOne              | Retry single dead letter         |
| DLQ bulk retry       | admin.deadLetters.retryAll              | Retry all with status            |
| Event trace          | admin.diagnostics.getEventFlowTrace     | Trace event by correlationId     |
| System diagnostics   | admin.diagnostics.getSystemState        | Full system health snapshot      |
| Durable function run | admin.diagnostics.getDurableFunctionRun | Query Retrier/Workflow run by ID |

#### Durable functions provide reliable execution patterns

Production systems use @convex-dev durable function components for reliability.

| Component      | Use Case              | Key Feature                      | Platform Integration Point      |
| -------------- | --------------------- | -------------------------------- | ------------------------------- |
| Action Retrier | External API calls    | Exponential backoff + onComplete | Circuit breaker half-open probe |
| Workpool       | Projection processing | Parallelism + partition ordering | DLQ processing                  |
| Workflow       | Multi-step sagas      | Compensation + awaitEvent        | Cross-BC coordination           |

_[production-hardening.feature](libar-platform/delivery-process/specs/platform/production-hardening.feature)_

---

## Platform / Phase 19

### BddTestingInfrastructure

_Domain logic tests require infrastructure (Docker, database)._

#### All domain logic tests must be Gherkin

Deciders, FSM, invariants use Given/When/Then format exclusively.

#### Deciders enable perfect test isolation

Pure functions = no mocking, no ctx, no database.

#### Step definitions must be organized to prevent conflicts

Separate step files per domain area, namespaced patterns.

#### Integration tests use action-focused steps

Command lifecycle tests validate full flow with assertions.

#### Platform packages must have feature coverage

libar-dev/platform-\* packages need BDD tests for public APIs.

_[bdd-testing-infrastructure.feature](libar-platform/delivery-process/specs/platform/bdd-testing-infrastructure.feature)_

---

## Platform / Phase 20

### DeterministicIdHashing

_TTL-based reservations work well for multi-step flows (registration wizards),_

#### Stream ID is deterministic from business key

Same business key always produces the same stream ID.

    **API:**

#### OCC prevents duplicate creation

First writer wins; second gets conflict error.

    **Conflict Handling:**

#### Hash algorithm is collision-resistant

Hash should be cryptographically strong to prevent collisions.

    **Hash Requirements:**
    - Deterministic: same input always produces same output
    - Collision-resistant: different inputs produce different outputs
    - URL-safe: can be used in stream IDs without encoding

#### Pattern complements Reservation Pattern

Choose based on use case; both are valid uniqueness strategies.

    **Decision Tree:**

_[deterministic-id-hashing.feature](libar-platform/delivery-process/specs/platform/deterministic-id-hashing.feature)_

### EcstFatEvents

_Thin events require consumers to query back to the source BC,_

#### Fat events enable service independence

Consumers don't need to query source BC for context.

    **Current State (thin event - requires back-query):**


    **Target State (fat event - self-contained):**

#### Builder utilities handle schema versioning

Fat events include schema version for upcasting support.

#### Crypto-shredding markers identify PII fields

GDPR compliance requires marking personal data for deletion.

#### Use fat events for cross-context integration

Same-context projections can use thin events for efficiency.

_[ecst-fat-events.feature](libar-platform/delivery-process/specs/platform/ecst-fat-events.feature)_

### ReservationPattern

_Uniqueness constraints before entity creation require check-then-create_

#### Reservations prevent race conditions

- **Invariant:** Only one reservation can exist for a given key at any time. Concurrent claims resolve deterministically via OCC.

- **Rationale:** Check-then-create patterns have a TOCTOU vulnerability where two requests may both see "not exists" and proceed to create, violating uniqueness. Atomic reservation eliminates this window.

#### Reservations have TTL for auto-cleanup

- **Invariant:** All reservations must have a TTL. After TTL expiry, the reservation transitions to "expired" and the key becomes available.

- **Rationale:** Without TTL, abandoned reservations (user closes browser, network failure) would permanently block values. TTL ensures eventual availability.

#### Confirmation converts to permanent entity

- **Invariant:** A reservation can only be confirmed once. Confirmation atomically transitions state to "confirmed" and links to the created entity.

- **Rationale:** The two-phase reservation→confirmation ensures the unique value is guaranteed available before the expensive entity creation occurs.

#### Release frees reservation before expiry

- **Invariant:** An active reservation can be explicitly released, immediately freeing the key for other consumers without waiting for TTL.

- **Rationale:** Good UX requires immediate availability when users cancel. Waiting for TTL (potentially minutes) creates unnecessary blocking.

#### Reservation key combines type and value

- **Invariant:** Reservation keys are namespaced by type. The same value can be reserved in different namespaces simultaneously.

- **Rationale:** A single value like "alice" may need uniqueness in multiple contexts (username, display name, etc.). Type-scoped keys allow independent reservations.

_[reservation-pattern.feature](libar-platform/delivery-process/specs/platform/reservation-pattern.feature)_

---

## Platform / Phase 21

### IntegrationPatterns21a

_Cross-context communication is ad-hoc._

#### Context Map documents BC relationships

- **Invariant:** All BC relationships must be explicitly documented with relationship type, upstream/downstream direction, and no duplicate or self-referential entries.

- **Rationale:** Implicit relationships lead to accidental coupling and unclear ownership. Explicit documentation enables architecture governance and dependency analysis.

| Relationship          | Upstream        | Downstream                       | Description                                      |
| --------------------- | --------------- | -------------------------------- | ------------------------------------------------ |
| upstream-downstream   | ProducerContext | ConsumerContext                  | Producer publishes, Consumer consumes            |
| customer-supplier     | ProducerContext | DownstreamContext                | Downstream needs drive Producer API              |
| conformist            | EventStore      | All BCs                          | All BCs conform to event schema                  |
| anti-corruption-layer | ExternalSystem  | IntegrationContext               | IntegrationContext translates external responses |
| partnership           | ProducerContext | ConsumerContext                  | Bidirectional collaboration on shared model      |
| shared-kernel         | SharedKernel    | ProducerContext, ConsumerContext | Shared code/types between BCs                    |
| open-host-service     | ProducerContext | External                         | Producer exposes public integration API          |

#### Published Language defines stable contracts

- **Invariant:** Integration events must use registered schemas with explicit versioning and compatibility modes. Unregistered event types and invalid payloads are rejected.

- **Rationale:** Ad-hoc event formats create tight coupling and break consumers on change. Versioned schemas with compatibility contracts enable safe evolution.

#### ACL translates external models

- **Invariant:** External system data must pass through ACL translation with schema validation before entering the domain. Unmapped values and invalid inputs are rejected.

- **Rationale:** Direct use of external models leaks foreign concepts into the domain, creating coupling and making the domain vocabulary impure. ACL enforces boundaries.

_[integration-patterns-21a.feature](libar-platform/delivery-process/specs/platform/integration-patterns-21a.feature)_

### IntegrationPatterns21b

_Schema evolution breaks consumers._

#### Schema versioning enables evolution

Old consumers continue working when schemas evolve through upcasting and downcasting.

    **Version Migration (Upcasting):**


    **Chain Migration:**

#### Contract tests validate integration

Producer and consumer contracts are tested independently.

_[integration-patterns-21b.feature](libar-platform/delivery-process/specs/platform/integration-patterns-21b.feature)_

---

## Platform / Phase 22

### AgentAsBoundedContext

_AI agents are invoked manually without integration into the_

#### Agent subscribes to relevant event streams

EventBus delivers events to agent BC like any other subscriber.

    **Subscription API:**

#### Agent detects patterns across events

Pattern window groups events for analysis (LLM or rule-based).

    **Pattern Detection API:**

#### Agent emits commands with explainability

Commands include reasoning and suggested action.

    **Command Emission API:**


    **LLM Fault Isolation (Optional Enhancement):**
    For production deployments, wrap LLM calls with Phase 18's circuit breaker:

    This triggers fallback to rule-based analysis when LLM is unavailable,
    preventing cascade failures during LLM provider outages.

#### Human-in-loop controls automatic execution

High-confidence actions can auto-execute; low-confidence require approval.

    **Human-in-Loop Configuration:**


    **Approval Timeout Implementation (Workflow sleepUntil):**
    Race approval event vs timeout using workflow primitives:

    Using workflow `sleepUntil()` racing with `awaitEvent()` is simpler than
    scheduler-based timeouts because workflow state is inherently durable.

#### All agent decisions are audited

Audit trail captures pattern detection, reasoning, and outcomes.

    **Audit Event Structure:**

_[agent-as-bounded-context.feature](libar-platform/delivery-process/specs/platform/agent-as-bounded-context.feature)_

---
