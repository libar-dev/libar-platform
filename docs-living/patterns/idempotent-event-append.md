# ✅ Idempotent Event Append

**Purpose:** Detailed documentation for the Idempotent Event Append pattern

---

## Overview

| Property | Value          |
| -------- | -------------- |
| Status   | completed      |
| Category | Event Sourcing |

## Description

Ensures each logical event is stored exactly once in the event store,
regardless of how many times the append operation is retried.

### Idempotency Key Strategy

| Event Source   | Pattern                                | Example                                  |
| -------------- | -------------------------------------- | ---------------------------------------- |
| Command result | `{commandType}:{entityId}:{commandId}` | `SubmitOrder:ord-123:cmd-456`            |
| Action result  | `{actionType}:{entityId}`              | `payment:ord-123`                        |
| Saga step      | `{sagaType}:{sagaId}:{step}`           | `OrderFulfillment:saga-789:reserveStock` |
| Scheduled job  | `{jobType}:{scheduleId}:{timestamp}`   | `expireReservations:job-001:1704067200`  |

### Usage

```typescript
const result = await idempotentAppendEvent(ctx, {
  idempotencyKey: `payment:${orderId}`,
  streamType: "Order",
  streamId: orderId,
  eventType: "PaymentCompleted",
  eventData: { chargeId, amount },
});

if (result.status === "duplicate") {
  // Event already exists, no action needed
}
```

## Use Cases

- When appending events that may be retried or deduplicated

---

[← Back to Pattern Registry](../PATTERNS.md)
