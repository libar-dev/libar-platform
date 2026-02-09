# ✅ Durable Events Integration

**Purpose:** Detailed requirements for the Durable Events Integration feature

---

## Overview

| Property       | Value                                       |
| -------------- | ------------------------------------------- |
| Status         | completed                                   |
| Product Area   | Platform                                    |
| Business Value | production reliability and failure recovery |
| Phase          | 18                                          |

## Description

**Problem:** Phase 18 delivered durability primitives to `platform-core`, but the example app's
main command flow still uses direct event append. Durability patterns exist only in test harnesses
(`testing/*.ts`), not in the production order/inventory flows. Users cannot see how to integrate
these patterns in realistic scenarios.

**Solution:** Integrate all Phase 18 durability patterns into the main order management flow:

- **Idempotent event append** with command-derived deduplication keys
- **Intent/completion bracketing** for failure recovery and orphan detection
- **Durable event publication** with Workpool-backed retry semantics
- **Outbox handler** for capturing external action results as events
- **Poison event handling** in production projection handlers
- **Projection rebuild demonstration** with realistic corruption recovery scenario

**Why It Matters for Convex-Native ES:**
| Benefit | How |
| Exactly-once event delivery | Idempotency keys prevent duplicate events on retry |
| Failure recovery | Intent bracketing detects stuck commands |
| Guaranteed action capture | Outbox pattern captures external API results as events |
| Operational visibility | Poison events quarantined with alerting |
| Data recovery | Projection rebuild from any position |

**Architecture Overview:**

```
Command Flow with Durability
────────────────────────────

┌──────────────────────────────────────────────────────────────────────────┐
│ CommandOrchestrator                                                       │
│                                                                           │
│  1. recordIntent()     ──► Intent event (timeout scheduled)              │
│         │                                                                 │
│  2. BC Handler         ──► CMS update + event via idempotentAppendEvent  │
│         │                   (deduplication via commandId:eventType)       │
│         │                                                                 │
│  3. recordCompletion() ──► Completion event (cancels timeout)            │
│         │                                                                 │
│  4. Projection         ──► Workpool.enqueue() with onComplete            │
│         │                   (deadLetterOnComplete for failures)           │
│         │                                                                 │
│  5. Saga (if needed)   ──► durableAppendEvent for critical events        │
└──────────────────────────────────────────────────────────────────────────┘

External Actions with Outbox
────────────────────────────

┌──────────────────────────────────────────────────────────────────────────┐
│ actionRetrier.run(ctx, chargeStripeAction, args, {                       │
│   onComplete: onPaymentComplete,  ◄── createOutboxHandler()              │
│   context: { orderId, amount }                                           │
│ })                                                                        │
│                                                                           │
│ onComplete receives:                                                      │
│   { kind: "success", returnValue: { chargeId } }                         │
│   { kind: "failed", error: "..." }                                       │
│   { kind: "canceled" }                                                   │
│                                                                           │
│ Outbox handler appends event:                                            │
│   PaymentCompleted or PaymentFailed                                      │
└──────────────────────────────────────────────────────────────────────────┘
```

**PDR-008 Alignment:** This demonstrates platform capabilities in realistic scenarios,
serves as reference implementation, and validates durability patterns work end-to-end.

## Acceptance Criteria

**First command creates event normally**

- Given an order "ord-123" in draft status
- And a SubmitOrder command with commandId "cmd-456"
- When the command is executed via DurableCommandOrchestrator
- Then an OrderSubmitted event should be created
- And the event should have idempotencyKey "cmd:SubmitOrder:ord-123:cmd-456"
- And the result status should be "appended"

**Retry with same commandId returns existing event**

- Given an OrderSubmitted event exists with idempotencyKey "cmd:SubmitOrder:ord-123:cmd-456"
- When a SubmitOrder command with commandId "cmd-456" is retried
- Then no new event should be created
- And the existing event should be returned
- And the result status should be "duplicate"
- And the eventId should match the original event

**Different commandId is rejected for already-submitted order**

- Given an OrderSubmitted event exists with idempotencyKey "cmd:SubmitOrder:ord-123:cmd-456"
- When a SubmitOrder command with commandId "cmd-789" is executed for order "ord-123"
- Then the request should be rejected by the decider
- And the rejection reason should be "order already submitted"

**Successful command records intent and completion**

