# Command Bus Foundation - Idempotency and Orchestration

> **Pattern:** Infrastructure-level command deduplication, status lifecycle tracking, and the 7-step CommandOrchestrator that enforces consistent dual-write execution across all bounded contexts.
> **Package:** `@libar-dev/platform-bus` (component), `@libar-dev/platform-core` (orchestrator)

---

## Overview

The Command Bus Foundation provides infrastructure-level guarantees for command processing in a distributed system. It solves three critical problems:

1. **Idempotency**: Duplicate command submissions (same `commandId`) are detected and return cached results without re-execution
2. **Status Tracking**: Every command progresses through a well-defined lifecycle from receipt to completion
3. **Consistent Execution**: The 7-step CommandOrchestrator ensures every command follows the same dual-write pattern

**Key insight:** Command idempotency is an infrastructure concern, not a domain concern. By handling deduplication at the bus level, bounded contexts remain focused on business logic.

---

## 1. The Problem

### 1.1 Duplicate Command Execution

In distributed systems, network failures, retries, and client-side bugs can cause the same command to be submitted multiple times:

```typescript
// Client code with retry logic
async function submitOrder(order) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await api.createOrder(order);
    } catch (error) {
      if (attempt === 2) throw error;
      // Network timeout - retry
    }
  }
}
```

Without idempotency protection, each retry could create a new order, corrupt inventory counts, or charge a customer multiple times.

### 1.2 Inconsistent Command Handling

Without a standardized execution path, commands across bounded contexts may:

- Skip event emission (breaking audit trails)
- Forget to trigger projections (stale read models)
- Handle errors inconsistently
- Miss correlation tracking (debugging nightmares)

### 1.3 Target State

```typescript
// With Command Bus Foundation:
// - Same commandId always returns same result
// - All commands follow identical 7-step flow
// - Full audit trail and correlation tracking
const result = await orchestrator.execute(ctx, createOrderConfig, {
  commandId: "cmd_abc123", // Client-provided for idempotency
  orderId: "ord_456",
  items: [{ productId: "prod_1", quantity: 2 }],
});

// If network fails and client retries with same commandId:
// - No duplicate order created
// - Cached result returned immediately
```

---

## 2. Command Idempotency (commandId Deduplication)

### 2.1 How It Works

Every command carries a unique `commandId`. When a command is recorded, the Command Bus checks if that ID already exists:

```
                    ┌─────────────────────────┐
                    │   recordCommand API     │
                    └───────────┬─────────────┘
                                │
                    ┌───────────▼─────────────┐
                    │  Check by_commandId     │
                    │       index             │
                    └───────────┬─────────────┘
                                │
              ┌─────────────────┴─────────────────┐
              │                                   │
        ┌─────▼─────┐                       ┌─────▼─────┐
        │ Not Found │                       │   Found   │
        └─────┬─────┘                       └─────┬─────┘
              │                                   │
    ┌─────────▼─────────┐               ┌─────────▼─────────┐
    │ Insert as pending │               │ Return cached     │
    │ Return isNew=true │               │ status + result   │
    └───────────────────┘               └───────────────────┘
```

### 2.2 API: recordCommand

```typescript
// From @libar-dev/platform-bus/src/component/lib.ts
const recordCommand = mutation({
  args: {
    commandId: v.string(),
    commandType: v.string(),
    targetContext: v.string(),
    payload: v.any(),
    metadata: v.object({
      userId: v.optional(v.string()),
      correlationId: v.string(),
      timestamp: v.number(),
    }),
    ttl: v.optional(v.number()), // Default: 7 days
  },
  returns: v.union(
    v.object({ status: v.literal("new") }),
    v.object({
      status: v.literal("duplicate"),
      commandStatus: v.union(
        v.literal("pending"),
        v.literal("executed"),
        v.literal("rejected"),
        v.literal("failed")
      ),
      result: v.optional(v.any()),
    })
  ),
});
```

