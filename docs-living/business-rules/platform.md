# Platform Business Rules

**Purpose:** Business rules for the Platform product area

---

**141 rules** from 30 features. 50 rules have explicit invariants.

---

## Phase 2

### Event Store Foundation

_Event Sourcing requires centralized storage for domain events with_

---

#### Events are immutable once appended

Once an event is appended to a stream, it cannot be modified or deleted.

---

#### Streams provide per-entity ordering via version numbers

Each stream represents a single entity (aggregate) and maintains its own
version sequence starting at 1.

---

#### globalPosition enables total ordering across all streams

While version provides per-stream ordering, globalPosition provides a
monotonically increasing counter across ALL events from ALL streams.

---

#### OCC prevents concurrent modification conflicts

When appending events, callers must provide an expectedVersion: - If expectedVersion matches the stream's currentVersion, append succeeds - If expectedVersion mismatches, append returns a conflict result - For new streams, expectedVersion = 0

    This enables safe concurrent access without locks while ensuring
    business invariants are validated against consistent state.

**Verified by:**

- Successful append with matching version
- Conflict on version mismatch

---

#### Checkpoints enable projection resumption with exactly-once semantics

Projections track their lastProcessedPosition (a globalPosition value).

**Verified by:**

- Projection resumes from checkpoint

_event-store-foundation.feature_

---

## Phase 3

### Command Bus Foundation

_Command execution requires idempotency (same command = same result),_

---

#### Commands are idempotent via commandId deduplication

Every command has a unique commandId.

**Verified by:**

- First command execution is recorded
- Duplicate command returns cached result

---

#### Status tracks the complete command lifecycle

Commands progress through well-defined states: - **pending**: Command received, execution in progress - **executed**: Command succeeded, event(s) emitted - **rejected**: Business rule violation, no event emitted - **failed**: Unexpected error during execution

    The status is updated atomically with the command result, ensuring
    consistent state even under concurrent access.

**Verified by:**

- Successful command transitions to executed
- Business rejection transitions to rejected
- Unexpected error transitions to failed

---

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

---

#### correlationId links commands, events, and projections

Every command carries a correlationId that flows through the entire
execution path: - Command -> Handler -> Event metadata -> Projection processing - Enables tracing a user action through all system components - Supports debugging and audit trail reconstruction

    The commandEventCorrelations table tracks which events were produced
    by each command, enabling forward (command -> events) lookups.

---

#### Middleware provides composable cross-cutting concerns

The CommandOrchestrator supports a middleware pipeline that wraps
command execution with before/after hooks:

    - **Validation middleware**: Schema validation before handler
    - **Authorization middleware**: Permission checks
    - **Logging middleware**: Structured command logging
    - **Rate limiting**: Throttling by user/context

    Middleware executes in registration order, with early exit on failure.

_command-bus-foundation.feature_

---

## Phase 6

### Saga Orchestration

_Cross-BC operations (e.g., Order -> Inventory -> Shipping) cannot_

---

#### Sagas orchestrate operations across multiple bounded contexts

When a business process spans multiple bounded contexts (e.g., Orders,
Inventory, Shipping), a Saga coordinates the steps:

    1.

**Verified by:**

- Successful cross-context coordination
- Compensation on step failure

---

#### @convex-dev/workflow provides durability across server restarts

Sagas use Convex Workflow for durable execution: - Workflow state is persisted automatically - Server restarts resume from the last completed step - External events (awaitEvent) allow pausing for external input

    This durability is critical for long-running processes that may span
    minutes or hours (e.g., waiting for payment confirmation).

---

#### Compensation reverses partial operations on failure

If step N fails after steps 1..N-1 succeeded, compensation logic
must undo the effects of the completed steps:

    Compensation runs in reverse order of the original steps.

| Step              | Success Action   | Compensation        |
| ----------------- | ---------------- | ------------------- |
| Reserve inventory | Stock reserved   | Release reservation |
| Charge payment    | Payment captured | Refund payment      |
| Update order      | Order confirmed  | Cancel order        |

---

#### Saga idempotency prevents duplicate workflows via sagaId

Each saga has a unique sagaId (typically the entity ID triggering it).

**Verified by:**

- First trigger starts saga
- Duplicate trigger returns existing saga

---

#### Saga status is updated via onComplete callback, not inside workflow

The workflow's onComplete handler updates the saga's status in the
sagas table.

_saga-orchestration.feature_

---

## Phase 11

### Bounded Context Foundation

_DDD Bounded Contexts need clear boundaries with physical enforcement,_

---

#### Components have isolated databases that parent cannot query directly

Each Convex component (bounded context) has its own isolated database.

**Verified by:**

- Direct table query fails across component boundary
- Component API access succeeds

---

#### Sub-transactions are atomic within components

When a component handler is called, all writes within that handler
commit atomically.

---

#### ctx.auth does not cross component boundaries

Authentication context (ctx.auth) is NOT passed to component handlers.

**Verified by:**

- User ID passed explicitly to component

---

#### Id<"table"> inside component becomes string at API boundary

Convex typed IDs (Id<"table">) are scoped to their database.

**Verified by:**

- ID conversion at boundary

---

#### DualWriteContextContract formalizes the bounded context API

Each bounded context should define a contract that specifies: - **identity**: Name, description, version, streamTypePrefix - **executionMode**: "dual-write" for CMS + Event pattern - **commandTypes**: List of commands the context handles - **eventTypes**: List of events the context produces - **cmsTypes**: CMS tables with schema versions - **errorCodes**: Domain errors that can be returned

    This contract serves as documentation and enables type-safe integration.

**Verified by:**

- Contract provides type safety for commands

_bounded-context-foundation.feature_

---

## Phase 13

### Package Architecture

_The original @convex-es/core package grew to 25+ modules, creating issues:_

---

#### Layer 0 packages have no framework dependencies

**Verified by:**

- platform-fsm has no dependencies
- platform-decider depends only on platform-fsm

---

#### Consumers can install individual packages

**Verified by:**

- Decider package is independently usable
- Packages are independently publishable

---

#### Tests ship with framework packages

**Verified by:**

- Framework tests live in framework packages

---

#### Backward compatibility is maintained

**Verified by:**

- Existing imports continue to work

---

#### No naming conflicts with libar-ai project

**Verified by:**

- Platform namespace avoids conflicts

_package-architecture.feature_

---

## Phase 14

### Decider Pattern

_Domain logic embedded in handlers makes testing require infrastructure._

---

#### Deciders must be pure functions

Pure functions have no I/O, no ctx access, no side effects.

---

#### DeciderOutput encodes three outcomes

- **Success:** Command executed, event emitted, state updated
  - **Rejected:** Business rule violation, no event, clear error code
  - **Failed:** Unexpected failure, audit event, context preserved

  **Executable tests:** platform-decider/tests/features/behavior/decider-outputs.feature
  - Scenarios covering success, rejected, failed outputs
  - Type guard tests (isSuccess, isRejected, isFailed)
  - Edge cases for mutually exclusive outcomes

---

#### FSM enforces valid state transitions

State machines prevent invalid transitions at runtime with clear errors.

---

#### Evolve functions use event payload as source of truth

Evolve must not recalculate values - events are immutable source of truth.

---

#### Handler factories wrap deciders with infrastructure

- `createDeciderHandler()` for modifications (loads existing state)
  - `createEntityDeciderHandler()` for creation (handles null state)

_decider-pattern.feature_

---

## Phase 15

### Projection Categories

_Projections exist but categories are implicit._

---

#### Projections are classified into four distinct categories

> **Invariant:** Every projection must belong to exactly one of four categories: Logic, View, Reporting, or Integration. Categories are mutually exclusive.
>
> **Rationale:** Without explicit categories, developers must guess which projection to use for which purpose, leading to misuse (e.g., using Logic projections for UI) and performance issues (e.g., subscribing to Reporting projections reactively).

| Category    | Purpose                             | Query Pattern  | Example                |
| ----------- | ----------------------------------- | -------------- | ---------------------- |
| Logic       | Minimal data for command validation | Internal only  | orderExists(id)        |
| View        | Denormalized for UI queries         | Client queries | orderSummaries         |
| Reporting   | Analytics and aggregations          | Async/batch    | dailySalesReport       |
| Integration | Cross-context synchronization       | EventBus       | orderStatusForShipping |

**Verified by:**

- Projection definition includes category
- Invalid category is rejected

---

#### Categories determine projection characteristics

> **Invariant:** Each category prescribes specific characteristics for cardinality, freshness requirements, and client exposure. These are not suggestions but enforced at registration time.
>
> **Rationale:** Consistent characteristics per category enable infrastructure optimizations (e.g., reactive subscriptions only for View) and security enforcement (e.g., Logic projections never exposed to clients).

