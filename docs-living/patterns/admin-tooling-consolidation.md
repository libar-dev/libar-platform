# 📋 Admin Tooling Consolidation

**Purpose:** Detailed documentation for the Admin Tooling Consolidation pattern

---

## Overview

| Property | Value   |
| -------- | ------- |
| Status   | planned |
| Category | DDD     |
| Phase    | 18      |

## Description

**Problem:** Admin functionality is scattered across the codebase:

- Dead letter queue at `convex/projections/deadLetters.ts`
- Saga admin at `convex/sagas/admin.ts`
- No centralized diagnostics or event flow tracing
- No unified interface for durable function inspection
  This fragmentation makes operational tasks difficult and error-prone.

**Solution:** Consolidate admin functionality into `convex/admin/` directory:

- **projections.ts** - Rebuild triggers, status, checkpoint management
- **deadLetters.ts** - DLQ inspection, retry, ignore (refactored from current location)
- **diagnostics.ts** - Event flow trace, system state snapshot
- **durableFunctions.ts** - Workpool/Workflow run inspection

**Why It Matters for Convex-Native ES:**
| Benefit | How |
| Discoverability | All admin operations in one directory |
| Consistency | Uniform patterns for all admin endpoints |
| Security | Single authorization wrapper for admin access |
| Onboarding | New team members find operations easily |
| Documentation | Admin API becomes self-documenting location |

**Design Principle:** Saga admin remains at `convex/sagas/admin.ts` because sagas
are domain-specific and tightly coupled to saga definitions. The `admin/` directory
is for cross-cutting operational concerns.

## Dependencies

- Depends on: EventReplayInfrastructure
- Depends on: HealthObservability
- Depends on: CircuitBreakerPattern

## Acceptance Criteria

**Admin directory is created with correct structure**

- Given the example app has no admin/ directory
- When admin tooling consolidation is implemented
- Then convex/admin/ directory should exist
- And it should contain projections.ts, deadLetters.ts, diagnostics.ts, durableFunctions.ts
- And \_auth.ts should provide authorization wrapper

**Backward compatibility for DLQ imports**

- Given code imports from "convex/projections/deadLetters"
- When admin tooling consolidation is complete
- Then old import path should still work via re-export
- And deprecation warning should be logged

**Get dead letter statistics**

- Given 5 dead letters for "orderSummary" (3 pending, 2 resolved)
- And 3 dead letters for "productCatalog" (all pending)
- When getDeadLetterStats is called
- Then response should include:

| Field                                        | Value |
| -------------------------------------------- | ----- |
| total                                        | 8     |
| byProjectionAndStatus.orderSummary:pending   | 3     |
| byProjectionAndStatus.orderSummary:resolved  | 2     |
| byProjectionAndStatus.productCatalog:pending | 3     |

**Bulk retry pending dead letters**

- Given 10 pending dead letters for "orderSummary"
- When bulkRetry is called with limit 5
- Then 5 dead letters should have status "retrying"
- And 5 projection handler invocations should be enqueued
- And response.retriedCount should be 5

**Trace complete event flow**

- Given a SubmitOrder command with correlationId "corr-123"
- And the command produced OrderSubmitted and OrderConfirmed events
- And both events were processed by orderSummary projection
- And a saga was triggered
- When getEventFlowTrace is called with "corr-123"
- Then response should include the command
- And response should include 2 events
- And response should include projection updates
- And response should include saga information

**Trace shows failure point**

- Given a command that produced an event
- And the event failed projection processing
- When getEventFlowTrace is called
- Then deadLetters array should include the failure
- And error message should be visible

**System state provides complete overview**

- When getSystemState is called
- Then response should include health aggregation
- And response should include all projection lags
- And response should include DLQ statistics
- And response should include circuit breaker states
- And summary should highlight critical issues

**Query Workpool item status**

