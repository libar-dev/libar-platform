# Changelog

**Purpose:** Project changelog in Keep a Changelog format

---

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

---

## [Unreleased]

### Added

- **Command Config Partition Key Validation**: Validates that all projection configurations in a command config
- **Process Enhancements**: Vision: Transform the delivery process from a documentation tool into a delivery operating system.
- **Themed Decision Architecture**: Decisions (ADRs, PDRs) should not be "dumped into same folder" when generated.
- **Test Content Blocks**: This feature demonstrates what content blocks are captured and rendered
- **Process Metadata Expansion**: The monorepo's delivery process lacked metadata tags for variance tracking, governance, and hierarchical views.

---

## [v0.3.0]

### Added

- **PDR 006 TypeScript Taxonomy**

---

## [v0.2.0]

### Added

- **PDR 008 Example App Purpose**
- **PDR 007 Two Tier Spec Architecture**
- **Saga Orchestration**: Problem: Cross-BC operations (e.g., Order -> Inventory -> Shipping) cannot
- **Reservation Pattern**: Problem: Uniqueness constraints before entity creation require check-then-create
- **Reactive Projections**: Problem: Workpool-based projections have 100-500ms latency.
- **Projection Categories**: Problem: Projections exist but categories are implicit.
- **Package Architecture**: The original @convex-es/core package grew to 25+ modules, creating issues:
- **Event Store Foundation**: Problem: Event Sourcing requires centralized storage for domain events with
- **Event Store Durability**: Problem: The dual-write pattern (CMS + Event) works when both operations are in the
- **Event Replay Infrastructure**: Problem: When projections become corrupted, require schema migration, or drift from
- **Ecst Fat Events**: Problem: Thin events require consumers to query back to the source BC,
- **Dynamic Consistency Boundaries**: Problem: Cross-entity invariants within a bounded context currently require
- **Durable Function Adapters**: Problem: Platform has well-defined interfaces (RateLimitChecker, DCB conflict handling) but uses
- **Decider Pattern**: Problem: Domain logic embedded in handlers makes testing require infrastructure.
- **Command Bus Foundation**: Problem: Command execution requires idempotency (same command = same result),
- **Bounded Context Foundation**: Problem: DDD Bounded Contexts need clear boundaries with physical enforcement,
- **Bdd Testing Infrastructure**: Problem: Domain logic tests require infrastructure (Docker, database).
- **Example App Modernization**: Problem: The `order-management` example app has grown organically during platform

---

## [v0.1.0]

### Added

- **Unified Tag Prefix Architecture**
- **PDR 003 Behavior Feature File Structure**
- **Release Management Architecture**
- **PDR 001 Process Decisions Folder**

---

## [Q1-2026]

### Added

- **BDD World**: As a BDD test author
- **Polling Utilities**: As a developer writing integration tests
- **Test Environment Guards**: As a platform developer

---

## [Earlier]

### Added

- **Handler Factories**: The Decider pattern separates pure business logic from infrastructure concerns,
- **Event Store**: Central event storage component for Event Sourcing.
- **CMS Repository**: Factory for typed data access with automatic schema upcasting in dual-write handlers.
- **Query Abstraction**: Query factory functions for creating type-safe read model queries.
- **Projection Checkpointing**: Projection checkpoint helper for idempotent event processing.
- **Process Manager Lifecycle**: FSM for managing PM state transitions (idle/processing/completed/failed) with validation.
- **Process Manager**: Process Manager module for event-reactive coordination.
- **Command Orchestrator**: The CommandOrchestrator encapsulates the 7-step dual-write + projection execution
- **Logging Infrastructure**: Factory for domain-specific loggers with scope prefixes and level filtering.
- **Middleware Pipeline**: Orchestrates middleware execution in the correct order.
- **Invariant Framework**: Factory for declarative business rule validation with typed error codes.
- **Event Upcasting**: Transforms events from older schema versions to current version at read time.
- **Event Bus Abstraction**: Durable event pub/sub using Workpool for parallelism, retries, and dead letter handling.
- **Event Store Durability Types**: Core types for durable event persistence patterns:
- **Durable Cross-Context Event Publication**: Cross-context events use Workpool-backed publication with tracking,
- **Poison Event Handling**: Events that cause projection processing failures are tracked; after N
- **Outbox Pattern for Action Results**: Captures external API results (success or failure) as domain events using
- **Intent/Completion Event Pattern**: Long-running operations bracket with intent and completion events
- **Event Store Durability**: Guaranteed event persistence patterns for Convex-native event sourcing.
- **Idempotent Event Append**: Ensures each logical event is stored exactly once in the event store,
- **Durable Append via Workpool Actions**: Failed event appends from async contexts are retried via Workpool actions
- **Correlation Chain System**: Correlation types for tracking causal relationships in command-event flows.
- **CMS Dual Write**: Core types for Command Model State - the continuously updated aggregate snapshot
- **Command Bus**: Type-safe client for the Convex Command Bus component providing infrastructure-level idempotency.
- **Bounded Context Identity**: BoundedContextFoundation:bounded-context-identity
- **Dual Write Contract**: BoundedContextFoundation:dual-write-contract
- **Workpool Partition Key Types**: Provides type definitions for partition key strategies that ensure
- **Workpool Partitioning Strategy**: Standardized partition key patterns for event ordering and OCC prevention
- **Partition Key Helper Functions**: Standardized partition key generation for per-entity event ordering
- **Per-Projection Partition Configuration**: Defines configuration types and constants for projection partitioning
- **Projection Complexity Classifier**: Analyzes projection characteristics and recommends appropriate
- **Types for event replay and projection rebuilding.**: Types for event replay and projection rebuilding.
- **Progress calculation utilities for replay operations.**: Progress calculation utilities for replay operations.
- **Foundation Infrastructure**: Consolidates old roadmap phases 0-13 into a single completed milestone.
- **Reactive Projection Shared Evolve**: As a platform developer
- **Reactive Projection Eligibility**: As a platform developer
- **Reactive Projection Hybrid Model**: As a frontend developer
- **Reactive Projection Conflict Detection**: As a platform developer

---
