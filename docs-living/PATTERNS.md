# Pattern Registry

**Purpose:** Quick reference for discovering and implementing patterns
**Detail Level:** Overview with links to details

---

## Progress

**Overall:** [████████████░░░░░░░░] 90/152 (59% complete)

| Status      | Count |
| ----------- | ----- |
| ✅ Completed | 90    |
| 🚧 Active   | 10    |
| 📋 Planned  | 52    |
| **Total**   | 152   |

---

## Categories

- [Agent On Complete](#agent-on-complete) (1)
- [Arch](#arch) (29)
- [Command](#command) (9)
- [Core](#core) (2)
- [CQRS](#cqrs) (2)
- [DDD](#ddd) (33)
- [Decider](#decider) (3)
- [Event Sourcing](#event-sourcing) (13)
- [Implements](#implements) (2)
- [Infra](#infra) (26)
- [Opportunity 1](#opportunity-1) (1)
- [Pattern](#pattern) (3)
- [Process Enhancements](#process-enhancements) (2)
- [Projection](#projection) (13)
- [Saga](#saga) (8)
- [Testing Infrastructure](#testing-infrastructure) (5)

---

## All Patterns

| Pattern                                                                 | Category               | Status    | Description                                                                                                                 |
| ----------------------------------------------------------------------- | ---------------------- | --------- | --------------------------------------------------------------------------------------------------------------------------- |
| ✅ Active Reservations Projection                                        | Projection             | completed | Tracks active stock reservations and updates stock levels.                                                                  |
| ✅ Agent Action Handler                                                  | Arch                   | completed | Agent action handler for churn risk detection.                                                                              |
| ✅ Agent Churn Risk Completion Executable Tests                          | Agent On Complete      | completed | As a system operator I want agent failures to create dead letters for retry So that no events are silently lost...          |
| ✅ Agent Command Infrastructure                                          | DDD                    | completed | Problem: Three interconnected gaps in agent command infrastructure: 1.                                                      |
| ✅ Agent On Complete Handler                                             | Arch                   | completed | Workpool job completion handler for agent BC.                                                                               |
| ✅ App Composition Root                                                  | Arch                   | completed | Application composition root.                                                                                               |
| ✅ Bdd Testing Infrastructure Executable Tests                           | Testing Infrastructure | completed | As a platform developer I want integration tests to be properly isolated So that tests don't interfere with each...         |
| ✅ Bdd Testing Infrastructure Executable Tests                           | Testing Infrastructure | completed | As a platform maintainer I want all platform packages to have BDD test coverage So that public APIs are documented...       |
| ✅ BDD World                                                             | Testing Infrastructure | completed | As a BDD test author I want world/state management utilities So that I can manage scenario context across steps The...      |
| ✅ Bounded Context Identity                                              | DDD                    | completed | BoundedContextFoundation:bounded-context-identity Core identification contract for bounded contexts, providing...           |
| ✅ CMS Dual Write                                                        | Core                   | completed | Core types for Command Model State - the continuously updated aggregate snapshot maintained atomically alongside...         |
| ✅ CMS Repository                                                        | Pattern                | completed | Factory for typed data access with automatic schema upcasting in dual-write handlers.                                       |
| ✅ Codec Driven Reference Generation                                     | Process Enhancements   | completed | Reference documentation is specified via 11 recipe `.feature` files in `architect/recipes/`.                                |
| ✅ Command Bus                                                           | Command                | completed | Type-safe client for the Convex Command Bus component providing infrastructure-level idempotency.                           |
| ✅ Command Orchestrator                                                  | Command                | completed | The CommandOrchestrator encapsulates the 7-step dual-write + projection execution pattern that is central to this...        |
| ✅ Command Registry                                                      | Arch                   | completed | Command registry with Zod validation schemas per command type.                                                              |
| ✅ Correlation Chain System                                              | Pattern                | completed | Correlation types for tracking causal relationships in command-event flows.                                                 |
| ✅ Cross Context Read Model                                              | CQRS                   | completed | Cross-context query APIs.                                                                                                   |
| ✅ Customer Cancellations Projection                                     | Projection             | completed | Customer cancellation history with rolling 30-day window.                                                                   |
| ✅ DCB Scope Key Utilities                                               | DDD                    | completed | Re-export the canonical shared scope-key contract used across platform packages.                                            |
| ✅ DCB Types                                                             | DDD                    | completed | Types for scope-based multi-entity coordination within bounded contexts.                                                    |
| ✅ Dual Write Contract                                                   | Core                   | completed | BoundedContextFoundation:dual-write-contract Type-safe contract for bounded contexts using the dual-write pattern,...       |
| ✅ Durable Append via Workpool Actions                                   | Event Sourcing         | completed | Failed event appends from async contexts are retried via Workpool actions with exponential backoff until success or...      |
| ✅ Durable Cross-Context Event Publication                               | Event Sourcing         | completed | Cross-context events use Workpool-backed publication with tracking, retry, and dead letter handling.                        |
| ✅ Durable Append Action                                                 | Arch                   | completed | Durable Append - Workpool-backed event append with retry.                                                                   |
| ✅ Event Replay Infrastructure Types                                     | Implements             | completed | Types for event replay and projection rebuilding.                                                                           |
| ✅ Event Store Durability                                                | Event Sourcing         | completed | Guaranteed event persistence patterns for Convex-native event sourcing.                                                     |
| ✅ Event Store Durability Types                                          | Event Sourcing         | completed | Core types for durable event persistence patterns: - Outbox pattern for action result capture - Idempotent event...         |
| ✅ Event Bus Abstraction                                                 | Event Sourcing         | completed | Durable event pub/sub using Workpool for parallelism, retries, and dead letter handling.                                    |
| ✅ Event Store                                                           | Event Sourcing         | completed | Central event storage component for Event Sourcing.                                                                         |
| ✅ Event Subscription Registry                                           | Arch                   | completed | EventBus pub/sub subscription definitions.                                                                                  |
| ✅ Event Upcasting                                                       | Event Sourcing         | completed | Transforms events from older schema versions to current version at read time.                                               |
| ✅ Foundation Infrastructure                                             | Arch                   | completed | Consolidates old roadmap phases 0-13 into a single completed milestone.                                                     |
| ✅ Handler Factories                                                     | Decider                | completed | The Decider pattern separates pure business logic from infrastructure concerns, enabling unit testing without...            |
| ✅ Idempotent Event Append                                               | Event Sourcing         | completed | Ensures each logical event is stored exactly once in the event store, regardless of how many times the append...            |
| ✅ Integration Dead Letters                                              | Arch                   | completed | Dead letter queue management for cross-context event publications.                                                          |
| ✅ Integration Event Handlers                                            | Arch                   | completed | Integration event handlers.                                                                                                 |
| ✅ Integration Event Schemas                                             | Arch                   | completed | Integration event schema definitions for cross-context communication.                                                       |
| ✅ Integration Routes                                                    | Arch                   | completed | Integration event routes.                                                                                                   |
| ✅ Intent/Completion Event Pattern                                       | Event Sourcing         | completed | Long-running operations bracket with intent and completion events for visibility, timeout detection, and...                 |
| ✅ Invariant Framework                                                   | DDD                    | completed | Factory for declarative business rule validation with typed error codes.                                                    |
| ✅ Inventory Command Configs                                             | Command                | completed | Command configs for 7 inventory commands.                                                                                   |
| ✅ Inventory Command Handlers                                            | Command                | completed | Inventory command handlers implementing the dual-write pattern.                                                             |
| ✅ Inventory Deciders                                                    | Decider                | completed | Pure decision functions for Inventory aggregate (product + reservation).                                                    |
| ✅ Inventory Domain Events                                               | Event Sourcing         | completed | Inventory BC domain events (7 types).                                                                                       |
| ✅ Inventory Internal Mutations                                          | Arch                   | completed | Internal mutations for Inventory operations.                                                                                |
| ✅ Inventory Public API                                                  | Arch                   | completed | App-level public API for Inventory bounded context.                                                                         |
| ✅ Logging Infrastructure                                                | Infra                  | completed | Factory for domain-specific loggers with scope prefixes and level filtering.                                                |
| ✅ Middleware Pipeline                                                   | Command                | completed | Orchestrates middleware execution in the correct order.                                                                     |
| ✅ Mock Payment Actions                                                  | Saga                   | completed | Mock Payment Actions - Simulated external payment service.                                                                  |
| ✅ Order Command Configs                                                 | Command                | completed | Command configs for 6 order commands.                                                                                       |
| ✅ Order Command Handlers                                                | Command                | completed | Order command handlers implementing the dual-write pattern.                                                                 |
| ✅ Order Deciders                                                        | Decider                | completed | Pure decision functions for Order aggregate.                                                                                |
| ✅ Order Domain Events                                                   | Event Sourcing         | completed | Orders BC domain events (6 types, 2 schema versions).                                                                       |
| ✅ Order Fulfillment Saga                                                | Saga                   | completed | Order Fulfillment Saga.                                                                                                     |
| ✅ Order Items Projection                                                | Projection             | completed | Order line items read model.                                                                                                |
| ✅ Order Management Infrastructure                                       | Arch                   | completed | Infrastructure setup for the order-management application.                                                                  |
| ✅ Order Notification PM                                                 | Saga                   | completed | Process manager: OrderConfirmed -> SendNotification command.                                                                |
| ✅ Order Public API                                                      | Arch                   | completed | App-level public API for Orders bounded context.                                                                            |
| ✅ Order Summary Projection                                              | Projection             | completed | OrderSummary projection handlers (app-level).                                                                               |
| ✅ Order With Inventory Projection                                       | Projection             | completed | OrderWithInventoryStatus cross-context projection handlers (app-level).                                                     |
| ✅ Outbox Pattern for Action Results                                     | Event Sourcing         | completed | Captures external API results (success or failure) as domain events using the `onComplete` callback guarantee from...       |
| ✅ Package Architecture                                                  | DDD                    | completed | Provenance (refactoring carve-out, META-pattern): PackageArchitecture is a structural meta-pattern describing...            |
| ✅ Partition Key Helper Functions                                        | Projection             | completed | Standardized partition key generation for per-entity event ordering and OCC prevention in Workpool-based processing.        |
| ✅ Payment Outbox Handler                                                | Saga                   | completed | Payment Outbox Handler - Captures payment action results as events.                                                         |
| ✅ Per-Projection Partition Configuration                                | Projection             | completed | Defines configuration types and constants for projection partitioning including parallelism recommendations based on...     |
| ✅ Poison Event Handling                                                 | Event Sourcing         | completed | Events that cause projection processing failures are tracked; after N failures, they are quarantined and skipped to...      |
| ✅ Polling Utilities                                                     | Testing Infrastructure | completed | As a developer writing integration tests I want async polling utilities So that I can wait for eventual consistency...      |
| ✅ Process Manager                                                       | DDD                    | completed | Process Manager module for event-reactive coordination.                                                                     |
| ✅ Process Manager Lifecycle                                             | Pattern                | completed | FSM for managing PM state transitions (idle/processing/completed/failed) with validation.                                   |
| ✅ Product Catalog Projection                                            | Projection             | completed | Product catalog read model.                                                                                                 |
| ✅ Projection Complexity Classifier                                      | Projection             | completed | Analyzes projection characteristics and recommends appropriate partition strategies using a decision tree approach.         |
| ✅ Projection Checkpointing                                              | Projection             | completed | Projection checkpoint helper for idempotent event processing.                                                               |
| ✅ Projection Dead Letters                                               | Arch                   | completed | Dead letter queue for failed projection and subscription handlers.                                                          |
| ✅ Projection Definitions                                                | Arch                   | completed | Registry of all projection definitions and replay handler registry.                                                         |
| ✅ Query Abstraction                                                     | CQRS                   | completed | Query factory functions for creating type-safe read model queries.                                                          |
| ✅ Rate Limit Definitions                                                | Arch                   | completed | Centralized rate limit configuration for the order-management application.                                                  |
| ✅ Reactive Projection Conflict Detection                                | DDD                    | completed | As a platform developer I want conflicts detected and resolved automatically So that data integrity is maintained...        |
| ✅ Reactive Projection Eligibility                                       | DDD                    | completed | As a platform developer I want only view projections to support reactive updates So that system resources are optimized...  |
| ✅ Reactive Projection Hybrid Model                                      | DDD                    | completed | As a frontend developer I want projections that combine durability with instant feedback So that users see optimistic...    |
| ✅ Reactive Projection Shared Evolve                                     | DDD                    | completed | As a platform developer I want evolve logic shared between client and server So that state transformations are always...    |
| ✅ Replay Progress Utilities                                             | Implements             | completed | Progress calculation utilities for replay operations.                                                                       |
| ✅ Reservation Release PM                                                | Saga                   | completed | Process manager: OrderCancelled -> ReleaseReservation command.                                                              |
| ✅ Saga Completion Handler                                               | Saga                   | completed | Workflow onComplete callback handler.                                                                                       |
| ✅ Saga Orchestration Executable Tests                                   | DDD                    | completed | Provenance: This file was authored under the refactoring carve-out to expose SagaOrchestration in the PatternGraph.         |
| ✅ Saga Registry                                                         | Saga                   | completed | Saga registry providing idempotent saga start (startSagaIfNotExists), status tracking, and Zod payload validation at...     |
| ✅ Saga Router                                                           | Saga                   | completed | Routes domain events to saga workflows.                                                                                     |
| ✅ Test Environment Guards                                               | Testing Infrastructure | completed | As a platform developer I want environment guards for test-only functions So that test utilities cannot be called in...     |
| ✅ Workpool Partition Key Types                                          | Projection             | completed | Provides type definitions for partition key strategies that ensure per-entity event ordering and prevent OCC conflicts.     |
| ✅ Workpool Partitioning Strategy                                        | Projection             | completed | Standardized partition key patterns for event ordering and OCC prevention in Workpool-based projection processing.          |
| 🚧 Agent as Bounded Context - AI-Driven Event Reactors                  | DDD                    | active    | Demonstrates the Agent as Bounded Context pattern where AI agents subscribe to domain events via EventBus and emit...       |
| 🚧 Agent BC Component Isolation                                         | DDD                    | active    | Problem: Agent BC tables (`agentCheckpoints`, `agentAuditEvents`, `agentDeadLetters`, `agentCommands`,...                   |
| 🚧 Agent LLM Integration                                                | DDD                    | active    | Problem: The agent event handler (`handleChurnRiskEvent`) is a Convex mutation that cannot call external APIs.              |
| 🚧 Command Config Partition Key Validation                              | Command                | active    | Validates that all projection configurations in a command config have explicit partition keys defined.                      |
| 🚧 Confirmed Order Cancellation                                         | DDD                    | active    | Problem: The Order FSM treats `confirmed` as terminal.                                                                      |
| 🚧 DCB Retry Execution                                                  | Arch                   | active    | DCB Retry Execution — reference implementation for integrating withDCBRetry into command handlers.                          |
| 🚧 Process Enhancements                                                 | Process Enhancements   | active    | Vision: Transform the delivery process from a documentation tool into a delivery operating system.                          |
| 🚧 Projection Categories Executable Tests                               | DDD                    | active    | As a platform developer I want projections classified into four distinct categories So that I can route queries and...      |
| 🚧 Projection Categories Executable Tests                               | DDD                    | active    | As a platform developer I want projections to require explicit category declaration So that all projections have...         |
| 🚧 Projection Categories Executable Tests                               | DDD                    | active    | As a platform developer I want to query projections by category from the registry So that I can target specific...          |
| 📋 Admin Tooling Consolidation                                          | DDD                    | planned   | Problem: Admin functionality is scattered across the codebase: - Dead letter queue at...                                    |
| 📋 Agent Action Handler Factory — DS-2 Stub                             | Infra                  | planned   | Agent Action Handler Factory — DS-2 Stub Replaces `createAgentEventHandler` (init.ts) with an action-based handler...       |
|  Agent Approval Workflow Tools                                          | Arch                   | planned   | Agent Approval Workflow Tools Provides utilities for managing human-in-loop approval workflow for low-confidence...         |
|  Agent BC Utility Functions                                             | Arch                   | planned   | Agent BC Utility Functions Shared utilities for agent bounded context operations.                                           |
|  Agent Command Emission Tool                                            | Arch                   | planned   | Agent Command Emission Tool Provides utilities for emitting commands from the agent.                                        |
| 📋 Agent Command Router — DS-4 Stub                                     | Infra                  | planned   | Agent Command Router — DS-4 Stub Maps agent command types to their orchestrator routes.                                     |
| 📋 Agent Component - Approval Public API — DS-1 Stub                    | Infra                  | planned   | Agent Component - Approval Public API — DS-1 Stub Provides human-in-loop approval workflow for agent actions.               |
| 📋 Agent Component - Audit Public API — DS-1 Stub                       | Infra                  | planned   | Agent Component - Audit Public API — DS-1 Stub Provides audit event recording and querying for agent decision...            |
| 📋 Agent Component - Checkpoint Public API — DS-1 Stub                  | Infra                  | planned   | Agent Component - Checkpoint Public API — DS-1 Stub Provides checkpoint operations for exactly-once event processing...     |
| 📋 Agent Component - Command Public API — DS-1 Stub                     | Infra                  | planned   | Agent Component - Command Public API — DS-1 Stub Provides command recording, status tracking, and querying for...           |
| 📋 Agent Component - Dead Letter Public API — DS-1 Stub                 | Infra                  | planned   | Agent Component - Dead Letter Public API — DS-1 Stub Provides dead letter recording, status management, and querying for... |
| 📋 Agent Component Definition — DS-1 Stub                               | Infra                  | planned   | Agent Component Definition — DS-1 Stub Defines the agent bounded context as a Convex component with isolated database.      |
| 📋 Agent Component Schema — DS-1 Stub                                   | Infra                  | planned   | Agent Component Schema — DS-1 Stub Isolated database for all agent-specific state.                                          |
| 📋 Agent Lifecycle FSM — DS-5 Stub                                      | Infra                  | planned   | Agent Lifecycle FSM — DS-5 Stub Formal state machine governing agent start/pause/resume/stop/reconfigure transitions.       |
| 📋 Agent onComplete Handler Factory — DS-2 Stub                         | Infra                  | planned   | Agent onComplete Handler Factory — DS-2 Stub Creates a Workpool onComplete mutation that persists all agent state...        |
| 📋 Agent Subscription Factory — DS-2 Stub                               | Infra                  | planned   | Agent Subscription Factory — DS-2 Stub Extends the existing `createAgentSubscription` factory to produce...                 |
| 📋 Agent Admin Frontend                                                 | DDD                    | planned   | Problem: The admin UI at `/admin/agents` has implementation gaps identified in the E2E feature file...                      |
| 📋 AgentBCConfig Evolution — DS-4 Stub                                  | Infra                  | planned   | AgentBCConfig Evolution — DS-4 Stub Evolves AgentBCConfig to support pattern-based detection alongside the legacy...        |
| 📋 Checkpoint Status Extension for Agent Lifecycle FSM — DS-5 Stub      | Infra                  | planned   | Checkpoint Status Extension for Agent Lifecycle FSM — DS-5 Stub Extends the existing AgentCheckpointStatus (3 states)...    |
|  Churn Risk Agent Configuration                                         | Arch                   | planned   | Churn Risk Agent Configuration Defines the configuration for the churn risk detection agent.                                |
|  Churn Risk Pattern Definition                                          | Arch                   | planned   | Churn Risk Pattern Definition Defines the pattern detection rules for identifying customers at risk of churning.            |
| 📋 Circuit Breaker Pattern                                              | DDD                    | planned   | Problem: External API failures (Stripe, SendGrid, webhooks) cascade through the system.                                     |
| 📋 Command Bridge — DS-4 Stub                                           | Infra                  | planned   | Command Bridge — DS-4 Stub Bridges agent command recording (onComplete step 2) with command routing through...              |
| 📋 Component Boundary Authentication Convention                         | DDD                    | planned   | Problem: Identity-bearing component mutations still trust caller-provided actor fields without a canonical...               |
|  Confidence Calculation Utilities for Agent BC                          | Arch                   | planned   | Confidence Calculation Utilities for Agent BC Shared utilities for calculating churn risk confidence scores.                |
| 📋 Cross-Component Query Types for Agent BC — DS-1 Stub                 | Infra                  | planned   | Cross-Component Query Types for Agent BC — DS-1 Stub Defines the data shapes for argument injection pattern.                |
|  Customer Utility Functions for Agent BC                                | Arch                   | planned   | Customer Utility Functions for Agent BC Shared utilities for extracting customer information from events.                   |
| 📋 Deterministic Id Hashing                                             | DDD                    | planned   | Problem: TTL-based reservations work well for multi-step flows (registration wizards), but add overhead for simple...       |
|  Durable Command Orchestrator - Intent/Completion Bracketing Wrapper    | Command                | planned   | Durable Command Orchestrator - Intent/Completion Bracketing Wrapper Wraps the standard CommandOrchestrator with...          |
| 📋 EventBus Publish Update — DS-2 Stub                                  | Infra                  | planned   | EventBus Publish Update — DS-2 Stub Shows the two changes needed to support the EventSubscription discriminated...          |
| 📋 Event Correctness Migration                                          | DDD                    | planned   | Problem: `appendToStream` idempotency semantics, `globalPosition` precision, and process-manager lifecycle parity are...    |
| 📋 EventSubscription Discriminated Union — DS-2 Stub                    | Infra                  | planned   | EventSubscription Discriminated Union — DS-2 Stub Extends EventSubscription from a single-interface (mutation-only) to a... |
| 📋 Health Observability                                                 | DDD                    | planned   | Problem: No Kubernetes integration (readiness/liveness probes), no metrics for projection lag, event throughput, or...      |
| 📋 Integration Patterns21a                                              | DDD                    | planned   | Problem: Cross-context communication is ad-hoc.                                                                             |
| 📋 Integration Patterns21b                                              | DDD                    | planned   | Problem: Schema evolution breaks consumers.                                                                                 |
|  Intent Admin Functions - CRUD operations for commandIntents table.     | Infra                  | planned   | Intent Admin Functions - CRUD operations for commandIntents table.                                                          |
| 📋 Lifecycle Audit Event Types — DS-5 Stub                              | Infra                  | planned   | Lifecycle Audit Event Types — DS-5 Stub Six new audit event types for agent lifecycle transitions.                          |
| 📋 Lifecycle Command Handlers — DS-5 Stub                               | Infra                  | planned   | Lifecycle Command Handlers — DS-5 Stub Five internalMutation handlers for agent lifecycle transitions.                      |
| 📋 Lifecycle Command Type Definitions — DS-5 Stub                       | Infra                  | planned   | Lifecycle Command Type Definitions — DS-5 Stub Five lifecycle commands with their argument types, result types, and...      |
|  LLM Configuration and Runtime Exports                                  | Arch                   | planned   | LLM Configuration and Runtime Exports...                                                                                    |
|  LLM Provider Configuration                                             | Arch                   | planned   | LLM Provider Configuration Configures the language model for agent pattern analysis.                                        |
|  OpenRouter Agent Runtime                                               | Arch                   | planned   | OpenRouter Agent Runtime Implements AgentRuntimeConfig using the Vercel AI SDK with OpenRouter.                             |
| 📋 Pattern Executor — DS-4 Stub                                         | Infra                  | planned   | Pattern Executor — DS-4 Stub Iterates an agent's pattern array, calling trigger() then analyze() for each pattern.          |
| 📋 Pattern Registry — DS-4 Stub                                         | Infra                  | planned   | Pattern Registry — DS-4 Stub Validates pattern definitions passed directly on AgentBCConfig.patterns.                       |
|  Poison Event Admin Functions - CRUD operations for poisonEvents table. | Infra                  | planned   | Poison Event Admin Functions - CRUD operations for poisonEvents table.                                                      |
| 📋 Production Hardening                                                 | DDD                    | planned   | Problem: Structured logging (Phase 13) exists but no metrics collection, distributed tracing, or admin tooling for...       |
|  Rebuild Demonstration - Projection rebuild from event stream.          | Projection             | planned   | Rebuild Demonstration - Projection rebuild from event stream.                                                               |
| 📋 Test Content Blocks                                                  | DDD                    | planned   | This feature demonstrates what content blocks are captured and rendered by the PRD generator.                               |
| 📋 Themed Decision Architecture                                         | Opportunity 1          | planned   | Decisions (ADRs, PDRs) should not be "dumped into same folder" when generated.                                              |
| 📋 Tranche0 Readiness Harness                                           | DDD                    | planned   | Problem: The remediation program cannot safely begin security or correctness migrations while `platform-store` lacks...     |
| 📋 Tranche0 Release Ci Docs Process Guardrails                          | DDD                    | planned   | Problem: `test.yml` ignores markdown and docs-only changes, release automation is not yet normalized around architect...    |
| 📋 Tranche1 Supporting Security Contract Sweep                          | DDD                    | planned   | Problem: Several tranche-1 gaps remain after the auth keystone: test-mode checks fail open, correlation IDs can be...       |

---

### Agent On Complete

1/1 complete (100%)

- [✅ Agent Churn Risk Completion Executable Tests](patterns/agent-churn-risk-completion-executable-tests.md)

---

### Arch

18/29 complete (62%)

- [✅ Agent Action Handler](patterns/agent-action-handler.md)
- [✅ Agent On Complete Handler](patterns/agent-on-complete-handler.md)
- [✅ App Composition Root](patterns/app-composition-root.md)
- [✅ Command Registry](patterns/command-registry.md)
- [✅ Durable Append Action](patterns/durable-append-action.md)
- [✅ Event Subscription Registry](patterns/event-subscription-registry.md)
- [✅ Foundation Infrastructure](patterns/foundation-infrastructure.md)
- [✅ Integration Dead Letters](patterns/integration-dead-letters.md)
- [✅ Integration Event Handlers](patterns/integration-event-handlers.md)
- [✅ Integration Event Schemas](patterns/integration-event-schemas.md)
- [✅ Integration Routes](patterns/integration-routes.md)
- [✅ Inventory Internal Mutations](patterns/inventory-internal-mutations.md)
- [✅ Inventory Public API](patterns/inventory-public-api.md)
- [✅ Order Management Infrastructure](patterns/order-management-infrastructure.md)
- [✅ Order Public API](patterns/order-public-api.md)
- [✅ Projection Dead Letters](patterns/projection-dead-letters.md)
- [✅ Projection Definitions](patterns/projection-definitions.md)
- [✅ Rate Limit Definitions](patterns/rate-limit-definitions.md)
- [🚧 DCB Retry Execution](patterns/dcb-retry-execution.md)
- [ Agent Approval Workflow Tools](patterns/agent-approval-workflow-tools.md)
- [ Agent BC Utility Functions](patterns/agent-bc-utility-functions.md)
- [ Agent Command Emission Tool](patterns/agent-command-emission-tool.md)
- [ Churn Risk Agent Configuration](patterns/churn-risk-agent-configuration.md)
- [ Churn Risk Pattern Definition](patterns/churn-risk-pattern-definition.md)
- [ Confidence Calculation Utilities for Agent BC](patterns/confidence-calculation-utilities-for-agent-bc.md)
- [ Customer Utility Functions for Agent BC](patterns/customer-utility-functions-for-agent-bc.md)
- [ LLM Configuration and Runtime Exports](patterns/llm-configuration-and-runtime-exports.md)
- [ LLM Provider Configuration](patterns/llm-provider-configuration.md)
- [ OpenRouter Agent Runtime](patterns/open-router-agent-runtime.md)

---

### Command

7/9 complete (78%)

- [✅ Command Bus](patterns/command-bus.md)
- [✅ Command Orchestrator](patterns/command-orchestrator.md)
- [✅ Inventory Command Configs](patterns/inventory-command-configs.md)
- [✅ Inventory Command Handlers](patterns/inventory-command-handlers.md)
- [✅ Middleware Pipeline](patterns/middleware-pipeline.md)
- [✅ Order Command Configs](patterns/order-command-configs.md)
- [✅ Order Command Handlers](patterns/order-command-handlers.md)
- [🚧 Command Config Partition Key Validation](patterns/command-config-partition-key-validation.md)
- [ Durable Command Orchestrator - Intent/Completion Bracketing Wrapper](patterns/durable-command-orchestrator-intent-completion-bracketing-wrapper.md)

---

### Core

2/2 complete (100%)

- [✅ CMS Dual Write](patterns/cms-dual-write.md)
- [✅ Dual Write Contract](patterns/dual-write-contract.md)

---

### CQRS

2/2 complete (100%)

- [✅ Cross Context Read Model](patterns/cross-context-read-model.md)
- [✅ Query Abstraction](patterns/query-abstraction.md)

---

### DDD

12/33 complete (36%)

- [✅ Agent Command Infrastructure](patterns/agent-command-infrastructure.md)
- [✅ Bounded Context Identity](patterns/bounded-context-identity.md)
- [✅ DCB Scope Key Utilities](patterns/dcb-scope-key-utilities.md)
- [✅ DCB Types](patterns/dcb-types.md)
- [✅ Invariant Framework](patterns/invariant-framework.md)
- [✅ Package Architecture](patterns/package-architecture.md)
- [✅ Process Manager](patterns/process-manager.md)
- [✅ Reactive Projection Conflict Detection](patterns/reactive-projection-conflict-detection.md)
- [✅ Reactive Projection Eligibility](patterns/reactive-projection-eligibility.md)
- [✅ Reactive Projection Hybrid Model](patterns/reactive-projection-hybrid-model.md)
- [✅ Reactive Projection Shared Evolve](patterns/reactive-projection-shared-evolve.md)
- [✅ Saga Orchestration Executable Tests](patterns/saga-orchestration-executable-tests.md)
- [🚧 Agent as Bounded Context - AI-Driven Event Reactors](patterns/agent-as-bounded-context-ai-driven-event-reactors.md)
- [🚧 Agent BC Component Isolation](patterns/agent-bc-component-isolation.md)
- [🚧 Agent LLM Integration](patterns/agent-llm-integration.md)
- [🚧 Confirmed Order Cancellation](patterns/confirmed-order-cancellation.md)
- [🚧 Projection Categories Executable Tests](patterns/projection-categories-executable-tests.md)
- [🚧 Projection Categories Executable Tests](patterns/projection-categories-executable-tests.md)
- [🚧 Projection Categories Executable Tests](patterns/projection-categories-executable-tests.md)
- [📋 Admin Tooling Consolidation](patterns/admin-tooling-consolidation.md)
- [📋 Agent Admin Frontend](patterns/agent-admin-frontend.md)
- [📋 Circuit Breaker Pattern](patterns/circuit-breaker-pattern.md)
- [📋 Component Boundary Authentication Convention](patterns/component-boundary-authentication-convention.md)
- [📋 Deterministic Id Hashing](patterns/deterministic-id-hashing.md)
- [📋 Event Correctness Migration](patterns/event-correctness-migration.md)
- [📋 Health Observability](patterns/health-observability.md)
- [📋 Integration Patterns21a](patterns/integration-patterns-21a.md)
- [📋 Integration Patterns21b](patterns/integration-patterns-21b.md)
- [📋 Production Hardening](patterns/production-hardening.md)
- [📋 Test Content Blocks](patterns/test-content-blocks.md)
- [📋 Tranche0 Readiness Harness](patterns/tranche-0-readiness-harness.md)
- [📋 Tranche0 Release Ci Docs Process Guardrails](patterns/tranche-0-release-ci-docs-process-guardrails.md)
- [📋 Tranche1 Supporting Security Contract Sweep](patterns/tranche-1-supporting-security-contract-sweep.md)

---

### Decider

3/3 complete (100%)

- [✅ Handler Factories](patterns/handler-factories.md)
- [✅ Inventory Deciders](patterns/inventory-deciders.md)
- [✅ Order Deciders](patterns/order-deciders.md)

---

### Event Sourcing

13/13 complete (100%)

- [✅ Durable Append via Workpool Actions](patterns/durable-append-via-workpool-actions.md)
- [✅ Durable Cross-Context Event Publication](patterns/durable-cross-context-event-publication.md)
- [✅ Event Store Durability](patterns/event-store-durability.md)
- [✅ Event Store Durability Types](patterns/event-store-durability-types.md)
- [✅ Event Bus Abstraction](patterns/event-bus-abstraction.md)
- [✅ Event Store](patterns/event-store.md)
- [✅ Event Upcasting](patterns/event-upcasting.md)
- [✅ Idempotent Event Append](patterns/idempotent-event-append.md)
- [✅ Intent/Completion Event Pattern](patterns/intent-completion-event-pattern.md)
- [✅ Inventory Domain Events](patterns/inventory-domain-events.md)
- [✅ Order Domain Events](patterns/order-domain-events.md)
- [✅ Outbox Pattern for Action Results](patterns/outbox-pattern-for-action-results.md)
- [✅ Poison Event Handling](patterns/poison-event-handling.md)

---

### Implements

2/2 complete (100%)

- [✅ Event Replay Infrastructure Types](patterns/event-replay-infrastructure-types.md)
- [✅ Replay Progress Utilities](patterns/replay-progress-utilities.md)

---

### Infra

1/26 complete (4%)

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
- [ Intent Admin Functions - CRUD operations for commandIntents table.](patterns/intent-admin-functions-crud-operations-for-command-intents-table.md)
- [📋 Lifecycle Audit Event Types — DS-5 Stub](patterns/lifecycle-audit-event-types-ds-5-stub.md)
- [📋 Lifecycle Command Handlers — DS-5 Stub](patterns/lifecycle-command-handlers-ds-5-stub.md)
- [📋 Lifecycle Command Type Definitions — DS-5 Stub](patterns/lifecycle-command-type-definitions-ds-5-stub.md)
- [📋 Pattern Executor — DS-4 Stub](patterns/pattern-executor-ds-4-stub.md)
- [📋 Pattern Registry — DS-4 Stub](patterns/pattern-registry-ds-4-stub.md)
- [ Poison Event Admin Functions - CRUD operations for poisonEvents table.](patterns/poison-event-admin-functions-crud-operations-for-poison-events-table.md)

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

1/2 complete (50%)

- [✅ Codec Driven Reference Generation](patterns/codec-driven-reference-generation.md)
- [🚧 Process Enhancements](patterns/process-enhancements.md)

---

### Projection

12/13 complete (92%)

- [✅ Active Reservations Projection](patterns/active-reservations-projection.md)
- [✅ Customer Cancellations Projection](patterns/customer-cancellations-projection.md)
- [✅ Order Items Projection](patterns/order-items-projection.md)
- [✅ Order Summary Projection](patterns/order-summary-projection.md)
- [✅ Order With Inventory Projection](patterns/order-with-inventory-projection.md)
- [✅ Partition Key Helper Functions](patterns/partition-key-helper-functions.md)
- [✅ Per-Projection Partition Configuration](patterns/per-projection-partition-configuration.md)
- [✅ Product Catalog Projection](patterns/product-catalog-projection.md)
- [✅ Projection Complexity Classifier](patterns/projection-complexity-classifier.md)
- [✅ Projection Checkpointing](patterns/projection-checkpointing.md)
- [✅ Workpool Partition Key Types](patterns/workpool-partition-key-types.md)
- [✅ Workpool Partitioning Strategy](patterns/workpool-partitioning-strategy.md)
- [ Rebuild Demonstration - Projection rebuild from event stream.](patterns/rebuild-demonstration-projection-rebuild-from-event-stream.md)

---

### Saga

8/8 complete (100%)

- [✅ Mock Payment Actions](patterns/mock-payment-actions.md)
- [✅ Order Fulfillment Saga](patterns/order-fulfillment-saga.md)
- [✅ Order Notification PM](patterns/order-notification-pm.md)
- [✅ Payment Outbox Handler](patterns/payment-outbox-handler.md)
- [✅ Reservation Release PM](patterns/reservation-release-pm.md)
- [✅ Saga Completion Handler](patterns/saga-completion-handler.md)
- [✅ Saga Registry](patterns/saga-registry.md)
- [✅ Saga Router](patterns/saga-router.md)

---

### Testing Infrastructure

5/5 complete (100%)

- [✅ Bdd Testing Infrastructure Executable Tests](patterns/bdd-testing-infrastructure-executable-tests.md)
- [✅ Bdd Testing Infrastructure Executable Tests](patterns/bdd-testing-infrastructure-executable-tests.md)
- [✅ BDD World](patterns/bdd-world.md)
- [✅ Polling Utilities](patterns/polling-utilities.md)
- [✅ Test Environment Guards](patterns/test-environment-guards.md)

---

## Dependencies

Pattern relationships and dependencies:

```mermaid
graph TD
    ActiveReservationsProjection --> InventoryCommandHandlers
    AdminToolingConsolidation -.-> CircuitBreakerPattern
    AdminToolingConsolidation -.-> EventReplayInfrastructure
    AdminToolingConsolidation -.-> HealthObservability
    Agent_Action_Handler_Factory___DS_2_Stub ..-> AgentLLMIntegration
    Agent_Approval_Workflow_Tools --> AgentAsBoundedContext
    Agent_as_Bounded_Context___AI_Driven_Event_Reactors -.-> ReactiveProjections
    Agent_as_Bounded_Context___AI_Driven_Event_Reactors ..-> AgentAsBoundedContext
    Agent_BC_Utility_Functions --> AgentAsBoundedContext
    Agent_Command_Emission_Tool --> AgentAsBoundedContext
    Agent_Command_Router___DS_4_Stub ..-> AgentCommandInfrastructure
    Agent_Component___Approval_Public_API___DS_1_Stub --> HumanInLoopConfig
    Agent_Component___Approval_Public_API___DS_1_Stub --> PendingApproval
    Agent_Component___Approval_Public_API___DS_1_Stub ..-> AgentBCComponentIsolation
    Agent_Component___Audit_Public_API___DS_1_Stub --> AgentAuditEvent
    Agent_Component___Audit_Public_API___DS_1_Stub ..-> AgentBCComponentIsolation
    Agent_Component___Checkpoint_Public_API___DS_1_Stub --> AgentCheckpoint
    Agent_Component___Checkpoint_Public_API___DS_1_Stub ..-> AgentBCComponentIsolation
    Agent_Component___Command_Public_API___DS_1_Stub --> EmittedAgentCommand
    Agent_Component___Command_Public_API___DS_1_Stub ..-> AgentBCComponentIsolation
    Agent_Component___Dead_Letter_Public_API___DS_1_Stub --> AgentDeadLetter
    Agent_Component___Dead_Letter_Public_API___DS_1_Stub ..-> AgentBCComponentIsolation
    Agent_Component_Definition___DS_1_Stub --> AgentBCConfig
    Agent_Component_Definition___DS_1_Stub ..-> AgentBCComponentIsolation
    Agent_Component_Schema___DS_1_Stub ..-> AgentBCComponentIsolation
    Agent_Lifecycle_FSM___DS_5_Stub ..-> AgentCommandInfrastructure
    Agent_onComplete_Handler_Factory___DS_2_Stub ..-> AgentLLMIntegration
    Agent_Subscription_Factory___DS_2_Stub ..-> AgentLLMIntegration
    AgentActionHandler --> AgentBCComponentIsolation
    AgentActionHandler --> AgentLLMIntegration
    AgentAdminFrontend -.-> AgentChurnRiskCompletion
    AgentBCComponentIsolation -.-> AgentAsBoundedContext
    AgentBCConfig_Evolution___DS_4_Stub ..-> AgentCommandInfrastructure
    AgentChurnRiskCompletionExecutableTests ..-> AgentChurnRiskCompletion
    AgentCommandInfrastructure -.-> AgentLLMIntegration
    AgentLLMIntegration -.-> AgentBCComponentIsolation
    AgentOnCompleteHandler --> AgentAsBoundedContext
    AgentOnCompleteHandler --> AgentLLMIntegration
    BddTestingInfrastructureExecutableTests ..-> BddTestingInfrastructure
    BDDWorld ..-> BddTestingInfrastructure
    Checkpoint_Status_Extension_for_Agent_Lifecycle_FSM___DS_5_Stub ..-> AgentCommandInfrastructure
    Churn_Risk_Agent_Configuration --> AgentAsBoundedContext
    Churn_Risk_Pattern_Definition --> AgentAsBoundedContext
    CMSRepository --> CMSDualWrite
    Command_Bridge___DS_4_Stub ..-> AgentCommandInfrastructure
    Command_Config_Partition_Key_Validation --> WorkpoolPartitioningStrategy
    Command_Config_Partition_Key_Validation ..-> WorkpoolPartitioningStrategy
    CommandOrchestrator --> CommandBus
    CommandOrchestrator --> EventStore
    CommandOrchestrator --> MiddlewarePipeline
    CommandRegistry --> InventoryCommandHandlers
    CommandRegistry --> OrderCommandHandlers
    ComponentBoundaryAuthenticationConvention -.-> Tranche0ReadinessHarness
    ComponentBoundaryAuthenticationConvention -.-> Tranche0ReleaseCiDocsProcessGuardrails
    Confidence_Calculation_Utilities_for_Agent_BC --> AgentAsBoundedContext
    ConfirmedOrderCancellation -.-> AgentAsBoundedContext
    ConfirmedOrderCancellation -.-> SagaOrchestration
    Cross_Component_Query_Types_for_Agent_BC___DS_1_Stub --> AgentBCConfig
    Cross_Component_Query_Types_for_Agent_BC___DS_1_Stub ..-> AgentBCComponentIsolation
    Customer_Utility_Functions_for_Agent_BC --> AgentAsBoundedContext
    CustomerCancellationsProjection --> OrderCommandHandlers
    DualWriteContract --> BoundedContextIdentity
    Durable_Append_via_Workpool_Actions --> WorkpoolPartitioningStrategy
    Durable_Append_via_Workpool_Actions ..-> EventStoreDurability
    Durable_Command_Orchestrator___Intent_Completion_Bracketing_Wrapper ..-> DurableEventsIntegration
    Durable_Cross_Context_Event_Publication --> EventBusAbstraction
    Durable_Cross_Context_Event_Publication --> WorkpoolPartitioningStrategy
    Durable_Cross_Context_Event_Publication ..-> EventStoreDurability
    DurableAppendAction ..-> DurableEventsIntegration
    Event_Replay_Infrastructure_Types ..-> EventReplayInfrastructure
    Event_Store_Durability --> WorkpoolPartitioningStrategy
    Event_Store_Durability ..-> EventStoreDurability
    Event_Store_Durability_Types ..-> EventStoreDurability
    EventBus_Publish_Update___DS_2_Stub ..-> AgentLLMIntegration
    EventCorrectnessMigration -.-> Tranche0ReadinessHarness
    EventCorrectnessMigration -.-> Tranche0ReleaseCiDocsProcessGuardrails
    EventSubscription_Discriminated_Union___DS_2_Stub ..-> AgentLLMIntegration
    EventSubscriptionRegistry --> AgentAsBoundedContext
    EventSubscriptionRegistry --> AgentLLMIntegration
    EventSubscriptionRegistry --> OrderNotificationPM
    EventSubscriptionRegistry --> ReservationReleasePM
    HealthObservability -.-> EventReplayInfrastructure
    HealthObservability -.-> WorkpoolPartitioningStrategy
    Idempotent_Event_Append ..-> EventStoreDurability
    IntegrationPatterns21b -.-> IntegrationPatterns21a
    IntegrationRoutes --> OrderCommandHandlers
    Intent_Admin_Functions___CRUD_operations_for_commandIntents_table_ ..-> DurableEventsIntegration
    Intent_Completion_Event_Pattern ..-> EventStoreDurability
    InventoryCommandConfigs --> ActiveReservationsProjection
    InventoryCommandConfigs --> OrderWithInventoryProjection
    InventoryCommandConfigs --> ProductCatalogProjection
    InventoryCommandHandlers --> InventoryDeciders
    InventoryCommandHandlers --> InventoryRepository
    Lifecycle_Audit_Event_Types___DS_5_Stub ..-> AgentCommandInfrastructure
    Lifecycle_Command_Handlers___DS_5_Stub ..-> AgentCommandInfrastructure
    Lifecycle_Command_Type_Definitions___DS_5_Stub ..-> AgentCommandInfrastructure
    LLM_Configuration_and_Runtime_Exports --> AgentAsBoundedContext
    LLM_Provider_Configuration --> AgentAsBoundedContext
    MockPaymentActions ..-> DurableEventsIntegration
    OpenRouter_Agent_Runtime --> AgentAsBoundedContext
    OrderCommandConfigs --> CustomerCancellationsProjection
    OrderCommandConfigs --> OrderItemsProjection
    OrderCommandConfigs --> OrderSummaryProjection
    OrderCommandConfigs --> OrderWithInventoryProjection
    OrderCommandHandlers --> OrderDeciders
    OrderCommandHandlers --> OrderRepository
    OrderFulfillmentSaga --> InventoryCommandHandlers
    OrderFulfillmentSaga --> OrderCommandHandlers
    OrderItemsProjection --> OrderCommandHandlers
    OrderManagementInfrastructure --> CommandBus
    OrderManagementInfrastructure --> EventStore
    OrderManagementInfrastructure --> Workflow
    OrderManagementInfrastructure --> Workpool
    OrderNotificationPM --> OrderCommandHandlers
    OrderSummaryProjection --> EventStore
    OrderWithInventoryProjection --> InventoryCommandHandlers
    OrderWithInventoryProjection --> OrderCommandHandlers
    Outbox_Pattern_for_Action_Results ..-> EventStoreDurability
    Partition_Key_Helper_Functions --> EventBusAbstraction
    Partition_Key_Helper_Functions ..-> WorkpoolPartitioningStrategy
    Pattern_Executor___DS_4_Stub ..-> AgentCommandInfrastructure
    Pattern_Registry___DS_4_Stub ..-> AgentCommandInfrastructure
    PaymentOutboxHandler ..-> DurableEventsIntegration
    Per_Projection_Partition_Configuration ..-> WorkpoolPartitioningStrategy
    Poison_Event_Admin_Functions___CRUD_operations_for_poisonEvents_table_ ..-> DurableEventsIntegration
    Poison_Event_Handling ..-> EventStoreDurability
    PollingUtilities ..-> BddTestingInfrastructure
    ProcessManager --> EventBusAbstraction
    ProcessManagerLifecycle --> EventBusAbstraction
    ProductCatalogProjection --> InventoryCommandHandlers
    ProductionHardening -.-> ReactiveProjections
    Projection_Complexity_Classifier ..-> WorkpoolPartitioningStrategy
    ProjectionCategoriesExecutableTests ..-> ProjectionCategories
    ReactiveProjectionConflictDetection ..-> ReactiveProjections
    ReactiveProjectionEligibility ..-> ReactiveProjections
    ReactiveProjectionHybridModel ..-> ReactiveProjections
    ReactiveProjectionSharedEvolve ..-> ReactiveProjections
    Rebuild_Demonstration___Projection_rebuild_from_event_stream_ ..-> DurableEventsIntegration
    Replay_Progress_Utilities ..-> EventReplayInfrastructure
    ReservationReleasePM --> InventoryCommandHandlers
    ReservationReleasePM --> OrderWithInventoryProjection
    SagaCompletionHandler --> SagaRegistry
    SagaOrchestrationExecutableTests ..-> SagaOrchestration
    SagaRouter --> OrderFulfillmentSaga
    TestEnvironmentGuards ..-> BddTestingInfrastructure
    Tranche1SupportingSecurityContractSweep -.-> Tranche0ReadinessHarness
    Tranche1SupportingSecurityContractSweep -.-> Tranche0ReleaseCiDocsProcessGuardrails
    Workpool_Partition_Key_Types --> EventBusAbstraction
    Workpool_Partition_Key_Types ..-> WorkpoolPartitioningStrategy
    Workpool_Partitioning_Strategy ..-> WorkpoolPartitioningStrategy
```

---
