# Pattern Registry

**Purpose:** Quick reference for discovering and implementing patterns
**Detail Level:** Overview with links to details

---

## Progress

**Overall:** [████████████░░░░░░░░] 60/97 (62% complete)

| Status       | Count |
| ------------ | ----- |
| ✅ Completed | 60    |
| 🚧 Active    | 5     |
| 📋 Planned   | 32    |
| **Total**    | 97    |

---

## Categories

- [Arch](#arch) (1)
- [Command](#command) (4)
- [Completed Before Delivery Process](#completed-before-delivery-process) (4)
- [Core](#core) (2)
- [CQRS](#cqrs) (1)
- [DDD](#ddd) (32)
- [Decider](#decider) (1)
- [Event Sourcing](#event-sourcing) (12)
- [Implements](#implements) (2)
- [Infra](#infra) (24)
- [Opportunity 1](#opportunity-1) (1)
- [Pattern](#pattern) (3)
- [Process Enhancements](#process-enhancements) (4)
- [Projection](#projection) (6)

---

## All Patterns

| Pattern                                                            | Category                          | Status    | Description                                                                                                                 |
| ------------------------------------------------------------------ | --------------------------------- | --------- | --------------------------------------------------------------------------------------------------------------------------- |
| ✅ Agent As Bounded Context                                        | DDD                               | completed | Problem: AI agents are invoked manually without integration into the event-driven architecture.                             |
| ✅ Agent Churn Risk Completion                                     | DDD                               | completed | Problem: The churn-risk agent in the order-management example app has working infrastructure from Phases 22a-22c...         |
| ✅ Agent Command Infrastructure                                    | DDD                               | completed | Problem: Three interconnected gaps in agent command infrastructure: 1.                                                      |
| ✅ Bdd Testing Infrastructure                                      | DDD                               | completed | Problem: Domain logic tests require infrastructure (Docker, database).                                                      |
| ✅ Bounded Context Foundation                                      | Completed Before Delivery Process | completed | Problem: DDD Bounded Contexts need clear boundaries with physical enforcement, type-safe contracts, and domain purity...    |
| ✅ Bounded Context Identity                                        | DDD                               | completed | BoundedContextFoundation:bounded-context-identity Core identification contract for bounded contexts, providing...           |
| ✅ CMS Dual Write                                                  | Core                              | completed | Core types for Command Model State - the continuously updated aggregate snapshot maintained atomically alongside...         |
| ✅ CMS Repository                                                  | Pattern                           | completed | Factory for typed data access with automatic schema upcasting in dual-write handlers.                                       |
| ✅ Codec Driven Reference Generation                               | Process Enhancements              | completed | Reference documentation is specified via 11 recipe `.feature` files in `delivery-process/recipes/`.                         |
| ✅ Command Bus                                                     | Command                           | completed | Type-safe client for the Convex Command Bus component providing infrastructure-level idempotency.                           |
| ✅ Command Bus Foundation                                          | Completed Before Delivery Process | completed | Problem: Command execution requires idempotency (same command = same result), status tracking, and a standardized...        |
| ✅ Command Orchestrator                                            | Command                           | completed | The CommandOrchestrator encapsulates the 7-step dual-write + projection execution pattern that is central to this...        |
| ✅ Correlation Chain System                                        | Pattern                           | completed | Correlation types for tracking causal relationships in command-event flows.                                                 |
| ✅ DCB Scope Key Utilities                                         | DDD                               | completed | Functions for creating, parsing, and validating scope keys.                                                                 |
| ✅ DCB Types                                                       | DDD                               | completed | Types for scope-based multi-entity coordination within bounded contexts.                                                    |
| ✅ Decider Pattern                                                 | DDD                               | completed | Problem: Domain logic embedded in handlers makes testing require infrastructure.                                            |
| ✅ Dual Write Contract                                             | Core                              | completed | BoundedContextFoundation:dual-write-contract Type-safe contract for bounded contexts using the dual-write pattern,...       |
| ✅ Durable Append via Workpool Actions                             | Event Sourcing                    | completed | Failed event appends from async contexts are retried via Workpool actions with exponential backoff until success or...      |
| ✅ Durable Cross-Context Event Publication                         | Event Sourcing                    | completed | Cross-context events use Workpool-backed publication with tracking, retry, and dead letter handling.                        |
| ✅ Durable Events Integration                                      | DDD                               | completed | Problem: Phase 18 delivered durability primitives to `platform-core`, but the example app's main command flow still...      |
| ✅ Durable Function Adapters                                       | DDD                               | completed | Problem: Platform has well-defined interfaces (RateLimitChecker, DCB conflict handling) but uses in-memory...               |
| ✅ Dynamic Consistency Boundaries                                  | DDD                               | completed | Problem: Cross-entity invariants within a bounded context currently require sequential commands (no atomicity) or...        |
| ✅ Ecst Fat Events                                                 | Event Sourcing                    | completed | Problem: Thin events require consumers to query back to the source BC, creating coupling and requiring synchronous...       |
| ✅ Event Store Durability                                          | Event Sourcing                    | completed | Guaranteed event persistence patterns for Convex-native event sourcing.                                                     |
| ✅ Event Store Durability Types                                    | Event Sourcing                    | completed | Core types for durable event persistence patterns: - Outbox pattern for action result capture - Idempotent event...         |
| ✅ Event Bus Abstraction                                           | Event Sourcing                    | completed | Durable event pub/sub using Workpool for parallelism, retries, and dead letter handling.                                    |
| ✅ Event Replay Infrastructure                                     | DDD                               | completed | Problem: When projections become corrupted, require schema migration, or drift from the Event Store due to bugs,...         |
| ✅ Event Store                                                     | Event Sourcing                    | completed | Central event storage component for Event Sourcing.                                                                         |
| ✅ Event Store Durability                                          | DDD                               | completed | Problem: The dual-write pattern (CMS + Event) works when both operations are in the same mutation, but several...           |
| ✅ Event Store Foundation                                          | Completed Before Delivery Process | completed | Problem: Event Sourcing requires centralized storage for domain events with ordering guarantees, concurrency control,...    |
| ✅ Event Upcasting                                                 | Event Sourcing                    | completed | Transforms events from older schema versions to current version at read time.                                               |
| ✅ Example App Modernization                                       | DDD                               | completed | Problem: The `order-management` example app has grown organically during platform development.                              |
| ✅ Foundation Infrastructure                                       | Arch                              | completed | Consolidates old roadmap phases 0-13 into a single completed milestone.                                                     |
| ✅ Handler Factories                                               | Decider                           | completed | The Decider pattern separates pure business logic from infrastructure concerns, enabling unit testing without...            |
| ✅ Idempotent Event Append                                         | Event Sourcing                    | completed | Ensures each logical event is stored exactly once in the event store, regardless of how many times the append...            |
| ✅ Intent/Completion Event Pattern                                 | Event Sourcing                    | completed | Long-running operations bracket with intent and completion events for visibility, timeout detection, and...                 |
| ✅ Invariant Framework                                             | DDD                               | completed | Factory for declarative business rule validation with typed error codes.                                                    |
| ✅ Logging Infrastructure                                          | Infra                             | completed | Factory for domain-specific loggers with scope prefixes and level filtering.                                                |
| ✅ Middleware Pipeline                                             | Command                           | completed | Orchestrates middleware execution in the correct order.                                                                     |
| ✅ Outbox Pattern for Action Results                               | Event Sourcing                    | completed | Captures external API results (success or failure) as domain events using the `onComplete` callback guarantee from...       |
| ✅ Package Architecture                                            | DDD                               | completed | The original @convex-es/core package grew to 25+ modules, creating issues: - Large bundle size for consumers who only...    |
| ✅ Partition Key Helper Functions                                  | Projection                        | completed | Standardized partition key generation for per-entity event ordering and OCC prevention in Workpool-based processing.        |
| ✅ Per-Projection Partition Configuration                          | Projection                        | completed | Defines configuration types and constants for projection partitioning including parallelism recommendations based on...     |
| ✅ Poison Event Handling                                           | Event Sourcing                    | completed | Events that cause projection processing failures are tracked; after N failures, they are quarantined and skipped to...      |
| ✅ Process Manager                                                 | DDD                               | completed | Process Manager module for event-reactive coordination.                                                                     |
| ✅ Process Manager Lifecycle                                       | Pattern                           | completed | FSM for managing PM state transitions (idle/processing/completed/failed) with validation.                                   |
| ✅ Process Metadata Expansion                                      | Process Enhancements              | completed | The monorepo's delivery process lacked metadata tags for variance tracking, governance, and hierarchical views.             |
| ✅ Progress calculation utilities for replay operations.           | Implements                        | completed | Progress calculation utilities for replay operations.                                                                       |
| ✅ Projection Complexity Classifier                                | Projection                        | completed | Analyzes projection characteristics and recommends appropriate partition strategies using a decision tree approach.         |
| ✅ Projection Categories                                           | DDD                               | completed | Problem: Projections exist but categories are implicit.                                                                     |
| ✅ Projection Checkpointing                                        | Projection                        | completed | Projection checkpoint helper for idempotent event processing.                                                               |
| ✅ Query Abstraction                                               | CQRS                              | completed | Query factory functions for creating type-safe read model queries.                                                          |
| ✅ Reactive Projections                                            | DDD                               | completed | Problem: Workpool-based projections have 100-500ms latency.                                                                 |
| ✅ Repo Level Docs Generation                                      | Process Enhancements              | completed | As a monorepo maintainer, I want unified documentation generation from multiple sources.                                    |
| ✅ Reservation Pattern                                             | DDD                               | completed | Problem: Uniqueness constraints before entity creation require check-then-create patterns with race condition risk,...      |
| ✅ Saga Orchestration                                              | Completed Before Delivery Process | completed | Problem: Cross-BC operations (e.g., Order -> Inventory -> Shipping) cannot use atomic transactions because bounded...       |
| ✅ Types for event replay and projection rebuilding.               | Implements                        | completed | Types for event replay and projection rebuilding.                                                                           |
| ✅ Workpool Partition Key Types                                    | Projection                        | completed | Provides type definitions for partition key strategies that ensure per-entity event ordering and prevent OCC conflicts.     |
| ✅ Workpool Partitioning Strategy                                  | Projection                        | completed | Standardized partition key patterns for event ordering and OCC prevention in Workpool-based projection processing.          |
| ✅ Workpool Partitioning Strategy                                  | DDD                               | completed | Problem: ADR-018 defines critical partition key strategies for preventing OCC conflicts and ensuring per-entity event...    |
| 🚧 Agent BC Component Isolation                                    | DDD                               | active    | Problem: Agent BC tables (`agentCheckpoints`, `agentAuditEvents`, `agentDeadLetters`, `agentCommands`,...                   |
| 🚧 Agent LLM Integration                                           | DDD                               | active    | Problem: The agent event handler (`handleChurnRiskEvent`) is a Convex mutation that cannot call external APIs.              |
| 🚧 Command Config Partition Key Validation                         | Command                           | active    | Validates that all projection configurations in a command config have explicit partition keys defined.                      |
| 🚧 Confirmed Order Cancellation                                    | DDD                               | active    | Problem: The Order FSM treats `confirmed` as terminal.                                                                      |
| 🚧 Process Enhancements                                            | Process Enhancements              | active    | Vision: Transform the delivery process from a documentation tool into a delivery operating system.                          |
| 📋 Admin Tooling Consolidation                                     | DDD                               | planned   | Problem: Admin functionality is scattered across the codebase: - Dead letter queue at...                                    |
| 📋 Agent Action Handler Factory — DS-2 Stub                        | Infra                             | planned   | Agent Action Handler Factory — DS-2 Stub Replaces `createAgentEventHandler` (init.ts) with an action-based handler...       |
| 📋 Agent Command Router — DS-4 Stub                                | Infra                             | planned   | Agent Command Router — DS-4 Stub Maps agent command types to their orchestrator routes.                                     |
| 📋 Agent Component - Approval Public API — DS-1 Stub               | Infra                             | planned   | Agent Component - Approval Public API — DS-1 Stub Provides human-in-loop approval workflow for agent actions.               |
| 📋 Agent Component - Audit Public API — DS-1 Stub                  | Infra                             | planned   | Agent Component - Audit Public API — DS-1 Stub Provides audit event recording and querying for agent decision...            |
| 📋 Agent Component - Checkpoint Public API — DS-1 Stub             | Infra                             | planned   | Agent Component - Checkpoint Public API — DS-1 Stub Provides checkpoint operations for exactly-once event processing...     |
| 📋 Agent Component - Command Public API — DS-1 Stub                | Infra                             | planned   | Agent Component - Command Public API — DS-1 Stub Provides command recording, status tracking, and querying for...           |
| 📋 Agent Component - Dead Letter Public API — DS-1 Stub            | Infra                             | planned   | Agent Component - Dead Letter Public API — DS-1 Stub Provides dead letter recording, status management, and querying for... |
| 📋 Agent Component Definition — DS-1 Stub                          | Infra                             | planned   | Agent Component Definition — DS-1 Stub Defines the agent bounded context as a Convex component with isolated database.      |
| 📋 Agent Component Schema — DS-1 Stub                              | Infra                             | planned   | Agent Component Schema — DS-1 Stub Isolated database for all agent-specific state.                                          |
| 📋 Agent Lifecycle FSM — DS-5 Stub                                 | Infra                             | planned   | Agent Lifecycle FSM — DS-5 Stub Formal state machine governing agent start/pause/resume/stop/reconfigure transitions.       |
| 📋 Agent onComplete Handler Factory — DS-2 Stub                    | Infra                             | planned   | Agent onComplete Handler Factory — DS-2 Stub Creates a Workpool onComplete mutation that persists all agent state...        |
| 📋 Agent Subscription Factory — DS-2 Stub                          | Infra                             | planned   | Agent Subscription Factory — DS-2 Stub Extends the existing `createAgentSubscription` factory to produce...                 |
| 📋 AgentBCConfig Evolution — DS-4 Stub                             | Infra                             | planned   | AgentBCConfig Evolution — DS-4 Stub Evolves AgentBCConfig to support pattern-based detection alongside the legacy...        |
| 📋 Checkpoint Status Extension for Agent Lifecycle FSM — DS-5 Stub | Infra                             | planned   | Checkpoint Status Extension for Agent Lifecycle FSM — DS-5 Stub Extends the existing AgentCheckpointStatus (3 states)...    |
| 📋 Circuit Breaker Pattern                                         | DDD                               | planned   | Problem: External API failures (Stripe, SendGrid, webhooks) cascade through the system.                                     |
| 📋 Command Bridge — DS-4 Stub                                      | Infra                             | planned   | Command Bridge — DS-4 Stub Bridges agent command recording (onComplete step 2) with command routing through...              |
| 📋 Cross-Component Query Types for Agent BC — DS-1 Stub            | Infra                             | planned   | Cross-Component Query Types for Agent BC — DS-1 Stub Defines the data shapes for argument injection pattern.                |
| 📋 Deterministic Id Hashing                                        | DDD                               | planned   | Problem: TTL-based reservations work well for multi-step flows (registration wizards), but add overhead for simple...       |
| 📋 EventBus Publish Update — DS-2 Stub                             | Infra                             | planned   | EventBus Publish Update — DS-2 Stub Shows the two changes needed to support the EventSubscription discriminated...          |
| 📋 EventSubscription Discriminated Union — DS-2 Stub               | Infra                             | planned   | EventSubscription Discriminated Union — DS-2 Stub Extends EventSubscription from a single-interface (mutation-only) to a... |
| 📋 Health Observability                                            | DDD                               | planned   | Problem: No Kubernetes integration (readiness/liveness probes), no metrics for projection lag, event throughput, or...      |
| 📋 Integration Patterns21a                                         | DDD                               | planned   | Problem: Cross-context communication is ad-hoc.                                                                             |
| 📋 Integration Patterns21b                                         | DDD                               | planned   | Problem: Schema evolution breaks consumers.                                                                                 |
| 📋 Lifecycle Audit Event Types — DS-5 Stub                         | Infra                             | planned   | Lifecycle Audit Event Types — DS-5 Stub Six new audit event types for agent lifecycle transitions.                          |
| 📋 Lifecycle Command Handlers — DS-5 Stub                          | Infra                             | planned   | Lifecycle Command Handlers — DS-5 Stub Five internalMutation handlers for agent lifecycle transitions.                      |
| 📋 Lifecycle Command Type Definitions — DS-5 Stub                  | Infra                             | planned   | Lifecycle Command Type Definitions — DS-5 Stub Five lifecycle commands with their argument types, result types, and...      |
| 📋 Pattern Executor — DS-4 Stub                                    | Infra                             | planned   | Pattern Executor — DS-4 Stub Iterates an agent's pattern array, calling trigger() then analyze() for each pattern.          |
| 📋 Pattern Registry — DS-4 Stub                                    | Infra                             | planned   | Pattern Registry — DS-4 Stub Validates pattern definitions passed directly on AgentBCConfig.patterns.                       |
| 📋 Production Hardening                                            | DDD                               | planned   | Problem: Structured logging (Phase 13) exists but no metrics collection, distributed tracing, or admin tooling for...       |
| 📋 Test Content Blocks                                             | DDD                               | planned   | This feature demonstrates what content blocks are captured and rendered by the PRD generator.                               |
| 📋 Themed Decision Architecture                                    | Opportunity 1                     | planned   | Decisions (ADRs, PDRs) should not be "dumped into same folder" when generated.                                              |

---

### Arch

1/1 complete (100%)

- [✅ Foundation Infrastructure](patterns/foundation-infrastructure.md)

---

### Command

3/4 complete (75%)

- [✅ Command Bus](patterns/command-bus.md)
- [✅ Command Orchestrator](patterns/command-orchestrator.md)
- [✅ Middleware Pipeline](patterns/middleware-pipeline.md)
- [🚧 Command Config Partition Key Validation](patterns/command-config-partition-key-validation.md)

---

### Completed Before Delivery Process

4/4 complete (100%)

- [✅ Bounded Context Foundation](patterns/bounded-context-foundation.md)
- [✅ Command Bus Foundation](patterns/command-bus-foundation.md)
- [✅ Event Store Foundation](patterns/event-store-foundation.md)
- [✅ Saga Orchestration](patterns/saga-orchestration.md)

---

### Core

2/2 complete (100%)

- [✅ CMS Dual Write](patterns/cms-dual-write.md)
- [✅ Dual Write Contract](patterns/dual-write-contract.md)

---

### CQRS

1/1 complete (100%)

- [✅ Query Abstraction](patterns/query-abstraction.md)

---

### DDD

21/32 complete (66%)

- [✅ Agent As Bounded Context](patterns/agent-as-bounded-context.md)
- [✅ Agent Churn Risk Completion](patterns/agent-churn-risk-completion.md)
- [✅ Agent Command Infrastructure](patterns/agent-command-infrastructure.md)
- [✅ Bdd Testing Infrastructure](patterns/bdd-testing-infrastructure.md)
- [✅ Bounded Context Identity](patterns/bounded-context-identity.md)
- [✅ DCB Scope Key Utilities](patterns/dcb-scope-key-utilities.md)
- [✅ DCB Types](patterns/dcb-types.md)
- [✅ Decider Pattern](patterns/decider-pattern.md)
- [✅ Durable Events Integration](patterns/durable-events-integration.md)
- [✅ Durable Function Adapters](patterns/durable-function-adapters.md)
- [✅ Dynamic Consistency Boundaries](patterns/dynamic-consistency-boundaries.md)
- [✅ Event Replay Infrastructure](patterns/event-replay-infrastructure.md)
- [✅ Event Store Durability](patterns/event-store-durability.md)
- [✅ Example App Modernization](patterns/example-app-modernization.md)
- [✅ Invariant Framework](patterns/invariant-framework.md)
- [✅ Package Architecture](patterns/package-architecture.md)
- [✅ Process Manager](patterns/process-manager.md)
- [✅ Projection Categories](patterns/projection-categories.md)
- [✅ Reactive Projections](patterns/reactive-projections.md)
- [✅ Reservation Pattern](patterns/reservation-pattern.md)
- [✅ Workpool Partitioning Strategy](patterns/workpool-partitioning-strategy.md)
- [🚧 Agent BC Component Isolation](patterns/agent-bc-component-isolation.md)
- [🚧 Agent LLM Integration](patterns/agent-llm-integration.md)
- [🚧 Confirmed Order Cancellation](patterns/confirmed-order-cancellation.md)
- [📋 Admin Tooling Consolidation](patterns/admin-tooling-consolidation.md)
- [📋 Circuit Breaker Pattern](patterns/circuit-breaker-pattern.md)
- [📋 Deterministic Id Hashing](patterns/deterministic-id-hashing.md)
- [📋 Health Observability](patterns/health-observability.md)
- [📋 Integration Patterns21a](patterns/integration-patterns-21a.md)
- [📋 Integration Patterns21b](patterns/integration-patterns-21b.md)
- [📋 Production Hardening](patterns/production-hardening.md)
- [📋 Test Content Blocks](patterns/test-content-blocks.md)

---

### Decider

1/1 complete (100%)

- [✅ Handler Factories](patterns/handler-factories.md)

---

### Event Sourcing

12/12 complete (100%)

- [✅ Durable Append via Workpool Actions](patterns/durable-append-via-workpool-actions.md)
- [✅ Durable Cross-Context Event Publication](patterns/durable-cross-context-event-publication.md)
- [✅ Ecst Fat Events](patterns/ecst-fat-events.md)
- [✅ Event Store Durability](patterns/event-store-durability.md)
- [✅ Event Store Durability Types](patterns/event-store-durability-types.md)
- [✅ Event Bus Abstraction](patterns/event-bus-abstraction.md)
- [✅ Event Store](patterns/event-store.md)
- [✅ Event Upcasting](patterns/event-upcasting.md)
- [✅ Idempotent Event Append](patterns/idempotent-event-append.md)
- [✅ Intent/Completion Event Pattern](patterns/intent-completion-event-pattern.md)
- [✅ Outbox Pattern for Action Results](patterns/outbox-pattern-for-action-results.md)
- [✅ Poison Event Handling](patterns/poison-event-handling.md)

---

### Implements

2/2 complete (100%)

- [✅ Progress calculation utilities for replay operations.](patterns/progress-calculation-utilities-for-replay-operations.md)
- [✅ Types for event replay and projection rebuilding.](patterns/types-for-event-replay-and-projection-rebuilding.md)

---

### Infra

1/24 complete (4%)

- [✅ Logging Infrastructure](patterns/logging-infrastructure.md)
- [📋 Agent Action Handler Factory — DS-2 Stub](patterns/agent-action-handler-factory-ds-2-stub.md)
- [📋 Agent Command Router — DS-4 Stub](patterns/agent-command-router-ds-4-stub.md)
- [📋 Agent Component - Approval Public API — DS-1 Stub](patterns/agent-component-approval-public-api-ds-1-stub.md)
- [📋 Agent Component - Audit Public API — DS-1 Stub](patterns/agent-component-audit-public-api-ds-1-stub.md)
- [📋 Agent Component - Checkpoint Public API — DS-1 Stub](patterns/agent-component-checkpoint-public-api-ds-1-stub.md)
- [📋 Agent Component - Command Public API — DS-1 Stub](patterns/agent-component-command-public-api-ds-1-stub.md)
- [📋 Agent Component - Dead Letter Public API — DS-1 Stub](patterns/agent-component-dead-letter-public-api-ds-1-stub.md)
- [📋 Agent Component Definition — DS-1 Stub](patterns/agent-component-definition-ds-1-stub.md)
- [📋 Agent Component Schema — DS-1 Stub](patterns/agent-component-schema-ds-1-stub.md)
- [📋 Agent Lifecycle FSM — DS-5 Stub](patterns/agent-lifecycle-fsm-ds-5-stub.md)
- [📋 Agent onComplete Handler Factory — DS-2 Stub](patterns/agent-on-complete-handler-factory-ds-2-stub.md)
- [📋 Agent Subscription Factory — DS-2 Stub](patterns/agent-subscription-factory-ds-2-stub.md)
- [📋 AgentBCConfig Evolution — DS-4 Stub](patterns/agent-bc-config-evolution-ds-4-stub.md)
- [📋 Checkpoint Status Extension for Agent Lifecycle FSM — DS-5 Stub](patterns/checkpoint-status-extension-for-agent-lifecycle-fsm-ds-5-stub.md)
- [📋 Command Bridge — DS-4 Stub](patterns/command-bridge-ds-4-stub.md)
- [📋 Cross-Component Query Types for Agent BC — DS-1 Stub](patterns/cross-component-query-types-for-agent-bc-ds-1-stub.md)
- [📋 EventBus Publish Update — DS-2 Stub](patterns/event-bus-publish-update-ds-2-stub.md)
- [📋 EventSubscription Discriminated Union — DS-2 Stub](patterns/event-subscription-discriminated-union-ds-2-stub.md)
- [📋 Lifecycle Audit Event Types — DS-5 Stub](patterns/lifecycle-audit-event-types-ds-5-stub.md)
- [📋 Lifecycle Command Handlers — DS-5 Stub](patterns/lifecycle-command-handlers-ds-5-stub.md)
- [📋 Lifecycle Command Type Definitions — DS-5 Stub](patterns/lifecycle-command-type-definitions-ds-5-stub.md)
- [📋 Pattern Executor — DS-4 Stub](patterns/pattern-executor-ds-4-stub.md)
- [📋 Pattern Registry — DS-4 Stub](patterns/pattern-registry-ds-4-stub.md)

---

### Opportunity 1

0/1 complete (0%)

- [📋 Themed Decision Architecture](patterns/themed-decision-architecture.md)

---

### Pattern

3/3 complete (100%)

- [✅ CMS Repository](patterns/cms-repository.md)
- [✅ Correlation Chain System](patterns/correlation-chain-system.md)
- [✅ Process Manager Lifecycle](patterns/process-manager-lifecycle.md)

---

### Process Enhancements

3/4 complete (75%)

- [✅ Codec Driven Reference Generation](patterns/codec-driven-reference-generation.md)
- [✅ Process Metadata Expansion](patterns/process-metadata-expansion.md)
- [✅ Repo Level Docs Generation](patterns/repo-level-docs-generation.md)
- [🚧 Process Enhancements](patterns/process-enhancements.md)

---

### Projection

6/6 complete (100%)

- [✅ Partition Key Helper Functions](patterns/partition-key-helper-functions.md)
- [✅ Per-Projection Partition Configuration](patterns/per-projection-partition-configuration.md)
- [✅ Projection Complexity Classifier](patterns/projection-complexity-classifier.md)
- [✅ Projection Checkpointing](patterns/projection-checkpointing.md)
- [✅ Workpool Partition Key Types](patterns/workpool-partition-key-types.md)
- [✅ Workpool Partitioning Strategy](patterns/workpool-partitioning-strategy.md)

---

## Dependencies

Pattern relationships and dependencies:

```mermaid
graph TD
    HandlerFactories --> DeciderPattern
    Agent_Lifecycle_FSM___DS_5_Stub ..-> AgentCommandInfrastructure
    Lifecycle_Command_Type_Definitions___DS_5_Stub ..-> AgentCommandInfrastructure
    Lifecycle_Command_Handlers___DS_5_Stub ..-> AgentCommandInfrastructure
    Lifecycle_Audit_Event_Types___DS_5_Stub ..-> AgentCommandInfrastructure
    Checkpoint_Status_Extension_for_Agent_Lifecycle_FSM___DS_5_Stub ..-> AgentCommandInfrastructure
    Cross_Component_Query_Types_for_Agent_BC___DS_1_Stub --> AgentBCConfig
    Cross_Component_Query_Types_for_Agent_BC___DS_1_Stub ..-> AgentBCComponentIsolation
    Pattern_Registry___DS_4_Stub ..-> AgentCommandInfrastructure
    Pattern_Executor___DS_4_Stub ..-> AgentCommandInfrastructure
    Agent_Command_Router___DS_4_Stub ..-> AgentCommandInfrastructure
    Command_Bridge___DS_4_Stub ..-> AgentCommandInfrastructure
    AgentBCConfig_Evolution___DS_4_Stub ..-> AgentCommandInfrastructure
    Agent_onComplete_Handler_Factory___DS_2_Stub ..-> AgentLLMIntegration
    EventBus_Publish_Update___DS_2_Stub ..-> AgentLLMIntegration
    EventSubscription_Discriminated_Union___DS_2_Stub ..-> AgentLLMIntegration
    Agent_Subscription_Factory___DS_2_Stub ..-> AgentLLMIntegration
    Agent_Action_Handler_Factory___DS_2_Stub ..-> AgentLLMIntegration
    CMSRepository --> CMSDualWrite
    ProcessManagerLifecycle --> EventBusAbstraction
    ProcessManager --> EventBusAbstraction
    ProjectionCheckpointing --> EventStoreFoundation
    Command_Config_Partition_Key_Validation --> WorkpoolPartitioningStrategy
    Command_Config_Partition_Key_Validation ..-> WorkpoolPartitioningStrategy
    CommandOrchestrator --> EventStore
    CommandOrchestrator --> CommandBus
    CommandOrchestrator --> MiddlewarePipeline
    CommandOrchestrator --> Workpool
    MiddlewarePipeline --> CommandBusFoundation
    InvariantFramework --> BoundedContextFoundation
    Event_Store_Durability_Types --> EventStoreFoundation
    Event_Store_Durability_Types --> DurableFunctionAdapters
    Event_Store_Durability_Types --> Workpool
    Event_Store_Durability_Types ..-> EventStoreDurability
    Durable_Cross_Context_Event_Publication --> Workpool
    Durable_Cross_Context_Event_Publication --> idempotentAppend
    Durable_Cross_Context_Event_Publication --> WorkpoolPartitioningStrategy
    Durable_Cross_Context_Event_Publication --> EventBusAbstraction
    Durable_Cross_Context_Event_Publication ..-> EventStoreDurability
    Poison_Event_Handling --> EventStoreFoundation
    Poison_Event_Handling --> Workpool
    Poison_Event_Handling ..-> EventStoreDurability
    Outbox_Pattern_for_Action_Results --> idempotentAppend
    Outbox_Pattern_for_Action_Results --> ActionRetrier
    Outbox_Pattern_for_Action_Results --> Workpool
    Outbox_Pattern_for_Action_Results ..-> EventStoreDurability
    Intent_Completion_Event_Pattern --> EventStoreFoundation
    Intent_Completion_Event_Pattern --> idempotentAppend
    Intent_Completion_Event_Pattern ..-> EventStoreDurability
    Event_Store_Durability --> EventStoreFoundation
    Event_Store_Durability --> DurableFunctionAdapters
    Event_Store_Durability --> WorkpoolPartitioningStrategy
    Event_Store_Durability ..-> EventStoreDurability
    Idempotent_Event_Append --> EventStoreFoundation
    Idempotent_Event_Append ..-> EventStoreDurability
    Durable_Append_via_Workpool_Actions --> idempotentAppend
    Durable_Append_via_Workpool_Actions --> Workpool
    Durable_Append_via_Workpool_Actions --> WorkpoolPartitioningStrategy
    Durable_Append_via_Workpool_Actions ..-> EventStoreDurability
    CorrelationChainSystem --> EventStoreFoundation
    DualWriteContract --> BoundedContextIdentity
    Agent_Component_Schema___DS_1_Stub ..-> AgentBCComponentIsolation
    Agent_Component___Dead_Letter_Public_API___DS_1_Stub --> AgentDeadLetter
    Agent_Component___Dead_Letter_Public_API___DS_1_Stub ..-> AgentBCComponentIsolation
    Agent_Component_Definition___DS_1_Stub --> AgentBCConfig
    Agent_Component_Definition___DS_1_Stub ..-> AgentBCComponentIsolation
    Agent_Component___Command_Public_API___DS_1_Stub --> EmittedAgentCommand
    Agent_Component___Command_Public_API___DS_1_Stub ..-> AgentBCComponentIsolation
    Agent_Component___Checkpoint_Public_API___DS_1_Stub --> AgentCheckpoint
    Agent_Component___Checkpoint_Public_API___DS_1_Stub ..-> AgentBCComponentIsolation
    Agent_Component___Audit_Public_API___DS_1_Stub --> AgentAuditEvent
    Agent_Component___Audit_Public_API___DS_1_Stub ..-> AgentBCComponentIsolation
    Agent_Component___Approval_Public_API___DS_1_Stub --> PendingApproval
    Agent_Component___Approval_Public_API___DS_1_Stub --> HumanInLoopConfig
    Agent_Component___Approval_Public_API___DS_1_Stub ..-> AgentBCComponentIsolation
    Workpool_Partition_Key_Types --> EventBusAbstraction
    Workpool_Partition_Key_Types ..-> WorkpoolPartitioningStrategy
    Workpool_Partitioning_Strategy ..-> WorkpoolPartitioningStrategy
    Partition_Key_Helper_Functions --> EventBusAbstraction
    Partition_Key_Helper_Functions ..-> WorkpoolPartitioningStrategy
    Per_Projection_Partition_Configuration ..-> WorkpoolPartitioningStrategy
    Projection_Complexity_Classifier ..-> WorkpoolPartitioningStrategy
    Types_for_event_replay_and_projection_rebuilding_ ..-> EventReplayInfrastructure
    Progress_calculation_utilities_for_replay_operations_ ..-> EventReplayInfrastructure
    RepoLevelDocsGeneration -.-> ProcessMetadataExpansion
    WorkpoolPartitioningStrategy -.-> DurableFunctionAdapters
    SagaOrchestration -.-> CommandBusFoundation
    SagaOrchestration -.-> BoundedContextFoundation
    ReservationPattern -.-> DynamicConsistencyBoundaries
    ReactiveProjections -.-> ProjectionCategories
    ProjectionCategories -.-> DeciderPattern
    ProductionHardening -.-> ReactiveProjections
    ProductionHardening -.-> DurableFunctionAdapters
    IntegrationPatterns21b -.-> IntegrationPatterns21a
    IntegrationPatterns21a -.-> EcstFatEvents
    HealthObservability -.-> EventReplayInfrastructure
    HealthObservability -.-> WorkpoolPartitioningStrategy
    EventStoreDurability -.-> EventStoreFoundation
    EventStoreDurability -.-> DurableFunctionAdapters
    EventStoreDurability -.-> WorkpoolPartitioningStrategy
    EventReplayInfrastructure -.-> EventStoreFoundation
    EventReplayInfrastructure -.-> DurableFunctionAdapters
    EventReplayInfrastructure -.-> EventStoreDurability
    EcstFatEvents -.-> DeciderPattern
    DynamicConsistencyBoundaries -.-> DeciderPattern
    DurableFunctionAdapters -.-> DCB
    DurableEventsIntegration -.-> ProductionHardening
    DurableEventsIntegration -.-> DurableFunctionAdapters
    DurableEventsIntegration -.-> EventReplayInfrastructure
    DeterministicIdHashing -.-> EventStoreFoundation
    DeciderPattern -.-> platform_fsm
    ConfirmedOrderCancellation -.-> SagaOrchestration
    ConfirmedOrderCancellation -.-> AgentAsBoundedContext
    CommandBusFoundation -.-> EventStoreFoundation
    CircuitBreakerPattern -.-> DurableFunctionAdapters
    BoundedContextFoundation -.-> EventStoreFoundation
    BoundedContextFoundation -.-> CommandBusFoundation
    BddTestingInfrastructure -.-> DeciderPattern
    AgentLLMIntegration -.-> AgentBCComponentIsolation
    AgentCommandInfrastructure -.-> AgentLLMIntegration
    AgentBCComponentIsolation -.-> AgentAsBoundedContext
    AgentAsBoundedContext -.-> ReactiveProjections
    AgentAsBoundedContext -.-> EcstFatEvents
    AdminToolingConsolidation -.-> EventReplayInfrastructure
    AdminToolingConsolidation -.-> HealthObservability
    AdminToolingConsolidation -.-> CircuitBreakerPattern
    ExampleAppModernization -.-> DynamicConsistencyBoundaries
    ExampleAppModernization -.-> ReactiveProjections
    ExampleAppModernization -.-> EcstFatEvents
    ExampleAppModernization -.-> ReservationPattern
    AgentChurnRiskCompletion -.-> AgentCommandInfrastructure
```

---
