# Development Roadmap

**Purpose:** Track implementation progress by phase
**Detail Level:** Phase summaries with links to details

---

## Overall Progress

**Patterns:** [███████████████░░░░░] 57/75 (76%)

**Phases:** 16/21 complete

| Metric         | Value |
| -------------- | ----- |
| Total Patterns | 75    |
| Completed      | 57    |
| Active         | 3     |
| Planned        | 15    |

---

## Phase Navigation

| Phase                                                                                | Progress | Complete |
| ------------------------------------------------------------------------------------ | -------- | -------- |
| ✅ [CMSDualWrite](phases/phase-01-cms-dual-write.md)                                 | 2/2      | 100%     |
| ✅ [EventStoreFoundation](phases/phase-02-event-store-foundation.md)                 | 1/1      | 100%     |
| ✅ [CommandBusFoundation](phases/phase-03-command-bus-foundation.md)                 | 1/1      | 100%     |
| ✅ [ProjectionCheckpointing](phases/phase-04-projection-checkpointing.md)            | 1/1      | 100%     |
| ✅ [SagaOrchestration](phases/phase-06-saga-orchestration.md)                        | 1/1      | 100%     |
| ✅ [EventUpcasting](phases/phase-09-event-upcasting.md)                              | 3/3      | 100%     |
| ✅ [MiddlewarePipeline](phases/phase-10-middleware-pipeline.md)                      | 1/1      | 100%     |
| ✅ [CMSRepository](phases/phase-11-cms-repository.md)                                | 3/3      | 100%     |
| ✅ [QueryAbstraction](phases/phase-12-query-abstraction.md)                          | 1/1      | 100%     |
| ✅ [ProcessManagerLifecycle](phases/phase-13-process-manager-lifecycle.md)           | 3/3      | 100%     |
| ✅ [HandlerFactories](phases/phase-14-handler-factories.md)                          | 2/2      | 100%     |
| ✅ [ProjectionCategories](phases/phase-15-projection-categories.md)                  | 1/1      | 100%     |
| ✅ [DCBTypes](phases/phase-16-dcb-types.md)                                          | 3/3      | 100%     |
| ✅ [ReactiveProjections](phases/phase-17-reactive-projections.md)                    | 1/1      | 100%     |
| 📋 [WorkpoolPartitioningStrategy](phases/phase-18-workpool-partitioning-strategy.md) | 5/9      | 56%      |
| ✅ [BddTestingInfrastructure](phases/phase-19-bdd-testing-infrastructure.md)         | 1/1      | 100%     |
| 📋 [ReservationPattern](phases/phase-20-reservation-pattern.md)                      | 2/3      | 67%      |
| 📋 [IntegrationPatterns21b](phases/phase-21-integration-patterns-21b.md)             | 0/2      | 0%       |
| 🚧 [AgentChurnRiskCompletion](phases/phase-22-agent-churn-risk-completion.md)        | 1/7      | 14%      |
| ✅ [ExampleAppModernization](phases/phase-23-example-app-modernization.md)           | 1/1      | 100%     |
| 🚧 [ThemedDecisionArchitecture](phases/phase-100-themed-decision-architecture.md)    | 2/6      | 33%      |

---

## Phases

### ✅ CMSDualWrite

[███████████████] 2/2 100% complete

| Pattern                      | Status    | Description                                                                                                         |
| ---------------------------- | --------- | ------------------------------------------------------------------------------------------------------------------- |
| ✅ CMS Dual Write            | completed | Core types for Command Model State - the continuously updated aggregate snapshot maintained atomically alongside... |
| ✅ Foundation Infrastructure | completed | Consolidates old roadmap phases 0-13 into a single completed milestone.                                             |

---

### ✅ EventStoreFoundation

[███████████████] 1/1 100% complete

| Pattern                   | Status    | Description                                                                                                              |
| ------------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------ |
| ✅ Event Store Foundation | completed | Problem: Event Sourcing requires centralized storage for domain events with ordering guarantees, concurrency control,... |

---

### ✅ CommandBusFoundation

[███████████████] 1/1 100% complete

| Pattern                   | Status    | Description                                                                                                          |
| ------------------------- | --------- | -------------------------------------------------------------------------------------------------------------------- |
| ✅ Command Bus Foundation | completed | Problem: Command execution requires idempotency (same command = same result), status tracking, and a standardized... |

---

### ✅ ProjectionCheckpointing

[███████████████] 1/1 100% complete

| Pattern                     | Status    | Description                                                   |
| --------------------------- | --------- | ------------------------------------------------------------- |
| ✅ Projection Checkpointing | completed | Projection checkpoint helper for idempotent event processing. |

---

### ✅ SagaOrchestration

[███████████████] 1/1 100% complete

| Pattern               | Status    | Description                                                                                                           |
| --------------------- | --------- | --------------------------------------------------------------------------------------------------------------------- |
| ✅ Saga Orchestration | completed | Problem: Cross-BC operations (e.g., Order -> Inventory -> Shipping) cannot use atomic transactions because bounded... |