| Category    | Cardinality      | Freshness      | Client Exposed |
| ----------- | ---------------- | -------------- | -------------- |
| Logic       | Minimal fields   | Always current | No             |
| View        | Denormalized     | Near real-time | Yes            |
| Reporting   | Aggregated       | Eventual       | Admin only     |
| Integration | Contract-defined | Event-driven   | No (EventBus)  |

**Verified by:**

- Category determines client exposure
- Logic projections have minimal fields

---

#### Projections must declare explicit category

> **Invariant:** Category must be specified at projection definition time. Projections without explicit category fail registration with CATEGORY_REQUIRED.
>
> **Rationale:** Implicit categories (guessed from naming or usage) lead to inconsistent behavior. Explicit declaration forces developers to think about the projection's purpose and enables compile-time validation.

**Verified by:**

- Projection without category fails registration
- Type system enforces category at compile time

---

#### Category determines client exposure

> **Invariant:** Client exposure is determined solely by category. Logic and Integration projections are never client-accessible. View projections are always client-accessible. Reporting projections require admin role.
>
> **Rationale:** Security and performance concerns require clear boundaries. Logic projections contain internal validation state that shouldn't leak. Integration projections are for cross-BC communication, not direct queries.

**Verified by:**

- Logic projections are not client-exposed
- View projections are client-exposed
- Reporting projections have restricted access
- Integration projections use EventBus

---

#### Only View projections require reactive subscriptions

> **Invariant:** Reactive subscriptions (real-time push updates) are only supported for View category projections. Other categories reject subscription attempts with SUBSCRIPTIONS_NOT_SUPPORTED.
>
> **Rationale:** Reactive infrastructure is expensive (WebSocket connections, change detection, client memory). Limiting reactivity to View projections ensures resources are used only where instant UI feedback is needed.

**Verified by:**

- View projections enable reactive subscriptions
- Logic projections do not support subscriptions
- Reporting projections use polling or batch refresh

_projection-categories.feature_

---

## Phase 16

### Dynamic Consistency Boundaries

_Cross-entity invariants within a bounded context currently require_

---

#### DCB defines four core concepts for scope-based coordination

These concepts work together to enable multi-entity invariants within
a bounded context.

| Concept        | Description                                                                                     |
| -------------- | ----------------------------------------------------------------------------------------------- |
| Scope Key      | Unique identifier for consistency boundary (format: tenant:${tenantId}:${scopeType}:${scopeId}) |
| Scope Table    | dcbScopes in Event Store for scope-level version tracking                                       |
| Virtual Stream | Logical composition of events within scope across physical streams                              |
| Scope OCC      | expectedVersion checked on commit to prevent concurrent modifications                           |

**Verified by:**

- Scope key follows tenant-prefixed format
- Invalid scope key format is rejected

---

#### Scope key uniquely identifies consistency boundary with OCC

All entities within a scope are validated together with scope-level OCC.

**Verified by:**

- Scope-level OCC prevents concurrent modifications
- Scope version increments on successful commit
- New scope starts at version 0

---

#### Virtual streams compose events across scope

Virtual streams provide a logical view of all events within a scope,
regardless of which physical stream (entity) they belong to.

**Verified by:**

- Query events across scope
- Virtual stream supports scope-based replay
- Virtual stream excludes events outside scope

---

#### DCB enforces three mandatory constraints

These constraints ensure DCB operates safely within the Convex-Native ES model.

| Constraint       | Reason                                              |
| ---------------- | --------------------------------------------------- |
| Single-BC only   | Cross-BC invariants must use Sagas for compensation |
| Tenant-aware     | Multi-tenant isolation enforced at scope level      |
| Decider required | Pure validation logic via Decider pattern           |

**Verified by:**

- DCB constraint validation
- DCB rejects cross-BC scope
- Scope includes tenant isolation

---

#### Operations must use Decider pattern

DCB builds on pure deciders for validation logic.

**Verified by:**

- DCB execution requires decider
- Decider result determines operation outcome

_dynamic-consistency-boundaries.feature_

---

## Phase 17

### Reactive Projections

_Workpool-based projections have 100-500ms latency._

---

#### Hybrid model combines durability with speed

Workpool handles persistence, reactive layer handles instant feedback.

| Current State                    | Target State                                  |
| -------------------------------- | --------------------------------------------- |
| Workpool only: 100-500ms latency | Hybrid: 10-50ms reactive + durable background |
| Client polls or waits            | Client sees instant optimistic update         |
| No optimistic UI                 | Full optimistic UI with rollback              |

**Verified by:**

- Client receives instant update then durable confirmation
- Optimistic update works during Workpool backlog
- Durable state takes precedence after convergence

---

#### Shared evolve logic runs on client and server

Same evolve() function ensures consistent state transformation.

| Input                                        | Output          |
| -------------------------------------------- | --------------- |
| (state: ProjectionState, event: DomainEvent) | ProjectionState |

**Verified by:**

- Evolve produces identical results on client and server
- Evolve handles unknown event types gracefully
- Multiple events evolve in sequence

---

#### Conflict detection triggers rollback

Optimistic updates are discarded if they conflict with durable state.

| Scenario                    | Detection                                  | Resolution              |
| --------------------------- | ------------------------------------------ | ----------------------- |
| Optimistic ahead of durable | Check globalPosition                       | Merge with durable base |
| Conflicting branch          | Different event IDs at same globalPosition | Discard optimistic      |
| Stale optimistic            | Age exceeds stale threshold (30s default)  | Rollback to durable     |

**Verified by:**

- Conflicting optimistic update is rolled back
- Conflict detection handles network partition
- No conflict when optimistic is ahead of durable
- Rollback triggers UI notification

---

#### Only View projections need reactive layer

Logic, Reporting, and Integration projections use Workpool only.

| Category    | Reactive Eligible | Reason                                |
| ----------- | ----------------- | ------------------------------------- |
| view        | Yes               | Client-facing, needs instant feedback |
| logic       | No                | Internal validation, no UI            |
| reporting   | No                | Analytics, eventual consistency OK    |
| integration | No                | Cross-BC sync via EventBus            |

**Verified by:**

- Category determines reactive eligibility
- Non-view projection rejects reactive subscription
- View projection enables full reactive functionality

---

#### useReactiveProjection merges durable and optimistic state

The hook provides a unified interface for hybrid reactive projections.

| Field           | Type      | Description                         |
| --------------- | --------- | ----------------------------------- |
| state           | T or null | Merged state (durable + optimistic) |
| isOptimistic    | boolean   | True if optimistic events applied   |
| durablePosition | number    | Last processed global position      |
| pendingEvents   | number    | Count of optimistic events          |

**Verified by:**

- Hook returns merged state
- Hook handles missing durable state
- Hook updates reactively on new events
- Hook clears optimistic state after durable catches up

_reactive-projections.feature_

---

## Phase 18

### Admin Tooling Consolidation

_Admin functionality is scattered across the codebase:_

---

#### Admin directory provides unified location for operational endpoints

All cross-cutting admin operations live in `convex/admin/`.

**Verified by:**

- Admin directory is created with correct structure
- Backward compatibility for DLQ imports

---

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

**Verified by:**

- Get dead letter statistics
- Bulk retry pending dead letters

---

#### Event flow trace enables debugging across the command-event-projection chain

When issues occur, operators need to trace: - Which command created an event - Which projections processed the event - Where in the chain a failure occurred

    **Trace Query:**

**Verified by:**

- Trace complete event flow
- Trace shows failure point

---

#### System state snapshot provides full health picture

Operators need a single query to understand overall system state, combining: - Component health (Event Store, projections, Workpools) - Projection lag across all projections - DLQ statistics - Active rebuilds - Circuit breaker states

    **Snapshot Query:**

**Verified by:**

- System state provides complete overview

---

#### Durable function queries enable Workpool and Workflow debugging

When background work fails or stalls, operators need visibility into: - Workpool queue contents and status - Workflow execution history - Action Retrier run status

    **Durable Function Queries:**

**Verified by:**

- Query Workpool item status
- Query Workflow execution with steps
- Query non-existent durable function

---

#### Admin endpoints require authorization

Admin operations are powerful and should be protected.

**Verified by:**

- Unauthenticated request is rejected
- Non-admin user is rejected
- Admin action is logged

_admin-tooling-consolidation.feature_

### Circuit Breaker Pattern

_External API failures (Stripe, SendGrid, webhooks) cascade through the system._

---

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

**Verified by:**

- Circuit remains closed on success
- Circuit opens after threshold failures
- Circuit transitions to half-open after timeout
- Successful probe closes circuit
- Failed probe reopens circuit

---

#### Circuit state persists in Convex table

Convex functions are stateless across invocations.

**Verified by:**

- Circuit state persists across function calls
- Non-existent circuit defaults to closed

---

#### Open-to-half-open transition uses scheduler

The OPEN → HALF_OPEN transition happens after `resetTimeoutMs` elapses.

**Verified by:**

- Timeout transitions open to half-open
- Stale timeout is ignored

---

#### Half-open probes use Action Retrier with zero retries

