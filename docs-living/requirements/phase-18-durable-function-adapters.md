# ✅ Durable Function Adapters

**Purpose:** Detailed requirements for the Durable Function Adapters feature

---

## Overview

| Property       | Value                                          |
| -------------- | ---------------------------------------------- |
| Status         | completed                                      |
| Product Area   | Platform                                       |
| Business Value | production grade reliability with minimal code |
| Phase          | 18                                             |

## Description

**Problem:** Platform has well-defined interfaces (RateLimitChecker, DCB conflict handling) but uses
in-memory implementations not suitable for production. DCB returns `conflict` status but callers must
implement manual retry logic, leading to boilerplate and inconsistent patterns.

**Solution:** Minimal adapters that bridge existing platform interfaces to production-grade
Convex durable function components:

- **RateLimitAdapter** - Connects `RateLimitChecker` interface to `@convex-dev/rate-limiter`
- **withDCBRetry** - Wraps `executeWithDCB` with Workpool-based OCC retry and backoff
- **Delete in-memory implementations** - Single production-grade option (no fallbacks)

**Reference:** See `docs/architecture/CONVEX-DURABILITY-REFERENCE.md` for component selection,
retry strategies, and the standard backoff formula used in this implementation.

**Why It Matters for Convex-Native ES:**
| Benefit | How |
| Production-grade rate limiting | Sharding, persistence, reservation patterns via component |
| Automatic OCC retry | Workpool handles backoff, jitter, partition ordering |
| Zero middleware changes | Adapter implements existing `RateLimitChecker` interface |
| Consistent retry patterns | Centralized backoff config, prevents boilerplate |

**Architectural Context:**
"""
Current State After Adapters
───────────── ──────────────
Middleware Pipeline Middleware Pipeline
│ │
▼ ▼
RateLimitChecker ──→ In-memory RateLimitChecker ──→ ConvexRateLimitAdapter
(lost on cold start) (persisted, sharded) ──→ @convex-dev/rate-limiter

DCB executeWithDCB DCB withDCBRetry
│ │
▼ ▼
Returns { status: "conflict" } Auto-retry via Workpool
(caller handles retry) (backoff, jitter, partition key)
"""

## Acceptance Criteria

**Adapter allows request within rate limit**

- Given a rate limiter with 100 requests per minute capacity
- And 50 requests have been made in the current window
- When checking rate limit for key "user:alice"
- Then the result should have allowed = true
- And retryAfterMs should be undefined

**Adapter rejects request exceeding rate limit**

- Given a rate limiter with 100 requests per minute capacity
- And 100 requests have been made in the current window
- When checking rate limit for key "user:alice"
- Then the result should have allowed = false
- And retryAfterMs should be greater than 0

**Adapter isolates limits by key**

- Given a rate limiter with 10 requests per minute capacity
- And user "alice" has exhausted her rate limit
- When checking rate limit for key "user:bob"
- Then the result should have allowed = true
- And alice's limit should remain exhausted

**Adapter integrates with existing middleware pipeline**

- Given the rate limit middleware is configured with ConvexRateLimitAdapter
- When a command is dispatched within rate limit
- Then the middleware should call the adapter
- And the command should proceed to the handler

**DCB succeeds on first attempt**

- Given a DCB operation with expectedVersion matching currentVersion
- When withDCBRetry is called
- Then executeWithDCB should be called once
- And the success result should be returned unchanged
- And no retry should be scheduled

**DCB conflict triggers automatic retry**

- Given a DCB operation with expectedVersion 5
- And currentVersion is 6 (conflict)
- When withDCBRetry is called with attempt 0
- Then a retry mutation should be enqueued to Workpool
- And the partition key should be "dcb:{scopeKey}"
- And the result should have status "deferred"
- And the retry should use expectedVersion 6

**Max retries exceeded returns rejected**

- Given a DCB operation that conflicts
- And attempt is equal to maxAttempts (5)
- When withDCBRetry is called
- Then the result should have status "rejected"
- And the code should be "DCB_MAX_RETRIES_EXCEEDED"
- And context should include attempt count

**Backoff increases exponentially with jitter**

- Given a backoff config with initialMs=100, base=2, maxMs=30000
- When calculating backoff for attempt 3
- Then the base delay should be 800ms (100 \* 2^3)
- And jitter should multiply by 0.5-1.5 (result: 400-1200ms)
- And total should not exceed 30000ms

**Partition key ensures scope serialization**

- Given two concurrent DCB operations on the same scope
- When both trigger retries
- Then both retries should use the same partition key
- And Workpool should execute them sequentially
- And only one should run at a time

**DCB retry with onComplete callback**

