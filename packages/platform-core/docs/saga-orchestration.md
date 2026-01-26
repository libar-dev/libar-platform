# Saga Orchestration - Cross-Context Coordination with Compensation

> **Pattern:** Durable multi-step workflows for cross-BC operations using @convex-dev/workflow
> **Reference Implementation:** See `examples/order-management/convex/sagas/`

---

## Overview

Saga Orchestration coordinates business processes that span multiple bounded contexts. Unlike intra-BC operations (which can use DCB for atomic consistency), cross-BC operations require eventual consistency with compensation logic to handle partial failures.

**Key insight:** Sagas are for cross-BC coordination. Intra-BC multi-entity operations should use DCB instead.

---

## 1. The Problem

### 1.1 Cross-BC Operations Cannot Use Atomic Transactions

When a business process spans multiple bounded contexts (e.g., Orders, Inventory, Shipping), each BC has an **isolated database**. There is no distributed transaction mechanism to atomically commit across all BCs.

```typescript
// Problem: No atomic transactions across bounded contexts
async function fulfillOrder(orderId: string) {
  await ordersBC.confirmOrder(orderId);     // Succeeds
  await inventoryBC.reserveStock(orderId);  // FAILS - Order is confirmed but no stock reserved!
  await shippingBC.schedulePickup(orderId); // Never reached
}
```

### 1.2 Partial Failures Leave Inconsistent State

Without coordination infrastructure:

| Scenario | Result |
| --- | --- |
| Step 2 fails after Step 1 succeeds | Inconsistent state (order confirmed, no inventory) |
| Network timeout after Step 2 | Unknown state (did inventory reserve succeed?) |
| Server restart mid-process | Lost progress, no recovery path |

---

## 2. The Solution: @convex-dev/workflow Integration

Sagas use Convex's durable workflow infrastructure to provide:

| Feature | Benefit |
| --- | --- |
| Durable execution | Survives server restarts, resumes from last step |
| Step-by-step persistence | Each completed step is recorded durably |
| Compensation support | Explicit logic to reverse partial operations |
| External events | Can pause waiting for external input (e.g., payment confirmation) |
| Built-in retry | Configurable retry with exponential backoff |

### 2.1 Infrastructure Setup

```typescript
// infrastructure.ts
import { WorkflowManager } from "@convex-dev/workflow";
import { components } from "./_generated/api";

export const workflowManager = new WorkflowManager(components.workflow, {
  workpoolOptions: {
    maxParallelism: 10,
    retryActionsByDefault: false,
    defaultRetryBehavior: {
      maxAttempts: 3,
      initialBackoffMs: 500,
      base: 2,
    },
    logLevel: "INFO",
  },
});
```

---

## 3. Saga Structure

### 3.1 The Three Components

A complete saga implementation requires three components:

| Component | Purpose | Location |
| --- | --- | --- |
| **Workflow Definition** | Business logic steps + compensation | `sagas/orderFulfillment.ts` |
| **Registry** | Idempotency + workflow lifecycle | `sagas/registry.ts` |
| **Router** | Event-to-saga mapping | `sagas/router.ts` |

### 3.2 Saga Flow: Trigger to Completion

```
Event (OrderSubmitted)
        │
        ▼
   ┌─────────┐
   │ Router  │ ─── Maps event type to saga type
   └────┬────┘
        │
        ▼
   ┌──────────┐
   │ Registry │ ─── Idempotency check (sagaId)
   └────┬─────┘     Creates saga record if new
        │
        ▼
   ┌──────────┐
   │ Workflow │ ─── Durable step execution
   └────┬─────┘
        │
        ├──► Success Path: Confirm operations
        │
        └──► Failure Path: Execute compensation
                    │
                    ▼
            ┌────────────┐
            │ onComplete │ ─── Update saga status
            └────────────┘
```

### 3.3 Workflow Definition Example