When circuit enters HALF_OPEN, we need to test if the service recovered.

**Verified by:**

- Half-open probe closes circuit on success
- Half-open probe reopens circuit on failure
- Open circuit returns fast failure

---

#### Each external service has independent circuit configuration

Different services have different failure characteristics.

| Option           | Default | Description                           |
| ---------------- | ------- | ------------------------------------- |
| failureThreshold | 5       | Consecutive failures before opening   |
| resetTimeoutMs   | 30000   | Time in open state before half-open   |
| successThreshold | 1       | Successes in half-open before closing |

**Verified by:**

- Payment circuit opens after 3 failures
- Email circuit tolerates more failures
- Different services have independent circuits

_circuit-breaker-pattern.feature_

### Durable Events Integration

_Phase 18 delivered durability primitives to `platform-core`, but the example app's_

---

#### Events are appended idempotently using command-derived keys

> **Invariant:** For any (commandId, eventType) tuple, at most one event can exist in the event store. Duplicate append attempts return the existing event without modification.
>
> **Rationale:** Commands may be retried due to network partitions, client timeouts, or infrastructure failures. Without idempotency, retries would create duplicate events, corrupting projections and triggering duplicate side effects.

**Verified by:**

- First command creates event normally
- Retry with same commandId returns existing event
- Different commandId is rejected for already-submitted order
- Retry with same commandId returns
  existing event
- Different commandId creates new event

---

#### Commands record intent before execution and completion after success

> **Invariant:** Every command execution must have exactly one matching completion event. An intent without completion after timeout indicates a stuck or crashed command.
>
> **Rationale:** Distributed systems fail in subtle ways - network partitions, process crashes, deadlocks. Intent bracketing creates an audit trail that enables detection of commands that started but never finished, enabling automated recovery or human intervention.

**Verified by:**

- Successful command records intent and completion
- Failed command records intent and failure
- Orphaned intent detected by scheduled job
- Intent already exists for commandId
- Failed command records
  intent and failure

---

#### Critical events use Workpool-backed durable append

> **Invariant:** A durably-enqueued event will eventually be persisted or moved to dead letter. The Workpool guarantees at-least-once execution with automatic retry and backoff.
>
> **Rationale:** Some events are too important to lose - payment confirmations, order submissions that trigger sagas, inventory reservations. These must survive transient failures (network issues, temporary unavailability) and be retried automatically.

| Event                | Why Critical                       |
| -------------------- | ---------------------------------- |
| OrderSubmitted       | Triggers saga, must start workflow |
| PaymentCompleted     | Financial record, must persist     |
| ReservationConfirmed | Inventory commitment               |

**Verified by:**

- Durable append succeeds on first try
- Durable append retries on transient failure
- Exhausted retries create dead letter
- Multiple events for same entity maintain order
- Durable append retries on transient
  failure

---

#### External action results are captured as events using outbox pattern

> **Invariant:** Every external action completion (success or failure) results in exactly one corresponding event. The outbox handler uses idempotent append to prevent duplicate events.
>
> **Rationale:** Actions calling external APIs (Stripe, email services, etc.) are at-most-once by default. If the action succeeds but subsequent processing fails, the side effect is orphaned. The outbox pattern uses the guaranteed `onComplete` callback to capture results as domain events, ensuring audit trail and enabling downstream processing.

**Verified by:**

- Successful payment creates PaymentCompleted event
- Failed payment creates PaymentFailed event
- Duplicate completion is deduplicated
- Failed payment creates
  PaymentFailed event

---

#### Projection handlers quarantine malformed events

> **Invariant:** A malformed event that fails processing N times will be quarantined and excluded from further processing. The projection will continue with remaining events.
>
> **Rationale:** Malformed events (schema violations, missing references, data corruption) should not block all projection processing indefinitely. Quarantining allows the system to continue while preserving the problematic events for investigation and potential replay after code fixes are deployed.

**Verified by:**

- Valid event processed normally
- Malformed event quarantined after max attempts
- Quarantined event can be replayed after fix
- Quarantined event can be ignored
- Malformed event quarantined after max
  attempts

---

#### Projections can be rebuilt from the event stream

> **Invariant:** A projection can be rebuilt from any starting position in the event stream. The rebuilt projection will eventually converge to the same state as if built incrementally.
>
> **Rationale:** Projection data can become corrupted (bugs, schema migrations gone wrong, manual data fixes). The event stream is the source of truth - projections are derived views that can be reconstructed at any time. This is a key benefit of event sourcing.

**Verified by:**

- Rebuild from position 0 re-processes all events
- Rebuild progress is trackable
- Running rebuild can be cancelled
- Concurrent rebuilds are prevented
- Rebuild from specific position
- Rebuild progress is
  trackable

---

#### Scheduled job detects and alerts on orphaned command intents

> **Invariant:** Any intent in "pending" status for longer than timeoutMs will be detected and transitioned to "abandoned" status. Operators are alerted for investigation.
>
> **Rationale:** Network partitions, process crashes, and deadlocks can leave commands in an incomplete state. Automated detection ensures these don't go unnoticed, enabling timely investigation and potential data recovery.

**Verified by:**

- Orphan detected after threshold exceeded
- Recent pending intent not flagged
- Completed intents are ignored
- Orphan detection reports metrics
- Recent pending intent not
  flagged

---

#### End-to-end durability is verified via integration tests

> **Invariant:** Integration tests must exercise the complete durability stack in a real Convex environment with actual database operations, Workpool execution, and event store.
>
> **Rationale:** Unit tests with mocks cannot verify the integration of multiple durability patterns working together. Integration tests ensure the patterns compose correctly and handle real-world scenarios like OCC conflicts and concurrent operations.

**Verified by:**

- Full durable command flow
- Command retry produces same result
- Projection rebuild restores correct state

_durable-events-integration.feature_

### Durable Function Adapters

_Platform has well-defined interfaces (RateLimitChecker, DCB conflict handling) but uses_

---

#### Rate limit adapter bridges middleware to component

> **Invariant:** Rate limiting decisions must persist across server restarts and scale horizontally via sharding—no in-memory implementations in production.
>
> **Rationale:** In-memory rate limiters lose state on cold starts and cannot enforce consistent limits across multiple server instances. The `@convex-dev/rate-limiter` component provides persistence, sharding, and correct token bucket/fixed window semantics without middleware pipeline changes.

| Expected QPS | Recommended Shards |
| ------------ | ------------------ |
| < 50         | None (default)     |
| 50-200       | 5-10               |
| 200-1000     | 10-50              |
| > 1000       | 50+                |

**Verified by:**

- Adapter allows request within rate limit
- Adapter rejects request exceeding rate limit
- Adapter isolates limits by key
- Adapter integrates with existing middleware pipeline
- Adapter rejects request
  exceeding rate limit
- Adapter integrates with
  existing middleware pipeline

  The adapter implements the existing `RateLimitChecker` interface

- allowing the current
  middleware pipeline to use `@convex-dev/rate-limiter` without any changes to middleware code.

**Implementation:** `@libar-dev/platform-core/src/middleware/rateLimitAdapter.ts`

---

#### DCB retry helper automatically handles OCC conflicts

> **Invariant:** OCC conflicts from DCB operations must be retried automatically with exponential backoff and scope-based serialization—callers must not implement retry logic.
>
> **Rationale:** Manual retry leads to inconsistent patterns, missing jitter (thundering herd), and no partition ordering (OCC storms). Workpool provides durable retry with partition keys that serialize retries per scope, preventing concurrent attempts.

**Verified by:**

- DCB succeeds on first attempt
- DCB conflict triggers automatic retry
- Max retries exceeded returns rejected
- Backoff increases exponentially with jitter
- Partition key ensures scope serialization
- DCB retry with onComplete callback
- Version advances between retry scheduling and execution
- Version advances between retry scheduling and execution

  The `withDCBRetry` helper wraps `executeWithDCB` and uses Workpool to automatically
  retry on OCC conflicts with exponential backoff and jitter.

**Implementation:** `@libar-dev/platform-core/src/dcb/withRetry.ts`

---

#### Adapters integrate with existing platform infrastructure

> **Invariant:** Adapters must plug into existing platform interfaces without requiring changes to middleware pipeline, command configs, or core orchestration logic.
>
> **Rationale:** The platform already has well-defined interfaces (RateLimitChecker, DCB execution flow). Adapters bridge these to Convex durable components without disrupting working code—minimizing risk and maximizing adoption.

**Verified by:**

- Rate limiter mounts as Convex component
- DCB retry pool mounts as separate Workpool
- Middleware pipeline order preserved
- DCB retry pool mounts as
  separate Workpool
- Middleware pipeline order preserved

  Both adapters plug into existing platform code without requiring changes to
  core interfaces or middleware pipeline structure.

**Implementation:** `examples/order-management/convex/rateLimits.ts`

_durable-function-adapters.feature_

### Event Replay Infrastructure

