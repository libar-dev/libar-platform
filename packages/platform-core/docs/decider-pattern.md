# Decider Pattern - Pure Domain Logic Extraction

> **Pattern:** Functional command handling that separates pure business logic from infrastructure concerns, enabling unit testing without database dependencies and reducing handler boilerplate by ~80%.

---

## Overview

The Decider pattern is a functional approach to command handling that extracts domain logic into pure functions. Instead of mixing business rules with database operations, deciders focus solely on answering: "Given the current state and a command, what should happen?"

**Key insight:** Deciders never perform I/O. They receive state, evaluate invariants, and return a decision. The infrastructure wrapper handles persistence.

```
Command → Load CMS (O(1)) → Decider (pure) → ATOMIC {CMS patch + Event append}
                              │
                              └── No ctx, no I/O, no side effects
```

---

## 1. The Problem

### 1.1 Traditional Handler Structure

Domain logic embedded in handlers creates several problems:

```typescript
// Traditional approach - domain logic mixed with infrastructure
export const handleSubmitOrder = mutation({
  args: { orderId: v.string(), commandId: v.string(), correlationId: v.string() },
  handler: async (ctx, args) => {
    // 1. Load state (infrastructure)
    const order = await ctx.db.query("orders").filter(...).first();

    // 2. Business logic (domain) - MIXED WITH INFRASTRUCTURE
    if (order.status !== "draft") {
      return { status: "rejected", code: "ORDER_NOT_IN_DRAFT" };
    }
    if (order.items.length === 0) {
      return { status: "rejected", code: "ORDER_HAS_NO_ITEMS" };
    }

    // 3. Persist (infrastructure)
    await ctx.db.patch(order._id, { status: "submitted" });

    // 4. Build event (more infrastructure)
    const event = { eventType: "OrderSubmitted", payload: {...} };
    await eventStore.append(ctx, event);

    return { status: "success", data: {...} };
  },
});
```

**Problems with this approach:**

| Problem                           | Impact                                    |
| --------------------------------- | ----------------------------------------- |
| Testing requires Docker           | Slow CI, complex test setup               |
| Business logic hidden in handlers | Hard to understand domain rules           |
| Duplicate validation logic        | Inconsistent behavior across handlers     |
| No property-based testing         | Cannot verify invariants exhaustively     |
| Difficult to refactor             | Business logic entangled with persistence |

### 1.2 The Goal

Separate concerns so that:

- **Deciders** (pure) contain all business logic - testable without infrastructure
- **Handlers** (effectful) handle load/persist - thin orchestration layer

---

## 2. The Solution: decide + evolve

The Decider pattern uses two complementary functions:

### 2.1 decide(state, command, context) -> DeciderOutput

Determines what should happen based on current state and command input.

```typescript
function decideSubmitOrder(
  state: OrderCMS,
  command: SubmitOrderInput,
  context: DeciderContext
): DeciderOutput<OrderSubmittedEvent, SubmitOrderData, OrderStateUpdate> {
  // Validate FSM transition (pure check)
  if (!orderFSM.canTransition(state.status, "submitted")) {
    return rejected("ORDER_NOT_IN_DRAFT", `Cannot submit order in ${state.status} status.`);
  }

  // Validate business invariant (pure check)
  if (state.items.length === 0) {
    return rejected("ORDER_HAS_NO_ITEMS", "Cannot submit an order with no items.");
  }

  // Build success output (pure construction)
  return success({
    data: {
      orderId: state.orderId,
      totalAmount: state.totalAmount,
      itemCount: state.items.length,
    },
    event: {
      eventType: "OrderSubmitted",
      payload: {
        orderId: state.orderId,
        items: state.items,
        totalAmount: state.totalAmount,
        submittedAt: context.now,
      },
    },
    stateUpdate: {
      status: "submitted",
    },
  });
}
```

### 2.2 evolve(state, event) -> state

Applies an event to produce new state. Used for projections, testing, and replay.

```typescript
function evolveSubmitOrder(state: OrderCMS, event: OrderSubmittedEvent): OrderCMS {
  return {
    ...state,
    status: "submitted",
  };
}
```

### 2.3 The Full Decider

Combining both functions into a reusable unit:

```typescript
export const submitOrderDecider: Decider<
  OrderCMS,
  SubmitOrderInput,
  OrderSubmittedEvent,
  SubmitOrderData,
  OrderStateUpdate
> = {
  decide: decideSubmitOrder,
  evolve: evolveSubmitOrder,
};
```

