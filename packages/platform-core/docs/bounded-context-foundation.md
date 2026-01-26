# Bounded Context Foundation - Physical Isolation and Contracts

> **Pattern:** DDD bounded contexts with physical database isolation via Convex Components
> **Package:** `@libar-dev/platform-bc`
> **Status:** Completed (Phase 11)

---

## Overview

The Bounded Context Foundation pattern provides **physical database isolation** for DDD bounded contexts using Convex Components. Unlike traditional bounded contexts which rely on team discipline and code conventions, this pattern enforces isolation at the infrastructure level.

**Key insight:** Convex Components create true physical boundaries. The parent application cannot query component tables directly - all communication must go through well-defined handler APIs.

---

## 1. The Problem

### 1.1 Traditional Bounded Context Challenges

DDD Bounded Contexts need clear boundaries with physical enforcement, type-safe contracts, and domain purity. Without physical isolation, accidental coupling between contexts undermines the benefits of domain-driven design.

| Challenge | Traditional Approach | Risk |
|-----------|---------------------|------|
| Database access | Convention-based | Developers can accidentally query across boundaries |
| API contracts | Documentation only | No compile-time enforcement |
| Data ownership | Team agreement | Shared tables create hidden dependencies |
| Auth context | Implicit sharing | Security assumptions leak across boundaries |

### 1.2 The Convex Component Solution

Convex Components provide physical database isolation for bounded contexts:

```typescript
// Each bounded context is a Convex component with isolated database
import orders from "./contexts/orders/convex.config";
import inventory from "./contexts/inventory/convex.config";

const app = defineApp();
app.use(orders);     // Isolated DB: orderCMS
app.use(inventory);  // Isolated DB: inventoryCMS, reservationCMS
```

**Result:** The Orders context cannot accidentally query Inventory tables - they exist in separate, physically isolated databases.

---

## 2. Component Database Isolation (Convex Components)

### 2.1 Isolation Mechanics

Each Convex component (bounded context) has its own isolated database. The parent application **CANNOT** directly query component tables:

```typescript
// FAILS - table doesn't exist in parent database
ctx.db.query("orderCMS");
// Error: Table "orderCMS" does not exist

// WORKS - uses component API
ctx.runMutation(components.orders.handlers.createOrder, args);
```

### 2.2 What Gets Isolated

| Aspect | Inside Component | At Parent Level |
|--------|-----------------|-----------------|
| Database tables | Fully accessible via `ctx.db` | Invisible - must use handler API |
| Scheduled functions | Run independently | Cannot be cancelled by parent |
| Internal state | Direct access | Opaque - no introspection API |
| Document IDs | `Id<"orderCMS">` | Converted to `string` at boundary |

### 2.3 Component Configuration Example

```typescript
// convex/convex.config.ts
import { defineApp } from "convex/server";

// Infrastructure components
import eventStore from "@libar-dev/platform-store/convex.config";
import commandBus from "@libar-dev/platform-bus/convex.config";

// Bounded context components
import orders from "./contexts/orders/convex.config";
import inventory from "./contexts/inventory/convex.config";

const app = defineApp();

// Each component has its OWN isolated database
app.use(eventStore);   // events, streams tables
app.use(commandBus);   // commands table
app.use(orders);       // orderCMS table
app.use(inventory);    // inventoryCMS, reservationCMS tables

export default app;
```

---

## 3. Boundary Rules

### 3.1 Critical Boundary Constraints

| Rule | Implication | Error Handling |
|------|-------------|----------------|
| **No direct table access** | Parent cannot `ctx.db.query("orderCMS")` | Table does not exist error |
| **No auth passthrough** | `ctx.auth` doesn't cross boundaries | Must pass `userId` explicitly |
| **IDs become strings** | `Id<"table">` inside → `string` at boundary | Type conversion required |
| **No env vars** | Components can't access `process.env` | Pass configuration as args |
| **No programmatic cleanup** | Cannot delete component data from parent | Use Docker restart for tests |

### 3.2 Auth Context Handling

The `ctx.auth` context does NOT cross component boundaries. If a component needs user identity, pass it explicitly:

```typescript
// Parent app mutation
export const createOrder = mutation({
  handler: async (ctx, args) => {
    // Get auth in parent
    const identity = await ctx.auth.getUserIdentity();
    const userId = identity?.subject;

    // Must pass to component explicitly
    await ctx.runMutation(components.orders.handlers.createOrder, {
      orderId: args.orderId,
      customerId: args.customerId,
      userId,  // Explicitly passed - component cannot access ctx.auth
    });
  },
});
```

**Why explicit passing?** Prevents implicit coupling to auth infrastructure and makes security requirements clear in the API.

### 3.3 ID Transformation at Boundaries

Inside components, use Convex document IDs (`Id<"table">`). At component boundaries, convert to strings:

```typescript
// Inside Orders component
const order: Doc<"orderCMS"> = await ctx.db.get(internalId);

// Return business IDs (strings) to parent
return {
  orderId: order.orderId,      // string - business ID
  version: order.version,      // number
  status: order.status,        // string
  // Do NOT return: order._id  // Id<"orderCMS"> - meaningless outside
};
```

---

## 4. Sub-Transaction Atomicity

### 4.1 Default Behavior: All Writes Commit Together

All writes for a top-level mutation call, including writes performed by calls into other components' mutations, commit at the same time:

```typescript
export const processOrder = mutation({
  handler: async (ctx, args) => {
    // Write to app table
    await ctx.db.insert("orders", { status: "processing" });

    // Write to component's isolated database
    await ctx.runMutation(components.inventory.lib.reserveStock, {
      productId: args.productId,
      quantity: args.quantity,
    });

    // ALL writes (app + component) commit together
    // If we throw here, BOTH the order insert AND the reservation are rolled back
  },
});
```

### 4.2 Caught Exceptions: Sub-Transaction Rollback

If a component mutation call throws and the caller catches the exception:
- **Only the component's writes roll back**
- Parent writes (before the call) are preserved

```typescript
export const processWithFallback = mutation({
  handler: async (ctx, args) => {
    await ctx.db.insert("logs", { event: "started" });  // Will commit

    try {
      // Component throws (e.g., rate limit exceeded)
      await ctx.runMutation(components.rateLimiter.lib.checkLimit, {
        key: args.userId,
        throws: true,
      });
    } catch (e) {
      // Component's writes are rolled back
      // App's "started" log is still pending and will commit
      await ctx.db.insert("logs", { event: "rate_limited" });
      return { success: false };
    }

    await ctx.db.insert("logs", { event: "completed" });
    return { success: true };
  },
});
```

### 4.3 Implications for DDD/ES/CQRS

| Pattern | Implication |
|---------|-------------|
| Command handlers | CMS and Event Store writes commit atomically |
| Projection processing | Atomic updates across read models |
| Saga compensation | Must be explicit (separate mutation calls) - caught exceptions only roll back the component that threw |

---

## 5. DualWriteContextContract (Type-Safe BC APIs)

### 5.1 Contract Purpose

Each bounded context should define a contract that specifies its public API. The contract serves as documentation and enables type-safe integration.

```typescript
import type {
  DualWriteContextContract,
  CMSTypeDefinition
} from "@libar-dev/platform-bc";

export const OrdersContextContract = {
  identity: {
    name: "orders",
    description: "Order management bounded context",
    version: 1,
    streamTypePrefix: "Order",
  },
  executionMode: "dual-write",
  commandTypes: ["CreateOrder", "AddItem", "SubmitOrder", "CancelOrder"] as const,
  eventTypes: ["OrderCreated", "ItemAdded", "OrderSubmitted", "OrderCancelled"] as const,
  cmsTypes: {
    orderCMS: {
      tableName: "orderCMS",
      currentStateVersion: 1,
      description: "Order aggregate state",
    },
  },
  errorCodes: ["ORDER_NOT_FOUND", "ORDER_ALREADY_EXISTS", "ORDER_NOT_IN_DRAFT"],
} as const satisfies DualWriteContextContract<
  readonly ["CreateOrder", "AddItem", "SubmitOrder", "CancelOrder"],
  readonly ["OrderCreated", "ItemAdded", "OrderSubmitted", "OrderCancelled"],
  { orderCMS: CMSTypeDefinition }
>;
```

### 5.2 Contract Components

| Component | Purpose | Example |
|-----------|---------|---------|
| `identity` | Context identification and metadata | Name, description, version, streamTypePrefix |
| `executionMode` | Execution pattern ("dual-write") | CMS + Event in same transaction |
| `commandTypes` | Commands the context handles | `["CreateOrder", "SubmitOrder"]` |
| `eventTypes` | Events the context produces | `["OrderCreated", "OrderSubmitted"]` |
| `cmsTypes` | CMS tables with schema versions | Table names and currentStateVersion |
| `errorCodes` | Domain errors that can be returned | Business rule violations |

### 5.3 BoundedContextIdentity

The identity interface provides core metadata for the bounded context:

```typescript
interface BoundedContextIdentity {
  // Unique context name (lowercase, no spaces)
  // Used as identifier in logs, event routing, and integrations
  name: string;  // e.g., "orders", "inventory"

  // Human-readable description of the context's purpose
  description: string;

  // Contract version for evolution tracking
  // Increment when breaking changes are made to the public API
  version: number;

  // Prefix used for event stream types in the Event Store
  // All events from this context will have streams like `{prefix}:{entityId}`
  streamTypePrefix: string;  // e.g., "Order" produces "Order:order_123"
}
```