_When projections become corrupted, require schema migration, or drift from_

---

#### Replay must resume from last successful checkpoint

> **Invariant:** A replay operation must never reprocess events that have already been successfully applied to the projection—resume from last checkpoint, not from scratch.
>
> **Rationale:** Replaying millions of events wastes compute, risks projection corruption if handlers aren't idempotent, and extends recovery time. Checkpoints enable reliable long-running rebuilds that survive transient failures.

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

**Verified by:**

- Replay resumes after failure
- Checkpoint updates atomically with chunk completion
- Replay handles empty event range
- Checkpoint updates atomically with
  chunk completion
- Replay handles empty event range

  Replay state is persisted in the `replayCheckpoints` table. If a replay fails or is
  interrupted

- it resumes from the last successfully processed globalPosition
- not
  from the beginning. This saves compute and enables reliable long-running rebuilds.

**Implementation:** `@libar-dev/platform-core/src/projections/replay/types.ts`

---

#### Replay uses dedicated low-priority Workpool

> **Invariant:** Replay operations must not starve live projection updates—dedicated low-priority pool with maxParallelism ≤ 50% of projectionPool.
>
> **Rationale:** Live user-facing projections must maintain low latency. Replay is background recovery work that can tolerate higher latency. Separate Workpool with lower parallelism ensures budget preservation.

| Parameter                             | Value | Rationale                                        |
| ------------------------------------- | ----- | ------------------------------------------------ |
| maxParallelism                        | 5     | Low priority, preserves 50%+ budget for live ops |
| retryActionsByDefault                 | false | Replay mutations, not actions                    |
| defaultRetryBehavior.maxAttempts      | 5     | More retries for background work                 |
| defaultRetryBehavior.initialBackoffMs | 1000  | Longer backoff for batch work                    |
| logLevel                              | INFO  | Production observability                         |

**Verified by:**

- Replay does not starve live projections
- Only one replay per projection
- Different projections can rebuild concurrently
- Only one replay per
  projection
- Different projections can rebuild concurrently

  Event replay is background work that should not compete with live projection updates.
  A dedicated `eventReplayPool` with low parallelism (5) ensures:
  - Live projections maintain priority (projectionPool: 10)
  - Replay doesn't exhaust the action/mutation budget
  - Backpressure is controlled via Workpool queue depth

**Implementation:** `examples/order-management/convex/infrastructure.ts`

---

#### Events are processed in configurable chunks

> **Invariant:** Each replay chunk must complete within Convex mutation timeout limits (10s)—chunk size must be configurable based on projection complexity.
>
> **Rationale:** Large event stores have millions of events. Processing all in one mutation would timeout. Chunked processing with complexity-aware sizing ensures reliable completion: simple projections use 100, complex ones use 10-25.

| Projection Complexity           | Chunk Size | Rationale                        |
| ------------------------------- | ---------- | -------------------------------- |
| Simple (single table update)    | 100        | Fast processing, high throughput |
| Medium (multiple tables)        | 50         | More writes per event            |
| Complex (cross-context joins)   | 25         | Avoid timeout, more I/O          |
| Very complex (external lookups) | 10         | Maximum safety margin            |

**Verified by:**

- Chunk processes correct number of events
- Final chunk handles remainder
- Chunk size respects projection complexity
- Final chunk handles
  remainder
- Chunk size respects projection complexity

  Processing all events in a single mutation would timeout for large event stores.
  Chunked processing:
  - Fetches N events per chunk (default: 100)
  - Applies projection logic to each event
  - Updates checkpoint atomically
  - Schedules next chunk if more events exist

**Implementation:** `processReplayChunk`

---

#### Replay progress is queryable in real-time

> **Invariant:** Operations teams must be able to query replay progress at any time— status, percentage complete, and estimated remaining time.
>
> **Rationale:** Long-running rebuilds (hours for large projections) need visibility. Without progress tracking, operators cannot estimate completion, detect stuck replays, or plan maintenance windows.

**Verified by:**

- Query replay progress
- List all active rebuilds
- Progress handles completed replay
- Progress handles
  completed replay

  Operations teams need visibility into long-running rebuilds. Progress queries provide:
  - Current status (running

- paused
- completed
- failed
- cancelled)
  - Events processed vs total (with percentage)
  - Estimated time remaining (based on throughput)
  - Error details if failed

**Implementation:** `@libar-dev/platform-core/src/projections/replay/progress.ts`

---

#### Admin mutations enable operational control

> **Invariant:** Replay operations must only be triggerable via internal mutations— no public API exposure for admin operations.
>
> **Rationale:** Replay can be expensive (compute, time) and disruptive if misused. Internal mutations ensure only authorized code paths can trigger rebuilds, preventing accidental or malicious replay triggering.

| Operation       | Mutation/Query     | Purpose                         |
| --------------- | ------------------ | ------------------------------- |
| Trigger rebuild | triggerRebuild     | Start new rebuild from position |
| Cancel rebuild  | cancelRebuild      | Stop in-progress rebuild        |
| Get status      | getRebuildStatus   | Query single rebuild progress   |
| List active     | listActiveRebuilds | Query all running rebuilds      |
| Pause rebuild   | pauseRebuild       | Temporarily pause (future)      |
| Resume rebuild  | resumeRebuild      | Resume paused rebuild (future)  |

**Verified by:**

- Trigger rebuild creates checkpoint and schedules first chunk
- Cancel rebuild stops processing
- Cannot trigger duplicate rebuild
- Cannot trigger duplicate rebuild

  Operations teams need to trigger

- monitor
- cancel
- and manage rebuilds.
  All admin operations use internal mutations for security.

**Implementation:** `examples/order-management/convex/admin/projections.ts`

_event-replay-infrastructure.feature_

### Event Store Durability

_The dual-write pattern (CMS + Event) works when both operations are in the_

---

#### Action results are captured as events via onComplete mutation

> **Invariant:** Every external API result (success or failure) must be captured as a domain event within the bounded context's event stream.
>
> **Rationale:** Actions are at-most-once by default. If an action succeeds but the subsequent event append fails, the side effect is orphaned. The outbox pattern uses `onComplete` callbacks which are guaranteed to be called after the action finishes.

**Verified by:**

- External API success is captured as event
- External API failure is captured as event
- onComplete mutation failure is retried
- Idempotent append prevents duplicate events

**Implementation:** `@libar-dev/platform-core/src/durability/outbox.ts`

---

#### Event append is idempotent using idempotency keys

> **Invariant:** Each logical event is stored exactly once in the event store, regardless of how many times the append operation is retried.
>
> **Rationale:** Retries (Workpool, manual, saga compensation) can cause duplicate append attempts. Without idempotency keys, the same business event could be stored multiple times, corrupting projections and causing double-processing in downstream systems.

| Event Source   | Idempotency Key Pattern                 | Example                                  |
| -------------- | --------------------------------------- | ---------------------------------------- |
| Command result | `{commandType}:{entityId}:{commandId}`  | `SubmitOrder:ord-123:cmd-456`            |
| Action result  | `{actionType}:{entityId}`               | `payment:ord-123`                        |
| Saga step      | `{sagaType}:{sagaId}:{step}`            | `OrderFulfillment:saga-789:reserveStock` |
| Scheduled job  | `{jobType}:{scheduleId}:{runTimestamp}` | `expireReservations:job-001:1704067200`  |

**Verified by:**

- First append with idempotency key succeeds
- Duplicate append returns existing event
- Different idempotency keys create separate events

**Implementation:** `@libar-dev/platform-core/src/durability/idempotentAppend.ts`

---

#### Cross-context events use Workpool-backed publication with tracking

> **Invariant:** Every cross-context event publication must be tracked, retried on failure, and dead-lettered if undeliverable after maximum attempts.
>
> **Rationale:** Fire-and-forget publication loses events when subscribers fail. For event-driven architectures to be reliable, cross-context communication must be durable with guaranteed delivery or explicit failure tracking.

**Verified by:**

- Event is delivered to all target contexts
- Failed delivery is retried
- Max retries exceeded creates dead letter
- Publication status is queryable

**Implementation:** `@libar-dev/platform-core/src/durability/publication.ts`

---

#### Long-running operations bracket with intent and completion events

> **Invariant:** Operations that span multiple steps, external calls, or significant time must record an "intent" event at start and "completion" event at end.
>
> **Rationale:** Without bracketing, partially-completed operations are invisible to monitoring, undetectable by reconciliation, and create audit trail gaps. Intent events enable timeout detection and manual intervention for stuck operations.

| Operation          | Intent Event             | Completion Events                                               |
| ------------------ | ------------------------ | --------------------------------------------------------------- |
| Order submission   | OrderSubmissionStarted   | OrderSubmitted, OrderSubmissionFailed, OrderSubmissionAbandoned |
| Payment processing | PaymentProcessingStarted | PaymentCompleted, PaymentFailed                                 |
| Stock reservation  | ReservationRequested     | StockReserved, ReservationFailed                                |

