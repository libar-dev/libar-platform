# Platform Business Rules

**Purpose:** Business rules for the Platform product area

---

**73 rules** from 20 features. 22 rules have explicit invariants.

---

## Phase 13

### Package Architecture

*The original @convex-es/core package grew to 25+ modules, creating issues:*

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

*package-architecture.feature*

---

## Phase 18

### Admin Tooling Consolidation

*Admin functionality is scattered across the codebase:*

---

#### Admin directory provides unified location for operational endpoints

All cross-cutting admin operations live in `convex/admin/`.

**Verified by:**
- Admin directory is created with correct structure
- Backward compatibility for DLQ imports

---

#### DLQ endpoints provide inspection, retry, and ignore operations

Dead letter queue management enables operations teams to:
    - View failed projection updates
    - Retry individual or bulk items
    - Ignore items that cannot be processed

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

When issues occur, operators need to trace:
    - Which command created an event
    - Which projections processed the event
    - Where in the chain a failure occurred

    **Trace Query:**

**Verified by:**
- Trace complete event flow
- Trace shows failure point

---

#### System state snapshot provides full health picture

Operators need a single query to understand overall system state, combining:
    - Component health (Event Store, projections, Workpools)
    - Projection lag across all projections
    - DLQ statistics
    - Active rebuilds
    - Circuit breaker states

    **Snapshot Query:**

**Verified by:**
- System state provides complete overview

---

#### Durable function queries enable Workpool and Workflow debugging

When background work fails or stalls, operators need visibility into:
    - Workpool queue contents and status
    - Workflow execution history
    - Action Retrier run status

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

*admin-tooling-consolidation.feature*

### Circuit Breaker Pattern

*External API failures (Stripe, SendGrid, webhooks) cascade through the system.*

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

*circuit-breaker-pattern.feature*

### Health Observability

*No Kubernetes integration (readiness/liveness probes), no metrics for*

---

#### Health endpoints support Kubernetes probes

Kubernetes requires HTTP endpoints for orchestration:
    - **Readiness probe** (`/health/ready`) - Is the service ready to receive traffic?
    - **Liveness probe** (`/health/live`) - Is the process alive and responsive?

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

*health-observability.feature*

### Production Hardening

*Structured logging (Phase 13) exists but no metrics collection, distributed tracing,*

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

*production-hardening.feature*

---

## Phase 20

### Deterministic Id Hashing

*TTL-based reservations work well for multi-step flows (registration wizards),*

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

*deterministic-id-hashing.feature*

---

## Phase 21

### Integration Patterns21a

*Cross-context communication is ad-hoc.*

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

*integration-patterns-21a.feature*

### Integration Patterns21b

*Schema evolution breaks consumers.*

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

*integration-patterns-21b.feature*

---

## Phase 22

### Agent BC Component Isolation