```typescript
// sagas/orderFulfillment.ts
export const orderFulfillmentWorkflow = workflowManager.define({
  args: {
    orderId: v.string(),
    customerId: v.string(),
    items: v.array(v.object({
      productId: v.string(),
      quantity: v.number(),
    })),
    correlationId: v.string(),
  },
  returns: v.object({
    status: v.union(v.literal("completed"), v.literal("compensated")),
    reservationId: v.optional(v.string()),
    reason: v.optional(v.string()),
  }),
  handler: async (ctx, args) => {
    // Step 1: Reserve inventory (cross-BC call)
    const reserveResult = await ctx.runMutation(reserveStockMutation, {
      orderId: args.orderId,
      items: args.items,
    });

    // Step 2: Handle result
    if (reserveResult.status === "failed" || reserveResult.status === "rejected") {
      // COMPENSATION: Cancel the order
      await ctx.runMutation(cancelOrderMutation, {
        orderId: args.orderId,
        reason: reserveResult.reason ?? "Inventory reservation failed",
        correlationId: args.correlationId,
      });

      return { status: "compensated", reason: reserveResult.reason };
    }

    // Step 3: Confirm order (success path)
    await ctx.runMutation(confirmOrderMutation, {
      orderId: args.orderId,
      correlationId: args.correlationId,
    });

    // Step 4: Confirm reservation
    if (reserveResult.data?.reservationId) {
      await ctx.runMutation(confirmReservationMutation, {
        reservationId: reserveResult.data.reservationId,
        correlationId: args.correlationId,
      });
    }

    return {
      status: "completed",
      reservationId: reserveResult.data?.reservationId
    };
  },
});
```

---

## 4. Saga Idempotency

### 4.1 The Problem: Duplicate Triggers

Events can be delivered multiple times due to:
- Network retries
- At-least-once delivery guarantees
- Event reprocessing during recovery

Without idempotency, each delivery would start a new saga workflow.

### 4.2 The Solution: startSagaIfNotExists

```typescript
// sagas/registry.ts
export const startSagaIfNotExists = internalMutation({
  args: {
    sagaType: v.string(),
    sagaId: v.string(),          // Business identifier (e.g., orderId)
    triggerEventId: v.string(),
    triggerGlobalPosition: v.number(),
    eventPayload: v.any(),
    correlationId: v.string(),
  },
  handler: async (ctx, args) => {
    // 1. Check for existing saga (idempotency)
    const existing = await ctx.db
      .query("sagas")
      .withIndex("by_sagaId", (q) =>
        q.eq("sagaType", args.sagaType).eq("sagaId", args.sagaId)
      )
      .first();

    if (existing) {
      // Saga already exists - return existing info
      return {
        status: "exists" as const,
        sagaStatus: existing.status,
        workflowId: existing.workflowId,
      };
    }

    // 2. Validate payload with saga-specific schema
    const parseResult = OrderFulfillmentPayloadSchema.safeParse(args.eventPayload);
    if (!parseResult.success) {
      throw new Error(`Invalid payload: ${parseResult.error.message}`);
    }

    // 3. Start workflow with onComplete callback
    const workflowId = await workflowManager.start(
      ctx,
      orderFulfillmentWorkflowRef,
      { orderId: args.sagaId, ...parseResult.data, correlationId: args.correlationId },
      {
        onComplete: onSagaCompleteRef,
        context: { sagaType: args.sagaType, sagaId: args.sagaId },
      }
    );

    // 4. Create saga record
    await ctx.db.insert("sagas", {
      sagaType: args.sagaType,
      sagaId: args.sagaId,
      workflowId,
      status: "pending",
      triggerEventId: args.triggerEventId,
      triggerGlobalPosition: args.triggerGlobalPosition,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    return { status: "created" as const, workflowId };
  },
});
```

### 4.3 Idempotency Key Selection

| Entity Type | Recommended sagaId | Rationale |
| --- | --- | --- |
| Order processing | `orderId` | One fulfillment saga per order |
| Payment processing | `paymentId` | One payment saga per payment |
| User onboarding | `userId` | One onboarding saga per user |
| Batch job | `batchId` | One saga per batch |

---

## 5. Compensation Logic

### 5.1 The Compensation Pattern

