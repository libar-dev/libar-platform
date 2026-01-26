# Event Store Durability - Architecture

> **Pattern:** Guaranteed event persistence for async contexts
> **Package API:** See [`@libar-dev/platform-core/src/durability`](../../deps/libar-dev-packages/packages/platform/core/src/durability)

---

## Overview

The dual-write pattern (CMS + Event in same mutation) works perfectly for synchronous commands. However, several async scenarios can result in **lost events**:

| Scenario                                    | Problem                                                  | Impact                                      |
| ------------------------------------------- | -------------------------------------------------------- | ------------------------------------------- |
| External API success, event capture failure | Customer charged but PaymentCompleted never recorded     | Stale projection, stuck saga, missing audit |
| Cross-context publication failure           | OrderSubmitted published but inventory never receives it | Fire-and-forget loses events                |
| Long-running BC operations                  | Multi-step process fails partway with no record          | Unknown state, no recovery path             |
| Action result capture                       | Mutation to record result fails after action succeeded   | Orphaned side effect                        |

**Solution:** This spec provides six durable persistence patterns:

```
┌─────────────────────────────────────────────────────────────────────────┐
│                     EVENT STORE DURABILITY PATTERNS                      │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  1. Outbox Pattern ───────► Capture action results via onComplete        │
│  2. Idempotent Append ────► Prevent duplicates with idempotency keys     │
│  3. Durable Append ───────► Retry failed appends via Workpool actions    │
│  4. Durable Publication ──► Workpool-backed cross-context delivery       │
│  5. Intent/Completion ────► Bracket long-running operations              │
│  6. Poison Event ─────────► Quarantine malformed events                  │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 1. Idempotent Event Append

**Location:** `platform-core/src/durability/idempotentAppend.ts`

### Problem

Retries (Workpool, manual, saga compensation) can cause duplicate append attempts. Without idempotency keys, the same business event could be stored multiple times.

### Solution

Each event has an optional `idempotencyKey`. Before append, check if an event with that key already exists.

### Idempotency Key Patterns

| Event Source   | Pattern                                | Example                                  |
| -------------- | -------------------------------------- | ---------------------------------------- |
| Command result | `{commandType}:{entityId}:{commandId}` | `SubmitOrder:ord-123:cmd-456`            |
| Action result  | `{actionType}:{entityId}`              | `payment:ord-123`                        |
| Saga step      | `{sagaType}:{sagaId}:{step}`           | `OrderFulfillment:saga-789:reserveStock` |
| Scheduled job  | `{jobType}:{scheduleId}:{timestamp}`   | `expireReservations:job-001:1704067200`  |

### Usage

```typescript
import { idempotentAppendEvent } from "@libar-dev/platform-core/durability";

const result = await idempotentAppendEvent(ctx, {
  event: {
    idempotencyKey: `payment:${orderId}`,
    streamType: "Order",
    streamId: orderId,
    eventType: "PaymentCompleted",
    eventData: { chargeId, amount },
    boundedContext: "orders",
    correlationId,
  },
  dependencies: {
    getByIdempotencyKey: components.eventStore.lib.getByIdempotencyKey,
    appendToStream: components.eventStore.lib.appendToStream,
  },
});

if (result.status === "duplicate") {
  // Event already exists, no action needed
}
```

### Result Types

```typescript
type IdempotentAppendResult =
  | { status: "appended"; eventId: string; version: number }
  | { status: "duplicate"; eventId: string; version: number };
```

### Helper Functions

| Function                                                          | Purpose                   |
| ----------------------------------------------------------------- | ------------------------- |
| `buildCommandIdempotencyKey(type, entityId, commandId)`           | For command results       |
| `buildActionIdempotencyKey(actionType, entityId)`                 | For action results        |
| `buildSagaStepIdempotencyKey(sagaType, sagaId, step)`             | For saga step results     |
| `buildScheduledJobIdempotencyKey(jobType, scheduleId, timestamp)` | For scheduled job results |

---

## 2. Outbox Pattern for Action Results

**Location:** `platform-core/src/durability/outbox.ts`

### Problem

Actions are at-most-once by default. If an action succeeds but the subsequent event append fails, the side effect is orphaned.

### Solution

Use `onComplete` callback from Workpool/Action Retrier. The callback is **guaranteed** to be called after the action finishes.

```
Action → onComplete mutation ─┬─► Success: Append PaymentCompleted event
                              ├─► Failure: Append PaymentFailed event
                              └─► Canceled: Append appropriate event