**Key Rules:**

| Rule                             | Rationale                               |
| -------------------------------- | --------------------------------------- |
| No `ctx` parameter               | Pure functions cannot access database   |
| No I/O operations                | No network calls, no file system        |
| No side effects                  | Same inputs always produce same outputs |
| Deterministic                    | Enables property-based testing          |
| Event payload is source of truth | `evolve` must not recalculate values    |

---

## 3. Core Types

### 3.1 DeciderOutput - Three Possible Outcomes

Every decider returns one of three outcomes:

```typescript
type DeciderOutput<TEvent, TData, TStateUpdate, TFailEvent> =
  | DeciderSuccess<TEvent, TData, TStateUpdate>
  | DeciderRejected
  | DeciderFailed<TFailEvent>;
```

#### Success - Command Executed

```typescript
interface DeciderSuccess<TEvent, TData, TStateUpdate> {
  status: "success";
  data: TData; // Returned to caller
  event: TEvent; // Event to emit
  stateUpdate: TStateUpdate; // CMS update to apply
}
```

#### Rejected - Validation Failure (No Event)

```typescript
interface DeciderRejected {
  status: "rejected";
  code: string; // e.g., "ORDER_NOT_IN_DRAFT"
  message: string; // Human-readable explanation
  context?: UnknownRecord; // Optional details
}
```

#### Failed - Business Failure (With Event)

```typescript
interface DeciderFailed<TEvent> {
  status: "failed";
  reason: string; // Failure explanation
  event: TEvent; // Failure event to emit
  context?: UnknownRecord; // Optional details
}
```

**When to use each:**

| Outcome    | Use When                           | Event Emitted | Example                  |
| ---------- | ---------------------------------- | ------------- | ------------------------ |
| `success`  | Command executed successfully      | Yes           | Order submitted          |
| `rejected` | Validation failed, no action taken | No            | Order not in draft       |
| `failed`   | Business failure worth recording   | Yes           | Stock reservation failed |

### 3.2 DeciderContext - Infrastructure Metadata

```typescript
interface DeciderContext {
  now: number; // Current timestamp (Date.now())
  commandId: string; // For causation tracking
  correlationId: string; // For request tracing
}
```

The context provides values that a pure function cannot generate on its own (timestamps, IDs). The handler wrapper creates this context before calling the decider.

### 3.3 Decider Interface

```typescript
interface Decider<TState, TCommand, TEvent, TData, TStateUpdate> {
  decide: (
    state: TState,
    command: TCommand,
    context: DeciderContext
  ) => DeciderOutput<TEvent, TData, TStateUpdate>;

  evolve: (state: TState, event: TEvent) => TState;
}
```

### 3.4 Helper Functions

| Function                                | Returns           | Purpose                           |
| --------------------------------------- | ----------------- | --------------------------------- |
| `success({ data, event, stateUpdate })` | `DeciderSuccess`  | Build successful output           |
| `rejected(code, message, context?)`     | `DeciderRejected` | Build validation failure          |
| `failed(reason, event, context?)`       | `DeciderFailed`   | Build business failure with event |
| `isSuccess(output)`                     | `boolean`         | Type guard for success            |
| `isRejected(output)`                    | `boolean`         | Type guard for rejection          |
| `isFailed(output)`                      | `boolean`         | Type guard for failure            |

**Example usage:**

```typescript
import { success, rejected, isSuccess, isRejected } from "@libar-dev/platform-decider";

// In decider
if (state.status !== "draft") {
  return rejected("ORDER_NOT_IN_DRAFT", "Order must be in draft status");
}
return success({
  data: { orderId },
  event: { eventType: "OrderSubmitted", payload: {...} },
  stateUpdate: { status: "submitted" },
});

// In handler (for custom handlers)
const result = decideSubmitOrder(state, command, context);
if (isRejected(result)) {
  return rejectedResult(result.code, result.message, result.context);
}
if (isSuccess(result)) {
  // Process success...
}
```

---

## 4. Handler Factories

Handler factories wrap pure deciders with infrastructure concerns, reducing boilerplate by ~80%.

### 4.1 createDeciderHandler - For Entity Modifications

Use when the entity **must already exist**.