### 2.3 Race Condition Handling

Convex indexes are not unique constraints, so concurrent inserts can both succeed. The Command Bus uses post-insert verification:

```typescript
// Insert the command
const insertedId = await ctx.db.insert("commands", { ... });

// Verify we won the race
const allWithSameId = await ctx.db
  .query("commands")
  .withIndex("by_commandId", (q) => q.eq("commandId", args.commandId))
  .collect();

if (allWithSameId.length > 1) {
  // Race condition: delete ours, return existing as duplicate
  await ctx.db.delete(insertedId);
  const winner = allWithSameId.find((c) => c._id !== insertedId);
  return { status: "duplicate", commandStatus: winner.status, result: winner.result };
}
```

### 2.4 Client-Side Usage

Clients should generate and persist `commandId` before submission:

```typescript
// Generate once, retry with same ID
const commandId = `cmd_${crypto.randomUUID()}`;
localStorage.setItem("pendingOrderId", commandId);

const result = await api.createOrder({ commandId, ...orderData });

if (result.status === "success" || result.status === "duplicate") {
  localStorage.removeItem("pendingOrderId");
}
```

---

## 3. Status Lifecycle

### 3.1 State Machine

Commands progress through well-defined states:

```
           ┌─────────────────────────────────────────┐
           │                                         │
           │     ┌──────────┐                        │
    New    │     │ pending  │◄──── Command recorded  │
   Command │     └────┬─────┘                        │
           │          │                              │
           │   Handler│executes                      │
           │          │                              │
           │    ┌─────┴─────────────────┐            │
           │    │                       │            │
           │    ▼                       ▼            │
           │ ┌──────────┐         ┌──────────┐       │
           │ │ executed │         │ rejected │       │
           │ │ (success)│         │(business)│       │
           │ └──────────┘         └──────────┘       │
           │                                         │
           │         ┌──────────┐                    │
           │         │  failed  │◄── Infrastructure  │
           │         │ (error)  │    error           │
           │         └──────────┘                    │
           └─────────────────────────────────────────┘
```

### 3.2 Status Definitions

| Status     | Event Emitted | Meaning                                          | Example                         |
| ---------- | ------------- | ------------------------------------------------ | ------------------------------- |
| `pending`  | No            | Command received, execution in progress          | API received request            |
| `executed` | Yes           | Command succeeded, business outcome recorded     | Order created successfully      |
| `rejected` | No            | Business rule violation, no state change         | Invalid order status for action |
| `failed`   | Yes           | Business failure with event (e.g., compensation) | Insufficient stock for reserve  |

**Key Distinction:**

- `rejected` = Validation error, NOT recorded in event store
- `failed` = Business outcome that IS recorded (triggers compensation flows)

### 3.3 API: updateCommandResult

```typescript
// From @libar-dev/platform-bus/src/component/lib.ts
const updateCommandResult = mutation({
  args: {
    commandId: v.string(),
    status: v.union(v.literal("executed"), v.literal("rejected"), v.literal("failed")),
    result: v.optional(v.any()),
  },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const command = await ctx.db
      .query("commands")
      .withIndex("by_commandId", ...)
      .first();

    // Verify command is still pending (prevent race conditions)
    if (command.status !== "pending") {
      return false; // Already processed by another handler
    }

    await ctx.db.patch(command._id, {
      status: args.status,
      result: args.result,
      executedAt: Date.now(),
    });
    return true;
  },
});
```

---

## 4. The 7-Step CommandOrchestrator

The CommandOrchestrator is the single execution path for all commands. Every command follows this exact flow with no exceptions.

### 4.1 Step-by-Step Flow

