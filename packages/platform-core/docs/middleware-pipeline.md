# Middleware Pipeline - Composable Command Processing

> **Pattern:** Cross-cutting concerns via composable middleware with before/after hooks
> **Location:** `@libar-dev/platform-core/src/middleware/`

---

## Overview

The Middleware Pipeline provides a composable mechanism for applying cross-cutting concerns to command execution. Rather than embedding validation, authorization, logging, and rate limiting directly into handlers, these concerns are separated into discrete middleware components that execute in a defined order around the command handler.

**Key insight:** Middleware separates infrastructure concerns from domain logic, keeping handlers focused on business rules.

---

## 1. The Problem: Separating Infrastructure from Domain Logic

### 1.1 Without Middleware: Tangled Concerns

Without middleware, every command handler would need to implement its own validation, authorization, logging, and rate limiting:

```typescript
// Without middleware: concerns tangled in handler
export const createOrder = mutation({
  args: { orderId: v.string(), customerId: v.string() },
  handler: async (ctx, args) => {
    // Validation logic (repeated in every handler)
    if (!args.orderId.startsWith("ord_")) {
      return { status: "rejected", code: "INVALID_ORDER_ID", reason: "..." };
    }

    // Authorization check (repeated in every handler)
    const user = await getUser(ctx);
    if (!user || !user.canCreateOrders) {
      return { status: "rejected", code: "UNAUTHORIZED", reason: "..." };
    }

    // Logging (repeated in every handler)
    console.log(`Creating order ${args.orderId} for ${args.customerId}`);
    const startTime = Date.now();

    // Rate limiting (repeated in every handler)
    const rateLimitResult = await checkRateLimit(ctx, user.id);
    if (!rateLimitResult.allowed) {
      return { status: "rejected", code: "RATE_LIMITED", reason: "..." };
    }

    // FINALLY: actual domain logic
    const result = await orderDecider.decide(state, command);

    // More logging
    console.log(`Order created in ${Date.now() - startTime}ms`);

    return result;
  },
});
```

### 1.2 With Middleware: Clean Separation

```typescript
// With middleware: handler focuses on domain logic only
const createOrderConfig: CommandConfig = {
  commandType: "CreateOrder",
  boundedContext: "orders",
  handler: createOrderHandler, // Pure domain logic
  // ... projection configuration
};

// Infrastructure concerns are configured once
const pipeline = createMiddlewarePipeline()
  .use(createStructureValidationMiddleware({ schemas }))
  .use(createAuthorizationMiddleware({ checker }))
  .use(createLoggingMiddleware({ logger }))
  .use(createRateLimitMiddleware({ checkerFactory, getKey }));

export const createOrder = mutation({
  args: { orderId: v.string(), customerId: v.string() },
  handler: (ctx, args) => orchestrator.execute(ctx, createOrderConfig, args),
});
```

---

## 2. Pipeline Architecture

### 2.1 Execution Flow

The middleware pipeline wraps the command handler with before and after hooks:

```
Request
   │
   ▼
┌─────────────────────────────────────────────────────────────┐
│  BEFORE HOOKS (in order: 10 → 20 → 30 → 40 → 50)           │
│                                                             │
│  Structure Validation (10)                                  │
│         │                                                   │
│         ▼                                                   │
│  Domain Validation (20)                                     │
│         │                                                   │
│         ▼                                                   │
│  Authorization (30)                                         │
│         │                                                   │
│         ▼                                                   │
│  Logging (40) ──────────────┐ (logs "Command started")      │
│         │                   │                               │
│         ▼                   │                               │
│  Rate Limiting (50)         │                               │
│         │                   │                               │
└─────────│───────────────────│───────────────────────────────┘
          │                   │
          ▼                   │
   ┌──────────────┐           │
   │   HANDLER    │           │
   │ (domain      │           │
   │  logic)      │           │
   └──────────────┘           │
          │                   │
          ▼                   │
┌─────────────────────────────│───────────────────────────────┐
│  AFTER HOOKS (reverse: 50 → 40 → 30 → 20 → 10)             │
│                             │                               │
│  Rate Limiting (50)         │                               │
│         │                   │                               │
│         ▼                   │                               │
│  Logging (40) ◄─────────────┘ (logs "Command completed")    │
│         │                                                   │
│         ▼                                                   │
│  Authorization (30)                                         │
│         │                                                   │
│         ▼                                                   │
│  Domain Validation (20)                                     │
│         │                                                   │
│         ▼                                                   │
│  Structure Validation (10)                                  │
│                                                             │
└─────────────────────────────────────────────────────────────┘
          │
          ▼
      Response
```