- Given a DCB operation with onComplete callback configured
- And the operation conflicts then succeeds on retry
- When the retry mutation completes successfully
- Then onComplete should be called with the success result
- And the context object should be passed through unchanged

**Version advances between retry scheduling and execution**

- Given operation A with expectedVersion 5 conflicts (currentVersion is 6)
- And retry is scheduled with expectedVersion 6 and runAfter 250ms
- And operation B completes at 100ms advancing version to 7
- When operation A's retry executes at 250ms
- Then it should detect conflict (currentVersion is 7, not 6)
- And it should schedule another retry with expectedVersion 7
- And attempt counter should be incremented to 2

**Rate limiter mounts as Convex component**

- Given convex.config.ts includes rate limiter component
- When the deployment runs
- Then rate limiter tables should be created
- And rate limiter API should be accessible

**DCB retry pool mounts as separate Workpool**

- Given convex.config.ts includes dcbRetryPool component
- When a DCB conflict occurs
- Then retry should be enqueued to dcbRetryPool
- And projection workpool should not be affected

**Middleware pipeline order preserved**

- Given rate limit middleware at order 50
- And structure validation at order 10
- And authorization at order 30
- When a command is dispatched
- Then structure validation runs first
- Then authorization runs second
- Then rate limiting runs third

## Business Rules

**Rate limit adapter bridges middleware to component**

**Invariant:** Rate limiting decisions must persist across server restarts and scale
horizontally via sharding—no in-memory implementations in production.

    **Rationale:** In-memory rate limiters lose state on cold starts and cannot enforce
    consistent limits across multiple server instances. The `@convex-dev/rate-limiter`
    component provides persistence, sharding, and correct token bucket/fixed window
    semantics without middleware pipeline changes.

    **API:** See `@libar-dev/platform-core/src/middleware/rateLimitAdapter.ts`

    **Verified by:** Adapter allows request within rate limit, Adapter rejects request
    exceeding rate limit, Adapter isolates limits by key, Adapter integrates with
    existing middleware pipeline

    The adapter implements the existing `RateLimitChecker` interface, allowing the current
    middleware pipeline to use `@convex-dev/rate-limiter` without any changes to middleware code.

    **Interface Contract (existing):**

```typescript
// platform-core/src/middleware/types.ts - EXISTING interface
export type RateLimitChecker = (key: string) => Promise<RateLimitResult>;

export interface RateLimitResult {
  allowed: boolean;
  retryAfterMs?: number;
}
```

**Adapter Implementation:**

```typescript
// platform-core/src/middleware/rateLimitAdapter.ts - NEW
import type { RateLimiter } from "@convex-dev/rate-limiter";
import type { MutationCtx } from "convex/server";
import type { RateLimitChecker, RateLimitResult } from "./types.js";

/**
 * Create a RateLimitChecker that delegates to @convex-dev/rate-limiter.
 *
 * @param rateLimiter - Instance from the mounted component
 * @param limitName - Named limit from rateLimiter config
 * @returns Factory that creates RateLimitChecker for a given ctx
 *
 * @example
 * // In convex/rateLimits.ts
 * export const rateLimiter = new RateLimiter(components.rateLimiter, {
 *   commandDispatch: { kind: "token bucket", rate: 100, period: MINUTE, shards: 50 },
 * });
 *
 * // In middleware setup
 * const checker = createConvexRateLimitAdapter(rateLimiter, "commandDispatch")(ctx);
 * const result = await checker("user:" + userId);
 */
export function createConvexRateLimitAdapter(
  rateLimiter: RateLimiter,
  limitName: string
): (ctx: MutationCtx) => RateLimitChecker {
  return (ctx: MutationCtx): RateLimitChecker => {
    return async (key: string): Promise<RateLimitResult> => {
      const status = await rateLimiter.limit(ctx, limitName, { key });
      return {
        allowed: status.ok,
        retryAfterMs: status.retryAfter,
      };
    };
  };
}
```

**Sharding Guidelines (from CONVEX-DURABILITY-REFERENCE.md Section 7):**
| Expected QPS | Recommended Shards |
| < 50 | None (default) |
| 50-200 | 5-10 |
| 200-1000 | 10-50 |
| > 1000 | 50+ |

    **Formula:** `shards ≈ QPS / 2`

_Verified by: Adapter allows request within rate limit, Adapter rejects request exceeding rate limit, Adapter isolates limits by key, Adapter integrates with existing middleware pipeline_

**DCB retry helper automatically handles OCC conflicts**