- Given an order "ord-123" ready for submission
- When SubmitOrder command is executed with commandId "cmd-456"
- Then a commandIntent record should be created with status "pending"
- And the intent should have operationType "SubmitOrder"
- And after successful execution the intent status should be "completed"
- And the intent should have completedAt timestamp
- And the intent should reference the created eventId

**Failed command records intent and failure**

- Given an order "ord-123" already submitted
- When SubmitOrder command is executed with commandId "cmd-789"
- Then a commandIntent record should be created with status "pending"
- And after rejection the intent status should be "failed"
- And the intent should contain the rejection error "order already submitted"
- And the intent should have completedAt timestamp

**Orphaned intent detected by scheduled job**

- Given a commandIntent with status "pending" created 10 minutes ago
- And no completion was recorded
- When the orphan detection cron runs
- Then the intent should be flagged with status "abandoned"
- And an alert should be generated with command details
- And the alert should include correlationId for tracing

**Intent already exists for commandId**

- Given a commandIntent exists for operationType "SubmitOrder" and streamId "ord-123"
- And the intent was created within the last minute
- When recordIntent is called for the same operation
- Then the existing intent should be returned
- And no duplicate intent should be created
- And the operation should proceed with the existing intentKey

**Durable append succeeds on first try**

- Given the event store is healthy
- When durableAppendEvent is called for OrderSubmitted
- Then the event should be enqueued to Workpool
- And the Workpool job should execute immediately
- And the event should be persisted via idempotentAppendEvent
- And onComplete callback should receive kind "success"

**Durable append retries on transient failure**

- Given the event store experiences a transient error
- When durableAppendEvent is called for OrderSubmitted
- Then the Workpool should retry with exponential backoff
- And retry intervals should follow initialMs \* base^attempt
- And the event should eventually be persisted
- And onComplete callback should receive kind "success"

**Exhausted retries create dead letter**

- Given the event store is persistently unavailable
- When durableAppendEvent exhausts all retry attempts
- Then onComplete callback should receive kind "failed"
- And a dead letter record should be created in eventAppendDeadLetters
- And the dead letter should contain full event context
- And the dead letter status should be "pending"

**Multiple events for same entity maintain order**

- Given OrderSubmitted and OrderConfirmed events for order "ord-123"
- When both are enqueued via durableAppendEvent
- Then both should use partition key name "append"
- And partition key value should be "Order:ord-123"
- And the events should be processed in FIFO order
- And OrderSubmitted should complete before OrderConfirmed starts

**Successful payment creates PaymentCompleted event**

- Given an order "ord-123" awaiting payment
- When the Stripe charge action succeeds with chargeId "ch_xxx"
- Then the onComplete handler should receive kind "success"
- And a PaymentCompleted event should be appended
- And the event should have idempotencyKey "payment:ord-123"
- And the event should contain the chargeId and amount

**Failed payment creates PaymentFailed event**

- Given an order "ord-123" awaiting payment
- When the Stripe charge action fails with error "insufficient_funds"
- Then the onComplete handler should receive kind "failed"
- And a PaymentFailed event should be appended
- And the event should have idempotencyKey "payment:ord-123"
- And the event should contain the error message

**Duplicate completion is deduplicated**

- Given a PaymentCompleted event exists with idempotencyKey "payment:ord-123"
- When onComplete is called again with same context
- Then no new event should be created
- And idempotentAppendEvent should return status "duplicate"
- And the handler should complete successfully

**Valid event processed normally**

- Given a valid OrderCreated event with orderId "ord-123"
- When the withPoisonEventHandling wrapper processes it
- Then the underlying handler should be called
- And no poison event record should be created
- And the projection should be updated successfully

**Malformed event quarantined after max attempts**

- Given a malformed OrderCreated event with invalid customerId
- And the event has failed processing 2 times
- When the third processing attempt fails
- Then the event should be quarantined to poisonEvents table
- And the poison record status should be "quarantined"
- And the poison record should contain the last error
- And an alert should be logged with onQuarantine callback

**Quarantined event can be replayed after fix**

- Given a quarantined event in poisonEvents with status "quarantined"
- When an operator triggers replay via admin.poison.replayEvent
- Then the poison record status should become "pending"
- And the attempts counter should be reset to 0
- And subsequent processing should be attempted
- And on success the status should become "replayed"

**Quarantined event can be ignored**