```

### onComplete Guarantee

The `onComplete` mutation is scheduled **atomically** when the action completes:

- It fires regardless of action success/failure/cancel
- Convex OCC auto-retries handle transient conflicts
- The `context` parameter preserves all data needed for recovery

**Critical:** The `onComplete` mutation must be **idempotent** because OCC retries may cause multiple executions.

### Usage

```typescript
import { createOutboxHandler } from "@libar-dev/platform-core/durability";

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
  boundedContext: "orders",
  dependencies: {
    getByIdempotencyKey: components.eventStore.lib.getByIdempotencyKey,
    appendToStream: components.eventStore.lib.appendToStream,
  },
});

// Use with Action Retrier
await retrier.run(ctx, internal.payments.chargeStripe, args, {
  onComplete: internal.payments.onPaymentComplete,
  context: { orderId, customerId, amount },
});
```

### ActionResult Type

```typescript
type ActionResult<T = unknown> =
  | { kind: "success"; returnValue: T }
  | { kind: "failed"; error: string }
  | { kind: "canceled" };
```

---

## 3. Durable Append via Workpool Actions

**Location:** `platform-core/src/durability/durableAppend.ts`

### Problem

Workpool only retries **actions**, not mutations. If a saga step or scheduled job needs durable event append, wrapping in an action enables Workpool retry semantics.

### Solution

```
durableAppendEvent (action)
  → ctx.runMutation(idempotentAppend, args)
  → If action fails, Workpool retries the action
  → Idempotency key prevents duplicate events
```

### When to Use

| Scenario                    | Use durableAppendEvent? | Why                                      |
| --------------------------- | ----------------------- | ---------------------------------------- |
| Synchronous command handler | No                      | Atomic dual-write handles this           |
| Action onComplete           | Recommended             | Mutation can fail after action succeeded |
| Saga step                   | Yes                     | Step result must be captured             |
| Scheduled job               | Yes                     | Job completion must be recorded          |

### Usage

```typescript
import { durableAppendEvent } from "@libar-dev/platform-core/durability";

// In saga or scheduled job
const { workId } = await durableAppendEvent(ctx, {
  workpool: eventAppendPool,
  actionRef: internal.eventStore.durableAppend.appendEventAction,
  append: {
    event: {
      idempotencyKey: `saga:${sagaId}:reserveStock`,
      streamType: "Inventory",
      streamId: productId,
      eventType: "StockReserved",
      eventData: { quantity, orderId },
      boundedContext: "inventory",
    },
    dependencies: {
      getByIdempotencyKey: components.eventStore.lib.getByIdempotencyKey,
      appendToStream: components.eventStore.lib.appendToStream,
    },
  },
  options: {
    onComplete: internal.eventStore.deadLetters.onAppendComplete,
    context: { sagaId, step: "reserveStock" },
  },
});
```

### Partition Key

Uses `append:${streamType}:${streamId}` format to ensure per-entity ordering while allowing parallel processing across entities.

---

## 4. Durable Cross-Context Event Publication

**Location:** `platform-core/src/durability/publication.ts`

### Problem

Fire-and-forget publication loses events when subscribers fail. Cross-context communication must be durable with guaranteed delivery or explicit failure tracking.

### Solution

Workpool-backed publication with tracking, retry, and dead letter handling.

### Publication Flow

```
publish(event, targetContexts)
  → For each target context:
      1. Insert publication tracking record (status: "pending")
      2. Enqueue delivery action via publicationPool
      3. On success: status → "delivered"
      4. On failure after retries: status → "dead_letter"