```typescript
import { createDeciderHandler } from "@libar-dev/platform-core/decider";

const confirmOrderHandler = createDeciderHandler({
  name: "ConfirmOrder",
  streamType: "Order",
  schemaVersion: 1,
  decider: decideConfirmOrder,
  getEntityId: (args) => args.orderId,
  loadState: async (ctx, entityId) => orderRepo.load(ctx, entityId),
  applyUpdate: async (ctx, _id, cms, update, version, now) => {
    await ctx.db.patch(_id, { ...update, version, updatedAt: now });
  },
  handleError: (error, entityId) => {
    if (error instanceof NotFoundError) {
      return rejectedResult("ORDER_NOT_FOUND", error.message, { orderId: entityId });
    }
    throw error;
  },
});

// Export as mutation
export const handleConfirmOrder = mutation({
  args: { commandId: v.string(), correlationId: v.string(), orderId: v.string() },
  handler: async (ctx, args) => confirmOrderHandler(ctx, args),
});
```

**Factory automation:**

| Step | Action             | Handled By                        |
| ---- | ------------------ | --------------------------------- |
| 1    | Load CMS           | `loadState` callback              |
| 2    | Build context      | Factory (timestamp, IDs)          |
| 3    | Call decider       | Pure function invocation          |
| 4    | Transform result   | Factory -> `CommandHandlerResult` |
| 5    | Build EventData    | Factory (adds metadata)           |
| 6    | Apply state update | `applyUpdate` callback            |
| 7    | Handle errors      | `handleError` callback            |

### 4.2 createEntityDeciderHandler - For Entity Creation

Use when the entity **may not exist yet**.

```typescript
import { createEntityDeciderHandler } from "@libar-dev/platform-core/decider";

const createOrderHandler = createEntityDeciderHandler({
  name: "CreateOrder",
  streamType: "Order",
  schemaVersion: 1,
  decider: decideCreateOrder, // Receives TState | null
  getEntityId: (args) => args.orderId,
  tryLoadState: async (ctx, entityId) => orderRepo.tryLoad(ctx, entityId), // Returns null if not found
  insert: async (ctx, entityId, stateUpdate, commandInput, version, now) => {
    const cms = createInitialOrderCMS(entityId, commandInput.customerId);
    await ctx.db.insert("orderCMS", {
      ...cms,
      ...stateUpdate,
      version,
      createdAt: now,
      updatedAt: now,
    });
  },
  preValidate: async (ctx, args) => {
    // Optional: cross-entity validation before decider
    const existingOrder = await ctx.db
      .query("orderCMS")
      .withIndex("by_external_id", (q) => q.eq("externalId", args.externalId))
      .first();
    if (existingOrder) {
      return rejectedResult("DUPLICATE_EXTERNAL_ID", "External ID already exists");
    }
    return undefined; // Continue with decider
  },
});
```

**Key differences from createDeciderHandler:**

| Aspect             | createDeciderHandler              | createEntityDeciderHandler    |
| ------------------ | --------------------------------- | ----------------------------- |
| State loading      | `loadState` (throws if not found) | `tryLoadState` (returns null) |
| Decider state type | `TState`                          | `TState \| null`              |
| Persistence        | `applyUpdate` (patch)             | `insert` (create)             |
| Version            | `cms.version + 1`                 | Always `1`                    |
| Pre-validation     | Not supported                     | `preValidate` callback        |

### 4.3 When to Skip Factories

Some handlers need custom logic that factories don't support:

```typescript
// Custom handler for Fat Events enrichment
const submitOrderHandlerWithEnrichment = async (ctx, args) => {
  // 1. Load order CMS
  const { cms, _id } = await orderRepo.load(ctx, args.orderId);

  // 2. Load customer snapshot for enrichment (pre-decider I/O)
  const customerSnapshot = loadCustomerSnapshot(cms.customerId);

  // 3. Build extended context with customer data
  const context: SubmitOrderContext = {
    now: Date.now(),
    commandId: args.commandId,
    correlationId: args.correlationId,
    customerSnapshot, // Extra data for Fat Events
  };

  // 4. Call decider with enriched context
  const result = decideSubmitOrder(cms, { orderId: args.orderId }, context);

  // 5. Handle result manually...
};
```

**When to use custom handlers:**

| Scenario                | Use Factory?           | Reason                                    |
| ----------------------- | ---------------------- | ----------------------------------------- |
| Standard CRUD           | Yes                    | Reduces boilerplate                       |
| Pre-decider enrichment  | No                     | Factory doesn't support context extension |
| Cross-entity validation | Consider `preValidate` | Entity creation factory supports this     |
| Complex error handling  | Maybe                  | Custom handlers offer more control        |

