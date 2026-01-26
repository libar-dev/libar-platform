# Durable Function Adapters - Architecture

> **Pattern:** Production-grade bridges for Convex durable function components
> **Package API:** See [`@libar-dev/platform-core/src/middleware`](../../deps/libar-dev-packages/packages/platform/core/src/middleware) and [`@libar-dev/platform-core/src/dcb`](../../deps/libar-dev-packages/packages/platform/core/src/dcb)

---

## Overview

Durable Function Adapters bridge platform-core interfaces to production-grade Convex components. They use **structural typing** to avoid direct dependencies, enabling:

- **Loose coupling** between platform-core and component packages
- **Production-grade persistence** for rate limiting and retry scheduling
- **Sharding and distribution** for high-throughput workloads

---

## 1. The Problem Adapters Solve

### 1.1 In-Memory Implementations Are Insufficient

| Limitation        | In-Memory       | Production Adapter      |
| ----------------- | --------------- | ----------------------- |
| **Persistence**   | Lost on restart | Persisted to database   |
| **Distribution**  | Single instance | Sharded across replicas |
| **Scalability**   | Memory bound    | Database-backed         |
| **Observability** | None            | Standard Convex tooling |

### 1.2 Direct Coupling Creates Problems

```typescript
// ❌ BAD: Direct dependency in platform-core
import { RateLimiter } from "@convex-dev/rate-limiter";
// Problems:
// - Platform-core now depends on rate-limiter package
// - Apps without rate limiting still pay the dependency cost
// - Version conflicts between apps and platform

// ✅ GOOD: Structural typing
interface RateLimiterLike {
  limit(ctx: unknown, name: string, options?: {...}): Promise<RateLimiterResult>;
}
// Benefits:
// - No package dependency in platform-core
// - App provides concrete instance
// - Compatible with any implementation
```

---

## 2. Core Adapters

### 2.1 ConvexRateLimitAdapter

Bridges the `RateLimitChecker` interface to `@convex-dev/rate-limiter`.

**Location:** `platform-core/src/middleware/rateLimitAdapter.ts`

**Structural Interface:**

```typescript
interface RateLimiterLike {
  limit(
    ctx: unknown,
    name: string,
    options?: { key?: string; count?: number; throws?: boolean; reserve?: boolean }
  ): Promise<RateLimiterResult>;
}
```

**Usage:**

```typescript
// In convex/rateLimits.ts
import { RateLimiter, MINUTE } from "@convex-dev/rate-limiter";

export const rateLimiter = new RateLimiter(components.rateLimiter, {
  commandDispatch: { kind: "token bucket", rate: 100, period: MINUTE, shards: 50 },
});

// In middleware setup
import { createConvexRateLimitAdapter } from "@libar-dev/platform-core/middleware";

const checkerFactory = createConvexRateLimitAdapter(rateLimiter, "commandDispatch");

// In command handler (per-request)
const checker = checkerFactory(ctx);
const result = await checker(`user:${userId}`);
if (!result.allowed) {
  return {
    status: "rejected",
    code: "RATE_LIMITED",
    context: { retryAfterMs: result.retryAfterMs },
  };
}
```

### 2.2 withDCBRetry

Wraps DCB operations to automatically retry on OCC conflicts via Workpool.

**Location:** `platform-core/src/dcb/withRetry.ts`

**Flow:**

```
Command → executeWithDCB → conflict? ──┬─► success/rejected/failed → return unchanged
                                       │
                                       └─► conflict → calculate backoff
                                                     → enqueue retry mutation
                                                     → return { status: "deferred" }
```

**Structural Interface:**

```typescript
interface WorkpoolLikeForDCB {
  enqueueMutation: <TArgs extends UnknownRecord>(
    ctx: MutationCtx,
    handler: FunctionReference<"mutation", FunctionVisibility, TArgs, unknown>,
    args: TArgs,
    options?: {
      key?: string;        // Partition key for ordering
      runAfter?: number;   // Backoff delay
      onComplete?: ...;    // Completion callback
      context?: unknown;
    }
  ) => Promise<unknown>;
}
```

**Usage:**

```typescript
import { withDCBRetry } from "@libar-dev/platform-core/dcb";

export const reserveWithRetry = internalMutation({
  handler: async (ctx, args) => {
    const { attempt = 0, expectedVersion, ...commandArgs } = args;

    const result = await executeWithDCB(ctx, {
      scopeKey: createScopeKey(args.tenantId, "reservation", args.reservationId),
      expectedVersion,
      // ... rest of config
    });

    return withDCBRetry(ctx, {
      workpool: dcbRetryPool,
      retryMutation: internal.reservations.reserveWithRetry,
      scopeKey: createScopeKey(args.tenantId, "reservation", args.reservationId),
      options: { maxAttempts: 5 },
    }).handleResult(result, {
      attempt,
      retryArgs: { ...commandArgs },
    });
  },
});
```

### 2.3 Backoff Calculation

Exponential backoff with jitter to prevent thundering herd.

**Location:** `platform-core/src/dcb/backoff.ts`

**Formula:**

```
delay = min(maxMs, initialMs * base^attempt * jitter)
```

| Parameter   | Default | Description                |
| ----------- | ------- | -------------------------- |
| `initialMs` | 100     | Base delay for first retry |
| `base`      | 2       | Exponential growth factor  |
| `maxMs`     | 30,000  | Maximum delay cap          |
| `jitter`    | 0.5-1.5 | Random multiplier          |

**Example Progression:**