### 2.2 Short-Circuiting

Any before hook can short-circuit the pipeline by returning `continue: false`:

```
Request
   │
   ▼
Structure Validation (10) ────► continue: true
   │
   ▼
Authorization (30) ───────────► continue: false (UNAUTHORIZED)
   │                                    │
   │  (Skipped: Logging, Rate Limit)    │
   │                                    │
   ▼                                    │
After hooks run for                     │
ALREADY-EXECUTED middlewares            │
(only Structure Validation)             │
   │                                    │
   ▼                                    │
Response: { status: "rejected", code: "UNAUTHORIZED", ... }
```

### 2.3 Context Propagation

Middlewares can modify the context passed to subsequent hooks:

```typescript
const enrichmentMiddleware: Middleware = {
  name: "enrichment",
  order: 15, // Between structure and domain validation
  before: async (ctx) => {
    // Load user data and add to context
    const userData = await loadUserFromDatabase(ctx.raw);
    return {
      continue: true,
      ctx: {
        ...ctx,
        custom: {
          ...ctx.custom,
          userId: userData.id,
          userRole: userData.role,
          userTenantId: userData.tenantId,
        },
      },
    };
  },
};
```

---

## 3. Built-in Middleware

### 3.1 Standard Order Constants

| Order | Middleware            | Purpose                                |
|-------|-----------------------|----------------------------------------|
| 10    | Structure Validation  | Zod schema validation                  |
| 20    | Domain Validation     | Business rule pre-checks               |
| 30    | Authorization         | RBAC/permission checks                 |
| 40    | Logging               | Command execution tracing              |
| 50    | Rate Limiting         | API protection                         |

```typescript
import { MIDDLEWARE_ORDER } from "@libar-dev/platform-core";

// Use constants for custom middleware positioning
const myMiddleware: Middleware = {
  name: "custom",
  order: MIDDLEWARE_ORDER.AUTHORIZATION - 5, // Run just before authorization
  // ...
};
```

### 3.2 Structure Validation Middleware (Order: 10)

Validates command arguments against Zod schemas. Runs first to reject malformed requests before any expensive operations.

```typescript
import { z } from "zod";
import { createStructureValidationMiddleware } from "@libar-dev/platform-core";

const validationMiddleware = createStructureValidationMiddleware({
  schemas: {
    CreateOrder: z.object({
      orderId: z.string().startsWith("ord_"),
      customerId: z.string().startsWith("cust_"),
      items: z.array(z.object({
        productId: z.string(),
        quantity: z.number().positive(),
      })).min(1),
    }),
    AddOrderItem: z.object({
      orderId: z.string(),
      productId: z.string(),
      quantity: z.number().positive().max(100),
    }),
  },
  stripUnknown: false, // Default: keep extra properties
});
```

**Registry-based validation** (uses schemas from CommandRegistry):

```typescript
import { createRegistryValidationMiddleware } from "@libar-dev/platform-core";
import { commandRegistry } from "./commands/registry";

const validationMiddleware = createRegistryValidationMiddleware(commandRegistry, {
  stripUnknown: true, // Remove properties not in schema
});
```

**Rejection result:**
```typescript
{
  status: "rejected",
  code: "VALIDATION_ERROR",
  reason: "Invalid command arguments: orderId must start with 'ord_'",
  context: {
    errors: [{ path: "orderId", message: "...", code: "invalid_string" }]
  }
}
```

### 3.3 Domain Validation Middleware (Order: 20)

Pre-handler business rule validation for rules that don't require database state.

```typescript
import {
  createDomainValidationMiddleware,
  combineDomainValidators,
  CommonValidators,
} from "@libar-dev/platform-core";

const domainMiddleware = createDomainValidationMiddleware({
  validators: {
    CreateOrder: combineDomainValidators([
      CommonValidators.requiredString("customerId", "Customer ID is required"),
      CommonValidators.startsWithPrefix("customerId", "cust_"),
    ]),
    AddOrderItem: combineDomainValidators([
      CommonValidators.positiveNumber("quantity"),
      CommonValidators.numberRange("quantity", 1, 100, "Quantity must be 1-100"),
    ]),
    SetDiscount: async (args) => {
      const discount = args.discountPercent as number;
      if (discount < 0 || discount > 50) {
        return "Discount must be between 0% and 50%";
      }
      return undefined; // Valid
    },
  },
});
```

**Available CommonValidators:**