When step N fails after steps 1..(N-1) succeeded, compensation reverses the completed steps in reverse order.

### 5.2 Compensation Table

| Step | Success Action | Compensation Action |
| --- | --- | --- |
| 1. Reserve inventory | Stock marked as reserved | Release reservation |
| 2. Charge payment | Payment captured | Refund payment |
| 3. Update order | Order status = confirmed | Cancel order |
| 4. Schedule shipping | Pickup scheduled | Cancel pickup |

### 5.3 Compensation Implementation Strategies

**Strategy A: Inline Compensation (Simple)**

```typescript
handler: async (ctx, args) => {
  const reserveResult = await ctx.runMutation(reserveStockMutation, args);

  if (reserveResult.status === "failed") {
    // Compensation inline
    await ctx.runMutation(cancelOrderMutation, {
      orderId: args.orderId,
      reason: "Inventory reservation failed",
    });
    return { status: "compensated" };
  }
  // ... continue success path
}
```

**Strategy B: Try-Catch Compensation (Complex)**

```typescript
handler: async (ctx, args) => {
  let reservationId: string | undefined;
  let paymentId: string | undefined;

  try {
    // Step 1: Reserve
    const reserve = await ctx.runMutation(reserveStockMutation, args);
    reservationId = reserve.data.reservationId;

    // Step 2: Charge
    const payment = await ctx.runMutation(chargePaymentMutation, args);
    paymentId = payment.data.paymentId;

    // Step 3: Confirm
    await ctx.runMutation(confirmOrderMutation, args);

    return { status: "completed" };
  } catch (error) {
    // Compensate in reverse order
    if (paymentId) {
      await ctx.runMutation(refundPaymentMutation, { paymentId });
    }
    if (reservationId) {
      await ctx.runMutation(releaseReservationMutation, { reservationId });
    }
    await ctx.runMutation(cancelOrderMutation, {
      orderId: args.orderId,
      reason: error.message
    });
    return { status: "compensated", reason: error.message };
  }
}
```

### 5.4 Compensation Best Practices

| Practice | Rationale |
| --- | --- |
| Compensation must be idempotent | May be retried on failure |
| Log compensation actions | Audit trail for debugging |
| Handle compensation failures | May need manual intervention |
| Track partial compensation | Know what was undone |

---

## 6. External Status Tracking

### 6.1 Why External Tracking?

Workflow handlers should remain **pure** - focused on business logic without direct database access. Status tracking is handled by the `onComplete` callback.

### 6.2 onComplete Callback

```typescript
// sagas/completion.ts
export const onSagaComplete = internalMutation({
  args: {
    workflowId: vWorkflowId,
    result: vResultValidator,
    context: v.object({
      sagaType: v.string(),
      sagaId: v.string(),
    }),
  },
  handler: async (ctx, { workflowId, result, context }) => {
    const saga = await ctx.db
      .query("sagas")
      .withIndex("by_sagaId", (q) =>
        q.eq("sagaType", context.sagaType).eq("sagaId", context.sagaId)
      )
      .first();

    if (!saga) return;

    const now = Date.now();

    if (result.kind === "success") {
      await ctx.db.patch(saga._id, {
        status: "completed",
        completedAt: now,
        updatedAt: now,
      });
      // Cleanup workflow data (no longer needed)
      await workflowManager.cleanup(ctx, workflowId);
    } else if (result.kind === "failed") {
      await ctx.db.patch(saga._id, {
        status: "failed",
        error: result.error,
        updatedAt: now,
      });
      // Preserve workflow for debugging
    } else if (result.kind === "canceled") {
      await ctx.db.patch(saga._id, {
        status: "failed",
        error: "Canceled",
        updatedAt: now,
      });
      await workflowManager.cleanup(ctx, workflowId);
    }
  },
});
```

### 6.3 Saga Status FSM

```
pending ──► running ──► completed
   │           │
   │           ├──► compensating ──► compensated
   │           │
   │           └──► failed
   │
   └──► failed (validation error)
```

