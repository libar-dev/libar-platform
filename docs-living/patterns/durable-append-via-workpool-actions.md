# ✅ Durable Append via Workpool Actions

**Purpose:** Detailed documentation for the Durable Append via Workpool Actions pattern

---

## Overview

| Property | Value      |
| -------- | ---------- |
| Status   | completed  |
| Category | Implements |

## Description

Failed event appends from async contexts are retried via Workpool actions
with exponential backoff until success or dead letter.

### Why Action Wrapper?

Workpool only retries actions, not mutations. By wrapping the idempotent
append mutation in an action, we get Workpool retry semantics while the
underlying idempotent check prevents duplicates.

### When to Use

| Scenario                    | Use durableAppendEvent? | Why                                      |
| --------------------------- | ----------------------- | ---------------------------------------- |
| Synchronous command handler | No                      | Atomic dual-write handles this           |
| Action onComplete           | Recommended             | Mutation can fail after action succeeded |
| Saga step                   | Yes                     | Step result must be captured             |
| Scheduled job               | Yes                     | Job completion must be recorded          |

### Architecture

```
durableAppendEvent (action)
  → ctx.runMutation(idempotentAppend, args)
  → If action fails, Workpool retries the action
  → Idempotency key prevents duplicate events
```

### Usage

```typescript
await durableAppendEvent(
  ctx,
  eventAppendPool,
  {
    idempotencyKey: `saga:${sagaId}:step3`,
    streamType: "Order",
    streamId: orderId,
    eventType: "ShipmentScheduled",
    eventData: { trackingNumber },
  },
  {
    retry: { maxAttempts: 5, initialBackoffMs: 100, base: 2 },
    onComplete: internal.saga.onAppendComplete,
    context: { sagaId, step: "step3" },
  }
);
```

## Use Cases

- When event append must survive failures in async contexts

---

[← Back to Pattern Registry](../PATTERNS.md)
