# Development Roadmap

**Purpose:** Track implementation progress by phase
**Detail Level:** Phase summaries with links to details

---

## Overall Progress

**Patterns:** [████████████░░░░░░░░] 90/152 (59%)

**Phases:** 14/25 complete

| Metric         | Value |
| -------------- | ----- |
| Total Patterns | 152   |
| Completed      | 90    |
| Active         | 10    |
| Planned        | 52    |

---

## Phase Navigation

| Phase                                                                                                                          | Progress | Complete |
| ------------------------------------------------------------------------------------------------------------------------------ | -------- | -------- |
| ✅ [Inception](phases/phase-01-inception.md)                                                                                    | 2/2      | 100%     |
| ✅ [Construction](phases/phase-04-construction.md)                                                                              | 1/1      | 100%     |
| ✅ [CorrelationChainSystem](phases/phase-09-correlation-chain-system.md)                                                        | 3/3      | 100%     |
| ✅ [MiddlewarePipeline](phases/phase-10-middleware-pipeline.md)                                                                 | 1/1      | 100%     |
| ✅ [CMSRepository](phases/phase-11-cms-repository.md)                                                                           | 2/2      | 100%     |
| ✅ [QueryAbstraction](phases/phase-12-query-abstraction.md)                                                                     | 1/1      | 100%     |
| ✅ [LoggingInfrastructure](phases/phase-13-logging-infrastructure.md)                                                           | 3/3      | 100%     |
| ✅ [HandlerFactories](phases/phase-14-handler-factories.md)                                                                     | 1/1      | 100%     |
| 🚧 [ProjectionCategoriesExecutableTests](phases/phase-15-projection-categories-executable-tests.md)                            | 0/3      | 0%       |
| ✅ [DCBScopeKeyUtilities](phases/phase-16-dcb-scope-key-utilities.md)                                                           | 2/2      | 100%     |
| ✅ [ReactiveProjectionConflictDetection](phases/phase-17-reactive-projection-conflict-detection.md)                             | 4/4      | 100%     |
| 📋 [AdminToolingConsolidation](phases/phase-18-admin-tooling-consolidation.md)                                                 | 0/4      | 0%       |
| ✅ [BddTestingInfrastructureExecutableTests](phases/phase-19-bdd-testing-infrastructure-executable-tests.md)                    | 2/2      | 100%     |
| 📋 [DeterministicIdHashing](phases/phase-20-deterministic-id-hashing.md)                                                       | 0/1      | 0%       |
| 📋 [IntegrationPatterns21a](phases/phase-21-integration-patterns-21a.md)                                                       | 0/2      | 0%       |
| 🚧 [Agent as Bounded Context - AI-Driven Event Reactors](phases/phase-22-agent-as-bounded-context-ai-driven-event-reactors.md) | 1/6      | 17%      |
| 📋 [Tranche0ReadinessHarness](phases/phase-24-tranche-0-readiness-harness.md)                                                  | 0/1      | 0%       |
| 📋 [Tranche0ReleaseCiDocsProcessGuardrails](phases/phase-25-tranche-0-release-ci-docs-process-guardrails.md)                   | 0/1      | 0%       |
| 📋 [ComponentBoundaryAuthenticationConvention](phases/phase-26-component-boundary-authentication-convention.md)                | 0/1      | 0%       |
| 📋 [EventCorrectnessMigration](phases/phase-27-event-correctness-migration.md)                                                 | 0/1      | 0%       |
| 📋 [Tranche1SupportingSecurityContractSweep](phases/phase-28-tranche-1-supporting-security-contract-sweep.md)                  | 0/1      | 0%       |
| ✅ [PollingUtilities](phases/phase-56-polling-utilities.md)                                                                     | 1/1      | 100%     |
| ✅ [BDDWorld](phases/phase-57-bdd-world.md)                                                                                     | 1/1      | 100%     |
| ✅ [TestEnvironmentGuards](phases/phase-58-test-environment-guards.md)                                                          | 1/1      | 100%     |
| 🚧 [CodecDrivenReferenceGeneration](phases/phase-100-codec-driven-reference-generation.md)                                     | 1/4      | 25%      |

---

## Phases

### ✅ Inception

[███████████████] 2/2 100% complete

