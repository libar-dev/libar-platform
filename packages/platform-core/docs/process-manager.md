# Process Manager - Event-Reactive Command Coordination

> **Pattern:** Fire-and-forget event-driven command emission without orchestration overhead.
> **Package API:** See `@libar-dev/platform-core/processManager`

---

## Overview

Process Managers are lightweight coordinators that react to events and emit commands. They provide a simpler alternative to Sagas when you need event-to-command routing without compensation logic or multi-step orchestration.

**Key insight:** Process Managers are for fire-and-forget scenarios. If you need rollback or multi-step coordination, use Sagas instead.

---

## 1. The Problem Process Managers Solve

### 1.1 Scenario: Simple Event-to-Command Routing

Many event-driven scenarios follow a simple pattern: when event X occurs, emit command Y. For example:

- When `OrderConfirmed` occurs, send a confirmation email
- When `PaymentReceived` occurs, trigger inventory allocation
- When `ReservationExpired` occurs, release the reserved items

### 1.2 Over-Engineering with Sagas

Using Sagas for simple event-to-command routing introduces unnecessary complexity:

```typescript
// Overkill: Saga for simple notification
const notificationSaga = defineWorkflow({
  workflowName: "sendNotification",
  steps: [
    { action: "sendEmail" }, // No compensation needed
  ],
});
// Problems:
// - Workflow overhead (state persistence, step tracking)
// - Compensation logic defined but never used
// - Heavier infrastructure for simple routing
```

### 1.3 Target: Lightweight Process Manager

```typescript
// Appropriate: Process Manager for simple notification
const orderNotificationPM = defineProcessManager({
  processManagerName: "orderNotification",
  description: "Sends notification when order is confirmed",
  triggerType: "event",
  eventSubscriptions: ["OrderConfirmed"] as const,
  emitsCommands: ["SendNotification"],
  context: "orders",
});
// Benefits:
// - Minimal overhead (position tracking only)
// - No compensation logic to maintain
// - Workpool-based for fast execution
```

---

## 2. Process Manager vs Saga Decision Tree

### 2.1 Quick Decision Flowchart

```
Need compensation/rollback on failure?
  |
  +-- YES --> Use Saga (Workflow)
  |
  +-- NO --> Continue...
             |
             Does process coordinate multiple steps over time?
               |
               +-- YES --> Use Saga (Workflow)
               |
               +-- NO --> Continue...
                          |
                          Need to wait for external events (awaitEvent)?
                            |
                            +-- YES --> Use Saga (Workflow)
                            |
                            +-- NO --> Use Process Manager (Workpool)
```

### 2.2 Detailed Comparison

| Aspect                    | Process Manager                            | Saga                                |
| ------------------------- | ------------------------------------------ | ----------------------------------- |
| **Purpose**               | React to events, emit commands             | Orchestrate multi-step workflows    |
| **State**                 | Minimal (position + optional custom state) | Rich workflow state                 |
| **Compensation**          | None                                       | Built-in rollback logic             |
| **Trigger Types**         | Event, time, or hybrid                     | Usually event-triggered             |
| **Lifespan**              | Fire-and-forget or single event processing | Long-running across multiple events |
| **Convex Implementation** | Workpool (fast, simple)                    | Workflow (durable, complex)         |
| **Idempotency**           | globalPosition checkpoint                  | Workflow-managed                    |
| **Error Handling**        | Dead letter queue                          | Compensating transactions           |

### 2.3 Use Case Examples

| Scenario                          | Pattern         | Why                                           |
| --------------------------------- | --------------- | --------------------------------------------- |
| Send confirmation email           | Process Manager | No compensation needed                        |
| Reserve inventory for order       | Saga            | Needs compensation if payment fails           |
| Check expired reservations hourly | Process Manager | Time-triggered, fire-and-forget               |
| Order fulfillment (multi-step)    | Saga            | Payment -> Inventory -> Shipping coordination |
| Route event to external webhook   | Process Manager | Fire-and-forget notification                  |
| Payment processing with retry     | Saga            | Needs rollback on final failure               |

---

## 3. Core Concepts