- Given a Workpool item with ID "work-123" in "pending" state
- When getWorkpoolItem is called with "work-123"
- Then response should include state "pending"
- And response should include previousAttempts count

**Query Workflow execution with steps**

- Given a Workflow with ID "wf-456" that has completed 3 steps
- When getWorkflowExecution is called with "wf-456"
- Then response should include workflow status
- And response.steps should have 3 entries
- And each step should include name, status, and duration

**Query non-existent durable function**

- Given no Workpool item with ID "work-nonexistent"
- When getWorkpoolItem is called
- Then response should indicate item not found
- And no error should be thrown

**Unauthenticated request is rejected**

- Given no authentication token is provided
- When an admin endpoint is called
- Then error should be "UNAUTHENTICATED"

**Non-admin user is rejected**

- Given a user without admin role
- When an admin endpoint is called
- Then error should be "UNAUTHORIZED: Admin role required"

**Admin action is logged**

- Given an admin user triggers a projection rebuild
- When the action completes
- Then an entry should be added to adminAuditLog
- And entry should include action, args, userId, and timestamp

## Business Rules

**Admin directory provides unified location for operational endpoints**

All cross-cutting admin operations live in `convex/admin/`. Domain-specific
admin (sagas) remains with domain code.

    **Directory Structure:**

```text
convex/
    ├── admin/
    │   ├── _auth.ts           # Authorization wrapper for admin access
    │   ├── projections.ts     # Rebuild, status, checkpoint operations
    │   ├── deadLetters.ts     # DLQ management (refactored)
    │   ├── diagnostics.ts     # Event flow trace, system state
    │   └── durableFunctions.ts # Workpool/Workflow inspection
    │
    ├── projections/
    │   └── deadLetters.ts     # DEPRECATED - re-exports from admin/
    │
    └── sagas/
        └── admin.ts           # Saga-specific admin (stays here)
```

**Migration Strategy:** 1. Create `convex/admin/` directory 2. Move DLQ endpoints to `admin/deadLetters.ts` 3. Add re-exports at old location for backward compatibility 4. Update imports in calling code 5. Remove deprecated re-exports in future release

_Verified by: Admin directory is created with correct structure, Backward compatibility for DLQ imports_

**DLQ endpoints provide inspection, retry, and ignore operations**

Dead letter queue management enables operations teams to: - View failed projection updates - Retry individual or bulk items - Ignore items that cannot be processed

    **Existing Operations (to be moved):**
    | Operation | Current Location | New Location |
    | getPendingDeadLetters | projections/deadLetters.ts | admin/deadLetters.ts |
    | replayDeadLetter | projections/deadLetters.ts | admin/deadLetters.ts |
    | ignoreDeadLetter | projections/deadLetters.ts | admin/deadLetters.ts |
    | prepareDeadLetterRetrigger | projections/deadLetters.ts | admin/deadLetters.ts |

    **New Operations:**
    | Operation | Purpose |
    | getDeadLetterById | Get single dead letter with full details |
    | getDeadLetterStats | Count by projection and status |
    | bulkRetry | Retry all pending for a projection |
    | bulkIgnore | Ignore all pending for a projection |
    | purgeResolved | Delete resolved items older than N days |

    **Enhanced DLQ Operations:**