| Pattern                     | Status    | Description                                                                                                         |
| --------------------------- | --------- | ------------------------------------------------------------------------------------------------------------------- |
| ✅ CMS Dual Write            | completed | Core types for Command Model State - the continuously updated aggregate snapshot maintained atomically alongside... |
| ✅ Foundation Infrastructure | completed | Consolidates old roadmap phases 0-13 into a single completed milestone.                                             |

---

### ✅ Construction

[███████████████] 1/1 100% complete

| Pattern                    | Status    | Description                                                   |
| -------------------------- | --------- | ------------------------------------------------------------- |
| ✅ Projection Checkpointing | completed | Projection checkpoint helper for idempotent event processing. |

---

### ✅ CorrelationChainSystem

[███████████████] 3/3 100% complete

| Pattern                    | Status    | Description                                                                              |
| -------------------------- | --------- | ---------------------------------------------------------------------------------------- |
| ✅ Correlation Chain System | completed | Correlation types for tracking causal relationships in command-event flows.              |
| ✅ Event Bus Abstraction    | completed | Durable event pub/sub using Workpool for parallelism, retries, and dead letter handling. |
| ✅ Event Upcasting          | completed | Transforms events from older schema versions to current version at read time.            |

---

### ✅ MiddlewarePipeline

[███████████████] 1/1 100% complete

| Pattern               | Status    | Description                                             |
| --------------------- | --------- | ------------------------------------------------------- |
| ✅ Middleware Pipeline | completed | Orchestrates middleware execution in the correct order. |

---

### ✅ CMSRepository

[███████████████] 2/2 100% complete

| Pattern               | Status    | Description                                                                           |
| --------------------- | --------- | ------------------------------------------------------------------------------------- |
| ✅ CMS Repository      | completed | Factory for typed data access with automatic schema upcasting in dual-write handlers. |
| ✅ Invariant Framework | completed | Factory for declarative business rule validation with typed error codes.              |

---

### ✅ QueryAbstraction

[███████████████] 1/1 100% complete

| Pattern             | Status    | Description                                                        |
| ------------------- | --------- | ------------------------------------------------------------------ |
| ✅ Query Abstraction | completed | Query factory functions for creating type-safe read model queries. |

---

### ✅ LoggingInfrastructure

[███████████████] 3/3 100% complete

| Pattern                     | Status    | Description                                                                                                      |
| --------------------------- | --------- | ---------------------------------------------------------------------------------------------------------------- |
| ✅ Logging Infrastructure    | completed | Factory for domain-specific loggers with scope prefixes and level filtering.                                     |
| ✅ Package Architecture      | completed | Provenance (refactoring carve-out, META-pattern): PackageArchitecture is a structural meta-pattern describing... |
| ✅ Process Manager Lifecycle | completed | FSM for managing PM state transitions (idle/processing/completed/failed) with validation.                        |

---

### ✅ HandlerFactories

[███████████████] 1/1 100% complete

| Pattern             | Status    | Description                                                                                                      |
| ------------------- | --------- | ---------------------------------------------------------------------------------------------------------------- |
| ✅ Handler Factories | completed | The Decider pattern separates pure business logic from infrastructure concerns, enabling unit testing without... |

---

### 🚧 ProjectionCategoriesExecutableTests

[░░░░░░░░░░░░░░░] 0/3 0% complete

| Pattern                                   | Status | Description                                                                                                            |
| ----------------------------------------- | ------ | ---------------------------------------------------------------------------------------------------------------------- |
| 🚧 Projection Categories Executable Tests | active | As a platform developer I want projections classified into four distinct categories So that I can route queries and... |
| 🚧 Projection Categories Executable Tests | active | As a platform developer I want projections to require explicit category declaration So that all projections have...    |
| 🚧 Projection Categories Executable Tests | active | As a platform developer I want to query projections by category from the registry So that I can target specific...     |

---

### ✅ DCBScopeKeyUtilities

[███████████████] 2/2 100% complete

| Pattern                   | Status    | Description                                                                      |
| ------------------------- | --------- | -------------------------------------------------------------------------------- |
| ✅ DCB Scope Key Utilities | completed | Re-export the canonical shared scope-key contract used across platform packages. |
| ✅ DCB Types               | completed | Types for scope-based multi-entity coordination within bounded contexts.         |