| Status | Description |
| --- | --- |
| `pending` | Saga created, workflow not yet started |
| `running` | Workflow executing steps |
| `completed` | All steps succeeded |
| `compensating` | Executing compensation logic |
| `compensated` | Compensation completed |
| `failed` | Unrecoverable failure |

---

## 7. Decision Tree: Saga vs Process Manager

### 7.1 Quick Decision

```
Need compensation for failures? ─────► Yes → Saga
        │
        No
        ▼
Multi-step with await/external events? ► Yes → Saga
        │
        No
        ▼
Simple event → command fire-and-forget? ► Process Manager
```

### 7.2 Detailed Comparison

| Criterion | Saga | Process Manager |
| --- | --- | --- |
| **Compensation** | Built-in, explicit | None (fire-and-forget) |
| **Durability** | @convex-dev/workflow | @convex-dev/workpool |
| **External events** | `ctx.awaitEvent()` | Not supported |
| **Complexity** | Higher (compensation logic) | Lower (just routing) |
| **Use case** | Order fulfillment, payments | Notifications, analytics |
| **State tracking** | Full workflow state | Event processing cursor |
| **Failure handling** | Compensate + retry | Dead letter + retry |

### 7.3 Example Scenarios

| Scenario | Pattern | Rationale |
| --- | --- | --- |
| Order → Inventory → Shipping | Saga | Needs compensation if shipping fails |
| Order → Send confirmation email | Process Manager | Fire-and-forget, retry is sufficient |
| Payment → Wait for webhook → Confirm | Saga | External event (await webhook) |
| User signup → Analytics event | Process Manager | Simple event translation |
| Multi-step approval workflow | Saga | External events (human approval) |

### 7.4 Hybrid Approach

Some scenarios benefit from both patterns:

```
OrderSubmitted event
        │
        ├──► Saga: Order Fulfillment (compensation required)
        │
        └──► Process Manager: Send notification email (fire-and-forget)
```

---

## 8. Saga Table Schema

```typescript
// schema.ts
sagas: defineTable({
  /** Type of the saga (e.g., "OrderFulfillment") */
  sagaType: v.string(),

  /** Business identifier for idempotency (e.g., orderId) */
  sagaId: v.string(),

  /** Workflow run ID from @convex-dev/workflow */
  workflowId: v.string(),

  /** Current saga status */
  status: v.union(
    v.literal("pending"),
    v.literal("running"),
    v.literal("completed"),
    v.literal("failed"),
    v.literal("compensating"),
    v.literal("compensated")
  ),

  /** ID of the event that triggered this saga */
  triggerEventId: v.string(),

  /** Global position of trigger event (for ordering) */
  triggerGlobalPosition: v.number(),

  /** Timestamps */
  createdAt: v.number(),
  updatedAt: v.number(),
  completedAt: v.optional(v.number()),

  /** Error message if failed */
  error: v.optional(v.string()),
})
  .index("by_sagaId", ["sagaType", "sagaId"])
  .index("by_status", ["sagaType", "status"])
  .index("by_workflowId", ["workflowId"])
```

---

## 9. Admin Operations

### 9.1 Monitoring Queries

| Query | Purpose |
| --- | --- |
| `getSagaDetails` | Full saga + workflow status |
| `getStuckSagas` | Running longer than threshold |
| `getFailedSagas` | Failed sagas needing attention |
| `getSagaStats` | Status counts by saga type |
| `getSagaSteps` | Workflow step history |

### 9.2 Intervention Mutations

| Mutation | Use Case |
| --- | --- |
| `markSagaFailed` | Force-fail a stuck saga |
| `markSagaCompensated` | Record manual compensation |
| `cancelSaga` | Cancel running workflow |
| `retrySaga` | Reset failed saga to pending |
| `cleanupSagaWorkflow` | Free workflow storage |

---

## Related Documents

- [DCB Architecture](./dcb-architecture.md) - Intra-BC multi-entity operations
- [Event Store Durability](./event-store-durability.md) - Event append guarantees
- [Durable Function Adapters](./durable-function-adapters.md) - Workpool/Workflow overview