**Invariant:** OCC conflicts from DCB operations must be retried automatically with
exponential backoff and scope-based serialization—callers must not implement retry logic.

    **Rationale:** Manual retry leads to inconsistent patterns, missing jitter (thundering
    herd), and no partition ordering (OCC storms). Workpool provides durable retry with
    partition keys that serialize retries per scope, preventing concurrent attempts.

    **API:** See `@libar-dev/platform-core/src/dcb/withRetry.ts`

    **Verified by:** DCB succeeds on first attempt, DCB conflict triggers automatic retry,
    Max retries exceeded returns rejected, Backoff increases exponentially with jitter,
    Partition key ensures scope serialization, DCB retry with onComplete callback,
    Version advances between retry scheduling and execution

    The `withDCBRetry` helper wraps `executeWithDCB` and uses Workpool to automatically
    retry on OCC conflicts with exponential backoff and jitter.

    **Current Problem:**

```typescript
// Caller must implement retry manually
const result = await executeWithDCB(ctx, config);
if (result.status === "conflict") {
  // Manual retry logic required - inconsistent across codebase
  // No backoff, no jitter, no partition ordering
}
```

**Solution with withDCBRetry:**

```typescript
// platform-core/src/dcb/withRetry.ts
    import type { Workpool, RetryBehavior } from "@convex-dev/workpool";
    import { executeWithDCB } from "./execute.js";
    import type { ExecuteWithDCBConfig, DCBExecutionResult } from "./types.js";
    import { calculateBackoff } from "./backoff.js";

    // Reuse Workpool's RetryBehavior for consistency
    // Fields: maxAttempts, initialBackoffMs, base (matches Workpool exactly)
    // We add maxBackoffMs for cap on exponential growth
    export type DCBRetryConfig = RetryBehavior & { maxBackoffMs: number };

    export type DCBRetryResult<TData> =
      | DCBExecutionResult<TData>
      | { status: "deferred"; retryKey: string; scheduledAt: number };

    /**
     * Execute DCB with automatic OCC conflict retry via Workpool.
     *
     * On conflict:
     * 1. Checks if max attempts exceeded → returns rejected
     * 2. Calculates backoff with jitter
     * 3. Enqueues retry mutation to Workpool with partition key = scopeKey
     * 4. Returns { status: "deferred" } to caller
     *
     * Partition key ensures only one retry runs at a time per scope,
     * preventing OCC storms.
     */
    export interface DCBRetryOptions {
      /** Current attempt number (0-indexed) */
      attempt?: number;
      /** Callback mutation when retry completes (success, rejected, or max retries) */
      onComplete?: FunctionReference<"mutation">;
      /** Context data passed through to onComplete */
      context?: unknown;
    }

    export async function withDCBRetry<TCtx, TData>(
      ctx: TCtx,
      workpool: Workpool,
      retryMutation: FunctionReference<"mutation">,
      dcbConfig: ExecuteWithDCBConfig<...>,
      retryConfig?: Partial<DCBRetryConfig>,
      options?: DCBRetryOptions
    ): Promise<DCBRetryResult<TData>> {
      const { attempt = 0, onComplete, context } = options ?? {};
      const config = { ...DEFAULT_RETRY_CONFIG, ...retryConfig };

      const result = await executeWithDCB(ctx, dcbConfig);

      // Non-conflict results are terminal - call onComplete if configured
      if (result.status !== "conflict") {
        if (onComplete) {
          await ctx.runMutation(onComplete, { result, context });
        }
        return result;
      }

      // OCC conflict - check retry budget
      if (attempt >= config.maxAttempts) {
        const rejection = {
          status: "rejected" as const,
          code: "DCB_MAX_RETRIES_EXCEEDED",
          reason: `OCC conflict after ${attempt} attempts`,
          context: { lastVersion: result.currentVersion, attempts: attempt },
        };
        if (onComplete) {
          await ctx.runMutation(onComplete, { result: rejection, context });
        }
        return rejection;
      }

      // Calculate backoff with jitter
      const backoffMs = calculateBackoff(attempt, config);
      const retryKey = `dcb:${dcbConfig.scopeKey}`;

      // Enqueue retry via Workpool - passes through onComplete for eventual notification
      await workpool.enqueueMutation(ctx, retryMutation, {
        dcbConfig: { ...dcbConfig, expectedVersion: result.currentVersion },
        retryConfig: config,
        options: { attempt: attempt + 1, onComplete, context },
      }, {
        key: retryKey,        // Partition by scope for ordering
        runAfter: backoffMs,  // Delayed execution
      });

      return {
        status: "deferred",
        retryKey,
        scheduledAt: Date.now() + backoffMs,
      };
    }
```

**Backoff Calculation (standard formula from CONVEX-DURABILITY-REFERENCE.md):**