| Validator           | Purpose                                     |
|---------------------|---------------------------------------------|
| `requiredString`    | Non-empty string validation                 |
| `positiveNumber`    | Number > 0                                  |
| `nonNegativeNumber` | Number >= 0                                 |
| `numberRange`       | Number within min/max bounds                |
| `matchesPattern`    | String matches regex                        |
| `startsWithPrefix`  | String starts with prefix                   |

### 3.4 Authorization Middleware (Order: 30)

RBAC integration point for command authorization.

```typescript
import {
  createAuthorizationMiddleware,
  createRoleBasedChecker,
  createOwnerBasedChecker,
  combineAuthorizationCheckers,
} from "@libar-dev/platform-core";

// Role-based authorization
const roleChecker = createRoleBasedChecker(
  {
    CreateOrder: ["user", "admin"],
    CancelOrder: ["admin"],
    DeleteOrder: ["superadmin"],
  },
  (ctx) => ctx.custom.userRole as string
);

// Owner-based authorization (users can only modify their own resources)
const ownerChecker = createOwnerBasedChecker(
  (ctx) => ctx.command.args.ownerId as string,  // Resource owner
  (ctx) => ctx.custom.userId as string,         // Current user
  ["admin", "superadmin"]                        // Admin bypass roles
);

// Combine checkers (all must pass)
const combinedChecker = combineAuthorizationCheckers([roleChecker, ownerChecker]);

const authMiddleware = createAuthorizationMiddleware({
  checker: combinedChecker,
  skipFor: ["GetSystemHealth", "PublicQuery"], // System commands
});
```

**Custom authorization checker:**

```typescript
const authMiddleware = createAuthorizationMiddleware({
  checker: async (ctx) => {
    const userId = ctx.custom.userId as string;

    // Check authentication
    if (!userId) {
      return { allowed: false, reason: "Authentication required" };
    }

    // Check permissions from database
    const permissions = await loadPermissions(ctx.raw, userId);
    const requiredPermission = `command:${ctx.command.type}`;

    if (!permissions.includes(requiredPermission)) {
      return {
        allowed: false,
        reason: `Missing permission: ${requiredPermission}`,
      };
    }

    return { allowed: true };
  },
});
```

### 3.5 Logging Middleware (Order: 40)

Correlation-aware logging with timing metrics.

```typescript
import {
  createLoggingMiddleware,
  createConvexLogger,
  createJsonLogger,
  createNoOpLogger,
} from "@libar-dev/platform-core";

// Using Convex console
const loggingMiddleware = createLoggingMiddleware({
  logger: createConvexLogger(console, "[Command]"),
  includePayload: false, // Security: don't log sensitive data
  includeTiming: true,   // Log duration in ms
});

// JSON logger for aggregation systems
const jsonLogger = createJsonLogger({
  output: (json) => externalLogger.send(json),
  includeTimestamp: true,
  serviceName: "order-service",
});

// No-op logger for testing
const testLogger = createNoOpLogger();
```

**Log output:**

```
[Command] Command started: CreateOrder {
  commandType: "CreateOrder",
  commandId: "cmd_abc123",
  correlationId: "corr_xyz789",
  boundedContext: "orders",
  category: "aggregate"
}

[Command] Command succeeded: CreateOrder {
  commandType: "CreateOrder",
  commandId: "cmd_abc123",
  correlationId: "corr_xyz789",
  status: "success",
  durationMs: 42,
  eventId: "evt_def456"
}
```

### 3.6 Rate Limiting Middleware (Order: 50)

API protection via rate limiting integration.

```typescript
import {
  createRateLimitMiddleware,
  createConvexRateLimitAdapter,
  RateLimitKeys,
} from "@libar-dev/platform-core";
import { rateLimiter } from "./rateLimits";

const rateLimitMiddleware = createRateLimitMiddleware({
  // Factory creates checker per-request with access to Convex ctx
  checkerFactory: (ctx) =>
    createConvexRateLimitAdapter(rateLimiter, "commandDispatch")(ctx.raw),

  // Key strategy for rate limit bucket
  getKey: RateLimitKeys.byUserAndCommand(
    (ctx) => ctx.custom.userId as string ?? "anonymous"
  ),

  // System commands exempt from rate limiting
  skipFor: ["GetSystemHealth", "CleanupExpiredReservations"],
});
```

**Available key strategies:**