**Verified by:**

- Intent and completion events bracket operation
- Timeout detects incomplete operation
- Idempotent timeout handler
- Reconciliation query finds orphaned intents

**Implementation:** `@libar-dev/platform-core/src/durability/intentCompletion.ts`

---

#### Failed event appends are recovered via Workpool actions

> **Invariant:** Event append failures from async contexts (scheduled jobs, saga steps) are retried with exponential backoff until success or dead letter.
>
> **Rationale:** Workpool only retries actions, not mutations. By wrapping the idempotent append mutation in an action, we get Workpool retry semantics while the underlying idempotent check prevents duplicates.

| Scenario                    | Use durableAppendEvent? | Why                                      |
| --------------------------- | ----------------------- | ---------------------------------------- |
| Synchronous command handler | No                      | Atomic dual-write handles this           |
| Action onComplete           | Recommended             | Mutation can fail after action succeeded |
| Saga step                   | Yes                     | Step result must be captured             |
| Scheduled job               | Yes                     | Job completion must be recorded          |

**Verified by:**

- Append succeeds on first attempt
- Append retried after transient failure
- Exhausted retries create dead letter
- Append retried after failure

**Implementation:** `@libar-dev/platform-core/src/durability/durableAppend.ts`

---

#### Malformed events are quarantined after repeated failures

> **Invariant:** Events that cause projection processing failures are tracked; after N failures, they are quarantined and skipped to prevent infinite retry loops.
>
> **Rationale:** A single malformed event should not block all downstream projections indefinitely. Quarantine allows progress while alerting operators for manual investigation.

| Attempt | Action                                             |
| ------- | -------------------------------------------------- |
| 1       | Process event, catch error, record attempt         |
| 2       | Retry with backoff, catch error, record attempt    |
| 3       | Quarantine event, skip in future processing, alert |

**Verified by:**

- Event quarantined after repeated failures
- Quarantined events skipped in processing
- Recovered event can be reprocessed

**Implementation:** `@libar-dev/platform-core/src/durability/poisonEvent.ts`

---

#### Failed publications are tracked and recoverable

> **Invariant:** When cross-context event delivery fails after all retries, a dead letter record is created. Operations teams can investigate and retry manually or automatically.
>
> **Rationale:** Dead letters provide visibility into integration failures and enable recovery without data loss. Context-specific stats help identify systemic issues (e.g., analytics service down).

| Operation                     | Purpose                                  |
| ----------------------------- | ---------------------------------------- |
| listPublicationDeadLetters    | View failed deliveries by target context |
| retryPublicationDeadLetter    | Re-enqueue delivery via publicationPool  |
| ignorePublicationDeadLetter   | Mark as ignored (e.g., obsolete event)   |
| getPublicationDeadLetterStats | Count by target context and status       |

**Verified by:**

- Dead letter created after max retries
- Admin can retry dead letter
- Dead letter stats show context-specific issues

_event-store-durability.feature_

### Health Observability

_No Kubernetes integration (readiness/liveness probes), no metrics for_

---

#### Health endpoints support Kubernetes probes

Kubernetes requires HTTP endpoints for orchestration: - **Readiness probe** (`/health/ready`) - Is the service ready to receive traffic? - **Liveness probe** (`/health/live`) - Is the process alive and responsive?

    **Endpoint Specifications:**

    **Implementation via httpAction:**

| Endpoint      | HTTP Method | Success | Failure                 | Checks                                   |
| ------------- | ----------- | ------- | ----------------------- | ---------------------------------------- |
| /health/ready | GET         | 200 OK  | 503 Service Unavailable | Event Store, projections, Workpool depth |
| /health/live  | GET         | 200 OK  | (always 200)            | Process responsive                       |

**Verified by:**

- Readiness probe returns healthy when all components OK
- Readiness probe returns unhealthy on projection lag
- Liveness probe always returns alive

---

#### Workpool queue depth signals backpressure

When Workpool queue depth exceeds threshold, the system is under stress.

**Verified by:**

- Workpool backlog fails readiness
- Normal queue depth passes readiness

---

#### Projection lag tracks distance from Event Store head

Projection lag = (Event Store max globalPosition) - (Projection checkpoint position)

    Lag indicates how far behind projections are from the source of truth.

| Threshold | Status   | Action                         |
| --------- | -------- | ------------------------------ |
| 0-10      | healthy  | Normal operation               |
| 11-100    | warning  | Monitor, may indicate burst    |
| 101-1000  | degraded | Investigate, consider scaling  |
| 1000+     | critical | Alert, projection may be stuck |

**Verified by:**

- Projection lag is calculated correctly
- Missing checkpoint treated as maximum lag
- Zero lag is healthy

---

#### Metrics are collected as structured JSON for Log Streams export

Convex doesn't support OpenTelemetry SDK directly.

| Metric                | Labels               | Unit         | Purpose                      |
| --------------------- | -------------------- | ------------ | ---------------------------- |
| projection.lag_events | projection_name      | count        | Projection processing delay  |
| events.throughput     | stream_type          | events/min   | Event Store write rate       |
| command.latency_ms    | command_type, status | milliseconds | Command processing time      |
| dlq.size              | projection_name      | count        | Failed events awaiting retry |
| workpool.queue_depth  | pool_name            | count        | Pending items                |

**Verified by:**

- Metrics collection gathers all dimensions
- Metrics emitted as JSON for Log Streams
- Metrics collection handles empty state

---

#### System health aggregates component statuses

Overall system health is derived from individual component health.

| Component State | System Impact                      |
| --------------- | ---------------------------------- |
| All healthy     | System healthy (200)               |
| Any degraded    | System degraded (200 with warning) |
| Any unhealthy   | System unhealthy (503)             |

**Verified by:**

- All components healthy yields healthy system
- Single unhealthy component makes system unhealthy
- Degraded component yields degraded system

_health-observability.feature_

### Production Hardening

_Structured logging (Phase 13) exists but no metrics collection, distributed tracing,_

---

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

**Verified by:**

- Projection lag is tracked
- Metrics collection handles missing checkpoints

---

#### Distributed tracing visualizes event flow

Trace context propagates from command through events to projections using correlation IDs.

**Verified by:**

- Trace spans command-to-projection flow
- Missing trace context uses default

---

#### Health endpoints support Kubernetes probes

/health/ready for readiness (dependencies OK), /health/live for liveness (process running).

| Endpoint      | Purpose         | Checks                                   | Response      |
| ------------- | --------------- | ---------------------------------------- | ------------- |
| /health/ready | Readiness probe | Event store, projections, workpool depth | 200 OK or 503 |
| /health/live  | Liveness probe  | Process alive                            | 200 OK always |

**Verified by:**

- Readiness probe checks dependencies
- Unhealthy dependency fails readiness
- Liveness probe always succeeds
- Workpool backlog fails readiness

---

#### Circuit breakers prevent cascade failures

Open circuit after threshold failures, half-open for recovery testing.

| State     | Behavior                         | Transition                             |
| --------- | -------------------------------- | -------------------------------------- |
| CLOSED    | Normal operation, track failures | → OPEN after threshold failures        |
| OPEN      | Fail fast, no requests           | → HALF_OPEN after timeout              |
| HALF_OPEN | Allow one test request           | → CLOSED on success, → OPEN on failure |

**Verified by:**

- Circuit opens after repeated failures
- Circuit transitions to half-open after timeout
- Successful half-open request closes circuit
- Failed half-open request reopens circuit

---

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

**Verified by:**

- Projection rebuild re-processes events
- Dead letter retry re-enqueues event
- Event flow trace returns full history
- Durable function run diagnostics

---

#### Durable functions provide reliable execution patterns

Production systems use @convex-dev durable function components for reliability.

| Component      | Use Case              | Key Feature                      | Platform Integration Point      |
| -------------- | --------------------- | -------------------------------- | ------------------------------- |
| Action Retrier | External API calls    | Exponential backoff + onComplete | Circuit breaker half-open probe |
| Workpool       | Projection processing | Parallelism + partition ordering | DLQ processing                  |
| Workflow       | Multi-step sagas      | Compensation + awaitEvent        | Cross-BC coordination           |

**Verified by:**

- Circuit breaker uses action retrier for half-open probe
- Failed half-open probe reopens circuit via action retrier
- Dead letter retry uses action retrier for external calls
- Failed DLQ retry returns to pending status
- Durable function calls propagate trace context

_production-hardening.feature_

### Workpool Partitioning Strategy

_ADR-018 defines critical partition key strategies for preventing OCC conflicts_

---

#### Per-entity projections use streamId as partition key

> **Invariant:** Events for the same entity must process in the exact order they occurred in the Event Store—no out-of-order processing per entity.
>
> **Rationale:** Out-of-order event processing causes projection corruption. An ItemRemoved event processed before ItemAdded results in invalid state. Using `streamId` as partition key serializes per-entity while allowing cross-entity parallelism for throughput.