| Step | Action              | Component       | Purpose                               |
| ---- | ------------------- | --------------- | ------------------------------------- |
| 1    | Record command      | Command Bus     | Idempotency check + pending status    |
| 2    | Middleware pipeline | -               | Auth, validation, logging, rate limit |
| 3    | Call handler        | Bounded Context | CMS update via Decider                |
| 4    | Handle rejection    | -               | Early exit if business rule violated  |
| 5    | Append event        | Event Store     | Audit trail + projection source       |
| 6    | Trigger projection  | Workpool        | Update read models asynchronously     |
| 7    | Update status       | Command Bus     | Final status + cached result          |

### 4.2 Visual Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          CommandOrchestrator.execute()                       │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  [1] Record Command ──────────────────────────────────────────────────────► │
│      │                                                                      │
│      └─► Command Bus: recordCommand()                                       │
│          ├─► If duplicate → Return cached result (skip steps 2-7)           │
│          └─► If new → Continue with "pending" status                        │
│                                                                             │
│  [2] Middleware Pipeline ─────────────────────────────────────────────────► │
│      │                                                                      │
│      ├─► Structure validation (order: 10)                                   │
│      ├─► Domain validation (order: 20)                                      │
│      ├─► Authorization (order: 30)                                          │
│      ├─► Logging (order: 40)                                                │
│      └─► Rate limiting (order: 50)                                          │
│          └─► Any failure → Short-circuit, return rejection                  │
│                                                                             │
│  [3] Call Handler ────────────────────────────────────────────────────────► │
│      │                                                                      │
│      └─► BC Component: ctx.runMutation(config.handler, args)                │
│          └─► Returns: success | rejected | failed                           │
│                                                                             │
│  [4] Handle Rejection ────────────────────────────────────────────────────► │
│      │                                                                      │
│      └─► If rejected → Update status to "rejected", return early            │
│      └─► If failed → Emit failure event, trigger failedProjection           │
│                                                                             │
│  [5] Append Event ────────────────────────────────────────────────────────► │
│      │                                                                      │
│      └─► Event Store: appendToStream()                                      │
│          ├─► If OCC conflict → Update status to "rejected", return          │
│          └─► Record command-event correlation                               │
│                                                                             │
│  [6] Trigger Projection ──────────────────────────────────────────────────► │
│      │                                                                      │
│      ├─► Workpool: enqueueMutation(projection.handler)                      │
│      ├─► Secondary projections (parallel)                                   │
│      ├─► Saga routing (if configured)                                       │
│      └─► EventBus publish (if configured)                                   │
│                                                                             │
│  [7] Update Status ───────────────────────────────────────────────────────► │
│      │                                                                      │
│      └─► Command Bus: updateCommandResult("executed", result)               │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 4.3 Code Example

```typescript
// From @libar-dev/platform-core/src/orchestration/CommandOrchestrator.ts
export class CommandOrchestrator {
  async execute<TArgs, TResult>(
    ctx: MutationCtx,
    config: CommandConfig<...>,
    args: TArgs
  ): Promise<CommandMutationResult> {
    const commandId = args.commandId ?? generateCommandId();
    const chain = createCorrelationChain(commandId);

    // Step 1: Idempotency check BEFORE middleware
    const cmdResult = await this.deps.commandBus.recordCommand(ctx, {
      commandId,
      commandType: config.commandType,
      targetContext: config.boundedContext,
      payload: commandArgs,
      metadata: { correlationId: chain.correlationId, timestamp: Date.now() },
    });

    if (cmdResult.status === "duplicate") {
      return cmdResult; // Return cached result immediately
    }

    // Steps 2-7 via executeCoreAfterIdempotency()
    return this.deps.middlewarePipeline.execute(
      middlewareCommandInfo,
      {},
      async () => this.executeCoreAfterIdempotency(ctx, config, args, commandId, chain)
    );
  }
}
```

### 4.4 Guarantees

| Guarantee             | How Enforced                                        |
| --------------------- | --------------------------------------------------- |
| Idempotency           | Command Bus deduplication BEFORE any execution      |
| Dual-write atomicity  | CMS + Event in same mutation transaction            |
| OCC protection        | Event Store version conflict detection              |
| Projection triggering | Workpool enqueue for every successful command       |
| Correlation tracking  | Chain created at step 1, flows through all steps    |
| Error consistency     | Same rejection/failure handling across all commands |