---

### ✅ ReactiveProjectionConflictDetection

[███████████████] 4/4 100% complete

| Pattern                                  | Status    | Description                                                                                                                |
| ---------------------------------------- | --------- | -------------------------------------------------------------------------------------------------------------------------- |
| ✅ Reactive Projection Conflict Detection | completed | As a platform developer I want conflicts detected and resolved automatically So that data integrity is maintained...       |
| ✅ Reactive Projection Eligibility        | completed | As a platform developer I want only view projections to support reactive updates So that system resources are optimized... |
| ✅ Reactive Projection Hybrid Model       | completed | As a frontend developer I want projections that combine durability with instant feedback So that users see optimistic...   |
| ✅ Reactive Projection Shared Evolve      | completed | As a platform developer I want evolve logic shared between client and server So that state transformations are always...   |

---

### 📋 AdminToolingConsolidation

[░░░░░░░░░░░░░░░] 0/4 0% complete

| Pattern                        | Status  | Description                                                                                                            |
| ------------------------------ | ------- | ---------------------------------------------------------------------------------------------------------------------- |
| 📋 Admin Tooling Consolidation | planned | Problem: Admin functionality is scattered across the codebase: - Dead letter queue at...                               |
| 📋 Circuit Breaker Pattern     | planned | Problem: External API failures (Stripe, SendGrid, webhooks) cascade through the system.                                |
| 📋 Health Observability        | planned | Problem: No Kubernetes integration (readiness/liveness probes), no metrics for projection lag, event throughput, or... |
| 📋 Production Hardening        | planned | Problem: Structured logging (Phase 13) exists but no metrics collection, distributed tracing, or admin tooling for...  |

---

### ✅ BddTestingInfrastructureExecutableTests

[███████████████] 2/2 100% complete

| Pattern                                       | Status    | Description                                                                                                           |
| --------------------------------------------- | --------- | --------------------------------------------------------------------------------------------------------------------- |
| ✅ Bdd Testing Infrastructure Executable Tests | completed | As a platform developer I want integration tests to be properly isolated So that tests don't interfere with each...   |
| ✅ Bdd Testing Infrastructure Executable Tests | completed | As a platform maintainer I want all platform packages to have BDD test coverage So that public APIs are documented... |

---

### 📋 DeterministicIdHashing

[░░░░░░░░░░░░░░░] 0/1 0% complete

| Pattern                     | Status  | Description                                                                                                           |
| --------------------------- | ------- | --------------------------------------------------------------------------------------------------------------------- |
| 📋 Deterministic Id Hashing | planned | Problem: TTL-based reservations work well for multi-step flows (registration wizards), but add overhead for simple... |

---

### 📋 IntegrationPatterns21a

[░░░░░░░░░░░░░░░] 0/2 0% complete

| Pattern                    | Status  | Description                                     |
| -------------------------- | ------- | ----------------------------------------------- |
| 📋 Integration Patterns21a | planned | Problem: Cross-context communication is ad-hoc. |
| 📋 Integration Patterns21b | planned | Problem: Schema evolution breaks consumers.     |

---

### 🚧 Agent as Bounded Context - AI-Driven Event Reactors

[███░░░░░░░░░░░░] 1/6 17% complete