- Given a quarantined event that cannot be fixed (corrupt source data)
- When an operator calls admin.poison.ignoreEvent with reason
- Then the poison record status should become "ignored"
- And the ignore reason should be recorded
- And no further processing should be attempted

**Rebuild from position 0 re-processes all events**

- Given orderSummaries projection with 50 events processed
- And the projection data is corrupted
- When admin triggers demonstrateRebuild for "orderSummary"
- Then a replayCheckpoint should be created with status "running"
- And all 50 events should be re-processed in order
- And the projection should match the expected state
- And the rebuild should complete with status "completed"

**Rebuild progress is trackable**

- Given a rebuild in progress for orderSummary
- When admin queries getRebuildStatus
- Then response should include eventsProcessed count
- And response should include currentPosition
- And response should include percentComplete (0-100)
- And response should include eventsPerSecond rate
- And response should include estimatedRemainingMs

**Running rebuild can be cancelled**

- Given a rebuild in progress for orderSummary
- When admin cancels the rebuild via cancelRebuild
- Then checkpoint status should become "cancelled"
- And no further event chunks should be processed
- And the response should include eventsProcessedBeforeCancel

**Concurrent rebuilds are prevented**

- Given a rebuild in progress for orderSummary with replayId "replay-123"
- When admin triggers another rebuild for orderSummary
- Then the request should be rejected
- And error should be "REPLAY_ALREADY_ACTIVE"
- And response should include existingReplayId "replay-123"

**Rebuild from specific position**

- Given orderSummary with global position at 100
- And corruption detected starting at position 75
- When admin triggers rebuild from position 75
- Then only events from position 75 onward should be processed
- And eventsProcessed should be approximately 25
- And earlier projection state should be preserved

**Orphan detected after threshold exceeded**

- Given a commandIntent with status "pending"
- And timeoutMs is 300000 (5 minutes)
- And createdAt was 6 minutes ago
- When the orphan detection cron runs
- Then the intent should be transitioned to status "abandoned"
- And the error should contain "Timeout exceeded"
- And an alert log should be emitted with command details

**Recent pending intent not flagged**

- Given a commandIntent with status "pending"
- And timeoutMs is 300000 (5 minutes)
- And createdAt was 2 minutes ago
- When the orphan detection cron runs
- Then the intent should remain in status "pending"
- And the intent should NOT be included in orphan count

**Completed intents are ignored**

- Given a commandIntent with status "completed"
- And createdAt was 10 minutes ago
- When the orphan detection cron runs
- Then the intent should NOT be processed
- And the intent status should remain "completed"

**Orphan detection reports metrics**

- Given 3 orphaned intents detected
- And 2 are SubmitOrder and 1 is ConfirmOrder
- When the orphan detection cron completes
- Then the response should include orphanCount 3
- And the response should include byOperationType
- And byOperationType should have SubmitOrder: 2
- And byOperationType should have ConfirmOrder: 1

**Full durable command flow**

- Given the order-management backend is running
- And test isolation with testRunId
- When a CreateOrder command is executed via DurableCommandOrchestrator
- Then intent should be recorded before execution
- And event should be appended with idempotency key
- And completion should be recorded after success
- And projection should be updated via Workpool

**Command retry produces same result**

- Given a SubmitOrder command that will succeed
- When the command is executed twice with same commandId
- Then only one OrderSubmitted event should exist in event store
- And both executions should return the same eventId
- And projection should reflect single submission
- And intent should have exactly one completion record

**Projection rebuild restores correct state**

- Given orders with known event sequence
- And orderSummaries projection data is cleared
- When admin triggers demonstrateRebuild for "orderSummary"
- And rebuild completes (status "completed")
- Then orderSummaries should match expected state
- And all order counts and totals should be correct
- And rebuild duration should be logged

## Business Rules

**Events are appended idempotently using command-derived keys**

**Invariant:** For any (commandId, eventType) tuple, at most one event can exist in the
event store. Duplicate append attempts return the existing event without modification.

    **Rationale:** Commands may be retried due to network partitions, client timeouts, or
    infrastructure failures. Without idempotency, retries would create duplicate events,
    corrupting projections and triggering duplicate side effects.

    **Verified by:** First command creates event normally, Retry with same commandId returns
    existing event, Different commandId creates new event

    **API Reference:** `@libar-dev/platform-core/src/durability/idempotentAppend.ts`

    **Current State (direct append):**