### 3.1 Trigger Types

Process Managers support three trigger mechanisms:

| Trigger Type | Description                         | Use Case                                     |
| ------------ | ----------------------------------- | -------------------------------------------- |
| `event`      | Reacts to domain/integration events | Send notification when order ships           |
| `time`       | Runs on a schedule (cron)           | Release expired reservations every 5 minutes |
| `hybrid`     | Both event and time triggered       | Check fulfillment status on event OR hourly  |

### 3.2 PM Instance Identity

Each PM instance is identified by a combination of:

- **Process Manager Name**: The PM type (e.g., `"orderNotification"`)
- **Instance ID**: Derived from the event (e.g., `orderId`)

The instance ID is computed via the **correlation strategy**:

```typescript
// Correlation by event property
correlationStrategy: {
  correlationProperty: "orderId";
}

// Instance ID for event: { orderId: "ord_123", ... }
// Result: "ord_123"

// Fallback: If property not found, uses streamId
```

### 3.3 Lifecycle States

PM instances progress through a simple lifecycle:

```
                          RESET
        +------------------------------------+
        |                                    |
        v           START                    |
    +--------+ ----------------> +-----------+---+
    |  idle  |                   |  processing   |
    +--------+                   +---------------+
        ^                           |        |
        | RESET                     |        |
        |                   SUCCESS |        | FAIL
        |                           v        v
    +---+-------+             +---------------+
    | completed |             |    failed     |
    +-----------+             +---------------+
                                    |
                              RETRY |
                                    v
                               processing
```

| State        | Description                                   | Valid Transitions                    |
| ------------ | --------------------------------------------- | ------------------------------------ |
| `idle`       | Waiting for trigger event                     | START -> processing                  |
| `processing` | Currently handling an event                   | SUCCESS -> completed, FAIL -> failed |
| `completed`  | Successfully finished (terminal for one-shot) | RESET -> idle (time-triggered)       |
| `failed`     | Processing failed, requires investigation     | RETRY -> processing, RESET -> idle   |

### 3.4 Idempotency via Global Position

PMs use the event's `globalPosition` as a checkpoint to prevent duplicate processing:

```
Event (globalPosition: 42) --> PM Instance
                                   |
                                   v
                         lastGlobalPosition: 41?
                                   |
                    +--------------+---------------+
                    |                              |
                   YES                            NO
                    |                              |
                    v                              v
              Process event                 Skip (already processed)
              Update to 42                  Return "already_processed"
```

---

## 4. Implementation Pattern

### 4.1 Define the Process Manager

```typescript
import { defineProcessManager } from "@libar-dev/platform-bc";

export const orderNotificationPM = defineProcessManager({
  processManagerName: "orderNotification",
  description: "Sends notification when order is confirmed",
  triggerType: "event",
  eventSubscriptions: ["OrderConfirmed"] as const,
  emitsCommands: ["SendNotification"],
  context: "orders",
  correlationStrategy: { correlationProperty: "orderId" },
});
```

### 4.2 Create the Executor

