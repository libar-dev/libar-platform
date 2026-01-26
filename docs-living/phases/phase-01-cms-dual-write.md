# CMSDualWrite

**Purpose:** Detailed patterns for CMSDualWrite

---

## Summary

**Progress:** [████████████████████] 2/2 (100%)

| Status       | Count |
| ------------ | ----- |
| ✅ Completed | 2     |
| 🚧 Active    | 0     |
| 📋 Planned   | 0     |
| **Total**    | 2     |

---

## ✅ Completed Patterns

### ✅ CMS Dual Write

| Property | Value     |
| -------- | --------- |
| Status   | completed |

## CMS Dual-Write Pattern - O(1) State + Full Audit

Core types for Command Model State - the continuously updated aggregate snapshot
maintained atomically alongside events in the dual-write pattern.

### When to Use

- Defining aggregate state shapes (extend BaseCMS)
- Schema evolution with CMSUpcaster and CMSVersionConfig
- Timestamped records (use TimestampedCMS)
- Loading CMS with potential upcasting (use CMSLoadResult)

---

### ✅ Foundation Infrastructure

| Property | Value     |
| -------- | --------- |
| Status   | completed |

## Phase 1: Foundation Infrastructure

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

#### Enables

- Enables: EventStore
- Enables: CommandBus
- Enables: CommandOrchestrator

---

[← Back to Roadmap](../ROADMAP.md)