| Pattern                                                | Status    | Description                                                                                                           |
| ------------------------------------------------------ | --------- | --------------------------------------------------------------------------------------------------------------------- |
| 🚧 Agent as Bounded Context - AI-Driven Event Reactors | active    | Demonstrates the Agent as Bounded Context pattern where AI agents subscribe to domain events via EventBus and emit... |
| 📋 Agent Admin Frontend                                | planned   | Problem: The admin UI at `/admin/agents` has implementation gaps identified in the E2E feature file...                |
| 🚧 Agent BC Component Isolation                        | active    | Problem: Agent BC tables (`agentCheckpoints`, `agentAuditEvents`, `agentDeadLetters`, `agentCommands`,...             |
| ✅ Agent Command Infrastructure                         | completed | Problem: Three interconnected gaps in agent command infrastructure: 1.                                                |
| 🚧 Agent LLM Integration                               | active    | Problem: The agent event handler (`handleChurnRiskEvent`) is a Convex mutation that cannot call external APIs.        |
| 🚧 Confirmed Order Cancellation                        | active    | Problem: The Order FSM treats `confirmed` as terminal.                                                                |

---

### 📋 Tranche0ReadinessHarness

[░░░░░░░░░░░░░░░] 0/1 0% complete

| Pattern                       | Status  | Description                                                                                                             |
| ----------------------------- | ------- | ----------------------------------------------------------------------------------------------------------------------- |
| 📋 Tranche0 Readiness Harness | planned | Problem: The remediation program cannot safely begin security or correctness migrations while `platform-store` lacks... |

---

### 📋 Tranche0ReleaseCiDocsProcessGuardrails

[░░░░░░░░░░░░░░░] 0/1 0% complete

| Pattern                                        | Status  | Description                                                                                                              |
| ---------------------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------ |
| 📋 Tranche0 Release Ci Docs Process Guardrails | planned | Problem: `test.yml` ignores markdown and docs-only changes, release automation is not yet normalized around architect... |

---

### 📋 ComponentBoundaryAuthenticationConvention

[░░░░░░░░░░░░░░░] 0/1 0% complete

| Pattern                                         | Status  | Description                                                                                                   |
| ----------------------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------- |
| 📋 Component Boundary Authentication Convention | planned | Problem: Identity-bearing component mutations still trust caller-provided actor fields without a canonical... |

---

### 📋 EventCorrectnessMigration

[░░░░░░░░░░░░░░░] 0/1 0% complete

| Pattern                        | Status  | Description                                                                                                              |
| ------------------------------ | ------- | ------------------------------------------------------------------------------------------------------------------------ |
| 📋 Event Correctness Migration | planned | Problem: `appendToStream` idempotency semantics, `globalPosition` precision, and process-manager lifecycle parity are... |

---

### 📋 Tranche1SupportingSecurityContractSweep

[░░░░░░░░░░░░░░░] 0/1 0% complete

| Pattern                                        | Status  | Description                                                                                                           |
| ---------------------------------------------- | ------- | --------------------------------------------------------------------------------------------------------------------- |
| 📋 Tranche1 Supporting Security Contract Sweep | planned | Problem: Several tranche-1 gaps remain after the auth keystone: test-mode checks fail open, correlation IDs can be... |

---

### ✅ PollingUtilities

[███████████████] 1/1 100% complete

| Pattern             | Status    | Description                                                                                                            |
| ------------------- | --------- | ---------------------------------------------------------------------------------------------------------------------- |
| ✅ Polling Utilities | completed | As a developer writing integration tests I want async polling utilities So that I can wait for eventual consistency... |

---

### ✅ BDDWorld

[███████████████] 1/1 100% complete

| Pattern     | Status    | Description                                                                                                            |
| ----------- | --------- | ---------------------------------------------------------------------------------------------------------------------- |
| ✅ BDD World | completed | As a BDD test author I want world/state management utilities So that I can manage scenario context across steps The... |

---

### ✅ TestEnvironmentGuards

[███████████████] 1/1 100% complete

| Pattern                   | Status    | Description                                                                                                             |
| ------------------------- | --------- | ----------------------------------------------------------------------------------------------------------------------- |
| ✅ Test Environment Guards | completed | As a platform developer I want environment guards for test-only functions So that test utilities cannot be called in... |

---

### 🚧 CodecDrivenReferenceGeneration

[████░░░░░░░░░░░] 1/4 25% complete

| Pattern                             | Status    | Description                                                                                        |
| ----------------------------------- | --------- | -------------------------------------------------------------------------------------------------- |
| ✅ Codec Driven Reference Generation | completed | Reference documentation is specified via 11 recipe `.feature` files in `architect/recipes/`.       |
| 🚧 Process Enhancements             | active    | Vision: Transform the delivery process from a documentation tool into a delivery operating system. |
| 📋 Test Content Blocks              | planned   | This feature demonstrates what content blocks are captured and rendered by the PRD generator.      |
| 📋 Themed Decision Architecture     | planned   | Decisions (ADRs, PDRs) should not be "dumped into same folder" when generated.                     |

---

## Quarterly Timeline

| Quarter           | Total | Completed |
| ----------------- | ----- | --------- |
| Q1-2026           | 6     | 5         |
| Q2-2026 ← Current | 5     | 0         |

---