```typescript
// CommandOrchestrator uses direct append - no deduplication
await ctx.runMutation(eventStore.appendToStream, {
  streamType: "Order",
  streamId: orderId,
  eventType: "OrderSubmitted",
  eventData: { orderId, customerId },
  boundedContext: "orders",
});
```

**Target State (idempotent append via platform-core):**

```typescript
import { idempotentAppendEvent, buildCommandIdempotencyKey } from "@libar-dev/platform-core";

// Build command-derived idempotency key
const idempotencyKey = buildCommandIdempotencyKey(
  "SubmitOrder", // commandType
  orderId, // entityId
  commandId // unique command instance ID
);
// Result: "cmd:SubmitOrder:ord-123:cmd-456"

// Idempotent append with deduplication
const result = await idempotentAppendEvent(ctx, {
  event: {
    idempotencyKey,
    streamType: "Order",
    streamId: orderId,
    eventType: "OrderSubmitted",
    eventData: { orderId, customerId },
    boundedContext: "orders",
    correlationId,
  },
  dependencies: {
    getByIdempotencyKey: components.eventStore.lib.getByIdempotencyKey,
    appendToStream: components.eventStore.lib.appendToStream,
  },
});

// Handle deduplication transparently
if (result.status === "duplicate") {
  // Event already exists - command was already processed
  return { eventId: result.eventId, alreadyProcessed: true };
}
// result.status === "appended" - new event created
return { eventId: result.eventId, version: result.version };
```

**Integration Location:**
The idempotent append will be integrated into a new `DurableCommandOrchestrator` that
wraps the existing `CommandOrchestrator`. This preserves backward compatibility while
adding durability features opt-in per command.

_Verified by: First command creates event normally, Retry with same commandId returns existing event, Different commandId is rejected for already-submitted order_

**Commands record intent before execution and completion after success**

**Invariant:** Every command execution must have exactly one matching completion event.
An intent without completion after timeout indicates a stuck or crashed command.

    **Rationale:** Distributed systems fail in subtle ways - network partitions, process crashes,
    deadlocks. Intent bracketing creates an audit trail that enables detection of commands that
    started but never finished, enabling automated recovery or human intervention.

    **Verified by:** Successful command records intent and completion, Failed command records
    intent and failure, Orphaned intent detected by scheduled job, Intent already exists for commandId

    **API Reference:** `@libar-dev/platform-core/src/durability/intentCompletion.ts`

    **Pattern Implementation:**

```typescript
import {
  recordIntent,
  recordCompletion,
  buildIntentKey,
  type RecordIntentArgs,
  type CompletionStatus,
} from "@libar-dev/platform-core";

// Step 1: Record intent BEFORE command execution
const { intentKey, intentEventId } = await recordIntent(ctx, {
  operationType: "SubmitOrder",
  streamType: "Order",
  streamId: orderId,
  boundedContext: "orders",
  timeoutMs: 5 * 60 * 1000, // 5 minutes
  onTimeout: internal.admin.intents.handleTimeout,
  dependencies: intentDependencies,
  metadata: { customerId, itemCount },
  correlationId,
});

try {
  // Step 2: Execute command (CMS update + event append)
  const result = await executeCommand(ctx, command, args);

  // Step 3: Record successful completion
  await recordCompletion(ctx, {
    intentKey,
    status: "success",
    streamType: "Order",
    streamId: orderId,
    boundedContext: "orders",
    dependencies: intentDependencies,
    result: { eventId: result.eventId },
    correlationId,
  });

  return result;
} catch (error) {
  // Step 3 (failure path): Record failed completion
  await recordCompletion(ctx, {
    intentKey,
    status: "failure",
    streamType: "Order",
    streamId: orderId,
    boundedContext: "orders",
    dependencies: intentDependencies,
    error: error.message,
    correlationId,
  });
  throw error;
}
```

**Schema Addition (commandIntents table):**

```typescript
// schema.ts addition
    commandIntents: defineTable({
      intentKey: v.string(),
      operationType: v.string(),
      streamType: v.string(),
      streamId: v.string(),
      boundedContext: v.string(),
      status: v.union(v.literal("pending"), v.literal("completed"), v.literal("failed"), v.literal("abandoned")),
      timeoutMs: v.number(),
      metadata: v.optional(v.any()),
      correlationId: v.optional(v.string()),
      // Completion fields
      completedAt: v.optional(v.number()),
      completionEventId: v.optional(v.string()),
      error: v.optional(v.string()),
      createdAt: v.number(),
      updatedAt: v.number(),
    })
      .index("by_intentKey", ["intentKey"])
      .index("by_status_createdAt", ["status", "createdAt"])
      .index("by_streamId", ["streamType", "streamId"]),
```

