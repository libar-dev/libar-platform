# Changelog

**Purpose:** Project changelog in Keep a Changelog format

---

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

---

## [Unreleased]

### Added

- **Command Config Partition Key Validation**: Validates that all projection configurations in a command config have explicit partition keys defined.
- **Confirmed Order Cancellation**: Problem: The Order FSM treats `confirmed` as terminal.

---

## [v0.2.0]

### Added

- **PDR 008 Example App Purpose**
- **PDR 007 Two Tier Spec Architecture**
- **Example App Modernization**: Problem: The `order-management` example app has grown organically during platform development.
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
- **Decider Pattern**: Problem: Domain logic embedded in handlers makes testing require infrastructure.
- **Command Bus Foundation**: Problem: Command execution requires idempotency (same command = same result), status tracking, and a standardized...
- **Bounded Context Foundation**: Problem: DDD Bounded Contexts need clear boundaries with physical enforcement, type-safe contracts, and domain purity...
- **Bdd Testing Infrastructure**: Problem: Domain logic tests require infrastructure (Docker, database).
- **Agent As Bounded Context**: Problem: AI agents are invoked manually without integration into the event-driven architecture.

---

## [Earlier]

### Added

- **Handler Factories**: The Decider pattern separates pure business logic from infrastructure concerns, enabling unit testing without...
- **Event Store**: Central event storage component for Event Sourcing.
- **CMS Repository**: Factory for typed data access with automatic schema upcasting in dual-write handlers.
- **Query Abstraction**: Query factory functions for creating type-safe read model queries.
- **Projection Checkpointing**: Projection checkpoint helper for idempotent event processing.
- **Process Manager Lifecycle**: FSM for managing PM state transitions (idle/processing/completed/failed) with validation.
- **Process Manager**: Process Manager module for event-reactive coordination.
- **Command Orchestrator**: The CommandOrchestrator encapsulates the 7-step dual-write + projection execution pattern that is central to this...
- **Middleware Pipeline**: Orchestrates middleware execution in the correct order.
- **Logging Infrastructure**: Factory for domain-specific loggers with scope prefixes and level filtering.
- **Invariant Framework**: Factory for declarative business rule validation with typed error codes.
- **Event Upcasting**: Transforms events from older schema versions to current version at read time.
- **Event Bus Abstraction**: Durable event pub/sub using Workpool for parallelism, retries, and dead letter handling.
- **Event Store Durability Types**: Core types for durable event persistence patterns: - Outbox pattern for action result capture - Idempotent event...
- **Durable Cross-Context Event Publication**: Cross-context events use Workpool-backed publication with tracking, retry, and dead letter handling.
- **Poison Event Handling**: Events that cause projection processing failures are tracked; after N failures, they are quarantined and skipped to...
- **Outbox Pattern for Action Results**: Captures external API results (success or failure) as domain events using the `onComplete` callback guarantee from...
- **Intent/Completion Event Pattern**: Long-running operations bracket with intent and completion events for visibility, timeout detection, and...
- **Event Store Durability**: Guaranteed event persistence patterns for Convex-native event sourcing.
- **Idempotent Event Append**: Ensures each logical event is stored exactly once in the event store, regardless of how many times the append...
- **Durable Append via Workpool Actions**: Failed event appends from async contexts are retried via Workpool actions with exponential backoff until success or...
- **DCB Types**: Types for scope-based multi-entity coordination within bounded contexts.
- **DCB Scope Key Utilities**: Functions for creating, parsing, and validating scope keys.
- **CMS Dual Write**: Core types for Command Model State - the continuously updated aggregate snapshot maintained atomically alongside...
- **Correlation Chain System**: Correlation types for tracking causal relationships in command-event flows.
- **Command Bus**: Type-safe client for the Convex Command Bus component providing infrastructure-level idempotency.
- **Bounded Context Identity**: BoundedContextFoundation:bounded-context-identity Core identification contract for bounded contexts, providing...
- **Dual Write Contract**: BoundedContextFoundation:dual-write-contract Type-safe contract for bounded contexts using the dual-write pattern,...
- **Foundation Infrastructure**: Consolidates old roadmap phases 0-13 into a single completed milestone.
- **Workpool Partition Key Types**: Provides type definitions for partition key strategies that ensure per-entity event ordering and prevent OCC conflicts.
- **Workpool Partitioning Strategy**: Standardized partition key patterns for event ordering and OCC prevention in Workpool-based projection processing.
- **Partition Key Helper Functions**: Standardized partition key generation for per-entity event ordering and OCC prevention in Workpool-based processing.
- **Per-Projection Partition Configuration**: Defines configuration types and constants for projection partitioning including parallelism recommendations based on...
- **Projection Complexity Classifier**: Analyzes projection characteristics and recommends appropriate partition strategies using a decision tree approach.
- **Types for event replay and projection rebuilding.**: Types for event replay and projection rebuilding.
- **Progress calculation utilities for replay operations.**: Progress calculation utilities for replay operations.

---