| Strategy            | Key Format                           | Use Case                    |
|---------------------|--------------------------------------|-----------------------------|
| `byUserId`          | `user:{userId}`                      | Per-user limits             |
| `byCommandType`     | `command:{type}`                     | Per-command-type limits     |
| `byUserAndCommand`  | `user:{userId}:{type}`               | Per-user per-command limits |
| `byAggregateId`     | `aggregate:{type}:{id}`              | Per-resource limits         |
| `byIpAddress`       | `ip:{address}`                       | IP-based limits             |

**Rate limiter setup (convex/rateLimits.ts):**

```typescript
import { RateLimiter } from "@convex-dev/rate-limiter";
import { MINUTE } from "convex/values";
import { components } from "./_generated/api";

export const rateLimiter = new RateLimiter(components.rateLimiter, {
  // 100 commands per minute per user+command combination
  commandDispatch: {
    kind: "token bucket",
    rate: 100,
    period: MINUTE,
    shards: 50,
  },
});
```

---

## 4. Custom Middleware Creation

### 4.1 Middleware Interface

```typescript
interface Middleware<TCustom = UnknownRecord> {
  /** Unique middleware name for identification */
  name: string;

  /** Execution order (lower = earlier) */
  order: number;

  /** Before hook - can modify context or short-circuit */
  before?(ctx: MiddlewareContext<TCustom>): Promise<MiddlewareBeforeResult<TCustom>>;

  /** After hook - can transform result */
  after?(
    ctx: MiddlewareContext<TCustom>,
    result: CommandHandlerResult<unknown>
  ): Promise<CommandHandlerResult<unknown>>;
}
```

### 4.2 Before-Only Middleware (Validation/Guards)

```typescript
const tenantIsolationMiddleware: Middleware = {
  name: "tenantIsolation",
  order: 25, // After domain validation, before authorization

  async before(ctx) {
    const userTenantId = ctx.custom.userTenantId as string;
    const resourceTenantId = ctx.command.args.tenantId as string;

    if (resourceTenantId && resourceTenantId !== userTenantId) {
      return {
        continue: false,
        result: {
          status: "rejected",
          code: "TENANT_MISMATCH",
          reason: "Cannot access resources from another tenant",
        },
      };
    }

    return { continue: true, ctx };
  },
};
```

### 4.3 After-Only Middleware (Metrics/Audit)

```typescript
const metricsMiddleware: Middleware = {
  name: "metrics",
  order: 45, // After logging

  async after(ctx, result) {
    const durationMs = Date.now() - ctx.startedAt;

    // Record metrics (non-blocking)
    await recordMetric({
      commandType: ctx.command.type,
      status: result.status,
      durationMs,
      boundedContext: ctx.command.boundedContext,
    });

    return result; // Don't modify result
  },
};
```

### 4.4 Before+After Middleware (Timing/Tracing)

```typescript
const tracingMiddleware: Middleware = {
  name: "tracing",
  order: 5, // Run very early (before all built-in)

  async before(ctx) {
    // Start a trace span
    const span = tracer.startSpan(`command:${ctx.command.type}`);
    span.setAttribute("commandId", ctx.command.commandId);
    span.setAttribute("correlationId", ctx.command.correlationId);

    return {
      continue: true,
      ctx: {
        ...ctx,
        custom: { ...ctx.custom, traceSpan: span },
      },
    };
  },

  async after(ctx, result) {
    const span = ctx.custom.traceSpan as Span;
    span.setAttribute("status", result.status);

    if (result.status === "rejected") {
      span.setStatus({ code: SpanStatusCode.ERROR });
    }

    span.end();
    return result;
  },
};
```

### 4.5 Context Enrichment Middleware

```typescript
const userContextMiddleware: Middleware = {
  name: "userContext",
  order: 15,

  async before(ctx) {
    // Access raw Convex context for database queries
    const convexCtx = ctx.raw as MutationCtx;

    // Load user from session/token
    const identity = await convexCtx.auth.getUserIdentity();
    if (!identity) {
      return {
        continue: false,
        result: {
          status: "rejected",
          code: "UNAUTHENTICATED",
          reason: "Valid session required",
        },
      };
    }

    // Load user profile from database
    const user = await convexCtx.db
      .query("users")
      .withIndex("by_tokenIdentifier", (q) =>
        q.eq("tokenIdentifier", identity.tokenIdentifier)
      )
      .unique();

    return {
      continue: true,
      ctx: {
        ...ctx,
        custom: {
          ...ctx.custom,
          userId: user?._id.toString(),
          userRole: user?.role,
          userTenantId: user?.tenantId,
        },
      },
    };
  },
};
```

---

## 5. Execution Order

### 5.1 Ordering Rules