_Verified by: Successful command records intent and completion, Failed command records intent and failure, Orphaned intent detected by scheduled job, Intent already exists for commandId_

**Critical events use Workpool-backed durable append**

**Invariant:** A durably-enqueued event will eventually be persisted or moved to dead letter.
The Workpool guarantees at-least-once execution with automatic retry and backoff.

    **Rationale:** Some events are too important to lose - payment confirmations, order submissions
    that trigger sagas, inventory reservations. These must survive transient failures (network
    issues, temporary unavailability) and be retried automatically.

    **Verified by:** Durable append succeeds on first try, Durable append retries on transient
    failure, Exhausted retries create dead letter, Multiple events for same entity maintain order

    **API Reference:** `@libar-dev/platform-core/src/durability/durableAppend.ts`

    **Use cases for durable append:**
    | Event | Why Critical |
    | OrderSubmitted | Triggers saga, must start workflow |
    | PaymentCompleted | Financial record, must persist |
    | ReservationConfirmed | Inventory commitment |

    **Implementation:**

```typescript
import {
  durableAppendEvent,
  createAppendPartitionKey,
  createDurableAppendActionHandler,
} from "@libar-dev/platform-core";

// infrastructure.ts - Create durable append pool
export const durableAppendPool = new Workpool(components.workpool, {
  maxParallelism: 10,
  retryBackoff: {
    initialMs: 100,
    base: 2,
    maxMs: 30000,
  },
});

// Durable append action handler
export const durableAppendAction = createDurableAppendActionHandler();

// Usage in command handler
const partitionKey = createAppendPartitionKey("Order", orderId);
// Result: { name: "append", value: "Order:ord-123" }

const result = await durableAppendEvent(ctx, {
  workpool: durableAppendPool,
  actionRef: internal.eventStore.durableAppendAction,
  append: {
    event: {
      idempotencyKey: buildCommandIdempotencyKey("SubmitOrder", orderId, commandId),
      streamType: "Order",
      streamId: orderId,
      eventType: "OrderSubmitted",
      eventData: { orderId, customerId },
      boundedContext: "orders",
      correlationId,
    },
    dependencies: eventStoreDependencies,
  },
  options: {
    onComplete: internal.eventStore.onDurableAppendComplete,
    context: { orderId, commandId },
  },
});
// Result: { status: "enqueued", workId: "work-xyz" }
```

**Dead Letter Handling:**

```typescript
// eventStore/durableAppend.ts
export const onDurableAppendComplete = internalMutation({
  args: {
    result: v.union(
      v.object({ kind: v.literal("success"), returnValue: v.any() }),
      v.object({ kind: v.literal("failed"), error: v.string() }),
      v.object({ kind: v.literal("canceled") })
    ),
    context: v.object({
      orderId: v.string(),
      commandId: v.string(),
    }),
  },
  handler: async (ctx, { result, context }) => {
    if (result.kind === "failed") {
      // Record dead letter for manual recovery
      await ctx.db.insert("eventAppendDeadLetters", {
        idempotencyKey: buildCommandIdempotencyKey(
          "OrderSubmitted",
          context.orderId,
          context.commandId
        ),
        streamType: "Order",
        streamId: context.orderId,
        error: result.error,
        status: "pending",
        createdAt: Date.now(),
      });
      // Alert operator
      console.error(`[DURABLE_APPEND_FAILED] orderId=${context.orderId} error=${result.error}`);
    }
  },
});
```

_Verified by: Durable append succeeds on first try, Durable append retries on transient failure, Exhausted retries create dead letter, Multiple events for same entity maintain order_

**External action results are captured as events using outbox pattern**

**Invariant:** Every external action completion (success or failure) results in exactly one
corresponding event. The outbox handler uses idempotent append to prevent duplicate events.

    **Rationale:** Actions calling external APIs (Stripe, email services, etc.) are at-most-once
    by default. If the action succeeds but subsequent processing fails, the side effect is
    orphaned. The outbox pattern uses the guaranteed `onComplete` callback to capture results
    as domain events, ensuring audit trail and enabling downstream processing.

    **Verified by:** Successful payment creates PaymentCompleted event, Failed payment creates
    PaymentFailed event, Duplicate completion is deduplicated

    **API Reference:** `@libar-dev/platform-core/src/durability/outbox.ts`

    **IMPORTANT:** The outbox pattern is specifically for capturing external action results,
    NOT for projection delivery. Projection delivery is already guaranteed by the Workpool's
    `onComplete` callback with dead letter handling.

    **Implementation:**