```typescript
// platform-core/src/dcb/backoff.ts
// Uses DCBRetryConfig which extends Workpool's RetryBehavior

/**
 * Calculate exponential backoff with jitter.
 *
 * Formula: min(initialMs * base^attempt * jitter, maxMs)
 * Jitter: 50-150% multiplier (prevents thundering herd)
 *
 * This matches the standard Convex Workpool formula exactly.
 * We must calculate it ourselves because Workpool's retry only
 * triggers on exceptions, not successful conflict returns.
 */
export function calculateBackoff(attempt: number, config: DCBRetryConfig): number {
  const delay = config.initialBackoffMs * Math.pow(config.base, attempt);
  const jitter = 0.5 + Math.random(); // 50-150% multiplier
  return Math.min(delay * jitter, config.maxBackoffMs);
}
```

_Verified by: DCB succeeds on first attempt, DCB conflict triggers automatic retry, Max retries exceeded returns rejected, Backoff increases exponentially with jitter, Partition key ensures scope serialization, DCB retry with onComplete callback, Version advances between retry scheduling and execution_

**Adapters integrate with existing platform infrastructure**

**Invariant:** Adapters must plug into existing platform interfaces without requiring
changes to middleware pipeline, command configs, or core orchestration logic.

    **Rationale:** The platform already has well-defined interfaces (RateLimitChecker,
    DCB execution flow). Adapters bridge these to Convex durable components without
    disrupting working code—minimizing risk and maximizing adoption.

    **API:** See `examples/order-management/convex/rateLimits.ts` and
    `examples/order-management/convex/dcb/retryExecution.ts`

    **Verified by:** Rate limiter mounts as Convex component, DCB retry pool mounts as
    separate Workpool, Middleware pipeline order preserved

    Both adapters plug into existing platform code without requiring changes to
    core interfaces or middleware pipeline structure.

    **Rate Limiter Integration in Example App:**

```typescript
// examples/order-management/convex/rateLimits.ts
import { RateLimiter, MINUTE, HOUR } from "@convex-dev/rate-limiter";
import { components } from "./_generated/api";

export const rateLimiter = new RateLimiter(components.rateLimiter, {
  // Command dispatch: 100/min with burst capacity, sharded for scale
  commandDispatch: {
    kind: "token bucket",
    rate: 100,
    period: MINUTE,
    capacity: 150,
    shards: 50, // For ~100 QPS
  },
  // Admin operations: strict hourly limit
  adminOperations: {
    kind: "fixed window",
    rate: 10,
    period: HOUR,
  },
});

// examples/order-management/convex/middleware.ts
import { createConvexRateLimitAdapter } from "@libar-dev/platform-core";
import { rateLimiter } from "./rateLimits";

export function createProductionMiddleware(ctx: MutationCtx) {
  return createRateLimitMiddleware({
    checker: createConvexRateLimitAdapter(rateLimiter, "commandDispatch")(ctx),
    getKey: RateLimitKeys.byUserAndCommand(getUserId),
    skipFor: ["GetSystemHealth"],
  });
}
```

**DCB Retry Integration in Example App:**

```typescript
// examples/order-management/convex/dcb/retryExecution.ts
import { internalMutation } from "../_generated/server";
import { withDCBRetry } from "@libar-dev/platform-core";
import { dcbRetryPool } from "../infrastructure";

// Internal mutation that Workpool calls for retries
export const retryDCBExecution = internalMutation({
  args: {
    dcbConfig: v.any(), // Serialized DCB config
    retryConfig: v.any(),
    attempt: v.number(),
  },
  handler: async (ctx, { dcbConfig, retryConfig, attempt }) => {
    return withDCBRetry(
      ctx,
      dcbRetryPool,
      internal.dcb.retryExecution.retryDCBExecution,
      dcbConfig,
      retryConfig,
      attempt
    );
  },
});

// examples/order-management/convex/infrastructure.ts (addition)
export const dcbRetryPool = new Workpool(components.dcbRetryPool, {
  maxParallelism: 10,
  defaultRetryBehavior: {
    maxAttempts: 1, // withDCBRetry handles retry logic
    initialBackoffMs: 100,
    base: 2,
  },
});
```

_Verified by: Rate limiter mounts as Convex component, DCB retry pool mounts as separate Workpool, Middleware pipeline order preserved_

## Deliverables

- RateLimitChecker types (complete)
- Remove in-memory rate limiters (complete)
- ConvexRateLimitAdapter (complete)
- Rate limiter component mount (complete)
- Rate limit definitions (complete)
- DCB retry types (reuses Workpool RetryBehavior) (complete)
- withDCBRetry helper (complete)
- DCB retry Workpool mount (complete)
- DCB retry internal mutation (complete)
- Backoff calculation (standard formula) (complete)
- Backoff jitter function (injectable) (complete)
- DCB retry onComplete support (complete)
- Adapter usage documentation (complete)

---

[← Back to Product Requirements](../PRODUCT-REQUIREMENTS.md)