| Projection Type               | Partition Key | Parallelism | Rationale                        |
| ----------------------------- | ------------- | ----------- | -------------------------------- |
| Per-entity (orderSummary)     | streamId      | High (10+)  | Events for same entity serialize |
| Per-item (orderItems)         | orderId       | High (10+)  | Items for same order serialize   |
| Entity lookup (productLookup) | productId     | High (10+)  | Single entity consistency        |

**Verified by:**

- Entity projection processes events in order
- Different entities process in parallel
- Entity partition key helper generates correct format
- Different entities
  process in parallel
- Entity partition key helper generates correct format

  Entity-scoped projections (orderSummary

- productCatalog
- etc.) must process events
  in the order they occurred for each entity. Using `streamId` as the partition key
  ensures all events for entity X are processed sequentially
- even if events for
  entity Y process in parallel.

**Implementation:** `@libar-dev/platform-core/src/workpool/partitioning/helpers.ts`

---

#### Customer-scoped projections use customerId as partition key

> **Invariant:** All events affecting a customer's aggregate view must process in FIFO order for that customer—regardless of which entity generated the event.
>
> **Rationale:** Customer-scoped projections (order history, metrics, preferences) combine data from multiple entities. Processing order-123's event before order-122's event corrupts chronological customer views. Customer partition serializes all customer-affecting events.

| Projection Type      | Partition Key | Parallelism | Rationale                   |
| -------------------- | ------------- | ----------- | --------------------------- |
| Customer history     | customerId    | Medium (5)  | Customer-scoped consistency |
| Customer metrics     | customerId    | Medium (5)  | Aggregate per customer      |
| Customer preferences | customerId    | Medium (5)  | Single customer state       |

**Verified by:**

- Customer projection aggregates across orders
- Customer partition key helper validates required field
- Customer partition
  key helper validates required field

  Some projections aggregate data per customer (customerOrderHistory

- customerMetrics).
  These need all events for a customer to process in order
- regardless of which
  specific entity (order
- product) the event affects.

**Implementation:** `@libar-dev/platform-core/src/workpool/partitioning/helpers.ts`

---

#### Global rollup projections use single partition key or maxParallelism 1

> **Invariant:** Global aggregate projections must serialize all updates—no concurrent writes to the same aggregate document.
>
> **Rationale:** Global rollups (daily sales, inventory totals) write to a single document. Concurrent workers cause read-modify-write races: Worker A reads 100, Worker B reads 100, both write—one update is lost. Single partition key or maxParallelism:1 guarantees sequential processing.

| Projection Type    | Strategy          | Rationale                     |
| ------------------ | ----------------- | ----------------------------- |
| Daily sales rollup | key: "global"     | Single aggregate document     |
| Global metrics     | maxParallelism: 1 | Dedicated low-throughput pool |
| Inventory totals   | key: "global"     | Cross-product aggregation     |

**Verified by:**

- Global rollup processes sequentially
- Global rollup avoids OCC conflicts
- Dedicated Workpool alternative
- Global rollup avoids OCC
  conflicts
- Dedicated Workpool alternative

  Aggregate projections that summarize across all entities (dailySalesSummary

- globalInventoryLevels) have a single write target. Concurrent updates cause
  OCC conflicts. Solutions:
  1.

**Implementation:** `GLOBAL_PARTITION_KEY`

---

#### Cross-context projections use correlationId or sagaId as partition key

> **Invariant:** Events within a saga/workflow must process in causal order across all bounded contexts—saga step N+1 must not process before step N.
>
> **Rationale:** Cross-context projections join data from multiple BCs coordinated by a saga. Processing OrderConfirmed before StockReserved shows "confirmed" status with missing reservation data. Saga partition key ensures causal ordering.

| Projection Type    | Partition Key | Parallelism | Rationale                   |
| ------------------ | ------------- | ----------- | --------------------------- |
| Cross-context join | correlationId | Medium (5)  | Saga-scoped consistency     |
| Integration view   | sagaId        | Medium (5)  | Workflow-scoped consistency |
| Event chain view   | correlationId | Medium (5)  | Causal ordering             |

**Verified by:**

- Cross-context projection maintains saga ordering
- Different sagas process in parallel
- Different sagas
  process in parallel

  Cross-context projections (orderWithInventory) combine data from multiple BCs.
  These need all events within a saga/workflow to process in order to maintain
  consistency across the joined view.

**Implementation:** `@libar-dev/platform-core/src/workpool/partitioning/helpers.ts`

---

#### Partition key selection follows decision tree

> **Invariant:** Every projection config must have an explicit `getPartitionKey` function—implicit or missing partition keys are rejected at validation time.
>
> **Rationale:** Wrong partition keys cause subtle bugs: too fine-grained wastes throughput, too coarse-grained causes out-of-order processing, missing keys serialize everything. Mandatory explicit selection forces intentional design.

**Verified by:**

- Missing partition key fails validation
- Invalid partition key shape fails validation
- Decision tree guides correct partition choice
- Invalid partition key
  shape fails validation
- Decision tree guides correct partition choice

  ## Choosing the wrong partition key causes either:

**Implementation:** `@libar-dev/platform-core/src/orchestration/validation.ts`

---

#### DCB retry partition keys align with scope keys for coherent retry

> **Invariant:** DCB retry partition keys must derive from scope keys so retries serialize with new operations on the same scope—no interleaving.
>
> **Rationale:** Misaligned partition keys allow retry attempt 2 for scope X to interleave with new operation for scope X, causing the retry to read stale state. Aligned keys guarantee sequential processing of all scope-affecting work.

| DCB Scope                | DCB Scope Key                   | Projection Partition Key   |
| ------------------------ | ------------------------------- | -------------------------- |
| Single entity            | `tenant:T:entity:Order:ord-123` | `Order:ord-123` (streamId) |
| Multi-entity reservation | `tenant:T:reservation:res-456`  | `res-456` (reservationId)  |
| Customer operation       | `tenant:T:customer:cust-789`    | `cust-789` (customerId)    |

**Verified by:**

- DCB retry partition aligns with scope
- Aligned partition prevents interleaving
- Aligned partition prevents
  interleaving

  When using `withDCBRetry` (Phase 18a)

- the DCB scope key and projection partition
  key should align to ensure retries don't interleave with new events for the same
  scope.

**Implementation:** `withDCBRetry`

_workpool-partitioning-strategy.feature_

---

## Phase 19

### Bdd Testing Infrastructure

_Domain logic tests require infrastructure (Docker, database)._

---

#### All domain logic tests must be Gherkin

Deciders, FSM, invariants use Given/When/Then format exclusively.

**Verified by:**

- Decider test follows BDD pattern

---

#### Deciders enable perfect test isolation

Pure functions = no mocking, no ctx, no database.

**Verified by:**

- Decider test requires no infrastructure

---

#### Step definitions must be organized to prevent conflicts

Separate step files per domain area, namespaced patterns.

**Verified by:**

- Step definitions are domain-scoped
- Duplicate step patterns cause conflict error

---

#### Integration tests use action-focused steps

Command lifecycle tests validate full flow with assertions.

**Verified by:**

- Integration test validates command lifecycle

---

#### Platform packages must have feature coverage

libar-dev/platform-\* packages need BDD tests for public APIs.

**Verified by:**

- Platform package has feature tests

_bdd-testing-infrastructure.feature_

---

## Phase 20

### Deterministic Id Hashing

_TTL-based reservations work well for multi-step flows (registration wizards),_

---

#### Stream ID is deterministic from business key

Same business key always produces the same stream ID.

    **API:**

**Verified by:**

- Same email produces same stream ID
- Composite key produces consistent hash
- Different emails produce different stream IDs

---

#### OCC prevents duplicate creation

First writer wins; second gets conflict error.

    **Conflict Handling:**

**Verified by:**

- First create succeeds
- Second create fails with conflict
- Concurrent creates - exactly one succeeds

---

#### Hash algorithm is collision-resistant

Hash should be cryptographically strong to prevent collisions.

    **Hash Requirements:**
    - Deterministic: same input always produces same output
    - Collision-resistant: different inputs produce different outputs
    - URL-safe: can be used in stream IDs without encoding

**Verified by:**

- Hash output is URL-safe
- Hash is not reversible

---

#### Pattern complements Reservation Pattern

Choose based on use case; both are valid uniqueness strategies.

    **Decision Tree:**

**Verified by:**

- Pattern selection by use case

_deterministic-id-hashing.feature_

### Ecst Fat Events

_Thin events require consumers to query back to the source BC,_

---

#### Fat events enable service independence

Consumers don't need to query source BC for context.

    **Current State (thin event - requires back-query):**


    **Target State (fat event - self-contained):**

**Verified by:**

- Consumer processes event without back-query

---

#### Builder utilities handle schema versioning

Fat events include schema version for upcasting support.

**Verified by:**

- Fat event includes schema version

---