```typescript
import {
  createProcessManagerExecutor,
  type PMDomainEvent,
  type EmittedCommand,
  type ProcessManagerState,
} from "@libar-dev/platform-core/processManager";

export const orderNotificationExecutor = createProcessManagerExecutor<MutationCtx>({
  pmName: orderNotificationPM.processManagerName,
  eventSubscriptions: orderNotificationPM.eventSubscriptions,

  // Storage callbacks for PM state management
  storage: {
    getPMState: async (ctx, pmName, instanceId) => {
      return ctx.runQuery(components.eventStore.lib.getPMState, {
        processManagerName: pmName,
        instanceId,
      });
    },
    getOrCreatePMState: async (ctx, pmName, instanceId, initial) => {
      return ctx.runMutation(components.eventStore.lib.getOrCreatePMState, {
        processManagerName: pmName,
        instanceId,
        options: initial,
      });
    },
    updatePMState: async (ctx, pmName, instanceId, updates) => {
      await ctx.runMutation(components.eventStore.lib.updatePMState, {
        processManagerName: pmName,
        instanceId,
        updates,
      });
    },
    recordDeadLetter: async (ctx, pmName, instanceId, error, attemptCount, context) => {
      await ctx.runMutation(components.eventStore.lib.recordPMDeadLetter, {
        processManagerName: pmName,
        instanceId,
        error,
        attemptCount,
        ...context,
      });
    },
  },

  // Command emission via Workpool or scheduler
  commandEmitter: async (ctx, commands) => {
    for (const cmd of commands) {
      await ctx.scheduler.runAfter(0, processCommandRef, {
        commandType: cmd.commandType,
        payload: cmd.payload,
        correlationId: cmd.correlationId ?? "",
        causationId: cmd.causationId,
      });
    }
  },

  // Business logic handler
  handler: async (ctx, event) => {
    const { orderId, customerEmail } = event.payload as {
      orderId: string;
      customerEmail: string;
    };
    return [
      {
        commandType: "SendNotification",
        payload: {
          type: "order_confirmation",
          orderId,
          email: customerEmail,
        },
        causationId: event.eventId,
        correlationId: event.correlationId,
      },
    ];
  },

  // Instance ID resolution (optional, defaults to streamId)
  instanceIdResolver: (event) => (event.payload as { orderId: string }).orderId,
});
```

### 4.3 Create the Mutation Handler

```typescript
import { internalMutation } from "../_generated/server";

export const handleOrderConfirmed = internalMutation({
  args: {
    eventId: v.string(),
    eventType: v.string(),
    globalPosition: v.number(),
    correlationId: v.string(),
    streamType: v.string(),
    streamId: v.string(),
    payload: v.any(),
    timestamp: v.number(),
    category: v.string(),
    boundedContext: v.string(),
    instanceId: v.string(),
  },
  handler: async (ctx, args) => {
    const event: PMDomainEvent = {
      eventId: args.eventId,
      eventType: args.eventType,
      globalPosition: args.globalPosition,
      correlationId: args.correlationId,
      streamType: args.streamType,
      streamId: args.streamId,
      payload: args.payload as Record<string, unknown>,
      timestamp: args.timestamp,
    };

    return orderNotificationExecutor.process(ctx, event);
  },
});
```

### 4.4 Register with EventBus

```typescript
import { createPMSubscription } from "@libar-dev/platform-core/processManager";

const subscription = createPMSubscription(orderNotificationPM, {
  handler: internal.processManagers.orderNotification.handleOrderConfirmed,
  priority: 200, // After projections (100), before sagas (300)
});

// In your subscription registry
registry.add(subscription);
```

---

## 5. Components Architecture

### 5.1 Component Overview

```
+-------------------+     +-----------------+     +------------------+
|   EventBus        | --> | PM Subscription | --> | PM Executor      |
| (publishes event) |     | (routes event)  |     | (processes event)|
+-------------------+     +-----------------+     +------------------+
                                                        |
                                                        v
                          +------------------+     +------------------+
                          | Command Emitter  | <-- | PM Handler       |
                          | (Workpool/       |     | (business logic) |
                          |  Scheduler)      |     +------------------+
                          +------------------+
                                |
                                v
                          +------------------+
                          | Event Store      |
                          | (PM state tables)|
                          +------------------+
```

### 5.2 Key Components

| Component                  | Purpose                                     | Location                             |
| -------------------------- | ------------------------------------------- | ------------------------------------ |
| `ProcessManagerDefinition` | Formal metadata for PM                      | `@libar-dev/platform-bc`             |
| `ProcessManagerExecutor`   | Runtime execution with lifecycle management | `processManager/executor.ts`         |
| `ProcessManagerRegistry`   | Centralized PM lookup by event type         | `processManager/registry.ts`         |
| `withPMCheckpoint`         | Idempotency wrapper for PM handlers         | `processManager/withPMCheckpoint.ts` |
| `createPMSubscription`     | EventBus subscription from PM definition    | `processManager/subscription.ts`     |
| Lifecycle FSM              | State transition validation                 | `processManager/lifecycle.ts`        |

### 5.3 Processing Flow