---

## 5. Correlation Tracking (correlationId Flow)

### 5.1 The Correlation Chain

Every command creates a correlation chain that flows through the entire execution:

```typescript
// From @libar-dev/platform-core/src/correlation/chain.ts
interface CorrelationChain {
  commandId: CommandId; // Unique command identifier
  correlationId: CorrelationId; // Links all related operations
  causationId: CausationId; // Direct cause of this operation
  initiatedAt: number; // Timestamp
  userId?: string; // Optional user context
  context?: UnknownRecord; // Additional trace context
}
```

### 5.2 Correlation vs Causation

| ID              | Purpose                                     | Behavior               |
| --------------- | ------------------------------------------- | ---------------------- |
| `correlationId` | Links all operations in a request flow      | Preserved across chain |
| `causationId`   | Identifies the direct cause of an operation | Changes with each hop  |

```
User Request → Command A (correlationId: corr_1, causationId: cmd_A)
                  │
                  └─► Event X (correlationId: corr_1, causationId: cmd_A)
                        │
                        └─► Command B (correlationId: corr_1, causationId: evt_X)
                              │
                              └─► Event Y (correlationId: corr_1, causationId: cmd_B)
```

### 5.3 Command-Event Correlations Table

The `commandEventCorrelations` table tracks which events each command produced:

```typescript
// From @libar-dev/platform-bus/src/component/schema.ts
commandEventCorrelations: defineTable({
  commandId: v.string(), // The command that produced the event(s)
  eventIds: v.array(v.string()), // Event IDs produced
  commandType: v.string(), // For filtering/analytics
  boundedContext: v.string(), // For filtering
  createdAt: v.number(),
  ttl: v.number(),
  expiresAt: v.number(),
})
  .index("by_commandId", ["commandId"])
  .index("by_context", ["boundedContext", "createdAt"])
  .index("by_expiresAt", ["expiresAt"]);
```

### 5.4 Usage for Debugging

```typescript
// Forward lookup: What events did this command produce?
const correlation = await commandBus.getEventsByCommandId({ commandId: "cmd_123" });
// Returns: { commandId, eventIds: ["evt_a", "evt_b"], commandType, boundedContext }

// Trace by correlation: All commands in a request flow
const commands = await commandBus.getByCorrelation({ correlationId: "corr_xyz" });
// Returns all commands sharing the same correlationId
```

---

## 6. Middleware Pipeline

### 6.1 Pipeline Architecture

Middlewares wrap command execution with before/after hooks:

```
Request → [Middleware 1] → [Middleware 2] → [Middleware N] → Handler
                                                               │
              Result ← [Middleware N] ← [Middleware 2] ← [Middleware 1] ←┘
                        (after hooks run in reverse order)
```

### 6.2 Standard Middleware Order

| Order | Middleware           | Purpose                                        |
| ----- | -------------------- | ---------------------------------------------- |
| 10    | Structure validation | Zod schema validation of command payload       |
| 20    | Domain validation    | Business rule validation (e.g., entity exists) |
| 30    | Authorization        | Permission checks                              |
| 40    | Logging              | Structured command logging                     |
| 50    | Rate limiting        | Throttling by user/context                     |

### 6.3 Middleware Interface

```typescript
// From @libar-dev/platform-core/src/middleware/types.ts
interface Middleware<TCustom = UnknownRecord> {
  name: string; // Unique identifier
  order: number; // Execution order (lower = earlier)

  // Called before handler - can short-circuit
  before?(ctx: MiddlewareContext<TCustom>): Promise<MiddlewareBeforeResult<TCustom>>;

  // Called after handler - can transform result
  after?(
    ctx: MiddlewareContext<TCustom>,
    result: CommandHandlerResult
  ): Promise<CommandHandlerResult>;
}
```

