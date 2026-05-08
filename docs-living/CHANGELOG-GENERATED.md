# Changelog

**Purpose:** Project changelog in Keep a Changelog format

---

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

---

## [Unreleased]

### Added

- **Agent as Bounded Context - AI-Driven Event Reactors**: Demonstrates the Agent as Bounded Context pattern where AI agents subscribe to domain events via EventBus and emit...
- **Agent BC Component Isolation**: Problem: Agent BC tables (`agentCheckpoints`, `agentAuditEvents`, `agentDeadLetters`, `agentCommands`,...
- **Agent LLM Integration**: Problem: The agent event handler (`handleChurnRiskEvent`) is a Convex mutation that cannot call external APIs.
- **Codec Driven Reference Generation**: Reference documentation is specified via 11 recipe `.feature` files in `architect/recipes/`.
- **Command Config Partition Key Validation**: Validates that all projection configurations in a command config have explicit partition keys defined.
- **Component Boundary Authentication Convention**: Problem: Identity-bearing component mutations still trust caller-provided actor fields without a canonical...
- **Confirmed Order Cancellation**: Problem: The Order FSM treats `confirmed` as terminal.
- **DCB Retry Execution**: DCB Retry Execution — reference implementation for integrating withDCBRetry into command handlers.
- **Event Correctness Migration**: Problem: `appendToStream` idempotency semantics, `globalPosition` precision, and process-manager lifecycle parity are...
- **PDR 014 Component Boundary Authentication Convention**
- **PDR 015 Global Position Numeric Representation**
- **PDR 016 Projection Pool Split Named Pools Per Concern**
- **PDR 017 Tranche3 Platform Architecture Gate**
- **PDR 018 Idempotency Enforcement For Append To Stream**
- **PDR 019 V Any Vs V Unknown Boundary Policy**
- **PDR 020 Events Table Index Policy**
- **PDR 021 Platform Store Runtime Dependency On Platform Core**
- **PDR 022 Value Transfer Doctrine Adoption**
- **PDR 023 Bulk Doctrine Rollback And Recovery**
- **Process Enhancements**: Vision: Transform the delivery process from a documentation tool into a delivery operating system.
- **Projection Categories Executable Tests**: As a platform developer I want projections classified into four distinct categories So that I can route queries and...
- **Release V 020**: Converts the aggregate-less pivot roadmap into executable specs for Phases 14-22.
- **Test Content Blocks**: This feature demonstrates what content blocks are captured and rendered by the PRD generator.
- **Themed Decision Architecture**: Decisions (ADRs, PDRs) should not be "dumped into same folder" when generated.
- **Tranche0 Readiness Harness**: Problem: The remediation program cannot safely begin security or correctness migrations while `platform-store` lacks...
- **Tranche0 Release Ci Docs Process Guardrails**: Problem: `test.yml` ignores markdown and docs-only changes, release automation is not yet normalized around architect...
- **Tranche1 Supporting Security Contract Sweep**: Problem: Several tranche-1 gaps remain after the auth keystone: test-mode checks fail open, correlation IDs can be...

---

## [v0.3.0]

### Added

- **PDR 006 TypeScript Taxonomy**
- **Release V 030**: Completes the migration from JSON to TypeScript as the source of truth for the delivery process taxonomy.

---

## [v0.2.0]

### Added

- **Agent Command Infrastructure**: Problem: Three interconnected gaps in agent command infrastructure: 1.
- **Package Architecture**: Provenance (refactoring carve-out, META-pattern): PackageArchitecture is a structural meta-pattern describing...
- **PDR 007 Two Tier Spec Architecture**
- **PDR 008 Example App Purpose**
- **PDR 009 Design Session Methodology**
- **PDR 010 Cross Component Argument Injection**

---

## [v0.1.0]

### Added

- **PDR 001 Process Decisions Folder**
- **PDR 003 Behavior Feature File Structure**
- **Release Management Architecture**
- **Unified Tag Prefix Architecture**

---

## [Q1-2026]

### Added

- **BDD World**: As a BDD test author I want world/state management utilities So that I can manage scenario context across steps The...
- **Polling Utilities**: As a developer writing integration tests I want async polling utilities So that I can wait for eventual consistency...
- **Test Environment Guards**: As a platform developer I want environment guards for test-only functions So that test utilities cannot be called in...

---

## [Earlier]

### Added

- **Active Reservations Projection**: Tracks active stock reservations and updates stock levels.
- **Agent Action Handler**: Agent action handler for churn risk detection.
- **Agent On Complete Handler**: Workpool job completion handler for agent BC.
- **App Composition Root**: Application composition root.
- **Bdd Testing Infrastructure Executable Tests**: As a platform developer I want integration tests to be properly isolated So that tests don't interfere with each...
- **Bdd Testing Infrastructure Executable Tests**: As a platform maintainer I want all platform packages to have BDD test coverage So that public APIs are documented...
- **Bounded Context Identity**: BoundedContextFoundation:bounded-context-identity Core identification contract for bounded contexts, providing...
- **CMS Dual Write**: Core types for Command Model State - the continuously updated aggregate snapshot maintained atomically alongside...
- **CMS Repository**: Factory for typed data access with automatic schema upcasting in dual-write handlers.
- **Command Bus**: Type-safe client for the Convex Command Bus component providing infrastructure-level idempotency.
- **Command Orchestrator**: The CommandOrchestrator encapsulates the 7-step dual-write + projection execution pattern that is central to this...
- **Command Registry**: Command registry with Zod validation schemas per command type.
- **Correlation Chain System**: Correlation types for tracking causal relationships in command-event flows.
- **Cross Context Read Model**: Cross-context query APIs.
- **Customer Cancellations Projection**: Customer cancellation history with rolling 30-day window.
- **DCB Scope Key Utilities**: Re-export the canonical shared scope-key contract used across platform packages.
- **DCB Types**: Types for scope-based multi-entity coordination within bounded contexts.
- **Dual Write Contract**: BoundedContextFoundation:dual-write-contract Type-safe contract for bounded contexts using the dual-write pattern,...
- **Durable Append Action**: Durable Append - Workpool-backed event append with retry.
- **Durable Append via Workpool Actions**: Failed event appends from async contexts are retried via Workpool actions with exponential backoff until success or...
- **Durable Cross-Context Event Publication**: Cross-context events use Workpool-backed publication with tracking, retry, and dead letter handling.
- **Event Bus Abstraction**: Durable event pub/sub using Workpool for parallelism, retries, and dead letter handling.
- **Event Replay Infrastructure Types**: Types for event replay and projection rebuilding.
- **Event Store**: Central event storage component for Event Sourcing.
- **Event Store Durability**: Guaranteed event persistence patterns for Convex-native event sourcing.
- **Event Store Durability Types**: Core types for durable event persistence patterns: - Outbox pattern for action result capture - Idempotent event...
- **Event Subscription Registry**: EventBus pub/sub subscription definitions.
- **Event Upcasting**: Transforms events from older schema versions to current version at read time.
- **Foundation Infrastructure**: Consolidates old roadmap phases 0-13 into a single completed milestone.
- **Handler Factories**: The Decider pattern separates pure business logic from infrastructure concerns, enabling unit testing without...
- **Idempotent Event Append**: Ensures each logical event is stored exactly once in the event store, regardless of how many times the append...
- **Integration Dead Letters**: Dead letter queue management for cross-context event publications.
- **Integration Event Handlers**: Integration event handlers.
- **Integration Event Schemas**: Integration event schema definitions for cross-context communication.
- **Integration Routes**: Integration event routes.
- **Intent/Completion Event Pattern**: Long-running operations bracket with intent and completion events for visibility, timeout detection, and...
- **Invariant Framework**: Factory for declarative business rule validation with typed error codes.
- **Inventory Command Configs**: Command configs for 7 inventory commands.
- **Inventory Command Handlers**: Inventory command handlers implementing the dual-write pattern.
- **Inventory Deciders**: Pure decision functions for Inventory aggregate (product + reservation).
- **Inventory Domain Events**: Inventory BC domain events (7 types).
- **Inventory Internal Mutations**: Internal mutations for Inventory operations.
- **Inventory Public API**: App-level public API for Inventory bounded context.
- **Logging Infrastructure**: Factory for domain-specific loggers with scope prefixes and level filtering.
- **Middleware Pipeline**: Orchestrates middleware execution in the correct order.
- **Mock Payment Actions**: Mock Payment Actions - Simulated external payment service.
- **Order Command Configs**: Command configs for 6 order commands.
- **Order Command Handlers**: Order command handlers implementing the dual-write pattern.
- **Order Deciders**: Pure decision functions for Order aggregate.
- **Order Domain Events**: Orders BC domain events (6 types, 2 schema versions).
- **Order Fulfillment Saga**: Order Fulfillment Saga.
- **Order Items Projection**: Order line items read model.
- **Order Management Infrastructure**: Infrastructure setup for the order-management application.
- **Order Notification PM**: Process manager: OrderConfirmed -> SendNotification command.
- **Order Public API**: App-level public API for Orders bounded context.
- **Order Summary Projection**: OrderSummary projection handlers (app-level).
- **Order With Inventory Projection**: OrderWithInventoryStatus cross-context projection handlers (app-level).
- **Outbox Pattern for Action Results**: Captures external API results (success or failure) as domain events using the `onComplete` callback guarantee from...
- **Partition Key Helper Functions**: Standardized partition key generation for per-entity event ordering and OCC prevention in Workpool-based processing.
- **Payment Outbox Handler**: Payment Outbox Handler - Captures payment action results as events.
- **Per-Projection Partition Configuration**: Defines configuration types and constants for projection partitioning including parallelism recommendations based on...
- **Poison Event Handling**: Events that cause projection processing failures are tracked; after N failures, they are quarantined and skipped to...
- **Process Manager**: Process Manager module for event-reactive coordination.
- **Process Manager Lifecycle**: FSM for managing PM state transitions (idle/processing/completed/failed) with validation.
- **Product Catalog Projection**: Product catalog read model.
- **Projection Checkpointing**: Projection checkpoint helper for idempotent event processing.
- **Projection Complexity Classifier**: Analyzes projection characteristics and recommends appropriate partition strategies using a decision tree approach.
- **Projection Dead Letters**: Dead letter queue for failed projection and subscription handlers.
- **Projection Definitions**: Registry of all projection definitions and replay handler registry.
- **Query Abstraction**: Query factory functions for creating type-safe read model queries.
- **Rate Limit Definitions**: Centralized rate limit configuration for the order-management application.
- **Reactive Projection Conflict Detection**: As a platform developer I want conflicts detected and resolved automatically So that data integrity is maintained...
- **Reactive Projection Eligibility**: As a platform developer I want only view projections to support reactive updates So that system resources are optimized...
- **Reactive Projection Hybrid Model**: As a frontend developer I want projections that combine durability with instant feedback So that users see optimistic...
- **Reactive Projection Shared Evolve**: As a platform developer I want evolve logic shared between client and server So that state transformations are always...
- **Replay Progress Utilities**: Progress calculation utilities for replay operations.
- **Reservation Release PM**: Process manager: OrderCancelled -> ReleaseReservation command.
- **Saga Completion Handler**: Workflow onComplete callback handler.
- **Saga Orchestration Executable Tests**: Provenance: This file was authored under the refactoring carve-out to expose SagaOrchestration in the PatternGraph.
- **Saga Registry**: Saga registry providing idempotent saga start (startSagaIfNotExists), status tracking, and Zod payload validation at...
- **Saga Router**: Routes domain events to saga workflows.
- **Workpool Partition Key Types**: Provides type definitions for partition key strategies that ensure per-entity event ordering and prevent OCC conflicts.
- **Workpool Partitioning Strategy**: Standardized partition key patterns for event ordering and OCC prevention in Workpool-based projection processing.

---