```

### Partition Key Strategy

Uses `pub:${eventId}:${targetContext}` format:

- Per-event ordering within target context
- Parallel delivery across different events

### Usage

```typescript
import { createDurableEventPublisher } from "@libar-dev/platform-core/durability";

const publisher = createDurableEventPublisher({
  maxAttempts: 5,
  initialBackoffMs: 100,
  base: 2,
  dependencies: {
    workpool: publicationPool,
    deliveryActionRef: internal.integration.deliverEvent,
    onCompleteRef: internal.integration.deadLetters.onPublicationComplete,
  },
});

await publisher.publish(ctx, {
  event: orderSubmittedEvent,
  sourceContext: "orders",
  targetContexts: ["inventory", "notifications"],
});

// Query publication status
const publications = await publisher.getPublicationStatus(ctx, eventId);
// Returns: [{ targetContext: "inventory", status: "delivered" }, ...]
```

### Publication Status Values

| Status        | Meaning                                   |
| ------------- | ----------------------------------------- |
| `pending`     | Delivery not yet attempted or in progress |
| `delivered`   | Successfully delivered to target context  |
| `failed`      | Delivery failed (will retry)              |
| `dead_letter` | Max retries exceeded                      |
| `retried`     | Previously dead-lettered, now retrying    |

---

## 5. Intent/Completion Event Pattern

**Location:** `platform-core/src/durability/intentCompletion.ts`

### Problem

Operations spanning multiple steps, external calls, or significant time can fail partway through with no visibility:

- Invisible to monitoring
- Undetectable by reconciliation
- Missing from audit trail

### Solution

Bracket long-running operations with **intent** and **completion** events.

| Operation          | Intent Event               | Completion Events                                                     |
| ------------------ | -------------------------- | --------------------------------------------------------------------- |
| Order submission   | `OrderSubmissionStarted`   | `OrderSubmitted`, `OrderSubmissionFailed`, `OrderSubmissionAbandoned` |
| Payment processing | `PaymentProcessingStarted` | `PaymentCompleted`, `PaymentFailed`                                   |
| Stock reservation  | `ReservationRequested`     | `StockReserved`, `ReservationFailed`                                  |

### Timeout Handling

The intent function automatically schedules a timeout check via `ctx.scheduler.runAfter`. If no completion is recorded within the timeout, the check triggers configured action (abandon, alert, or retry).

### Usage

```typescript
import {
  recordIntent,
  recordCompletion,
  checkIntentTimeout,
} from "@libar-dev/platform-core/durability";

// 1. Record intent at operation start
const { intentKey } = await recordIntent(ctx, {
  operationType: "OrderSubmission",
  streamType: "Order",
  streamId: orderId,
  boundedContext: "orders",
  timeoutMs: 5 * 60 * 1000, // 5 minutes
  onTimeout: internal.orders.checkSubmissionTimeout,
  dependencies: {
    getByIdempotencyKey: components.eventStore.lib.getByIdempotencyKey,
    appendToStream: components.eventStore.lib.appendToStream,
  },
  correlationId,
});

// 2. Perform operation...

// 3. Record completion
await recordCompletion(ctx, {
  intentKey,
  status: "success", // or "failure" or "abandoned"
  streamType: "Order",
  streamId: orderId,
  boundedContext: "orders",
  dependencies: {
    /* ... */
  },
  result: { orderId, orderNumber },
});
```

### Reconciliation

Query for orphaned intents (intent without completion after timeout):

```typescript
const orphans = await queryOrphanedIntents(ctx, {
  operationType: "OrderSubmission",
  olderThanMs: 5 * 60 * 1000,
  limit: 100,
  queryIntentEvents: internal.eventStore.queries.getIntentEvents,
  hasCompletion: internal.eventStore.queries.hasCompletionForIntent,
});

for (const orphan of orphans) {
  console.log(`Orphan: ${orphan.intentKey}, age: ${orphan.timeSinceIntent}ms`);
}
```

---

## 6. Poison Event Handling

**Location:** `platform-core/src/durability/poisonEvent.ts`

### Problem

A single malformed event should not block all downstream projections indefinitely.

### Solution

Track failures per event per projection. After N failures, quarantine the event and skip in future processing.

### Poison Event Flow

| Attempt | Action                                             |
| ------- | -------------------------------------------------- |
| 1       | Process event, catch error, record attempt         |
| 2       | Retry with backoff, catch error, record attempt    |
| 3       | Quarantine event, skip in future processing, alert |

### Usage

```typescript
import { withPoisonEventHandling } from "@libar-dev/platform-core/durability";