```typescript
import { createOutboxHandler, type ActionResult } from "@libar-dev/platform-core";

// sagas/payments/outbox.ts
interface PaymentContext {
  orderId: string;
  customerId: string;
  amount: number;
}

interface StripeChargeResult {
  chargeId: string;
  receiptUrl: string;
}

export const onPaymentComplete = internalMutation({
  args: {
    result: v.union(
      v.object({ kind: v.literal("success"), returnValue: v.any() }),
      v.object({ kind: v.literal("failed"), error: v.string() }),
      v.object({ kind: v.literal("canceled") })
    ),
    context: v.object({
      orderId: v.string(),
      customerId: v.string(),
      amount: v.number(),
    }),
  },
  handler: createOutboxHandler<PaymentContext, StripeChargeResult>({
    getIdempotencyKey: (ctx) => `payment:${ctx.orderId}`,
    buildEvent: (result, ctx) => ({
      streamType: "Order",
      streamId: ctx.orderId,
      eventType: result.kind === "success" ? "PaymentCompleted" : "PaymentFailed",
      eventData:
        result.kind === "success"
          ? {
              chargeId: result.returnValue.chargeId,
              receiptUrl: result.returnValue.receiptUrl,
              amount: ctx.amount,
            }
          : {
              error: result.kind === "failed" ? result.error : "canceled",
              amount: ctx.amount,
            },
    }),
    boundedContext: "orders",
    dependencies: {
      getByIdempotencyKey: components.eventStore.lib.getByIdempotencyKey,
      appendToStream: components.eventStore.lib.appendToStream,
    },
  }),
});

// Usage in saga
await actionRetrier.run(
  ctx,
  internal.payments.chargeStripe,
  {
    customerId,
    amount,
    orderId,
  },
  {
    onComplete: internal.sagas.payments.onPaymentComplete,
    context: { orderId, customerId, amount },
  }
);
```

_Verified by: Successful payment creates PaymentCompleted event, Failed payment creates PaymentFailed event, Duplicate completion is deduplicated_

**Projection handlers quarantine malformed events**

**Invariant:** A malformed event that fails processing N times will be quarantined
and excluded from further processing. The projection will continue with remaining events.

    **Rationale:** Malformed events (schema violations, missing references, data corruption)
    should not block all projection processing indefinitely. Quarantining allows the system
    to continue while preserving the problematic events for investigation and potential replay
    after code fixes are deployed.

    **Verified by:** Valid event processed normally, Malformed event quarantined after max
    attempts, Quarantined event can be replayed after fix, Quarantined event can be ignored

    **API Reference:** `@libar-dev/platform-core/src/durability/poisonEvent.ts`

    **Implementation:**

```typescript
import { withPoisonEventHandling, type PoisonEventFullConfig } from "@libar-dev/platform-core";

// projections/orders/orderSummary.ts
const actualHandler = async (ctx: MutationCtx, args: OrderCreatedArgs) => {
  // Actual projection logic - may throw on malformed data
  const existing = await ctx.db
    .query("orderSummaries")
    .withIndex("by_orderId", (q) => q.eq("orderId", args.orderId))
    .first();

  if (existing) {
    // Idempotent - already processed
    return;
  }

  await ctx.db.insert("orderSummaries", {
    orderId: args.orderId,
    customerId: args.customerId,
    status: "draft",
    itemCount: 0,
    totalAmount: 0,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });
};

export const onOrderCreated = internalMutation({
  args: {
    /* ... */
  },
  handler: withPoisonEventHandling(actualHandler, {
    projectionName: "orderSummary",
    maxAttempts: 3,
    alertOnQuarantine: true,
    dependencies: {
      getPoisonRecord: internal.admin.poison.getRecord,
      upsertPoisonRecord: internal.admin.poison.upsertRecord,
      listQuarantinedRecords: internal.admin.poison.listQuarantined,
      getPoisonStats: internal.admin.poison.getStats,
    },
    onQuarantine: ({ eventId, projectionName, attempts, error }) => {
      console.error(
        `[POISON_EVENT] eventId=${eventId} projection=${projectionName} ` +
          `attempts=${attempts} error=${error}`
      );
    },
  }),
});
```