---

### ✅ EventUpcasting

[███████████████] 3/3 100% complete

| Pattern                     | Status    | Description                                                                              |
| --------------------------- | --------- | ---------------------------------------------------------------------------------------- |
| ✅ Correlation Chain System | completed | Correlation types for tracking causal relationships in command-event flows.              |
| ✅ Event Bus Abstraction    | completed | Durable event pub/sub using Workpool for parallelism, retries, and dead letter handling. |
| ✅ Event Upcasting          | completed | Transforms events from older schema versions to current version at read time.            |

---

### ✅ MiddlewarePipeline

[███████████████] 1/1 100% complete

| Pattern                | Status    | Description                                             |
| ---------------------- | --------- | ------------------------------------------------------- |
| ✅ Middleware Pipeline | completed | Orchestrates middleware execution in the correct order. |

---

### ✅ CMSRepository

[███████████████] 3/3 100% complete

| Pattern                       | Status    | Description                                                                                                              |
| ----------------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------ |
| ✅ Bounded Context Foundation | completed | Problem: DDD Bounded Contexts need clear boundaries with physical enforcement, type-safe contracts, and domain purity... |
| ✅ CMS Repository             | completed | Factory for typed data access with automatic schema upcasting in dual-write handlers.                                    |
| ✅ Invariant Framework        | completed | Factory for declarative business rule validation with typed error codes.                                                 |

---

### ✅ QueryAbstraction

[███████████████] 1/1 100% complete

| Pattern              | Status    | Description                                                        |
| -------------------- | --------- | ------------------------------------------------------------------ |
| ✅ Query Abstraction | completed | Query factory functions for creating type-safe read model queries. |

---

### ✅ ProcessManagerLifecycle

[███████████████] 3/3 100% complete

| Pattern                      | Status    | Description                                                                                                              |
| ---------------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------ |
| ✅ Logging Infrastructure    | completed | Factory for domain-specific loggers with scope prefixes and level filtering.                                             |
| ✅ Package Architecture      | completed | The original @convex-es/core package grew to 25+ modules, creating issues: - Large bundle size for consumers who only... |
| ✅ Process Manager Lifecycle | completed | FSM for managing PM state transitions (idle/processing/completed/failed) with validation.                                |

---

### ✅ HandlerFactories

[███████████████] 2/2 100% complete

| Pattern              | Status    | Description                                                                                                      |
| -------------------- | --------- | ---------------------------------------------------------------------------------------------------------------- |
| ✅ Decider Pattern   | completed | Problem: Domain logic embedded in handlers makes testing require infrastructure.                                 |
| ✅ Handler Factories | completed | The Decider pattern separates pure business logic from infrastructure concerns, enabling unit testing without... |

---

### ✅ ProjectionCategories

[███████████████] 1/1 100% complete

| Pattern                  | Status    | Description                                             |
| ------------------------ | --------- | ------------------------------------------------------- |
| ✅ Projection Categories | completed | Problem: Projections exist but categories are implicit. |

---

### ✅ DCBTypes

[███████████████] 3/3 100% complete

| Pattern                           | Status    | Description                                                                                                          |
| --------------------------------- | --------- | -------------------------------------------------------------------------------------------------------------------- |
| ✅ DCB Scope Key Utilities        | completed | Functions for creating, parsing, and validating scope keys.                                                          |
| ✅ DCB Types                      | completed | Types for scope-based multi-entity coordination within bounded contexts.                                             |
| ✅ Dynamic Consistency Boundaries | completed | Problem: Cross-entity invariants within a bounded context currently require sequential commands (no atomicity) or... |

---

### ✅ ReactiveProjections

[███████████████] 1/1 100% complete

| Pattern                 | Status    | Description                                                 |
| ----------------------- | --------- | ----------------------------------------------------------- |
| ✅ Reactive Projections | completed | Problem: Workpool-based projections have 100-500ms latency. |

---

### 📋 WorkpoolPartitioningStrategy

[████████░░░░░░░] 5/9 56% complete

| Pattern                           | Status    | Description                                                                                                              |
| --------------------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------ |
| 📋 Admin Tooling Consolidation    | planned   | Problem: Admin functionality is scattered across the codebase: - Dead letter queue at...                                 |
| 📋 Circuit Breaker Pattern        | planned   | Problem: External API failures (Stripe, SendGrid, webhooks) cascade through the system.                                  |
| ✅ Durable Events Integration     | completed | Problem: Phase 18 delivered durability primitives to `platform-core`, but the example app's main command flow still...   |
| ✅ Durable Function Adapters      | completed | Problem: Platform has well-defined interfaces (RateLimitChecker, DCB conflict handling) but uses in-memory...            |
| ✅ Event Replay Infrastructure    | completed | Problem: When projections become corrupted, require schema migration, or drift from the Event Store due to bugs,...      |
| ✅ Event Store Durability         | completed | Problem: The dual-write pattern (CMS + Event) works when both operations are in the same mutation, but several...        |
| 📋 Health Observability           | planned   | Problem: No Kubernetes integration (readiness/liveness probes), no metrics for projection lag, event throughput, or...   |
| 📋 Production Hardening           | planned   | Problem: Structured logging (Phase 13) exists but no metrics collection, distributed tracing, or admin tooling for...    |
| ✅ Workpool Partitioning Strategy | completed | Problem: ADR-018 defines critical partition key strategies for preventing OCC conflicts and ensuring per-entity event... |

