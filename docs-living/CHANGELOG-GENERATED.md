# Changelog

**Purpose:** Project changelog in Keep a Changelog format

---

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

---

## [Unreleased]

### Added

- **Command Config Partition Key Validation**: Validates that all projection configurations in a command config have explicit partition keys defined.
- **Process Enhancements**: Vision: Transform the delivery process from a documentation tool into a delivery operating system.
- **Release V 020**: Converts the aggregate-less pivot roadmap into executable specs for Phases 14-22.
- **Confirmed Order Cancellation**: Problem: The Order FSM treats `confirmed` as terminal.
- **Agent LLM Integration**: Problem: The agent event handler (`handleChurnRiskEvent`) is a Convex mutation that cannot call external APIs.
- **Agent BC Component Isolation**: Problem: Agent BC tables (`agentCheckpoints`, `agentAuditEvents`, `agentDeadLetters`, `agentCommands`,...
- **Themed Decision Architecture**: Decisions (ADRs, PDRs) should not be "dumped into same folder" when generated.
- **Test Content Blocks**: This feature demonstrates what content blocks are captured and rendered by the PRD generator.
- **Repo Level Docs Generation**: As a monorepo maintainer, I want unified documentation generation from multiple sources.
- **Process Metadata Expansion**: The monorepo's delivery process lacked metadata tags for variance tracking, governance, and hierarchical views.
- **Codec Driven Reference Generation**: Reference documentation is specified via 11 recipe `.feature` files in `delivery-process/recipes/`.

---

## [v0.3.0]

### Added

- **PDR 006 TypeScript Taxonomy**
- **Release V 030**: Completes the migration from JSON to TypeScript as the source of truth for the delivery process taxonomy.

---

## [v0.2.0]

### Added

- **PDR 010 Cross Component Argument Injection**
- **PDR 009 Design Session Methodology**
- **PDR 008 Example App Purpose**
- **PDR 007 Two Tier Spec Architecture**
- **Example App Modernization**: Problem: The `order-management` example app has grown organically during platform development.
- **Workpool Partitioning Strategy**: Problem: ADR-018 defines critical partition key strategies for preventing OCC conflicts and ensuring per-entity event...
- **Saga Orchestration**: Problem: Cross-BC operations (e.g., Order -> Inventory -> Shipping) cannot use atomic transactions because bounded...
- **Reservation Pattern**: Problem: Uniqueness constraints before entity creation require check-then-create patterns with race condition risk,...
- **Reactive Projections**: Problem: Workpool-based projections have 100-500ms latency.
- **Projection Categories**: Problem: Projections exist but categories are implicit.
- **Package Architecture**: The original @convex-es/core package grew to 25+ modules, creating issues: - Large bundle size for consumers who only...
- **Event Store Foundation**: Problem: Event Sourcing requires centralized storage for domain events with ordering guarantees, concurrency control,...
- **Event Store Durability**: Problem: The dual-write pattern (CMS + Event) works when both operations are in the same mutation, but several...
- **Event Replay Infrastructure**: Problem: When projections become corrupted, require schema migration, or drift from the Event Store due to bugs,...
- **Ecst Fat Events**: Problem: Thin events require consumers to query back to the source BC, creating coupling and requiring synchronous...
- **Dynamic Consistency Boundaries**: Problem: Cross-entity invariants within a bounded context currently require sequential commands (no atomicity) or...
- **Durable Function Adapters**: Problem: Platform has well-defined interfaces (RateLimitChecker, DCB conflict handling) but uses in-memory...
- **Durable Events Integration**: Problem: Phase 18 delivered durability primitives to `platform-core`, but the example app's main command flow still...
- **Decider Pattern**: Problem: Domain logic embedded in handlers makes testing require infrastructure.
- **Command Bus Foundation**: Problem: Command execution requires idempotency (same command = same result), status tracking, and a standardized...
- **Bounded Context Foundation**: Problem: DDD Bounded Contexts need clear boundaries with physical enforcement, type-safe contracts, and domain purity...
- **Bdd Testing Infrastructure**: Problem: Domain logic tests require infrastructure (Docker, database).
- **Agent Command Infrastructure**: Problem: Three interconnected gaps in agent command infrastructure: 1.
- **Agent As Bounded Context**: Problem: AI agents are invoked manually without integration into the event-driven architecture.

---

## [v0.1.0]

### Added

- **Unified Tag Prefix Architecture**
- **PDR 003 Behavior Feature File Structure**
- **Release Management Architecture**
- **PDR 001 Process Decisions Folder**

---

## [Earlier]

### Added

- **Handler Factories**: The Decider pattern separates pure business logic from infrastructure concerns, enabling unit testing without...
- **Event Store**: Central event storage component for Event Sourcing.
- **CMS Repository**: Factory for typed data access with automatic schema upcasting in dual-write handlers.
- **Query Abstraction**: Query factory functions for creating type-safe read model queries.
- **Process Manager Lifecycle**: FSM for managing PM state transitions (idle/processing/completed/failed) with validation.
- **Process Manager**: Process Manager module for event-reactive coordination.
- **Projection Checkpointing**: Projection checkpoint helper for idempotent event processing.
- **Command Orchestrator**: The CommandOrchestrator encapsulates the 7-step dual-write + projection execution pattern that is central to this...
- **Logging Infrastructure**: Factory for domain-specific loggers with scope prefixes and level filtering.
- **Middleware Pipeline**: Orchestrates middleware execution in the correct order.
- **Invariant Framework**: Factory for declarative business rule validation with typed error codes.
- **Event Bus Abstraction**: Durable event pub/sub using Workpool for parallelism, retries, and dead letter handling.
- **Event Upcasting**: Transforms events from older schema versions to current version at read time.
- **DCB Types**: Types for scope-based multi-entity coordination within bounded contexts.
- **DCB Scope Key Utilities**: Functions for creating, parsing, and validating scope keys.
- **Correlation Chain System**: Correlation types for tracking causal relationships in command-event flows.
- **Event Store Durability Types**: Core types for durable event persistence patterns: - Outbox pattern for action result capture - Idempotent event...
- **Durable Cross-Context Event Publication**: Cross-context events use Workpool-backed publication with tracking, retry, and dead letter handling.
- **Poison Event Handling**: Events that cause projection processing failures are tracked; after N failures, they are quarantined and skipped to...
- **Outbox Pattern for Action Results**: Captures external API results (success or failure) as domain events using the `onComplete` callback guarantee from...
- **Intent/Completion Event Pattern**: Long-running operations bracket with intent and completion events for visibility, timeout detection, and...
- **Event Store Durability**: Guaranteed event persistence patterns for Convex-native event sourcing.
- **Idempotent Event Append**: Ensures each logical event is stored exactly once in the event store, regardless of how many times the append...
- **Durable Append via Workpool Actions**: Failed event appends from async contexts are retried via Workpool actions with exponential backoff until success or...
- **CMS Dual Write**: Core types for Command Model State - the continuously updated aggregate snapshot maintained atomically alongside...
- **Command Bus**: Type-safe client for the Convex Command Bus component providing infrastructure-level idempotency.
- **Bounded Context Identity**: BoundedContextFoundation:bounded-context-identity Core identification contract for bounded contexts, providing...
- **Dual Write Contract**: BoundedContextFoundation:dual-write-contract Type-safe contract for bounded contexts using the dual-write pattern,...
- **Workpool Partition Key Types**: Provides type definitions for partition key strategies that ensure per-entity event ordering and prevent OCC conflicts.
- **Workpool Partitioning Strategy**: Standardized partition key patterns for event ordering and OCC prevention in Workpool-based projection processing.
- **Partition Key Helper Functions**: Standardized partition key generation for per-entity event ordering and OCC prevention in Workpool-based processing.
- **Per-Projection Partition Configuration**: Defines configuration types and constants for projection partitioning including parallelism recommendations based on...
- **Projection Complexity Classifier**: Analyzes projection characteristics and recommends appropriate partition strategies using a decision tree approach.
- **Types for event replay and projection rebuilding.**: Types for event replay and projection rebuilding.
- **Progress calculation utilities for replay operations.**: Progress calculation utilities for replay operations.
- **Foundation Infrastructure**: Consolidates old roadmap phases 0-13 into a single completed milestone.

---