**Admin Mutations:**

```typescript
// admin/poison.ts
export const replayEvent = internalMutation({
  args: { eventId: v.string(), projectionName: v.string() },
  handler: async (ctx, { eventId, projectionName }) => {
    const record = await ctx.db
      .query("poisonEvents")
      .withIndex("by_eventId_projection", (q) =>
        q.eq("eventId", eventId).eq("projectionName", projectionName)
      )
      .first();

    if (!record) {
      return { status: "not_found" };
    }
    if (record.status !== "quarantined") {
      return { status: "not_quarantined" };
    }

    // Reset for replay
    await ctx.db.patch(record._id, {
      status: "pending",
      attempts: 0,
      updatedAt: Date.now(),
    });

    // Re-enqueue to projection pool
    // (caller must trigger re-processing)
    return { status: "ready_for_replay" };
  },
});

export const ignoreEvent = internalMutation({
  args: { eventId: v.string(), projectionName: v.string(), reason: v.string() },
  handler: async (ctx, { eventId, projectionName, reason }) => {
    // ... update status to "ignored" with reason
  },
});
```

_Verified by: Valid event processed normally, Malformed event quarantined after max attempts, Quarantined event can be replayed after fix, Quarantined event can be ignored_

**Projections can be rebuilt from the event stream**

**Invariant:** A projection can be rebuilt from any starting position in the event stream.
The rebuilt projection will eventually converge to the same state as if built incrementally.

    **Rationale:** Projection data can become corrupted (bugs, schema migrations gone wrong,
    manual data fixes). The event stream is the source of truth - projections are derived views
    that can be reconstructed at any time. This is a key benefit of event sourcing.

    **Verified by:** Rebuild from position 0 re-processes all events, Rebuild progress is
    trackable, Running rebuild can be cancelled, Concurrent rebuilds are prevented,
    Rebuild from specific position

    **Existing Infrastructure (Phase 18b-1):**
    - `admin/projections.ts` - triggerRebuild, cancelRebuild, getRebuildStatus
    - `eventReplayPool` - Workpool with partition key ordering (parallelism: 5)
    - `replayHandlerRegistry` - Projection-specific replay handlers
    - `replayCheckpoints` table - Tracks rebuild progress

    **New Demonstration Mutations:**

```typescript
// admin/rebuildDemo.ts
export const demonstrateRebuild = internalMutation({
  args: { projectionName: v.string() },
  handler: async (ctx, { projectionName }) => {
    // Step 1: Get current projection state (for comparison)
    const beforeStats = await getProjectionStats(ctx, projectionName);

    // Step 2: Clear projection data
    await clearProjection(ctx, projectionName);

    // Step 3: Trigger rebuild from position 0
    const replayId = await triggerRebuild(ctx, {
      projectionName,
      fromPosition: 0,
      chunkSize: 100, // Process 100 events per batch
    });

    return {
      replayId,
      beforeStats,
      message: `Rebuild started. Monitor with getRebuildStatus("${replayId}")`,
    };
  },
});

export const verifyRebuild = internalQuery({
  args: { projectionName: v.string(), replayId: v.string() },
  handler: async (ctx, { projectionName, replayId }) => {
    const status = await getRebuildStatus(ctx, replayId);
    const currentStats = await getProjectionStats(ctx, projectionName);

    return {
      rebuildStatus: status,
      currentStats,
      isComplete: status.status === "completed",
      eventsProcessed: status.eventsProcessed,
      duration: status.completedAt ? status.completedAt - status.startedAt : null,
    };
  },
});
```

**Progress Tracking Structure:**

```typescript
interface RebuildStatus {
  replayId: string;
  projectionName: string;
  status: "running" | "completed" | "cancelled" | "failed";
  fromPosition: number;
  currentPosition: number;
  eventsProcessed: number;
  totalEvents: number; // If known
  startedAt: number;
  completedAt?: number;
  lastError?: string;
  // Computed
  percentComplete: number;
  eventsPerSecond: number;
  estimatedRemainingMs?: number;
}
```

_Verified by: Rebuild from position 0 re-processes all events, Rebuild progress is trackable, Running rebuild can be cancelled, Concurrent rebuilds are prevented, Rebuild from specific position_

