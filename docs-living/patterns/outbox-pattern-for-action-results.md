# ✅ Outbox Pattern for Action Results

**Purpose:** Detailed documentation for the Outbox Pattern for Action Results pattern

---

## Overview

| Property | Value          |
| -------- | -------------- |
| Status   | completed      |
| Category | Event Sourcing |

## Description

Captures external API results (success or failure) as domain events using
the `onComplete` callback guarantee from Workpool/Action Retrier.

### Why Outbox Pattern?

Actions are at-most-once by default. If an action succeeds but the subsequent
event append fails, the side effect is orphaned. The outbox pattern uses
`onComplete` callbacks which are guaranteed to be called after the action finishes.

### onComplete Guarantee

The `onComplete` mutation is scheduled atomically when the action completes.
It will be called regardless of action success/failure/cancel. If the
`onComplete` mutation itself fails:

- Convex OCC auto-retry handles transient conflicts
- If OCC exhausted, the failure is logged for manual recovery
- The `context` parameter preserves all data needed for recovery

### Usage

```typescript
// Create the onComplete handler
export const onPaymentComplete = createOutboxHandler({
  getIdempotencyKey: (ctx) => `payment:${ctx.orderId}`,
  buildEvent: (result, ctx) => ({
    streamType: "Order",
    streamId: ctx.orderId,
    eventType: result.kind === "success" ? "PaymentCompleted" : "PaymentFailed",
    eventData:
      result.kind === "success"
        ? { chargeId: result.returnValue.chargeId }
        : { error: result.error },
  }),
});

// Use with Action Retrier
await retrier.run(ctx, internal.payments.chargeStripe, args, {
  onComplete: internal.payments.onPaymentComplete,
  context: { orderId, customerId, amount },
});
```

## Use Cases

- When capturing external API results as domain events

---

[← Back to Pattern Registry](../PATTERNS.md)