---

## 5. FSM Integration

Finite State Machines (FSM) define valid state transitions and integrate seamlessly with deciders.

### 5.1 Defining an FSM

```typescript
import { defineFSM } from "@libar-dev/platform-core/fsm";

type OrderStatus = "draft" | "submitted" | "confirmed" | "cancelled";

export const orderFSM = defineFSM<OrderStatus>({
  initial: "draft",
  transitions: {
    draft: ["submitted", "cancelled"],
    submitted: ["confirmed", "cancelled"],
    confirmed: [], // Terminal state
    cancelled: [], // Terminal state
  },
});
```

### 5.2 Using FSM in Deciders

```typescript
function decideConfirmOrder(
  state: OrderCMS,
  command: ConfirmOrderInput,
  context: DeciderContext
): DeciderOutput<...> {
  // Validate FSM transition
  if (!orderFSM.canTransition(state.status, "confirmed")) {
    return rejected(
      "ORDER_NOT_SUBMITTED",
      `Cannot confirm order in ${state.status} status. Only submitted orders can be confirmed.`
    );
  }

  // Business logic continues...
}
```

### 5.3 FSM Methods

| Method                       | Returns    | Purpose                   |
| ---------------------------- | ---------- | ------------------------- |
| `canTransition(from, to)`    | `boolean`  | Check if transition valid |
| `assertTransition(from, to)` | `void`     | Throw if invalid          |
| `validTransitions(from)`     | `TState[]` | List valid targets        |
| `isTerminal(state)`          | `boolean`  | Check for end state       |
| `isValidState(state)`        | `boolean`  | Type guard for state      |

### 5.4 FSM State Diagram

```
                 ┌─────────────────────────────┐
                 │                             │
                 v                             │
          ┌──────────┐    SubmitOrder    ┌───────────┐
          │  draft   │──────────────────►│ submitted │
          └──────────┘                   └───────────┘
                 │                             │
                 │                             │ ConfirmOrder
                 │ CancelOrder                 │
                 │                             v
                 │                      ┌───────────┐
                 │                      │ confirmed │ (terminal)
                 │                      └───────────┘
                 │
                 v
          ┌───────────┐
          │ cancelled │ (terminal)
          └───────────┘
```

---

## 6. Decision Tree: Which Handler Factory to Use

```
Creating new entity? ─────────► Yes ──► createEntityDeciderHandler
        │
        No
        │
        v
Need pre-decider I/O? ────────► Yes ──► Custom handler
(e.g., Fat Events enrichment)
        │
        No
        │
        v
Standard modification ────────► Yes ──► createDeciderHandler
```

### Quick Reference

| Scenario                        | Factory                                         | Example                 |
| ------------------------------- | ----------------------------------------------- | ----------------------- |
| Create Order                    | `createEntityDeciderHandler`                    | Entity may not exist    |
| Submit Order (with enrichment)  | Custom handler                                  | Needs customer snapshot |
| Confirm Order                   | `createDeciderHandler`                          | Standard modification   |
| Cancel Order                    | `createDeciderHandler`                          | Standard modification   |
| Add Item to Order               | `createDeciderHandler`                          | Standard modification   |
| Create Product (with SKU check) | `createEntityDeciderHandler` with `preValidate` | Cross-entity uniqueness |

---

## 7. Testing Deciders

Because deciders are pure functions, they can be tested without infrastructure.

### 7.1 Unit Testing

```typescript
import { decideSubmitOrder } from "./submitOrder";
import { success, rejected, isSuccess, isRejected } from "@libar-dev/platform-decider";

describe("decideSubmitOrder", () => {
  const context = { now: Date.now(), commandId: "cmd-1", correlationId: "corr-1" };

  it("rejects orders not in draft status", () => {
    const state = { status: "submitted", items: [...], ... };
    const result = decideSubmitOrder(state, { orderId: "o1" }, context);

    expect(isRejected(result)).toBe(true);
    expect(result.code).toBe("ORDER_NOT_IN_DRAFT");
  });

  it("rejects orders with no items", () => {
    const state = { status: "draft", items: [], ... };
    const result = decideSubmitOrder(state, { orderId: "o1" }, context);

    expect(isRejected(result)).toBe(true);
    expect(result.code).toBe("ORDER_HAS_NO_ITEMS");
  });

  it("succeeds for valid draft orders with items", () => {
    const state = { status: "draft", items: [item1], ... };
    const result = decideSubmitOrder(state, { orderId: "o1" }, context);

    expect(isSuccess(result)).toBe(true);
    expect(result.event.eventType).toBe("OrderSubmitted");
    expect(result.stateUpdate.status).toBe("submitted");
  });
});
```

