# ✅ Intent/Completion Event Pattern

**Purpose:** Detailed documentation for the Intent/Completion Event Pattern pattern

---

## Overview

| Property | Value          |
| -------- | -------------- |
| Status   | completed      |
| Category | Event Sourcing |

## Description

Long-running operations bracket with intent and completion events
for visibility, timeout detection, and reconciliation support.

### Why Intent/Completion?

Without bracketing, partially-completed operations are:

- Invisible to monitoring
- Undetectable by reconciliation
- Missing from audit trail

Intent events enable timeout detection and manual intervention
for stuck operations.

### Pattern

| Operation          | Intent Event             | Completion Events                                               |
| ------------------ | ------------------------ | --------------------------------------------------------------- |
| Order submission   | OrderSubmissionStarted   | OrderSubmitted, OrderSubmissionFailed, OrderSubmissionAbandoned |
| Payment processing | PaymentProcessingStarted | PaymentCompleted, PaymentFailed                                 |
| Stock reservation  | ReservationRequested     | StockReserved, ReservationFailed                                |

### Timeout Handling

The timeout handler is a scheduled mutation via `ctx.scheduler.runAfter`.
This is appropriate because timeout checks are lightweight (query + conditional write).
The handler MUST be idempotent as multiple schedulers might fire for the same intent.

### Usage

```typescript
// Record intent at operation start
const intentKey = await recordIntent(ctx, {
  operationType: "OrderSubmission",
  streamType: "Order",
  streamId: orderId,
  timeoutMs: 5 * 60 * 1000, // 5 minutes
  onTimeout: internal.orders.checkSubmissionTimeout,
});

// ... perform operation ...

// Record completion
await recordCompletion(ctx, {
  intentKey,
  status: "success",
  result: { ... },
});
```

## Use Cases

- When operations span multiple steps and need visibility

---

[← Back to Pattern Registry](../PATTERNS.md)
