# ✅ Durable Cross-Context Event Publication

**Purpose:** Detailed documentation for the Durable Cross-Context Event Publication pattern

---

## Overview

| Property | Value          |
| -------- | -------------- |
| Status   | completed      |
| Category | Event Sourcing |

## Description

Cross-context events use Workpool-backed publication with tracking,
retry, and dead letter handling.

### Why Durable Publication?

Fire-and-forget publication loses events when subscribers fail. For
event-driven architectures to be reliable, cross-context communication
must be durable with guaranteed delivery or explicit failure tracking.

### Publication Ownership

The source bounded context owns publication tracking. This maintains
BC boundaries and allows source-specific circuit breaker logic.

### Partition Key Strategy

Uses `pub:${eventId}:${targetContext}` to ensure per-event ordering
while allowing parallel delivery to different events. See
WorkpoolPartitioningStrategy spec for partition key patterns.

### Usage

```typescript
const publisher = createDurableEventPublisher(publicationPool, {
  maxAttempts: 5,
  initialBackoffMs: 100,
  base: 2,
});

await publisher.publish(ctx, {
  event: orderSubmittedEvent,
  sourceContext: "orders",
  targetContexts: ["inventory", "notifications"],
  correlationId,
});
```

## Use Cases

- When publishing events across bounded contexts durably

---

[← Back to Pattern Registry](../PATTERNS.md)