| Attempt | Base Delay | With Jitter (range) |
| ------- | ---------- | ------------------- |
| 0       | 100ms      | 50-150ms            |
| 1       | 200ms      | 100-300ms           |
| 2       | 400ms      | 200-600ms           |
| 3       | 800ms      | 400-1200ms          |
| 4       | 1600ms     | 800-2400ms          |

**Testing Support:**

```typescript
import { noJitter } from "@libar-dev/platform-core/dcb";

// Deterministic backoff for tests
const delay = calculateBackoff(0, {
  initialMs: 100,
  base: 2,
  maxMs: 30000,
  jitterFn: noJitter, // Always returns 1.0
});
// delay === 100 (exact, no randomness)
```

---

## 3. When to Use

### Decision Tree

```
Need rate limiting? ─────────────────► createConvexRateLimitAdapter
                                        └─ Token bucket or fixed window
                                        └─ Sharded for high throughput
                                        └─ Per-user or per-command keys

Need DCB conflict retry? ────────────► withDCBRetry
                                        └─ Automatic OCC conflict handling
                                        └─ Exponential backoff with jitter
                                        └─ Partition ordering by scope

Need both? ──────────────────────────► Use both adapters
                                        └─ Rate limit in middleware pipeline
                                        └─ DCB retry in command handler
```

### Comparison Table

| Aspect            | ConvexRateLimitAdapter      | withDCBRetry         |
| ----------------- | --------------------------- | -------------------- |
| **Purpose**       | Protect APIs from abuse     | Handle OCC conflicts |
| **Component**     | @convex-dev/rate-limiter    | @convex-dev/workpool |
| **Layer**         | Middleware pipeline         | Command handler      |
| **Persistence**   | Rate limiter tables         | Workpool job queue   |
| **Configuration** | Token bucket / fixed window | Backoff options      |

---

## 4. Integration Patterns

### 4.1 Middleware Pipeline Integration

Rate limiting integrates at middleware order 50:

```typescript
import {
  createRateLimitMiddleware,
  createConvexRateLimitAdapter,
  RATE_LIMIT_ORDER, // 50
} from "@libar-dev/platform-core/middleware";

const checkerFactory = createConvexRateLimitAdapter(rateLimiter, "commandDispatch");

const rateLimitMiddleware = createRateLimitMiddleware({
  checker: async (key) => {
    // Get checker for this request's context
    return checkerFactory(ctx)(key);
  },
  getKey: RateLimitKeys.byUserAndCommand((ctx) => ctx.custom.userId),
  skipFor: ["GetSystemHealth", "CleanupExpired"],
});
```

### 4.2 Multiple Workpools

DCB retry uses a dedicated Workpool separate from projections:

```typescript
// convex/infrastructure.ts
import { Workpool } from "@convex-dev/workpool";

// Dedicated pool for DCB retries
export const dcbRetryPool = new Workpool(components.dcbRetryPool, {
  maxParallelism: 10,
  // Note: Workpool maxAttempts is 1 - DCB handles its own retry logic
});

// Separate pool for projections
export const projectionPool = new Workpool(components.projectionPool, {
  maxParallelism: 20,
});
```

### 4.3 Partition Ordering

DCB retries use partition keys for scope serialization:

```typescript
// Partition key format: dcb:{scopeKey}
// Example: dcb:tenant:t1:reservation:r1

// This ensures retries for the same scope execute in order (FIFO)
// Different scopes can execute in parallel
```

---

## 5. Configuration Reference

### ConvexRateLimitAdapter Options

| Option        | Type              | Description                    |
| ------------- | ----------------- | ------------------------------ |
| `rateLimiter` | `RateLimiterLike` | Rate limiter instance          |
| `limitName`   | `string`          | Named limit from configuration |

### withDCBRetry Options

| Option             | Type                | Default         | Description               |
| ------------------ | ------------------- | --------------- | ------------------------- |
| `maxAttempts`      | `number`            | 5               | Maximum retry attempts    |
| `initialBackoffMs` | `number`            | 100             | Initial backoff delay     |
| `backoffBase`      | `number`            | 2               | Exponential growth factor |
| `maxBackoffMs`     | `number`            | 30,000          | Maximum backoff cap       |
| `jitterFn`         | `() => number`      | `defaultJitter` | Jitter function           |
| `onComplete`       | `FunctionReference` | null            | Completion callback       |

### Backoff Options

| Option      | Type           | Default         | Description      |
| ----------- | -------------- | --------------- | ---------------- |
| `initialMs` | `number`       | 100             | Initial delay    |
| `base`      | `number`       | 2               | Exponential base |
| `maxMs`     | `number`       | 30,000          | Maximum delay    |
| `jitterFn`  | `() => number` | `defaultJitter` | Jitter function  |

---

## 6. Result Types

### DCBRetryResult

```typescript
type DCBRetryResult<TData> =
  | DCBSuccessResult<TData> // { status: "success", data, event, stateUpdate }
  | DCBRejectedResult // { status: "rejected", code, reason, context }
  | DCBFailedResult // { status: "failed", error }
  | DCBDeferredResult; // { status: "deferred", workId, retryAttempt, scheduledAfterMs }
```

### Type Guards

```typescript
import {
  isDCBDeferredResult,
  isDCBSuccessResult,
  isDCBRejectedResult,
  isDCBFailedResult,
  isMaxRetriesExceeded,
} from "@libar-dev/platform-core/dcb";
```

---

## Related Documents

- [CONVEX-DURABILITY-REFERENCE.md](CONVEX-DURABILITY-REFERENCE.md) - Component API reference
- [dcb-architecture.md](dcb-architecture.md) - DCB patterns and concepts
- [COMPONENT_ISOLATION.md](COMPONENT_ISOLATION.md) - Component boundaries