---

### ✅ BddTestingInfrastructure

[███████████████] 1/1 100% complete

| Pattern                       | Status    | Description                                                            |
| ----------------------------- | --------- | ---------------------------------------------------------------------- |
| ✅ Bdd Testing Infrastructure | completed | Problem: Domain logic tests require infrastructure (Docker, database). |

---

### 📋 ReservationPattern

[██████████░░░░░] 2/3 67% complete

| Pattern                     | Status    | Description                                                                                                            |
| --------------------------- | --------- | ---------------------------------------------------------------------------------------------------------------------- |
| 📋 Deterministic Id Hashing | planned   | Problem: TTL-based reservations work well for multi-step flows (registration wizards), but add overhead for simple...  |
| ✅ Ecst Fat Events          | completed | Problem: Thin events require consumers to query back to the source BC, creating coupling and requiring synchronous...  |
| ✅ Reservation Pattern      | completed | Problem: Uniqueness constraints before entity creation require check-then-create patterns with race condition risk,... |

---

### 📋 IntegrationPatterns21b

[░░░░░░░░░░░░░░░] 0/2 0% complete

| Pattern                    | Status  | Description                                     |
| -------------------------- | ------- | ----------------------------------------------- |
| 📋 Integration Patterns21a | planned | Problem: Cross-context communication is ad-hoc. |
| 📋 Integration Patterns21b | planned | Problem: Schema evolution breaks consumers.     |

---

### 🚧 AgentChurnRiskCompletion

[██░░░░░░░░░░░░░] 1/7 14% complete

| Pattern                         | Status    | Description                                                                                                             |
| ------------------------------- | --------- | ----------------------------------------------------------------------------------------------------------------------- |
| 📋 Agent Admin Frontend         | planned   | Problem: The admin UI at `/admin/agents` has several gaps identified in the E2E feature file...                         |
| ✅ Agent As Bounded Context     | completed | Problem: AI agents are invoked manually without integration into the event-driven architecture.                         |
| 📋 Agent BC Component Isolation | planned   | Problem: Agent BC tables (`agentCheckpoints`, `agentAuditEvents`, `agentDeadLetters`, `agentCommands`,...               |
| 📋 Agent Churn Risk Completion  | planned   | Problem: The churn-risk agent in the order-management example app has working rule-based detection but critical gaps... |
| 📋 Agent Command Infrastructure | planned   | Problem: Three interconnected gaps in agent command infrastructure: 1.                                                  |
| 📋 Agent LLM Integration        | planned   | Problem: The agent event handler (`handleChurnRiskEvent`) is a Convex mutation that cannot call external APIs.          |
| 🚧 Confirmed Order Cancellation | active    | Problem: The Order FSM treats `confirmed` as terminal.                                                                  |

---

### ✅ ExampleAppModernization

[███████████████] 1/1 100% complete

| Pattern                      | Status    | Description                                                                                    |
| ---------------------------- | --------- | ---------------------------------------------------------------------------------------------- |
| ✅ Example App Modernization | completed | Problem: The `order-management` example app has grown organically during platform development. |

---

### 🚧 ThemedDecisionArchitecture

[█████░░░░░░░░░░] 2/6 33% complete

| Pattern                              | Status    | Description                                                                                                     |
| ------------------------------------ | --------- | --------------------------------------------------------------------------------------------------------------- |
| 📋 Codec Driven Reference Generation | planned   | Reference documentation is specified via 11 recipe `.feature` files in `delivery-process/recipes/`.             |
| 🚧 Process Enhancements              | active    | Vision: Transform the delivery process from a documentation tool into a delivery operating system.              |
| ✅ Process Metadata Expansion        | completed | The monorepo's delivery process lacked metadata tags for variance tracking, governance, and hierarchical views. |
| ✅ Repo Level Docs Generation        | completed | As a monorepo maintainer, I want unified documentation generation from multiple sources.                        |
| 📋 Test Content Blocks               | planned   | This feature demonstrates what content blocks are captured and rendered by the PRD generator.                   |
| 📋 Themed Decision Architecture      | planned   | Decisions (ADRs, PDRs) should not be "dumped into same folder" when generated.                                  |

---

## Quarterly Timeline

| Quarter           | Total | Completed |
| ----------------- | ----- | --------- |
| Q1-2026 ← Current | 5     | 3         |

---