const safeHandler = withPoisonEventHandling(orderSummaryHandler, {
  projectionName: "orderSummary",
  maxAttempts: 3,
  alertOnQuarantine: true,
  dependencies: {
    getPoisonRecord: internal.projections.poison.getPoisonRecord,
    upsertPoisonRecord: internal.projections.poison.upsertPoisonRecord,
    listQuarantinedRecords: internal.projections.poison.listQuarantined,
    getPoisonStats: internal.projections.poison.getStats,
  },
  onQuarantine: ({ eventId, projectionName, attempts, error }) => {
    console.error(`[POISON] Event ${eventId} quarantined after ${attempts} attempts`);
  },
});

await safeHandler(ctx, event);
```

### Recovery Operations

| Function                           | Purpose                                 |
| ---------------------------------- | --------------------------------------- |
| `isEventQuarantined(ctx, args)`    | Check if event is quarantined           |
| `getPoisonEventRecord(ctx, args)`  | Get full poison event record            |
| `unquarantineEvent(ctx, args)`     | Remove from quarantine for reprocessing |
| `listQuarantinedEvents(ctx, args)` | List quarantined events                 |
| `getPoisonEventStats(ctx, args)`   | Get statistics for monitoring           |

---

## 7. Decision Tree

```
What context is the event being appended from?
    │
    ├─► Synchronous mutation (command handler)
    │       └─► No durability needed (atomic dual-write)
    │
    ├─► Action onComplete callback
    │       └─► Use createOutboxHandler
    │           └─► Idempotent append inside, no extra wrapper needed
    │
    ├─► Saga step / Scheduled job
    │       └─► Use durableAppendEvent
    │           └─► Workpool action wrapper for retry
    │
    └─► Cross-context publication
            └─► Use createDurableEventPublisher
                └─► Publication tracking + retry + dead letter

Is this a long-running operation?
    │
    ├─► Yes → recordIntent at start, recordCompletion at end
    │         └─► Enables timeout detection and reconciliation
    │
    └─► No → No intent/completion needed

Might events cause projection failures?
    │
    ├─► Yes → Wrap handler with withPoisonEventHandling
    │
    └─► No → Direct handler usage OK
```

---

## 8. Configuration Reference

### DurablePublisherConfig

| Parameter          | Type     | Default | Description                                  |
| ------------------ | -------- | ------- | -------------------------------------------- |
| `maxAttempts`      | `number` | -       | Maximum delivery attempts before dead letter |
| `initialBackoffMs` | `number` | -       | Initial backoff delay                        |
| `base`             | `number` | -       | Exponential backoff multiplier               |

### PoisonEventConfig

| Parameter           | Type      | Default | Description                        |
| ------------------- | --------- | ------- | ---------------------------------- |
| `maxAttempts`       | `number`  | -       | Failures before quarantine         |
| `alertOnQuarantine` | `boolean` | -       | Whether to alert when quarantining |

### IntentCompletionConfig

| Parameter   | Type                              | Default | Description             |
| ----------- | --------------------------------- | ------- | ----------------------- |
| `timeoutMs` | `number`                          | -       | Timeout in milliseconds |
| `onTimeout` | `"abandon" \| "alert" \| "retry"` | -       | Action on timeout       |

---

## Related Documents

- [CONVEX-DURABILITY-REFERENCE.md](CONVEX-DURABILITY-REFERENCE.md) - Workpool/Retrier API reference
- [durable-function-adapters.md](durable-function-adapters.md) - Rate limit and DCB retry adapters
- [workpool-partitioning.md](workpool-partitioning.md) - Partition key strategy
- [dcb-architecture.md](dcb-architecture.md) - Dynamic Consistency Boundaries