---

## 6. Type Helpers

### 6.1 ExtractCommandTypes

Extract command type literals from a contract for type-safe command handling:

```typescript
import type { ExtractCommandTypes } from "@libar-dev/platform-bc";

// Given the OrdersContextContract above:
type OrderCommands = ExtractCommandTypes<typeof OrdersContextContract>;
// Result: "CreateOrder" | "AddItem" | "SubmitOrder" | "CancelOrder"

// Use in command handlers for type-safe routing
function handleCommand(commandType: OrderCommands, payload: unknown) {
  switch (commandType) {
    case "CreateOrder":
      // TypeScript knows this is valid
      break;
    case "InvalidCommand":
      // TypeScript error: not assignable to OrderCommands
      break;
  }
}
```

### 6.2 ExtractEventTypes

Extract event type literals from a contract for type-safe event handling:

```typescript
import type { ExtractEventTypes } from "@libar-dev/platform-bc";

type OrderEvents = ExtractEventTypes<typeof OrdersContextContract>;
// Result: "OrderCreated" | "ItemAdded" | "OrderSubmitted" | "OrderCancelled"

// Use in projection handlers
function handleEvent(eventType: OrderEvents, payload: unknown) {
  switch (eventType) {
    case "OrderCreated":
      // Build read model
      break;
    case "OrderSubmitted":
      // Update status
      break;
  }
}
```

### 6.3 ExtractCMSTableNames

Extract CMS table names from a contract:

```typescript
import type { ExtractCMSTableNames } from "@libar-dev/platform-bc";

type OrderTables = ExtractCMSTableNames<typeof OrdersContextContract>;
// Result: "orderCMS"
```

### 6.4 Definition Helper Functions

The package provides helper functions that preserve literal types for better TypeScript inference:

```typescript
import {
  defineCommand,
  defineEvent,
  defineProjection,
  defineProcessManager
} from "@libar-dev/platform-bc";

// Command definition with preserved literal types
const CreateOrderDef = defineCommand({
  commandType: "CreateOrder",
  description: "Creates a new order in draft status",
  targetAggregate: "Order",
  createsAggregate: true,
  producesEvents: ["OrderCreated"],
  errorCodes: ["ORDER_ALREADY_EXISTS"],
});
// CreateOrderDef.commandType is "CreateOrder" (literal), not string

// Event definition with category
const OrderCreatedDef = defineEvent({
  eventType: "OrderCreated",
  description: "Emitted when a new order is created",
  sourceAggregate: "Order",
  category: "domain",  // domain | integration | trigger | fat
  schemaVersion: 1,
  producedBy: ["CreateOrder"],
});

// Projection definition with category
const orderSummaryProjection = defineProjection({
  projectionName: "orderSummary",
  description: "Order listing with status and totals",
  targetTable: "orderSummaries",
  partitionKeyField: "orderId",
  eventSubscriptions: ["OrderCreated", "OrderSubmitted"] as const,
  context: "orders",
  type: "primary",     // primary | secondary | cross-context
  category: "view",    // logic | view | reporting | integration
});

// Process manager definition with validation
const notificationPM = defineProcessManager({
  processManagerName: "orderNotification",
  description: "Sends notification when order is confirmed",
  triggerType: "event",  // event | time | hybrid
  eventSubscriptions: ["OrderConfirmed"] as const,
  emitsCommands: ["SendNotification"],
  context: "orders",
});
```

### 6.5 Category Validators

Type guards for validating category values at runtime:

```typescript
import {
  isEventCategory,
  isProjectionCategory,
  isLogicProjection,
  isViewProjection,
  isClientExposed,
} from "@libar-dev/platform-bc";

// Validate event category
const category: unknown = "domain";
if (isEventCategory(category)) {
  // category is now typed as EventCategory
}

// Check projection category for routing decisions
if (isViewProjection(projectionCategory)) {
  // Enable reactive subscriptions
}

if (isClientExposed(projectionCategory)) {
  // Allow client access
}
```

### 6.6 Projection Categories Reference

| Category | Purpose | Query Pattern | Client Exposed |
|----------|---------|---------------|----------------|
| `logic` | Internal command validation | Internal only | No |
| `view` | Denormalized for UI queries | Client queries | Yes (reactive) |
| `reporting` | Analytics and aggregations | Async/batch | Admin only |
| `integration` | Cross-context synchronization | EventBus | No |

---

## Related Documents

- [DCB Architecture](./dcb-architecture.md) - Multi-entity invariants within bounded contexts
- [Component Isolation](../../../../docs/architecture/COMPONENT_ISOLATION.md) - Full component isolation details
- [Projection Categories](./projection-categories.md) - Query routing taxonomy
- [Fat Events](./fat-events.md) - Event payload strategies