#### Crypto-shredding markers identify PII fields

GDPR compliance requires marking personal data for deletion.

**Verified by:**

- PII fields are marked for shredding

---

#### Use fat events for cross-context integration

Same-context projections can use thin events for efficiency.

**Verified by:**

- Event type selection by use case

_ecst-fat-events.feature_

### Reservation Pattern

_Uniqueness constraints before entity creation require check-then-create_

---

#### Reservations prevent race conditions

> **Invariant:** Only one reservation can exist for a given key at any time. Concurrent claims resolve deterministically via OCC.
>
> **Rationale:** Check-then-create patterns have a TOCTOU vulnerability where two requests may both see "not exists" and proceed to create, violating uniqueness. Atomic reservation eliminates this window.

**Verified by:**

- Concurrent reservations for same value

---

#### Reservations have TTL for auto-cleanup

> **Invariant:** All reservations must have a TTL. After TTL expiry, the reservation transitions to "expired" and the key becomes available.
>
> **Rationale:** Without TTL, abandoned reservations (user closes browser, network failure) would permanently block values. TTL ensures eventual availability.

**Verified by:**

- Reservation expires after TTL

---

#### Confirmation converts to permanent entity

> **Invariant:** A reservation can only be confirmed once. Confirmation atomically transitions state to "confirmed" and links to the created entity.
>
> **Rationale:** The two-phase reservation→confirmation ensures the unique value is guaranteed available before the expensive entity creation occurs.

**Verified by:**

- Confirm links reservation to entity

---

#### Release frees reservation before expiry

> **Invariant:** An active reservation can be explicitly released, immediately freeing the key for other consumers without waiting for TTL.
>
> **Rationale:** Good UX requires immediate availability when users cancel. Waiting for TTL (potentially minutes) creates unnecessary blocking.

**Verified by:**

- User cancels registration

---

#### Reservation key combines type and value

> **Invariant:** Reservation keys are namespaced by type. The same value can be reserved in different namespaces simultaneously.
>
> **Rationale:** A single value like "alice" may need uniqueness in multiple contexts (username, display name, etc.). Type-scoped keys allow independent reservations.

**Verified by:**

- Reservation key is type-scoped

_reservation-pattern.feature_

---

## Phase 21

### Integration Patterns21a

_Cross-context communication is ad-hoc._

---

#### Context Map documents BC relationships

> **Invariant:** All BC relationships must be explicitly documented with relationship type, upstream/downstream direction, and no duplicate or self-referential entries.
>
> **Rationale:** Implicit relationships lead to accidental coupling and unclear ownership. Explicit documentation enables architecture governance and dependency analysis.

| Relationship          | Upstream        | Downstream                       | Description                                      |
| --------------------- | --------------- | -------------------------------- | ------------------------------------------------ |
| upstream-downstream   | ProducerContext | ConsumerContext                  | Producer publishes, Consumer consumes            |
| customer-supplier     | ProducerContext | DownstreamContext                | Downstream needs drive Producer API              |
| conformist            | EventStore      | All BCs                          | All BCs conform to event schema                  |
| anti-corruption-layer | ExternalSystem  | IntegrationContext               | IntegrationContext translates external responses |
| partnership           | ProducerContext | ConsumerContext                  | Bidirectional collaboration on shared model      |
| shared-kernel         | SharedKernel    | ProducerContext, ConsumerContext | Shared code/types between BCs                    |
| open-host-service     | ProducerContext | External                         | Producer exposes public integration API          |

**Verified by:**

- Context Map shows BC topology
- Register Partnership relationship
- Register Shared Kernel relationship
- Register Open Host Service relationship
- Duplicate relationship is rejected
- Self-referential relationship is rejected

---

#### Published Language defines stable contracts

> **Invariant:** Integration events must use registered schemas with explicit versioning and compatibility modes. Unregistered event types and invalid payloads are rejected.
>
> **Rationale:** Ad-hoc event formats create tight coupling and break consumers on change. Versioned schemas with compatibility contracts enable safe evolution.

**Verified by:**

- Integration event uses Published Language
- Event tagging for routing and DCB
- Schema compatibility mode is enforced
- Register schema with compatibility mode
- Unregistered event type fails conversion
- Invalid payload fails schema validation

---

#### ACL translates external models

> **Invariant:** External system data must pass through ACL translation with schema validation before entering the domain. Unmapped values and invalid inputs are rejected.
>
> **Rationale:** Direct use of external models leaks foreign concepts into the domain, creating coupling and making the domain vocabulary impure. ACL enforces boundaries.

**Verified by:**

- ACL translates external system response
- ACL handles bidirectional translation
- ACL validates external input
- ACL rejects unmapped values

_integration-patterns-21a.feature_

### Integration Patterns21b

_Schema evolution breaks consumers._

---

#### Schema versioning enables evolution

Old consumers continue working when schemas evolve through upcasting and downcasting.

    **Version Migration (Upcasting):**


    **Chain Migration:**

**Verified by:**

- V1 consumer receives V2 event
- Upcast historical events
- Chain upcasters for multi-version migration
- Upcast adds computed field
- Incompatible schema change is rejected
- Breaking change without migration

---

#### Contract tests validate integration

Producer and consumer contracts are tested independently.

**Verified by:**

- Contract test validates schema compatibility
- Contract sample generation
- Generate multiple unique samples
- Producer contract test utility
- Consumer contract test utility
- Compatible producer and consumer verified
- Compatible with downcaster
- Detect producer-consumer mismatch
- Contract violation is recorded
- Contract violations are queryable

_integration-patterns-21b.feature_

---

## Phase 22

### Agent As Bounded Context

_AI agents are invoked manually without integration into the_

---

#### Agent subscribes to relevant event streams

EventBus delivers events to agent BC like any other subscriber.

    **Subscription API:**

**Verified by:**

- Agent receives subscribed events
- Agent receives filtered events only
- Agent receives events in order
- Agent resumes from last processed position after restart
- Agent configuration validation

---

#### Agent detects patterns across events

Pattern window groups events for analysis (LLM or rule-based).

    **Pattern Detection API:**

**Verified by:**

- Agent detects multiple cancellations pattern
- Agent uses LLM for pattern analysis
- Pattern window respects time boundary
- Pattern window loads events lazily for memory efficiency
- Pattern definition validation

---

#### Agent emits commands with explainability

Commands include reasoning and suggested action.

    **Command Emission API:**


    **LLM Fault Isolation (Optional Enhancement):**
    For production deployments, wrap LLM calls with Phase 18's circuit breaker:

    This triggers fallback to rule-based analysis when LLM is unavailable,
    preventing cascade failures during LLM provider outages.

**Verified by:**

- Agent emits recommendation command
- Command includes triggering event references
- Command requires minimum metadata
- LLM rate limit is handled with exponential backoff
- Command validation
- LLM error handling

---

#### Human-in-loop controls automatic execution

High-confidence actions can auto-execute; low-confidence require approval.

    **Human-in-Loop Configuration:**


    **Approval Timeout Implementation (Cron-based expiration):**
    Approval expiration uses a periodic cron job that queries pending approvals
    past their timeout.

**Verified by:**

- Action based on confidence threshold
- High-risk actions always require approval
- Pending approval expires after timeout

---

#### LLM calls are rate-limited

Rate limiting behavior including token bucket throttling, queue overflow handling,
and cost budget enforcement is specified in AgentLLMIntegration (Phase 22b).

---

#### All agent decisions are audited

Audit trail captures pattern detection, reasoning, and outcomes.

    **Audit Event Structure:**

**Verified by:**

- Agent decision creates audit event
- Audit includes LLM metadata
- Query agent decision history
- Audit captures rejected actions

_agent-as-bounded-context.feature_

### Agent BC Component Isolation