### 7.2 Property-Based Testing

Because deciders are pure and deterministic, they enable property-based testing:

```typescript
import { fc } from "@fast-check/vitest";

describe("decideSubmitOrder properties", () => {
  it("never succeeds with empty items", () => {
    fc.assert(
      fc.property(
        fc.record({
          status: fc.constant("draft"),
          items: fc.constant([]),
          orderId: fc.string(),
          // ...other fields
        }),
        (state) => {
          const result = decideSubmitOrder(state, { orderId: state.orderId }, context);
          return isRejected(result) && result.code === "ORDER_HAS_NO_ITEMS";
        }
      )
    );
  });

  it("always transitions to submitted on success", () => {
    fc.assert(
      fc.property(
        validDraftOrderArbitrary, // Custom arbitrary for valid orders
        (state) => {
          const result = decideSubmitOrder(state, { orderId: state.orderId }, context);
          return !isSuccess(result) || result.stateUpdate.status === "submitted";
        }
      )
    );
  });
});
```

---

## 8. Relationship to Other Patterns

### 8.1 Architecture Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ Command Orchestrator                                                        │
│ ┌─────────────────────────────────────────────────────────────────────────┐ │
│ │ 1. Record Command → 2. Middleware → 3. Call Handler                    │ │
│ └─────────────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      v
┌─────────────────────────────────────────────────────────────────────────────┐
│ Handler (Factory-Generated or Custom)                                       │
│ ┌─────────────────────────────────────────────────────────────────────────┐ │
│ │ Load CMS → Build Context → Call Decider → Apply Update → Return Event  │ │
│ └─────────────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      v
┌─────────────────────────────────────────────────────────────────────────────┐
│ Pure Decider                                                                │
│ ┌─────────────────────────────────────────────────────────────────────────┐ │
│ │ Validate Invariants → Check FSM → Return DeciderOutput                 │ │
│ │ (No ctx, no I/O, fully testable)                                       │ │
│ └─────────────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 8.2 Pattern Relationships

| Pattern                  | Relationship to Decider                                   |
| ------------------------ | --------------------------------------------------------- |
| **CMS Dual-Write**       | Handler applies decider's `stateUpdate` to CMS            |
| **FSM**                  | Deciders use FSM for transition validation                |
| **Command Orchestrator** | Calls handlers which wrap deciders                        |
| **Projections**          | Use `evolve` function to process events                   |
| **DCB**                  | Uses specialized `DCBDecider` for multi-entity operations |
| **Fat Events**           | Custom handlers enrich decider context                    |

### 8.3 Decider vs Handler vs Aggregate

| Concern      | Decider (Pure)    | Handler (Effectful)    | Aggregate (Traditional) |
| ------------ | ----------------- | ---------------------- | ----------------------- |
| I/O          | Never             | Load/persist CMS       | Mixed                   |
| Side effects | Never             | Always                 | Mixed                   |
| Testability  | Unit tests (fast) | Integration tests      | Integration tests       |
| Returns      | `DeciderOutput`   | `CommandHandlerResult` | Varies                  |
| State        | Receives state    | Manages loading        | Manages internally      |

---

## Related Documents

- [DCB Architecture](./dcb-architecture.md) - Multi-entity invariants using `DCBDecider`
- [Projection Categories](./projection-categories.md) - Using `evolve` in projections
- [Fat Events](./fat-events.md) - Custom handlers for event enrichment
- [Command Orchestrator](../../../../docs/architecture/OVERVIEW.md) - 7-step command flow

---

## Package References

| Package                            | Exports                                                                                                                              |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `@libar-dev/platform-decider`      | `DeciderOutput`, `success`, `rejected`, `failed`, `isSuccess`, `isRejected`, `isFailed`, `Decider`, `DeciderContext`, `DeciderEvent` |
| `@libar-dev/platform-core/decider` | Re-exports from platform-decider + `createDeciderHandler`, `createEntityDeciderHandler`                                              |
| `@libar-dev/platform-fsm`          | `defineFSM`, `FSM`, `FSMDefinition`, `FSMTransitionError`                                                                            |
