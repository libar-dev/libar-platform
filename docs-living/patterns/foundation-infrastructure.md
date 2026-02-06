# ✅ Foundation Infrastructure

**Purpose:** Detailed documentation for the Foundation Infrastructure pattern

---

## Overview

| Property | Value     |
| -------- | --------- |
| Status   | completed |
| Category | Arch      |
| Phase    | 1         |

## Description

Consolidates old roadmap phases 0-13 into a single completed milestone.

### Included Components

| Component    | Package        | Description                            |
| ------------ | -------------- | -------------------------------------- |
| Event Store  | platform-store | Central event storage with OCC         |
| Command Bus  | platform-bus   | Command idempotency infrastructure     |
| CMS Patterns | platform-core  | Command Model State dual-write         |
| Projections  | platform-core  | Checkpoint-based read model updates    |
| Correlation  | platform-core  | Request tracing via correlation chains |
| EventBus     | platform-core  | Publish/subscribe event delivery       |
| Middleware   | platform-core  | Command pipeline with hooks            |
| Invariants   | platform-core  | Domain rule enforcement                |

### Key Patterns Established

- **Dual-Write Pattern**: CMS update + event append atomic
- **Component Isolation**: Physical bounded context boundaries
- **Optimistic Concurrency**: Version-based conflict detection
- **Workpool-Based Projections**: Durable, ordered processing

Reference: docs/project-management/roadmap/ (old phases 0-13)

## Dependencies

- Enables: EventStore
- Enables: CommandBus
- Enables: CommandOrchestrator

---

[← Back to Pattern Registry](../PATTERNS.md)