```typescript
// admin/deadLetters.ts
export const getDeadLetterStats = internalQuery({
  handler: async (ctx) => {
    const deadLetters = await ctx.db.query("projectionDeadLetters").collect();

    const stats = deadLetters.reduce(
      (acc, dl) => {
        const key = `${dl.projectionName}:${dl.status}`;
        acc[key] = (acc[key] ?? 0) + 1;
        return acc;
      },
      {} as Record<string, number>
    );

    return {
      total: deadLetters.length,
      byProjectionAndStatus: stats,
      oldestPending: deadLetters
        .filter((dl) => dl.status === "pending")
        .sort((a, b) => a.failedAt - b.failedAt)[0]?.failedAt,
    };
  },
});

export const bulkRetry = internalMutation({
  args: {
    projectionName: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { projectionName, limit = 100 }) => {
    const pending = await ctx.db
      .query("projectionDeadLetters")
      .withIndex("by_projection_status", (q) =>
        q.eq("projectionName", projectionName).eq("status", "pending")
      )
      .take(limit);

    for (const dl of pending) {
      await ctx.db.patch(dl._id, { status: "retrying", retryStartedAt: Date.now() });
      // Enqueue retry via workpool
      await projectionPool.enqueueMutation(ctx, getProjectionHandler(projectionName), {
        eventId: dl.eventId,
        // ... other args from dead letter
      });
    }

    return { retriedCount: pending.length };
  },
});
```

_Verified by: Get dead letter statistics, Bulk retry pending dead letters_

**Event flow trace enables debugging across the command-event-projection chain**

When issues occur, operators need to trace: - Which command created an event - Which projections processed the event - Where in the chain a failure occurred

    **Trace Query:**

```typescript
// admin/diagnostics.ts
export const getEventFlowTrace = internalQuery({
  args: { correlationId: v.string() },
  handler: async (ctx, { correlationId }) => {
    // Find command
    const command = await ctx.db
      .query("commandBusCommands")
      .withIndex("by_correlationId", (q) => q.eq("correlationId", correlationId))
      .unique();

    // Find events
    const events = await eventStore.getByCorrelation(ctx, { correlationId });

    // Find projection updates (via checkpoints with matching eventIds)
    const projectionUpdates = await ctx.db
      .query("projectionCheckpoints")
      .filter((q) => events.some((e) => q.eq(q.field("lastEventId"), e.eventId)))
      .collect();

    // Find dead letters
    const deadLetters = await ctx.db
      .query("projectionDeadLetters")
      .filter((q) => events.some((e) => q.eq(q.field("eventId"), e.eventId)))
      .collect();

    // Find saga executions
    const sagas = await ctx.db
      .query("sagaRegistry")
      .withIndex("by_correlationId", (q) => q.eq("correlationId", correlationId))
      .collect();

    return {
      correlationId,
      command: command
        ? {
            commandType: command.commandType,
            status: command.status,
            createdAt: command.createdAt,
            completedAt: command.completedAt,
          }
        : null,
      events: events.map((e) => ({
        eventId: e.eventId,
        eventType: e.eventType,
        streamId: e.streamId,
        globalPosition: e.globalPosition,
        timestamp: e.timestamp,
      })),
      projectionUpdates: projectionUpdates.map((p) => ({
        projectionName: p.projectionName,
        lastGlobalPosition: p.lastGlobalPosition,
        updatedAt: p.updatedAt,
      })),
      deadLetters: deadLetters.map((dl) => ({
        projectionName: dl.projectionName,
        status: dl.status,
        error: dl.error,
        failedAt: dl.failedAt,
      })),
      sagas: sagas.map((s) => ({
        sagaType: s.sagaType,
        status: s.status,
        startedAt: s.startedAt,
        completedAt: s.completedAt,
      })),
    };
  },
});
```

_Verified by: Trace complete event flow, Trace shows failure point_

**System state snapshot provides full health picture**

Operators need a single query to understand overall system state, combining: - Component health (Event Store, projections, Workpools) - Projection lag across all projections - DLQ statistics - Active rebuilds - Circuit breaker states

    **Snapshot Query:**

```typescript
// admin/diagnostics.ts
export const getSystemState = internalQuery({
  handler: async (ctx) => {
    const [health, projectionLags, dlqStats, activeRebuilds, circuitStates] = await Promise.all([
      aggregateSystemHealth(ctx),
      getAllProjectionLags(ctx),
      getDeadLetterStats(ctx),
      listActiveRebuilds(ctx),
      getAllCircuitStates(ctx),
    ]);

    return {
      timestamp: Date.now(),
      health,
      projections: {
        lags: projectionLags,
        activeRebuilds,
      },
      deadLetters: dlqStats,
      circuitBreakers: circuitStates,
      summary: {
        status: health.status,
        projectionsWithLag: Object.values(projectionLags).filter((l) => l > 100).length,
        pendingDeadLetters: dlqStats.total,
        openCircuits: circuitStates.filter((c) => c.state === "open").length,
      },
    };
  },
});
```

