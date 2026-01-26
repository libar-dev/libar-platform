# EventBus - Publish/Subscribe for Domain Events

> **Pattern:** In-memory event routing with Workpool-backed delivery for durable, parallelized event distribution to subscribers (projections, process managers, sagas).

---

## Overview

The EventBus provides a unified publish/subscribe abstraction for domain events within the platform. Unlike traditional message brokers, it operates **in-memory** at runtime, routing published events to matching subscriptions via Workpool for durable delivery with retry semantics.

**Key insight:** The EventBus is a delivery mechanism, not storage. Events are persisted in the Event Store; the EventBus routes them to handlers.

---

## 1. The Problem (Decoupling Event Producers from Consumers)

### 1.1 Traditional Direct Coupling

Without an event bus, command handlers directly trigger projections and sagas:

```typescript
// Anti-pattern: Direct coupling in command handler
async function handleOrderSubmitted(ctx, event) {
  // CMS update happens first...

  // Then manually trigger each consumer
  await orderSummaryProjection.update(ctx, event);
  await inventorySaga.start(ctx, event);
  await notificationPM.handle(ctx, event);
  await auditLog.record(ctx, event);
  // Adding a new consumer requires modifying this handler
}
```

**Problems:**
- Command handlers become a coordination point
- Adding new subscribers requires modifying producers
- No centralized retry or dead letter handling
- Hard to reason about event flow

### 1.2 EventBus Solution

```typescript
// Clean: Command handler publishes, EventBus routes
const result = await commandOrchestrator.execute(ctx, config, args);
// EventBus (wired to orchestrator) automatically routes to:
// - orderSummaryProjection (priority 100)
// - orderNotificationPM (priority 200)
// - inventorySaga (priority 300)
// - auditLog (wildcard subscription)
```

**Benefits:**
- Producers don't know about consumers
- Adding subscribers is configuration-only
- Centralized Workpool delivery with retries
- Priority-ordered execution

---

## 2. Core Concepts

### 2.1 Published Event

A `PublishedEvent` contains all metadata required for routing and processing:

| Field            | Type            | Description                                 |
|------------------|-----------------|---------------------------------------------|
| `eventId`        | `string`        | Unique event identifier                     |
| `eventType`      | `string`        | Event type for routing (e.g., "OrderSubmitted") |
| `streamType`     | `string`        | Aggregate type (e.g., "Order")              |
| `streamId`       | `string`        | Aggregate instance ID                       |
| `category`       | `EventCategory` | Event category for filtering                |
| `schemaVersion`  | `number`        | Schema version for upcasting                |
| `boundedContext` | `string`        | Source bounded context                      |
| `globalPosition` | `number`        | Global position in event store              |
| `timestamp`      | `number`        | Creation timestamp                          |
| `payload`        | `TPayload`      | Event-specific data                         |
| `correlation`    | `object`        | `correlationId`, `causationId`, `userId?`   |

### 2.2 Subscription Filter

Filters determine which events a subscription receives. All criteria use **OR logic** within a field and **AND logic** between fields.

| Filter Field       | Description                           | Example                           |
|--------------------|---------------------------------------|-----------------------------------|
| `eventTypes`       | Match specific event types            | `["OrderSubmitted", "OrderCancelled"]` |
| `categories`       | Match event categories                | `["domain", "integration"]`       |
| `boundedContexts`  | Match source bounded contexts         | `["orders", "inventory"]`         |
| `streamTypes`      | Match aggregate types                 | `["Order", "Customer"]`           |

**Matching Rules:**
- Empty filter = wildcard (matches all events)
- Multiple values in a field = OR (matches any)
- Multiple fields = AND (all must match)

### 2.3 Partition Key

Partition keys enable ordered processing for events that share a key:

```typescript
interface PartitionKey {
  name: string;   // Key name (e.g., "orderId")
  value: string;  // Key value (e.g., "order_123")
}
```

**Note:** Partition key-based ordering is prepared in the API but awaiting Workpool support. Currently, partition keys are included in context for debugging/tracing.

### 2.4 Priority System