1. **Before hooks** execute in ascending order (10 -> 20 -> 30 -> 40 -> 50)
2. **After hooks** execute in descending order (50 -> 40 -> 30 -> 20 -> 10)
3. Middlewares with the same order execute in registration order
4. Short-circuit skips remaining before hooks AND skips handler

### 5.2 Positioning Custom Middleware

```typescript
import { MIDDLEWARE_ORDER } from "@libar-dev/platform-core";

// Before all built-in middleware
const tracingMiddleware = { name: "tracing", order: 5, ... };

// Between structure and domain validation
const schemaEnrichmentMiddleware = { name: "schemaEnrichment", order: 15, ... };

// Just before authorization
const tenantMiddleware = { name: "tenant", order: 25, ... };

// Between authorization and logging
const auditMiddleware = { name: "audit", order: 35, ... };

// After logging, before rate limiting
const metricsMiddleware = { name: "metrics", order: 45, ... };

// After all built-in middleware
const responseTransformMiddleware = { name: "responseTransform", order: 100, ... };
```

### 5.3 Pipeline Configuration

```typescript
const pipeline = createMiddlewarePipeline()
  // Built-in middleware
  .use(createStructureValidationMiddleware({ schemas }))
  .use(createDomainValidationMiddleware({ validators }))
  .use(createAuthorizationMiddleware({ checker }))
  .use(createLoggingMiddleware({ logger }))
  .use(createRateLimitMiddleware({ checkerFactory, getKey }))
  // Custom middleware
  .use(tracingMiddleware)
  .use(tenantMiddleware)
  .use(metricsMiddleware);

// Middleware names in execution order
console.log(pipeline.getMiddlewareNames());
// ["tracing", "structureValidation", "domainValidation", "tenant",
//  "authorization", "logging", "metrics", "rateLimit"]
```

---

## 6. Error Handling in Middleware

### 6.1 Before Hook Errors

If a before hook throws an exception, the pipeline returns a `MIDDLEWARE_ERROR` rejection:

```typescript
{
  status: "rejected",
  code: "MIDDLEWARE_ERROR",
  reason: "Database connection failed",
  context: { middleware: "userContext" }
}
```

### 6.2 After Hook Errors

After hooks run **after** the handler completes. Errors don't fail the command:

```typescript
const pipeline = createMiddlewarePipeline({
  onAfterHookError: (info) => {
    // Log but don't fail the command
    console.error(`After-hook error in ${info.middlewareName}:`, info.error);
    sentryClient.captureException(info.error, {
      extra: {
        middleware: info.middlewareName,
        commandType: info.commandType,
        commandId: info.commandId,
      },
    });
  },
});
```

### 6.3 Handler Errors

If the command handler throws, the pipeline wraps it as a rejection:

```typescript
{
  status: "rejected",
  code: "HANDLER_ERROR",
  reason: "Unexpected error message"
}
```

### 6.4 Short-Circuit Behavior

When a before hook short-circuits:

1. Remaining before hooks are **skipped**
2. Handler is **skipped**
3. After hooks run **only for already-executed middlewares**

```typescript
// Example: Authorization short-circuits
// Before: Structure(10) -> Domain(20) -> Auth(30) SHORT-CIRCUITS
// After:  Domain(20) -> Structure(10) (Auth's after hook NOT called)
```

---

## 7. Integration with CommandOrchestrator

The middleware pipeline is integrated into the CommandOrchestrator:

```typescript
// convex/infrastructure.ts
export const middlewarePipeline = createMiddlewarePipeline()
  .use(createRegistryValidationMiddleware(commandRegistry))
  .use(createLoggingMiddleware({ logger, includeTiming: true }))
  .use(createRateLimitMiddleware({ ... }));

export const commandOrchestrator = new CommandOrchestrator({
  eventStore,
  commandBus,
  projectionPool,
  middlewarePipeline,
  // ...
});
```

**Execution order in orchestrator:**

```
1. Idempotency check (BEFORE middleware)
   └── Duplicates return immediately
2. Middleware before hooks
3. Core handler execution (dual-write + projection)
4. Middleware after hooks
```

Note: Idempotency check runs **before** the middleware pipeline to avoid running expensive validation/authorization for duplicate commands.

---

## Related Documents

- [Command Bus Foundation](./command-bus-foundation.md) - Command recording and idempotency
- [DCB Architecture](./dcb-architecture.md) - Multi-entity consistency boundaries
- [Event Store Durability](./event-store-durability.md) - Event persistence guarantees
