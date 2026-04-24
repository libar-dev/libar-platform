# EventBusAbstraction

**Purpose:** Detailed patterns for EventBusAbstraction

---

## Summary

**Progress:** [████████████████████] 3/3 (100%)

| Status      | Count |
| ----------- | ----- |
| ✅ Completed | 3     |
| 🚧 Active   | 0     |
| 📋 Planned  | 0     |
| **Total**   | 3     |

---

## ✅ Completed Patterns

### ✅ Correlation Chain System

| Property | Value     |
| -------- | --------- |
| Status   | completed |

## Correlation Chain - Request Tracing

Correlation types for tracking causal relationships in command-event flows.
Provides structured tracing via commandId, correlationId, and causationId.

### When to Use

- Tracking causal relationships between commands and events
- Idempotency via commandId in Command Bus
- Request tracing across BC boundaries via correlationId
- Deriving new correlation chains from parent events (PMs, Sagas)

---

### ✅ Event Bus Abstraction

| Property | Value     |
| -------- | --------- |
| Status   | completed |

## EventBus - Pub/Sub for Domain Events

Durable event pub/sub using Workpool for parallelism, retries, and dead letter handling.
Publishes domain events to matching subscriptions with priority-based ordering.

### When to Use

- Publishing domain events to multiple subscribers via Workpool
- Priority-based subscription ordering for event handlers
- Building projections, process managers, or sagas that react to events

---

### ✅ Event Upcasting

| Property | Value     |
| -------- | --------- |
| Status   | completed |

## Event Upcasting Pipeline - Schema Evolution

Transforms events from older schema versions to current version at read time.
Enables non-breaking schema evolution via centralized migration pipeline.

### When to Use

- Event schemas need to evolve without breaking existing stored events
- Migrating events from older versions during projection/replay reads
- Centralized schema migration via an upcaster registry

---

[← Back to Roadmap](../ROADMAP.md)