Subscriptions execute in priority order (lower numbers run first):

| Priority Range | Typical Use                    |
|----------------|--------------------------------|
| 1-99           | Critical infrastructure        |
| 100 (default)  | Projections                    |
| 200            | Process Managers               |
| 300+           | Sagas, async tasks             |

This ensures projections update read models before process managers or sagas react to them.

---

## 3. Subscription Patterns

### 3.1 Defining Subscriptions with Registry

The `defineSubscriptions` function provides a fluent builder API:

```typescript
import { defineSubscriptions } from "@libar-dev/platform-core";

export const eventSubscriptions = defineSubscriptions((registry) => {
  // Projection subscription - priority 100 (default)
  registry
    .subscribe("orderSummary.onOrderSubmitted", internal.projections.orderSummary.handler)
    .forEventTypes("OrderSubmitted")
    .forCategories("domain")
    .withTransform((event, chain) => ({
      orderId: event.streamId,
      eventId: event.eventId,
      globalPosition: event.globalPosition,
      payload: event.payload,
    }))
    .withPartitionKey((event) => ({
      name: "orderId",
      value: event.streamId,
    }))
    .build();

  // Process Manager subscription - priority 200
  registry
    .subscribe("orderNotification.handler", internal.pm.orderNotification.handle)
    .forEventTypes("OrderConfirmed")
    .withPriority(200)
    .build();

  // Saga subscription - priority 300
  registry
    .subscribe("fulfillmentSaga.router", internal.sagas.fulfillment.route)
    .forEventTypes("OrderSubmitted")
    .withPriority(300)
    .build();

  // Wildcard audit subscription - matches all domain events
  registry
    .subscribe("audit.logger", internal.audit.logEvent)
    .forCategories("domain")
    .build();
});
```

### 3.2 Creating Individual Subscriptions

For subscriptions created outside the registry pattern:

```typescript
import { createSubscription } from "@libar-dev/platform-core";

const subscription = createSubscription(
  "orderSummary.onOrderSubmitted",
  internal.projections.orderSummary.handler
)
  .forEventTypes("OrderSubmitted")
  .withTransform((event) => ({ orderId: event.streamId }))
  .build();
```

### 3.3 Process Manager Subscriptions

The `createPMSubscription` helper bridges PM definitions to EventBus:

```typescript
import { createPMSubscription, type PMEventHandlerArgs } from "@libar-dev/platform-core/processManager";

const orderNotificationPM = defineProcessManager({
  processManagerName: "orderNotification",
  eventSubscriptions: ["OrderConfirmed"] as const,
  correlationStrategy: { correlationProperty: "orderId" },
  // ...
});

// Create EventBus subscription from PM definition
const subscription = createPMSubscription(orderNotificationPM, {
  handler: internal.processManagers.orderNotification.handleOrderConfirmed,
  priority: 200, // After projections
});

// Register in defineSubscriptions
export const eventSubscriptions = defineSubscriptions((registry) => {
  registry.add(subscription);
});
```

**PM Handler Args:** The default transformer provides:

| Field             | Description                           |
|-------------------|---------------------------------------|
| `eventId`         | Event identifier                      |
| `eventType`       | Event type                            |
| `globalPosition`  | For idempotency checking              |
| `correlationId`   | Correlation chain ID                  |
| `streamType`      | Aggregate type                        |
| `streamId`        | Aggregate instance ID                 |
| `payload`         | Event payload                         |
| `timestamp`       | Event timestamp                       |
| `category`        | Event category                        |
| `boundedContext`  | Source bounded context                |
| `instanceId`      | PM instance ID (from correlation strategy) |

### 3.4 Wildcard Subscriptions

Subscriptions without `eventTypes` or `categories` filters match all events:

```typescript
// Matches ALL events
registry.subscribe("metrics.collector", internal.metrics.collect).build();

// Matches all events from specific bounded context
registry
  .subscribe("orders.audit", internal.audit.ordersLogger)
  .forBoundedContexts("orders")
  .build();
```

---

## 4. Priority Handling

### 4.1 How Priority Works