**Scheduled job detects and alerts on orphaned command intents**

**Invariant:** Any intent in "pending" status for longer than timeoutMs will be detected
and transitioned to "abandoned" status. Operators are alerted for investigation.

    **Rationale:** Network partitions, process crashes, and deadlocks can leave commands
    in an incomplete state. Automated detection ensures these don't go unnoticed, enabling
    timely investigation and potential data recovery.

    **Verified by:** Orphan detected after threshold exceeded, Recent pending intent not
    flagged, Completed intents are ignored, Orphan detection reports metrics

    **Cron Configuration:**

```typescript
// crons.ts
import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Detect orphaned intents every 5 minutes
crons.interval("detectOrphanedIntents", { minutes: 5 }, internal.admin.intents.detectOrphans);

export default crons;
```

**Detection Logic:**

```typescript
// admin/intents.ts
import { queryOrphanedIntents } from "@libar-dev/platform-core";

export const detectOrphans = internalMutation({
  handler: async (ctx) => {
    const now = Date.now();

    // Find pending intents older than their timeout
    const orphans = await queryOrphanedIntents(ctx, {
      dependencies: intentDependencies,
      now,
    });

    if (orphans.length === 0) {
      console.info("[ORPHAN_DETECTION] No orphans found");
      return { orphanCount: 0 };
    }

    // Transition each orphan to abandoned
    const abandoned: string[] = [];
    for (const orphan of orphans) {
      await recordCompletion(ctx, {
        intentKey: orphan.intentKey,
        status: "abandoned",
        streamType: orphan.streamType,
        streamId: orphan.streamId,
        boundedContext: orphan.boundedContext,
        dependencies: intentDependencies,
        error: `Timeout exceeded (${orphan.timeoutMs}ms). Time since intent: ${orphan.timeSinceIntent}ms`,
      });
      abandoned.push(orphan.intentKey);
    }

    // Report metrics
    const byType = orphans.reduce(
      (acc, o) => {
        acc[o.operationType] = (acc[o.operationType] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>
    );

    console.warn(`[ORPHAN_DETECTION] Found ${orphans.length} orphans`, {
      orphanCount: orphans.length,
      byOperationType: byType,
    });

    return {
      orphanCount: orphans.length,
      byOperationType: byType,
      abandoned,
    };
  },
});

// Admin query for manual investigation
export const listOrphanedIntents = internalQuery({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, { limit = 100 }) => {
    const orphans = await ctx.db
      .query("commandIntents")
      .withIndex("by_status_createdAt", (q) => q.eq("status", "abandoned"))
      .order("desc")
      .take(limit);

    return orphans;
  },
});
```

_Verified by: Orphan detected after threshold exceeded, Recent pending intent not flagged, Completed intents are ignored, Orphan detection reports metrics_

**End-to-end durability is verified via integration tests**

**Invariant:** Integration tests must exercise the complete durability stack in a real
Convex environment with actual database operations, Workpool execution, and event store.

    **Rationale:** Unit tests with mocks cannot verify the integration of multiple durability
    patterns working together. Integration tests ensure the patterns compose correctly and
    handle real-world scenarios like OCC conflicts and concurrent operations.

    **Verified by:** Full durable command flow, Command retry produces same result,
    Projection rebuild restores correct state

    **Test Infrastructure:**

```typescript
// examples/order-management/tests/integration-steps/durability.integration.steps.ts
import {
  generateTestRunId,
  waitUntil,
  testMutation,
  testQuery,
} from "@libar-dev/platform-core/testing";

// Each test run gets isolated IDs
const testRunId = generateTestRunId();
const testOrderId = `${testRunId}_ord_001`;
```

_Verified by: Full durable command flow, Command retry produces same result, Projection rebuild restores correct state_

## Deliverables

- Idempotent append integration (complete)
- Command intents schema (complete)
- Intent recording in orchestrator (complete)
- Intent completion tracking (complete)
- Orphan intent detection cron (complete)
- Orphan intent admin queries (complete)
- Durable append pool (complete)
- Durable append action (complete)
- Payment outbox handler (complete)
- Poison event wrapper in orderSummary (complete)
- Poison event admin mutations (complete)
- Rebuild demonstration mutations (complete)
- Integration test scenarios (complete)

---

[← Back to Product Requirements](../PRODUCT-REQUIREMENTS.md)