### 6.4 Short-Circuiting

Any middleware can stop the pipeline and return a result:

```typescript
const authorizationMiddleware: Middleware = {
  name: "authorization",
  order: 30,
  before: async (ctx) => {
    const allowed = await checkPermissions(ctx);
    if (!allowed) {
      return {
        continue: false,
        result: {
          status: "rejected",
          code: "UNAUTHORIZED",
          reason: "User lacks permission for this action",
        },
      };
    }
    return { continue: true, ctx };
  },
};
```

### 6.5 Pipeline Configuration

```typescript
// From @libar-dev/platform-core/src/middleware/MiddlewarePipeline.ts
const pipeline = createMiddlewarePipeline({
  onAfterHookError: (info) => {
    console.error(`After-hook failed in ${info.middlewareName}:`, info.error);
  },
});

pipeline
  .use(createStructureValidationMiddleware({ schemas }))
  .use(createDomainValidationMiddleware({ validators }))
  .use(createAuthorizationMiddleware({ checker }))
  .use(createLoggingMiddleware({ logger }))
  .use(createRateLimitMiddleware({ checkerFactory, getKey }));

const orchestrator = new CommandOrchestrator({
  eventStore,
  commandBus,
  projectionPool,
  middlewarePipeline: pipeline,
});
```

---

## 7. Schema and Cleanup

### 7.1 Commands Table Schema

```typescript
// From @libar-dev/platform-bus/src/component/schema.ts
commands: defineTable({
  commandId: v.string(),
  commandType: v.string(),
  targetContext: v.string(),
  payload: v.any(),
  metadata: v.object({
    userId: v.optional(v.string()),
    correlationId: v.string(),
    timestamp: v.number(),
  }),
  status: v.union(
    v.literal("pending"),
    v.literal("executed"),
    v.literal("rejected"),
    v.literal("failed")
  ),
  result: v.optional(v.any()),
  executedAt: v.optional(v.number()),
  ttl: v.number(),
  expiresAt: v.number(),
})
  .index("by_commandId", ["commandId"]) // Idempotency lookup
  .index("by_correlationId", ["metadata.correlationId"]) // Tracing
  .index("by_status", ["status", "metadata.timestamp"]) // Status queries
  .index("by_context", ["targetContext", "metadata.timestamp"]) // Context filtering
  .index("by_expiresAt", ["expiresAt"]); // Cleanup queries
```

### 7.2 TTL-Based Cleanup

Commands have a configurable TTL (default: 7 days). The `cleanupExpired` mutation removes old commands:

```typescript
// From @libar-dev/platform-bus/src/component/lib.ts
const cleanupExpired = mutation({
  args: { batchSize: v.optional(v.number()) },
  returns: v.object({ commands: v.number(), correlations: v.number() }),
  handler: async (ctx, args) => {
    const batchSize = args.batchSize ?? 100;
    const now = Date.now();

    // Only delete non-pending commands that have expired
    const expiredCommands = await ctx.db
      .query("commands")
      .withIndex("by_expiresAt", (q) => q.lt("expiresAt", now))
      .filter((q) => q.neq(q.field("status"), "pending"))
      .take(batchSize);

    for (const command of expiredCommands) {
      await ctx.db.delete(command._id);
    }

    // Similarly for correlations...
    return { commands: expiredCommands.length, correlations: ... };
  },
});
```

**Important:** Pending commands are never deleted by cleanup, even if expired. This prevents data loss for long-running commands.

---

## Related Documents

- [event-store-foundation.md](./event-store-foundation.md) - Event storage and replay infrastructure
- [bounded-context-foundation.md](./bounded-context-foundation.md) - Physical BC isolation
- [dcb-architecture.md](./dcb-architecture.md) - Dynamic Consistency Boundaries for multi-entity operations
- [reactive-projections.md](./reactive-projections.md) - Real-time UI updates
- [fat-events.md](./fat-events.md) - Event categories and integration patterns