_Agent BC tables (`agentCheckpoints`, `agentAuditEvents`, `agentDeadLetters`,_

---

#### Agent component provides isolated database

> **Invariant:** All agent-specific state (checkpoints, audit events, dead letters, commands, pending approvals) must reside in the agent component's isolated database. No agent data in the shared app schema.
>
> **Rationale:** Physical BC isolation prevents accidental coupling. Parent app mutations cannot query agent tables directly — this is enforced by Convex's component architecture, not just convention. This matches the orders/inventory pattern where each BC owns its tables via `defineComponent()`.

**Verified by:**

- Agent component registers with isolated schema
- Component API provides full CRUD for checkpoints
- Direct table access is not possible from parent
- Component sub-transactions provide isolation
- Component isolation test
- API boundary test
- schema separation test

---

#### Cross-component queries use explicit API

> **Invariant:** Agent BC must access external data (like `customerCancellations` projection) through explicit cross-component query patterns, never through direct table access.
>
> **Rationale:** Maintains BC isolation while enabling necessary data access. The `customerCancellations` projection lives at the app level (owned by CommandOrchestrator), so the agent handler must receive this data as an argument or query it through a well-defined interface.

| Data Source           | Owner            | Consumer           | Access Pattern                |
| --------------------- | ---------------- | ------------------ | ----------------------------- |
| customerCancellations | App (projection) | Agent handler      | Passed as argument to handler |
| Order events          | EventBus         | Agent subscription | Delivered via Workpool        |
| Agent decisions       | Agent component  | Admin UI queries   | Via component API             |

**Verified by:**

- Agent handler receives projection data as argument
- Missing projection data returns empty result
- Agent handler cannot directly access app-level projection tables
- App-level queries can access agent data via component API
- Cross-component query works
- missing data handled gracefully
- no direct table coupling between agent and app

_agent-bc-component-isolation.feature_

### Agent Command Infrastructure

_Three interconnected gaps in agent command infrastructure:_

---

#### Emitted commands are routed to handlers

> **Invariant:** Commands emitted by agents must flow through CommandOrchestrator and be processed by registered handlers. Commands cannot remain unprocessed in a table.
>
> **Rationale:** The current `agentCommands` table receives inserts from `emitAgentCommand()` but nothing acts on them. The emitted `SuggestCustomerOutreach` command sits with status "pending" forever. For the agent to have real impact, its commands must reach domain handlers.

| Step | Action                              | Component             |
| ---- | ----------------------------------- | --------------------- |
| 1    | Agent decides to emit command       | Agent action handler  |
| 2    | Command recorded in onComplete      | Agent component       |
| 3    | CommandOrchestrator.execute()       | Platform orchestrator |
| 4    | Target BC handler processes command | Domain BC             |
| 5    | Command status updated              | Agent component       |

**Verified by:**

- Agent command routes through CommandOrchestrator to handler
- Unknown command type is rejected with validation error
- Command idempotency prevents duplicate processing
- Command routes to handler
- status lifecycle tracked
- unknown command rejected

---

#### Agent lifecycle is controlled via commands

> **Invariant:** Agent state changes (start, pause, resume, stop, reconfigure) must happen via commands, not direct database manipulation. Each transition is validated by the lifecycle FSM and recorded in the audit trail.
>
> **Rationale:** Commands provide audit trail, FSM validation, and consistent state transitions. Direct DB manipulation bypasses these safeguards. The lifecycle FSM prevents invalid transitions (e.g., pausing an already-stopped agent).

**Verified by:**

- PauseAgent transitions active agent to paused
- ResumeAgent resumes from checkpoint position
- Invalid lifecycle transition is rejected
- ReconfigureAgent updates configuration without losing state
- Valid transitions succeed
- invalid transitions rejected
- paused agent stops processing

---

#### Pattern definitions are the single source of truth

> **Invariant:** Each agent references named patterns from a registry. The pattern's `trigger()` and `analyze()` functions are used by the event handler, eliminating parallel implementations.
>
> **Rationale:** The current codebase has two disconnected pattern implementations: `_config.ts` with inline rule-based detection and `_patterns/churnRisk.ts` with formal `PatternDefinition` including LLM analysis. This creates confusion about which code path runs in production and makes the LLM analysis unreachable.

**Verified by:**

- Agent config references patterns from registry
- Handler uses pattern trigger for cheap detection
- Handler uses pattern analyze for LLM analysis
- Unknown pattern name in config fails validation
- Config references patterns by name
- handler uses pattern methods
- inline onEvent removed

_agent-command-infrastructure.feature_

### Agent LLM Integration

_The agent event handler (`handleChurnRiskEvent`) is a Convex mutation that_

---

#### Agent event handlers are actions for LLM integration

> **Invariant:** Agent event handlers that require LLM analysis must be Convex actions, not mutations. All state changes (checkpoint, audit, commands) happen in the onComplete mutation handler, never in the action.
>
> **Rationale:** Convex mutations cannot make external HTTP calls. The action/mutation split enables LLM integration while maintaining atomic state persistence. Actions are retryable by Workpool (mutations are not — they rely on OCC auto-retry).

**Verified by:**

- Agent action handler calls LLM and returns decision
- onComplete mutation persists decision atomically
- Action handler rejects invalid agent configuration
- LLM unavailable propagates error through retries to dead letter
- Action failure triggers dead letter via onComplete
- Action calls LLM
- onComplete persists
- fallback works
- timeout handled

---

#### Rate limiting is enforced before LLM calls

> **Invariant:** Every LLM call must check rate limits before execution. Exceeded limits queue the event for later retry or send to dead letter if queue is full.
>
> **Rationale:** LLM API costs can spiral quickly under high event volume. Rate limiting protects against runaway costs and external API throttling. The existing `rateLimits` config in `AgentBCConfig` defines the limits — this rule enforces them at runtime.

**Verified by:**

- Rate limiter allows LLM call within limits
- Rate limiter blocks LLM call when exceeded
- Cost budget exceeded pauses agent
- Queue overflow triggers dead letter
- Rate limit blocks excess calls
- cost budget pauses agent
- queue overflow creates dead letter

---

#### Agent subscriptions support onComplete callbacks

> **Invariant:** `CreateAgentSubscriptionOptions` must include an optional `onComplete` field that receives Workpool completion callbacks, enabling agent-specific dead letter handling and checkpoint updates.
>
> **Rationale:** The current `CreateAgentSubscriptionOptions` type lacks the `onComplete` field. While the EventBus falls back to the global `defaultOnComplete` (dead letter handler), agents need custom completion logic: checkpoint updates, agent-specific audit events, and rate limit tracking. Without this field, the agent-specific `handleChurnRiskOnComplete` handler is orphaned — defined but never wired.

**Verified by:**

- Agent subscription with onComplete receives completion callbacks
- Failed agent jobs create dead letters via onComplete
- Agent subscription without onComplete uses global default
- onComplete receives callbacks
- dead letters created on failure
- checkpoint updated on success

_agent-llm-integration.feature_

### Confirmed Order Cancellation

_The Order FSM treats `confirmed` as terminal._

---

#### Confirmed orders can be cancelled

The Order FSM must allow transitioning from `confirmed` to `cancelled`.

**Verified by:**

- Cancel a confirmed order
- Cannot cancel already cancelled order (unchanged behavior)
- OrderCancelled evolves confirmed state to cancelled

---

#### Reservation is released when confirmed order is cancelled

The ReservationReleaseOnOrderCancel PM subscribes to OrderCancelled events.

| Property            | Value                           |
| ------------------- | ------------------------------- |
| processManagerName  | reservationReleaseOnOrderCancel |
| eventSubscriptions  | OrderCancelled                  |
| emitsCommands       | ReleaseReservation              |
| context             | orders                          |
| correlationStrategy | orderId                         |

**Verified by:**

- Reservation is released after confirmed order cancellation
- Cancelling draft order does not trigger reservation release
- Cancelling submitted order with pending reservation releases it
- PM is idempotent for duplicate OrderCancelled events

---

#### Agent BC demo flow is enabled

The primary use case is enabling the Agent BC churn risk detection demo.

**Verified by:**

- Three cancellations trigger churn risk agent

_confirmed-order-cancellation.feature_

---

## Phase 100

### Themed Decision Architecture

_Current state: Decisions are listed chronologically or alphabetically in flat files._

---

#### Decisions are grouped by theme

The 7 themes identified during codebase synthesis:

| Theme        | Core ADRs               | Key Decision                          |
| ------------ | ----------------------- | ------------------------------------- |
| Persistence  | 001, 002, 010, 011      | Dual-write, no snapshots, lazy upcast |
| Isolation    | 005, 023, 028, 032      | BC as components, projections at app  |
| Commands     | 003, 017, 021, 030      | Orchestrator, idempotency, categories |
| Projections  | 004, 006, 015, 016, 018 | Workpool, checkpoints, partitioning   |
| Coordination | 009, 020, 025, 033      | Saga vs PM distinction                |
| Taxonomy     | 029, 030                | Event types, command categories       |
| Testing      | 013, 022, 031           | BDD, inverted pyramid, namespace      |

**Verified by:**

- Generate themed decision document
- Theme tag in decision file

---

#### Decisions declare dependencies

**Verified by:**

- ADR with dependency declaration
- Generate dependency graph

---

#### Decisions are layered by evolution phase

The 33 ADRs fall into 3 evolutionary layers:

| Layer          | ADR Range | Count | Description                    |
| -------------- | --------- | ----- | ------------------------------ |
| Foundation     | 001-010   | 10    | Core patterns, first decisions |
| Infrastructure | 011-020   | 10    | Supporting infrastructure      |
| Refinement     | 021-033   | 13    | Optimizations, clarifications  |

**Verified by:**

- Layer information in generated docs

---

#### Existing ADRs are migrated with review

**Verified by:**

- Port ADR from old format to feature file
- Review for validity during migration

---

#### Multiple output formats are generated

**Verified by:**

- Generate all decision artifacts

_themed-decision-architecture.feature_

---

[← Back to Business Rules](../BUSINESS-RULES.md)