1. **Event Published**: EventBus receives domain event
2. **Subscription Match**: PM subscription matches event type
3. **Instance ID Resolution**: Compute instance ID from correlation strategy
4. **Checkpoint Check**: Verify event not already processed (globalPosition)
5. **State Transition**: Move PM state from `idle` to `processing`
6. **Handler Execution**: Run PM handler to generate commands
7. **Command Emission**: Emit commands via Workpool/scheduler
8. **State Update**: Update to `completed` with new checkpoint
9. **Error Handling**: On failure, record dead letter and transition to `failed`

---

## 6. Dead Letter Handling

Failed PM processing is captured in a dead letter queue for investigation:

```typescript
interface ProcessManagerDeadLetter {
  processManagerName: string; // PM that failed
  instanceId: string; // Instance that failed
  eventId?: string; // Triggering event
  error: string; // Error message
  attemptCount: number; // Number of attempts
  status: "pending" | "replayed" | "ignored";
  failedCommand?: {
    // Command that failed to emit
    commandType: string;
    payload: Record<string, unknown>;
  };
  context?: Record<string, unknown>; // Additional debug context
  failedAt: number; // Timestamp
}
```

Dead letters can be:

- **Replayed**: Fix the issue and retry processing
- **Ignored**: Mark as obsolete (e.g., event no longer relevant)

---

## 7. Time-Triggered Process Managers

For cron-based PMs, define a schedule:

```typescript
const reservationExpirationPM = defineProcessManager({
  processManagerName: "reservationExpiration",
  description: "Releases expired reservations",
  triggerType: "time",
  eventSubscriptions: [], // No event subscriptions for time-triggered
  emitsCommands: ["ReleaseReservation"],
  context: "inventory",
  cronConfig: {
    interval: { minutes: 5 },
    scheduleDescription: "Every 5 minutes",
  },
});
```

Time-triggered PMs:

- Use `RESET` transition to return from `completed` to `idle`
- Don't require event subscriptions
- Are registered via `getTimeTriggeredPMs()` in the registry

---

## 8. Multi-PM Executor

When you have multiple PMs, use the multi-executor for unified routing:

```typescript
import { createMultiPMExecutor } from "@libar-dev/platform-core/processManager";

const multiExecutor = createMultiPMExecutor([
  orderNotificationExecutor,
  inventoryAllocationExecutor,
  paymentReceivedExecutor,
]);

// Find executors for an event type
const executors = multiExecutor.findExecutors("OrderConfirmed");

// Process event through all matching PMs
const results = await multiExecutor.processAll(ctx, event);
// Returns: [{ pmName: "orderNotification", result: {...} }, ...]
```

---

## 9. When to Use Process Managers

### Use Process Managers When:

- Simple event-to-command routing needed
- No compensation/rollback required
- Fire-and-forget semantics acceptable
- Single event processing (not multi-step)
- Performance matters (Workpool is faster than Workflow)

### Use Sagas Instead When:

- Compensation logic needed on failure
- Multi-step orchestration required
- Need to wait for external events (`awaitEvent`)
- Long-running process across multiple events
- Complex state management required

### Summary Decision Matrix

| Requirement                  | Use PM | Use Saga |
| ---------------------------- | ------ | -------- |
| Event -> single command      | Yes    | -        |
| Event -> multiple commands   | Yes    | -        |
| Multi-step with compensation | -      | Yes      |
| Wait for external event      | -      | Yes      |
| Time-triggered processing    | Yes    | -        |
| Hybrid (event + time)        | Yes    | -        |
| Fire-and-forget notification | Yes    | -        |
| Payment with rollback        | -      | Yes      |

---

## Related Documents

- [ADR-033: Process Manager vs Saga Distinction](../../../../docs/architecture/decisions/ADR-033-process-manager-vs-saga-distinction.md) - Architectural decision rationale
- [Workpool Partitioning](./workpool-partitioning.md) - Command emission infrastructure
- [EventBus Pattern](./eventbus.md) - Event routing infrastructure
- [Saga Orchestration](./saga-orchestration.md) - When you need compensation logic