_Verified by: System state provides complete overview_

**Durable function queries enable Workpool and Workflow debugging**

When background work fails or stalls, operators need visibility into: - Workpool queue contents and status - Workflow execution history - Action Retrier run status

    **Durable Function Queries:**

```typescript
// admin/durableFunctions.ts

// Query Workpool item status
export const getWorkpoolItem = internalQuery({
  args: { workId: v.string() },
  handler: async (ctx, { workId }) => {
    const status = await projectionPool.status(ctx, workId);
    return {
      workId,
      ...status,
    };
  },
});

// Query Workflow status and steps
export const getWorkflowExecution = internalQuery({
  args: { workflowId: v.string() },
  handler: async (ctx, { workflowId }) => {
    const status = await workflowManager.status(ctx, workflowId);
    const steps = await workflowManager.listSteps(ctx, workflowId);
    return {
      workflowId,
      status,
      steps,
    };
  },
});

// List pending Workpool items for a pool
export const listPendingWorkpoolItems = internalQuery({
  args: {
    poolName: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { poolName, limit = 50 }) => {
    // Implementation depends on Workpool internals
    // May need to query component tables directly
    const pool = getPoolByName(poolName);
    // ...
  },
});

// Get Action Retrier run status
export const getRetrierRun = internalQuery({
  args: { runId: v.string() },
  handler: async (ctx, { runId }) => {
    const status = await retrier.status(ctx, runId);
    return {
      runId,
      ...status,
    };
  },
});
```

_Verified by: Query Workpool item status, Query Workflow execution with steps, Query non-existent durable function_

**Admin endpoints require authorization**

Admin operations are powerful and should be protected. All admin endpoints
use an authorization wrapper that: - Validates caller has admin role - Logs all admin actions for audit - Rate limits admin operations

    **Authorization Wrapper:**

```typescript
// admin/_auth.ts
import { ConvexError } from "convex/values";

export function requireAdminRole(ctx: QueryCtx | MutationCtx) {
  const identity = ctx.auth.getUserIdentity();
  if (!identity) {
    throw new ConvexError("UNAUTHENTICATED");
  }

  // Check for admin role in token claims or user record
  const isAdmin =
    identity.tokenIdentifier.includes("admin") ||
    // Or check custom claims
    (identity as any).customClaims?.role === "admin";

  if (!isAdmin) {
    throw new ConvexError("UNAUTHORIZED: Admin role required");
  }

  return identity;
}

export function withAdminAuth<T>(
  handler: (ctx: MutationCtx, args: T, identity: UserIdentity) => Promise<any>
) {
  return async (ctx: MutationCtx, args: T) => {
    const identity = requireAdminRole(ctx);

    // Log admin action
    await ctx.db.insert("adminAuditLog", {
      action: handler.name,
      args: JSON.stringify(args),
      userId: identity.subject,
      timestamp: Date.now(),
    });

    return handler(ctx, args, identity);
  };
}
```

**Usage:**

```typescript
// admin/projections.ts
export const triggerRebuild = internalMutation({
  args: { projectionName: v.string() },
  handler: withAdminAuth(async (ctx, args, identity) => {
    // Only reached if caller has admin role
    // Action is logged to audit trail
    return triggerRebuildImpl(ctx, args);
  }),
});
```

_Verified by: Unauthenticated request is rejected, Non-admin user is rejected, Admin action is logged_

---

[← Back to Pattern Registry](../PATTERNS.md)