*Agent BC tables (`agentCheckpoints`, `agentAuditEvents`, `agentDeadLetters`,*

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

*agent-bc-component-isolation.feature*

### Agent Command Infrastructure

*Three interconnected gaps in agent command infrastructure:*

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

*agent-command-infrastructure.feature*

### Agent LLM Integration

*The agent event handler (`handleChurnRiskEvent`) is a Convex mutation that*

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

*agent-llm-integration.feature*

### Confirmed Order Cancellation

*The Order FSM treats `confirmed` as terminal.*

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

*confirmed-order-cancellation.feature*

---

## Phase 24

### Tranche0 Readiness Harness

*The remediation program cannot safely begin security or correctness migrations*

---

#### Tranche 0 readiness is a hard gate

The readiness packet completes before any wave-3 runtime packet starts.

**Verified by:**
- Store and bus readiness harnesses exist before tranche 1 implementation

---

#### Validation posture must fail closed

This packet aligns typecheck, Vitest, and linting surfaces so no package can present a false-green
    readiness state.

**Verified by:**
- Readiness validation remains machine-verifiable

*tranche-0-readiness-harness-and-dependency-hardening.feature*

---

## Phase 25

### Tranche0 Release Ci Docs Process Guardrails

*`test.yml` ignores markdown and docs-only changes, release automation is not yet*

---

#### PDR-002 is the only release authority

Release tooling mirrors architect metadata and does not replace it.

**Verified by:**
- Release governance points to PDR-002

---

#### Docs and process changes must have a non-skipped CI lane

The dedicated docs/process workflow exists because `.github/workflows/test.yml` skips markdown
    and docs-only changes.

**Verified by:**
- Docs-only changes still run architect guard and docs generation

*tranche-0-release-ci-and-docs-process-guardrails.feature*

---

## Phase 26

### Component Boundary Authentication Convention

*Identity-bearing component mutations still trust caller-provided actor fields*

---

#### P11 ships as one atomic packet

The auth convention is the tranche-1 keystone.

**Verified by:**
- Auth remediation is not split by mutation family

---

#### Verification is component-side and defaults to deny

The proof contract is checked inside the component mutation boundary, not by parent-app trust alone.

**Verified by:**
- Missing or forged proof is rejected by default

*component-boundary-authentication-convention.feature*

---

## Phase 27

### Event Correctness Migration

*`appendToStream` idempotency semantics, `globalPosition` precision, and process-manager*

---

#### P14, P17, and P18 remain one correctness packet

Idempotency, `globalPosition`, and PM transition parity are reviewed as one correctness surface.

**Verified by:**
- Event correctness packet starts from decisions and inventory

---

#### Compatibility and ordering remain explicit

The packet carries its own compatibility reader, parity tests, and evidence trail.

**Verified by:**
- Old and new checkpoint formats are handled explicitly

*event-correctness-migration.feature*

---

## Phase 28

### Tranche1 Supporting Security Contract Sweep

*Several tranche-1 gaps remain after the auth keystone: test-mode checks fail open,*

---

#### Supporting tranche-1 work follows the auth convention

This packet does not redefine the proof model from P11.

**Verified by:**
- Supporting cleanup does not bypass the auth keystone

---

#### Legacy shortcuts are removed, not documented as acceptable debt

Default-allow reviewer logic, fabricated correlation IDs, truncated UUID helpers, and earlier no-op hardening debt
    lifecycle stubs are all remediation targets.

**Verified by:**
- Supporting contract gaps fail closed after remediation

*tranche-1-supporting-security-and-contract-sweep.feature*

---

## Phase 100

### Themed Decision Architecture

*Current state: Decisions are listed chronologically or alphabetically in flat files.*

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

*themed-decision-architecture.feature*

---

## Uncategorized

### Agent Churn Risk Completion Executable Tests

*I want agent failures to create dead letters for retry*

---

#### Successful and canceled results do not create dead letters

> **Invariant:** Only failed results create dead letter entries. Success and canceled results are normal completion states that require no error tracking.
>
> **Rationale:** Dead letters are an error-recovery mechanism. Creating entries for non-error states would pollute the dead letter queue and obscure real failures.

**Verified by:**
- No dead letter on success
- No dead letter on canceled

---

#### Failed results create dead letters with error details

> **Invariant:** A failed result must create exactly one dead letter entry with the error message, attempt count of 1, pending status, and the event's global position.
>
> **Rationale:** Dead letters capture all context needed for manual retry or investigation. The attempt count tracks redelivery attempts for escalation policies.

**Verified by:**
- Creates dead letter on failure

---

#### Repeated failures increment attempt count

> **Invariant:** When the same eventId fails again, the existing dead letter's attemptCount is incremented and the error is updated. No duplicate entries are created.
>
> **Rationale:** Deduplication by eventId prevents queue bloat from redeliveries. The latest error is preserved for debugging the most recent failure.

**Verified by:**
- Increments attemptCount on repeated failure

---

#### Terminal dead letters are not updated

> **Invariant:** Once a dead letter reaches a terminal state (e.g., ignored), subsequent failures for the same eventId must not modify it.
>
> **Rationale:** Terminal states represent operator decisions (ignore, resolved). Overwriting them with new failures would lose the operator's intent.

**Verified by:**
- Does not update dead letter in terminal state

---

#### Approvals expire after configured timeout

> **Invariant:** Pending approvals must transition to "expired" status after `approvalTimeout` elapses. Once expired, they can no longer be approved.
>
> **Rationale:** Stale approvals cannot linger forever or be acted on after their review window closes.

**Verified by:**
- Cron expires approval after timeout
- Expired approval cannot be approved

---

#### Emitted commands create real domain records

> **Invariant:** Auto-executed `SuggestCustomerOutreach` decisions must route to the real outreach handler, which creates an outreach task record and emits an `OutreachCreated` domain event.
>
> **Rationale:** Agent commands must produce observable business effects, not stop at command metadata.

**Verified by:**
- SuggestCustomerOutreach creates outreach record and emits event

*on-complete.feature*

### Saga Orchestration Executable Tests

*to expose SagaOrchestration in the PatternGraph.*

---

#### Sagas orchestrate operations across multiple bounded contexts

> **Invariant:** Each saga step uses the CommandOrchestrator for dual-write semantics within target BC.
>
> **Rationale:** Cross-BC operations cannot use atomic transactions because bounded contexts have isolated databases. Routing each step through the CommandOrchestrator preserves dual-write semantics within the target context while the saga coordinates the overall process.

**Verified by:**
- Successful cross-context coordination
- Compensation on step failure

---

#### @convex-dev/workflow provides durability across server restarts

> **Invariant:** Workflow state persists automatically — server restarts resume from last completed step.
>
> **Rationale:** Long-running cross-BC processes can span minutes or hours (e.g., waiting for payment confirmation). Convex Workflow persists step boundaries automatically so a server restart does not cause re-execution of already-completed steps.

**Verified by:**
- Workflow resumes from the last completed step after restart

---

#### Compensation reverses partial operations on failure

> **Invariant:** Compensation runs in reverse order of completed steps on failure.
>
> **Rationale:** If step N fails after steps 1..N-1 succeeded, compensation logic must undo the effects of completed steps in reverse order. This preserves consistency across BCs without requiring distributed transactions.

**Verified by:**
- Compensation executes in reverse order of completed steps

---

#### Saga idempotency prevents duplicate workflows via sagaId

> **Invariant:** Same sagaId never starts duplicate workflows — registry returns existing info.
>
> **Rationale:** Network retries and event redelivery must not create multiple workflows for the same business operation. The registry checks for existing sagas before starting a new workflow.

**Verified by:**
- First trigger starts saga
- Duplicate trigger returns existing saga

---

#### Saga status is updated via onComplete callback, not inside workflow

> **Invariant:** Workflow code has no database access — status updates are external via onComplete.
>
> **Rationale:** Keeping the workflow body pure (no database access) ensures status updates are atomic with workflow completion and that failed status updates can be retried independently from the workflow itself.

**Verified by:**
- onComplete updates saga status after workflow finishes

*saga-orchestration-executable-tests.feature*

---

[← Back to Business Rules](../BUSINESS-RULES.md)