When an event is published, subscriptions execute in priority order:

```
Event Published
     │
     ▼
Find Matching Subscriptions
     │
     ▼
Sort by Priority (ascending)
     │
     ▼
┌────┴────┐
│ Priority│
│   50    │──► High priority handler (critical)
└────┬────┘
     ▼
┌────┴────┐
│ Priority│
│   100   │──► Projection handler (default)
└────┬────┘
     ▼
┌────┴────┐
│ Priority│
│   200   │──► Process Manager handler
└────┬────┘
     ▼
┌────┴────┐
│ Priority│
│   300   │──► Saga router
└────┴────┘
```

### 4.2 Priority Constants

```typescript
import { DEFAULT_SUBSCRIPTION_PRIORITY } from "@libar-dev/platform-core";

// DEFAULT_SUBSCRIPTION_PRIORITY = 100

import { DEFAULT_PM_SUBSCRIPTION_PRIORITY } from "@libar-dev/platform-core/processManager";

// DEFAULT_PM_SUBSCRIPTION_PRIORITY = 200
```

### 4.3 Recommended Priority Ranges

| Use Case                | Priority | Rationale                              |
|-------------------------|----------|----------------------------------------|
| Critical infrastructure | 1-50     | Must run before anything else          |
| Projections             | 100      | Update read models first               |
| Process Managers        | 200      | React to updated state                 |
| Sagas                   | 300      | Cross-BC coordination after local ops  |
| Audit/Analytics         | 400+     | Non-critical, can run last             |

---

## 5. Integration with Projections

### 5.1 Direct vs EventBus Triggering

The platform supports **two models** for projection triggering:

| Model                 | Mechanism                          | When to Use                         |
|-----------------------|------------------------------------|-------------------------------------|
| **Direct (CommandConfig)** | Orchestrator triggers projection directly | Simple 1:1 command-to-projection |
| **EventBus**          | Orchestrator publishes, EventBus routes | Multiple subscribers per event type |

**Important:** Do NOT duplicate projections in both models. If a projection is triggered via CommandConfig, don't also subscribe it via EventBus.

### 5.2 CommandOrchestrator Integration

The CommandOrchestrator publishes to EventBus in step 6a:

```typescript
// In CommandOrchestrator.executeCoreAfterIdempotency()

// 5. Trigger projection via Workpool (direct)
await this.deps.projectionPool.enqueueMutation(...);

// 6a. Publish to EventBus if configured
if (this.deps.eventBus) {
  await this.deps.eventBus.publish(
    ctx,
    {
      eventId: successResult.event.eventId,
      eventType: successResult.event.eventType,
      streamType: successResult.event.streamType,
      streamId: successResult.event.streamId,
      category: DEFAULT_EVENT_CATEGORY,
      schemaVersion: DEFAULT_SCHEMA_VERSION,
      boundedContext: config.boundedContext,
      globalPosition,
      timestamp: Date.now(),
      payload: successResult.event.payload,
      correlation: { correlationId, causationId },
    },
    chain
  );
}
```

### 5.3 Infrastructure Setup

```typescript
// infrastructure.ts
import { ConvexEventBus, createScopedLogger } from "@libar-dev/platform-core";
import { eventSubscriptions } from "./eventSubscriptions";

const eventBusLogger = createScopedLogger("EventBus", PLATFORM_LOG_LEVEL);

export const eventBus = new ConvexEventBus(projectionPool, eventSubscriptions, {
  defaultOnComplete: deadLetterOnComplete, // For dead letter tracking
  logger: eventBusLogger,
});

export const commandOrchestrator = new CommandOrchestrator({
  eventStore,
  commandBus,
  projectionPool,
  eventBus, // Wire EventBus to orchestrator
  defaultOnComplete: deadLetterOnComplete,
  middlewarePipeline,
  logger: orchestratorLogger,
});
```

---

## 6. Best Practices

### 6.1 Subscription Naming

Use consistent naming conventions:

```typescript
// Format: <domain>.<operation>
"orderSummary.onOrderSubmitted"
"inventory.onStockReserved"
"pm:orderNotification"        // Process Managers use pm: prefix
"audit.logDomainEvent"
```

### 6.2 Avoid Duplicate Delivery

**Anti-pattern:** Subscribing via both CommandConfig and EventBus:

```typescript
// CommandConfig already triggers orderSummary projection
const orderSubmitConfig = createCommandConfig({
  projection: { handler: orderSummaryHandler, ... },
  // ...
});

// DON'T also subscribe the same handler via EventBus
defineSubscriptions((registry) => {
  registry
    .subscribe("orderSummary.onOrderSubmitted", orderSummaryHandler) // DUPLICATE!
    .forEventTypes("OrderSubmitted")
    .build();
});
```

### 6.3 Error Handling

EventBus propagates Workpool enqueue errors. If a subscription fails to enqueue:
- The error is propagated immediately
- Subsequent subscriptions are NOT processed
- The event is still persisted in the Event Store

```typescript
// EventBus catches and re-throws errors with context
try {
  await this.workpool.enqueueMutation(ctx, subscription.handler, handlerArgs, options);
} catch (error) {
  this.logger.error("Failed to enqueue subscription", {
    subscriptionName: subscription.name,
    eventType: event.eventType,
    error: error instanceof Error ? error.message : String(error),
  });
  throw error; // Propagates to caller
}
```

### 6.4 Testing Subscriptions

```typescript
// Unit test example
describe("EventBus subscriptions", () => {
  it("matches OrderSubmitted events", () => {
    const subscriptions = defineSubscriptions((registry) => {
      registry
        .subscribe("orderHandler", mockHandler)
        .forEventTypes("OrderSubmitted")
        .build();
    });

    const bus = new ConvexEventBus(mockWorkpool, subscriptions);

    expect(bus.hasSubscribersFor("OrderSubmitted")).toBe(true);
    expect(bus.hasSubscribersFor("OrderCancelled")).toBe(false);
  });
});
```

### 6.5 Indexing Strategy

The EventBus builds an index for fast subscription lookup:

| Index Type       | Lookup Key        | Use Case                          |
|------------------|-------------------|-----------------------------------|
| `byEventType`    | Event type string | Most common - specific event types |
| `byCategory`     | Event category    | Category-wide subscriptions       |
| `wildcards`      | N/A               | No filter - matches all           |

**Performance note:** For high-volume event types, prefer specific `eventTypes` filters over wildcards.

---

## API Reference

### ConvexEventBus

```typescript
class ConvexEventBus implements EventBus {
  constructor(
    workpool: WorkpoolClient,
    subscriptions: EventSubscription[],
    config?: EventBusConfig
  );

  // Publish event to matching subscriptions
  publish(
    ctx: MutationCtx,
    event: PublishedEvent,
    chain: CorrelationChain
  ): Promise<PublishResult>;

  // Get subscriptions matching a filter
  getMatchingSubscriptions(filter: SubscriptionFilter): EventSubscription[];

  // Get all registered subscriptions
  getAllSubscriptions(): EventSubscription[];

  // Check if any subscriptions match an event type
  hasSubscribersFor(eventType: string): boolean;
}
```

### EventBusConfig

```typescript
interface EventBusConfig {
  // Default onComplete handler for dead letter tracking
  defaultOnComplete?: FunctionReference<"mutation", ...>;

  // Optional logger for EventBus operations
  logger?: Logger;
}
```

### PublishResult

```typescript
interface PublishResult {
  // Number of subscriptions that matched
  matchedSubscriptions: number;

  // Names of triggered subscriptions
  triggeredSubscriptions: string[];

  // Whether all enqueues succeeded
  success: boolean;
}
```

---

## Related Documents

- [Projection Categories](./projection-categories.md) - Projection types and when to use each
- [Reactive Projections](./reactive-projections.md) - Real-time UI with hybrid projections
- [Process Manager](../../../../docs/architecture/PROCESS_MANAGER.md) - Event-reactive coordination
- [Workpool Partitioning](./workpool-partitioning.md) - Durable function delivery patterns
