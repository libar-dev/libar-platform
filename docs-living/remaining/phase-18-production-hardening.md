# ProductionHardening - Remaining Work

**Purpose:** Detailed remaining work for ProductionHardening

---

## Summary

**Progress:** [█████████░░░░░░░░░░░] 3/7 (43%)

**Remaining:** 4 patterns (0 active, 4 planned)

---

## ✅ Ready to Start

These patterns can be started immediately:

| Pattern                    | Effort | Business Value                                      |
| -------------------------- | ------ | --------------------------------------------------- |
| 📋 Circuit Breaker Pattern | 1w     | external service resilience and budget preservation |
| 📋 Health Observability    | 1w     | production monitoring and k8s integration           |
| 📋 Production Hardening    | 3w     | operational reliability and system observability    |

---

## ⚠️ Blocked

These patterns are waiting on dependencies:

| Pattern                     | Blocked By                                                            | Effort |
| --------------------------- | --------------------------------------------------------------------- | ------ |
| Admin Tooling Consolidation | EventReplayInfrastructure, HealthObservability, CircuitBreakerPattern | 3d     |

---

## All Remaining Patterns

### 📋 Admin Tooling Consolidation

| Property       | Value                                                                 |
| -------------- | --------------------------------------------------------------------- |
| Status         | planned                                                               |
| Effort         | 3d                                                                    |
| Business Value | unified operations interface                                          |
| Dependencies   | EventReplayInfrastructure, HealthObservability, CircuitBreakerPattern |

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

#### Acceptance Criteria

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

#### Business Rules

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

### 📋 Circuit Breaker Pattern

| Property       | Value                                               |
| -------------- | --------------------------------------------------- |
| Status         | planned                                             |
| Effort         | 1w                                                  |
| Business Value | external service resilience and budget preservation |
| Dependencies   | DurableFunctionAdapters                             |

**Problem:** External API failures (Stripe, SendGrid, webhooks) cascade through the system.
Without automatic isolation:

- Action budget is wasted on calls destined to fail
- Users experience long timeouts instead of fast failures
- Partial outages become full outages via resource exhaustion
- No automatic recovery testing when service comes back

**Solution:** Database-backed circuit breaker with state machine:

- **CLOSED** - Normal operation, track failure count
- **OPEN** - Fail fast, no requests sent to failing service
- **HALF_OPEN** - Allow one test request to check recovery
- **Scheduled transitions** - `ctx.scheduler.runAfter` for timeout-based state changes
- **Action Retrier integration** - Half-open probe uses Retrier with maxFailures: 0

**Why It Matters for Convex-Native ES:**
| Benefit | How |
| Budget preservation | OPEN state prevents wasting actions on failing services |
| Fast failure | Users get immediate error instead of timeout |
| Automatic recovery | Half-open probe tests service without manual intervention |
| Observability | Circuit state changes are logged for alerting |
| Per-service isolation | Each external service has independent circuit |

**Convex Constraint:** No in-memory state across function invocations. Circuit state must
persist in Convex table. Timeout transitions use `ctx.scheduler.runAfter`, not in-memory timers.

#### Acceptance Criteria

**Circuit remains closed on success**

- Given a circuit in "closed" state with failureCount 3
- When a "success" event occurs
- Then circuit should remain "closed"
- And failureCount should reset to 0

**Circuit opens after threshold failures**

- Given a circuit in "closed" state with failureCount 4
- And failureThreshold is 5
- When a "failure" event occurs
- Then circuit should transition to "open"
- And sideEffect should be "schedule_timeout"
- And openedAt should be set to current time

**Circuit transitions to half-open after timeout**

- Given a circuit in "open" state
- When a "timeout" event occurs
- Then circuit should transition to "half_open"

**Successful probe closes circuit**

- Given a circuit in "half_open" state
- When a "probe_success" event occurs
- Then circuit should transition to "closed"
- And failureCount should be 0

**Failed probe reopens circuit**

- Given a circuit in "half_open" state
- When a "probe_failure" event occurs
- Then circuit should transition to "open"
- And sideEffect should be "schedule_timeout"

**Circuit state persists across function calls**

- Given a circuit "stripe-api" in "closed" state
- When two concurrent requests fail
- Then both failures should be recorded
- And failureCount should be 2 (not 1)

**Non-existent circuit defaults to closed**

- Given no circuit entry for "new-service"
- When loading circuit state
- Then state should be "closed"
- And failureCount should be 0
- And default config should be applied

**Timeout transitions open to half-open**

- Given a circuit "stripe-api" opened at timestamp 1000
- And resetTimeoutMs is 30000
- When timeout fires at timestamp 31000
- Then circuit should transition to "half_open"

**Stale timeout is ignored**

- Given a circuit "stripe-api" was opened at timestamp 1000
- And circuit was manually closed at timestamp 10000
- And circuit opened again at timestamp 20000
- When stale timeout fires with openedAt=1000
- Then timeout should be skipped
- And circuit should remain in current state

**Half-open probe closes circuit on success**

- Given a circuit "stripe-api" in "half_open" state
- When a probe request succeeds
- Then onProbeComplete should receive success result
- And circuit should transition to "closed"
- And probeRunId should be cleared

**Half-open probe reopens circuit on failure**

- Given a circuit "stripe-api" in "half_open" state
- When a probe request fails
- Then onProbeComplete should receive failed result
- And circuit should transition to "open"
- And a new timeout should be scheduled

**Open circuit returns fast failure**

- Given a circuit "stripe-api" in "open" state
- And circuit opened 10 seconds ago
- And resetTimeoutMs is 30000
- When a request is attempted
- Then request should fail immediately with "CIRCUIT_OPEN:stripe-api"
- And retryAfterMs should be approximately 20000

**Payment circuit opens after 3 failures**

- Given a circuit "stripe-api" with failureThreshold 3
- When 3 consecutive failures occur
- Then circuit should be "open"

**Email circuit tolerates more failures**

- Given a circuit "sendgrid" with failureThreshold 10
- When 5 failures occur
- Then circuit should still be "closed"
- And failureCount should be 5

**Different services have independent circuits**

- Given circuit "stripe-api" is "open"
- And circuit "sendgrid" is "closed"
- When a Stripe request is made
- Then it should fail fast
- When a SendGrid request is made
- Then it should execute normally

#### Business Rules

**Circuit breaker follows three-state machine**

The circuit breaker is a state machine with well-defined transitions:

    **State Diagram:**

```text
┌─────────────────────────────────────────────────────────────┐
    │                                                             │
    │   ┌──────────┐    failures >= threshold    ┌──────────┐   │
    │   │          │ ─────────────────────────► │          │   │
    │   │  CLOSED  │                             │   OPEN   │   │
    │   │          │ ◄───────────────────────── │          │   │
    │   └──────────┘    probe success            └────┬─────┘   │
    │        ▲                                        │         │
    │        │ probe success                          │         │
    │        │                                        │         │
    │   ┌────┴─────┐    resetTimeout expires         │         │
    │   │          │ ◄────────────────────────────────┘         │
    │   │HALF_OPEN │                                            │
    │   │          │ ─────────────────────────────────────────► │
    │   └──────────┘    probe failure            (back to OPEN) │
    │                                                           │
    └─────────────────────────────────────────────────────────────┘
```

**State Behaviors:**
| State | Request Handling | Transitions |
| CLOSED | Execute normally, track failures | → OPEN after threshold failures |
| OPEN | Reject immediately (fail fast) | → HALF_OPEN after timeout |
| HALF_OPEN | Allow single probe request | → CLOSED on success, → OPEN on failure |

    **Pure State Machine:**

```typescript
// stateMachine.ts - Pure function, no I/O
export type CircuitState = "closed" | "open" | "half_open";
export type CircuitEvent = "success" | "failure" | "timeout" | "probe_success" | "probe_failure";

export interface CircuitBreakerState {
  state: CircuitState;
  failureCount: number;
  lastFailureAt?: number;
  openedAt?: number;
  probeRunId?: string;
}

export interface CircuitBreakerConfig {
  failureThreshold: number; // Failures before opening (default: 5)
  resetTimeoutMs: number; // Time in OPEN before half-open (default: 30000)
  successThreshold: number; // Successes in half-open to close (default: 1)
}

export function computeNextState(
  current: CircuitBreakerState,
  event: CircuitEvent,
  config: CircuitBreakerConfig,
  now: number
): { nextState: CircuitBreakerState; sideEffect?: "schedule_timeout" | "probe_started" } {
  switch (current.state) {
    case "closed":
      if (event === "success") {
        return { nextState: { ...current, failureCount: 0 } };
      }
      if (event === "failure") {
        const newCount = current.failureCount + 1;
        if (newCount >= config.failureThreshold) {
          return {
            nextState: { state: "open", failureCount: newCount, openedAt: now },
            sideEffect: "schedule_timeout",
          };
        }
        return { nextState: { ...current, failureCount: newCount, lastFailureAt: now } };
      }
      break;

    case "open":
      if (event === "timeout") {
        return { nextState: { ...current, state: "half_open" } };
      }
      // Ignore success/failure in open state (requests are rejected)
      break;

    case "half_open":
      if (event === "probe_success") {
        return { nextState: { state: "closed", failureCount: 0 } };
      }
      if (event === "probe_failure") {
        return {
          nextState: { state: "open", failureCount: current.failureCount, openedAt: now },
          sideEffect: "schedule_timeout",
        };
      }
      break;
  }

  return { nextState: current };
}
```

_Verified by: Circuit remains closed on success, Circuit opens after threshold failures, Circuit transitions to half-open after timeout, Successful probe closes circuit, Failed probe reopens circuit_

**Circuit state persists in Convex table**

Convex functions are stateless across invocations. Circuit state must persist
in a table to survive function restarts and be consistent across workers.

    **Schema:**

```typescript
// schema.ts
    circuitBreakers: defineTable({
      name: v.string(),                    // e.g., "stripe-api", "sendgrid"
      state: v.union(v.literal("closed"), v.literal("open"), v.literal("half_open")),
      failureCount: v.number(),
      lastFailureAt: v.optional(v.number()),
      openedAt: v.optional(v.number()),
      probeRunId: v.optional(v.string()),  // Action Retrier run ID for probe
      probeScheduledAt: v.optional(v.number()),
      config: v.object({
        failureThreshold: v.number(),
        resetTimeoutMs: v.number(),
        successThreshold: v.number(),
      }),
      updatedAt: v.number(),
    }).index("by_name", ["name"]),
```

**State Operations:**

```typescript
// monitoring/circuitBreakers.ts
export const loadCircuitState = internalQuery({
  args: { name: v.string() },
  handler: async (ctx, { name }) => {
    const circuit = await ctx.db
      .query("circuitBreakers")
      .withIndex("by_name", (q) => q.eq("name", name))
      .unique();

    if (!circuit) {
      // Default to closed with default config
      return {
        name,
        state: "closed" as const,
        failureCount: 0,
        config: DEFAULT_CIRCUIT_CONFIG,
      };
    }

    return circuit;
  },
});

export const updateCircuitState = internalMutation({
  args: {
    name: v.string(),
    event: v.union(v.literal("success"), v.literal("failure") /* ... */),
  },
  handler: async (ctx, { name, event }) => {
    const current = await loadCircuitState(ctx, { name });
    const { nextState, sideEffect } = computeNextState(current, event, current.config, Date.now());

    // Upsert circuit state
    if (current._id) {
      await ctx.db.patch(current._id, { ...nextState, updatedAt: Date.now() });
    } else {
      await ctx.db.insert("circuitBreakers", {
        name,
        ...nextState,
        config: current.config,
        updatedAt: Date.now(),
      });
    }

    // Handle side effects
    if (sideEffect === "schedule_timeout") {
      await ctx.scheduler.runAfter(
        current.config.resetTimeoutMs,
        internal.monitoring.circuitBreakers.onTimeout,
        { name, openedAt: nextState.openedAt }
      );
    }

    return nextState;
  },
});
```

_Verified by: Circuit state persists across function calls, Non-existent circuit defaults to closed_

**Open-to-half-open transition uses scheduler**

The OPEN → HALF_OPEN transition happens after `resetTimeoutMs` elapses.
Since Convex has no in-memory timers, use `ctx.scheduler.runAfter`.

    **Important:** Schedule is a one-shot, not a recurring cron. Each circuit-open
    event schedules its own timeout.

    **Timeout Handler:**

```typescript
export const onTimeout = internalMutation({
  args: {
    name: v.string(),
    openedAt: v.number(), // Guard against stale timeouts
  },
  handler: async (ctx, { name, openedAt }) => {
    const current = await ctx.db
      .query("circuitBreakers")
      .withIndex("by_name", (q) => q.eq("name", name))
      .unique();

    if (!current) return;

    // Guard: only transition if still open AND openedAt matches
    // (prevents stale timeout from older open-close-open cycle)
    if (current.state !== "open" || current.openedAt !== openedAt) {
      return { skipped: true, reason: "circuit state changed" };
    }

    const { nextState } = computeNextState(current, "timeout", current.config, Date.now());
    await ctx.db.patch(current._id, { ...nextState, updatedAt: Date.now() });

    return { transitioned: true, newState: nextState.state };
  },
});
```

**Why Guard with openedAt:**
Without the guard, this could happen: 1. Circuit opens at T=0, schedules timeout for T=30s 2. Manual intervention closes circuit at T=10s 3. Circuit opens again at T=20s, schedules timeout for T=50s 4. Stale timeout fires at T=30s, transitions to half-open unexpectedly

    The `openedAt` guard ensures only the timeout from the current open cycle fires.

_Verified by: Timeout transitions open to half-open, Stale timeout is ignored_

**Half-open probes use Action Retrier with zero retries**

When circuit enters HALF_OPEN, we need to test if the service recovered.
Use Action Retrier with `maxFailures: 0` (no retries) for a controlled probe.

    **Why Action Retrier:**
    - Provides `onComplete` callback for probe result handling
    - Tracks run ID for correlating probe result with circuit
    - No retries means single attempt for clean pass/fail signal

    **Probe Pattern:**

```typescript
import { ActionRetrier } from "@convex-dev/action-retrier";

export async function executeWithCircuitBreaker<T>(
  ctx: ActionCtx,
  circuitName: string,
  operation: FunctionReference<"action">,
  args: Record<string, unknown>
): Promise<{ result: T } | { error: string; retryAfterMs?: number }> {
  const circuit = await loadCircuitState(ctx, { name: circuitName });

  if (circuit.state === "open") {
    const retryAfterMs =
      circuit.config.resetTimeoutMs - (Date.now() - (circuit.openedAt ?? Date.now()));
    return { error: `CIRCUIT_OPEN:${circuitName}`, retryAfterMs };
  }

  if (circuit.state === "half_open") {
    // Probe mode: single attempt, no retries
    const runId = await retrier.run(ctx, operation, args, {
      maxFailures: 0, // No retries
      onComplete: internal.monitoring.circuitBreakers.onProbeComplete,
    });

    // Track probe run ID
    await ctx.runMutation(internal.monitoring.circuitBreakers.setProbeRunId, {
      name: circuitName,
      runId,
    });

    return { result: "PROBE_STARTED" as T, probeRunId: runId };
  }

  // Closed state: normal execution with failure tracking
  try {
    const result = await ctx.runAction(operation, args);
    await ctx.runMutation(internal.monitoring.circuitBreakers.recordSuccess, {
      name: circuitName,
    });
    return { result };
  } catch (error) {
    await ctx.runMutation(internal.monitoring.circuitBreakers.recordFailure, {
      name: circuitName,
      error: String(error),
    });
    throw error;
  }
}

// Probe completion handler
export const onProbeComplete = internalMutation({
  args: { result: runResultValidator },
  handler: async (ctx, { result }) => {
    // Find circuit by probeRunId
    const circuit = await ctx.db
      .query("circuitBreakers")
      .filter((q) => q.eq(q.field("probeRunId"), result.runId))
      .unique();

    if (!circuit) return;

    if (result.type === "success") {
      await updateCircuitState(ctx, { name: circuit.name, event: "probe_success" });
    } else {
      await updateCircuitState(ctx, { name: circuit.name, event: "probe_failure" });
    }

    // Clear probe run ID
    await ctx.db.patch(circuit._id, { probeRunId: undefined });
  },
});
```

_Verified by: Half-open probe closes circuit on success, Half-open probe reopens circuit on failure, Open circuit returns fast failure_

**Each external service has independent circuit configuration**

Different services have different failure characteristics. A payment API
might need a higher threshold than a notification service.

    **Configuration Options:**
    | Option | Default | Description |
    | failureThreshold | 5 | Consecutive failures before opening |
    | resetTimeoutMs | 30000 | Time in open state before half-open |
    | successThreshold | 1 | Successes in half-open before closing |

    **Per-Service Configuration:**

```typescript
// Infrastructure setup
const circuitConfigs: Record<string, CircuitBreakerConfig> = {
  "stripe-api": {
    failureThreshold: 3, // Payment is critical, open quickly
    resetTimeoutMs: 60000, // Wait longer before retrying payments
    successThreshold: 1,
  },
  sendgrid: {
    failureThreshold: 10, // Email is less critical
    resetTimeoutMs: 30000,
    successThreshold: 1,
  },
  "webhook-delivery": {
    failureThreshold: 5,
    resetTimeoutMs: 15000, // Retry webhooks more frequently
    successThreshold: 2, // Require 2 successes to fully close
  },
};
```

_Verified by: Payment circuit opens after 3 failures, Email circuit tolerates more failures, Different services have independent circuits_

### 📋 Health Observability

| Property       | Value                                                   |
| -------------- | ------------------------------------------------------- |
| Status         | planned                                                 |
| Effort         | 1w                                                      |
| Business Value | production monitoring and k8s integration               |
| Dependencies   | EventReplayInfrastructure, WorkpoolPartitioningStrategy |

**Problem:** No Kubernetes integration (readiness/liveness probes), no metrics for
projection lag, event throughput, or system health. Operations team has no visibility
into system state, cannot detect degradation before it becomes an outage, and cannot
integrate with standard orchestration platforms.

**Solution:** Production-ready observability infrastructure:

- **HTTP health endpoints** - `/health/ready` and `/health/live` via Convex httpAction
- **Metrics collection** - Structured JSON for Log Streams export to Prometheus/Datadog
- **Projection lag tracking** - Checkpoint position vs Event Store max position
- **Workpool queue depth** - Backpressure detection for load shedding
- **Component health aggregation** - Event Store, projections, Workpools, external deps

**Why It Matters for Convex-Native ES:**
| Benefit | How |
| K8s integration | httpAction endpoints for readiness/liveness probes |
| Proactive monitoring | Projection lag alerts before users notice stale data |
| Load shedding | Workpool queue depth signals when to reject new work |
| External observability | Log Streams integration enables Grafana dashboards |
| Incident response | System state snapshot for rapid diagnosis |

**Convex Constraints:**

- No OpenTelemetry SDK inside Convex functions
- No persistent connections (WebSocket, long-polling)
- Metrics export via Log Streams (Axiom, Datadog) with REPORT-level JSON

#### Acceptance Criteria

**Readiness probe returns healthy when all components OK**

- Given Event Store is reachable
- And all projections are within lag threshold (< 100 events)
- And Workpool queue depth is below threshold
- When GET /health/ready is called
- Then HTTP status should be 200
- And response body should include:

| Field                  | Value   |
| ---------------------- | ------- |
| status                 | healthy |
| components.eventStore  | healthy |
| components.projections | healthy |
| components.workpool    | healthy |

**Readiness probe returns unhealthy on projection lag**

- Given projection "orderSummary" has lag of 500 events
- And lag threshold is 100 events
- When GET /health/ready is called
- Then HTTP status should be 503
- And response body should include:

| Field                    | Value     |
| ------------------------ | --------- |
| status                   | unhealthy |
| components.projections   | degraded  |
| details.orderSummary.lag | 500       |

**Liveness probe always returns alive**

- Given any system state (even degraded)
- When GET /health/live is called
- Then HTTP status should be 200
- And response body should include status "alive"

**Workpool backlog fails readiness**

- Given projectionPool maxParallelism is 10
- And projectionPool queue depth is 25
- And threshold is 20 (2x maxParallelism)
- When GET /health/ready is called
- Then HTTP status should be 503
- And response should identify "workpool_backlog" as degraded
- And suggested action should be "reduce traffic or scale"

**Normal queue depth passes readiness**

- Given projectionPool queue depth is 15
- And threshold is 20
- When GET /health/ready is called
- Then workpool component should be "healthy"

**Projection lag is calculated correctly**

- Given Event Store max globalPosition is 1000
- And projection "orderSummary" checkpoint is at position 950
- When calculating projection lag
- Then lag should be 50
- And status should be "warning"

**Missing checkpoint treated as maximum lag**

- Given Event Store max globalPosition is 1000
- And projection "newProjection" has no checkpoint entry
- When calculating projection lag
- Then lag should be 1000
- And a warning should be logged "no checkpoint for newProjection"

**Zero lag is healthy**

- Given Event Store max globalPosition is 1000
- And projection "orderSummary" checkpoint is at position 1000
- When calculating projection lag
- Then lag should be 0
- And status should be "healthy"

**Metrics collection gathers all dimensions**

- When system metrics are collected
- Then response should include projectionLags for all projections
- And response should include dlqSizes
- And response should include workpoolDepths for all pools
- And response should include timestamp

**Metrics emitted as JSON for Log Streams**

- When emitMetrics mutation runs
- Then a JSON log entry should be written at REPORT level
- And log entry should have type "METRICS"
- And log entry should be parseable by Log Streams

**Metrics collection handles empty state**

- Given no events have been processed
- And no dead letters exist
- When system metrics are collected
- Then projectionLags should be empty object or zeros
- And dlqSizes should be empty object or zeros
- And collection should not fail

**All components healthy yields healthy system**

- Given Event Store responds successfully
- And all projections have lag < 100
- And all Workpool depths are below threshold
- And DLQ has < 10 pending items
- When system health is aggregated
- Then system status should be "healthy"
- And summary.healthy should be 4
- And summary.unhealthy should be 0

**Single unhealthy component makes system unhealthy**

- Given Event Store responds successfully
- And projection "orderSummary" has lag of 5000 (critical)
- And Workpool depths are normal
- When system health is aggregated
- Then system status should be "unhealthy"
- And components should identify "projections" as unhealthy

**Degraded component yields degraded system**

- Given Event Store responds successfully
- And projection "orderSummary" has lag of 150 (warning)
- And all other components are healthy
- When system health is aggregated
- Then system status should be "degraded"
- And components should identify "projections" as degraded

#### Business Rules

**Health endpoints support Kubernetes probes**

Kubernetes requires HTTP endpoints for orchestration: - **Readiness probe** (`/health/ready`) - Is the service ready to receive traffic? - **Liveness probe** (`/health/live`) - Is the process alive and responsive?

    **Endpoint Specifications:**
    | Endpoint | HTTP Method | Success | Failure | Checks |
    | /health/ready | GET | 200 OK | 503 Service Unavailable | Event Store, projections, Workpool depth |
    | /health/live | GET | 200 OK | (always 200) | Process responsive |

    **Implementation via httpAction:**

```typescript
// convex/http.ts
import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";

const http = httpRouter();

http.route({
  path: "/health/ready",
  method: "GET",
  handler: httpAction(async (ctx) => {
    const health = await ctx.runQuery(internal.health.checkReadiness);
    return new Response(JSON.stringify(health), {
      status: health.status === "healthy" ? 200 : 503,
      headers: { "Content-Type": "application/json" },
    });
  }),
});

http.route({
  path: "/health/live",
  method: "GET",
  handler: httpAction(async () => {
    // Liveness just confirms the function can execute
    return new Response(JSON.stringify({ status: "alive", timestamp: Date.now() }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }),
});

export default http;
```

_Verified by: Readiness probe returns healthy when all components OK, Readiness probe returns unhealthy on projection lag, Liveness probe always returns alive_

**Workpool queue depth signals backpressure**

When Workpool queue depth exceeds threshold, the system is under stress.
Readiness should fail to trigger load shedding (K8s stops routing traffic).

    **Threshold Calculation:**
    Default threshold = maxParallelism * 2
    - projectionPool (maxParallelism: 10) → threshold: 20
    - dcbRetryPool (maxParallelism: 10) → threshold: 20
    - eventReplayPool (maxParallelism: 5) → threshold: 10

    **Why x2 Multiplier:**
    - Some queuing is normal (burst absorption)
    - Beyond 2x, processing is falling behind
    - Configurable per deployment

    **Queue Depth Query:**

```typescript
// health.ts
export const getWorkpoolDepths = internalQuery({
  handler: async (ctx) => {
    // Query Workpool internal tables (component-specific)
    // This requires Workpool to expose a status query
    const projectionDepth = await projectionPool.getQueueDepth(ctx);
    const dcbRetryDepth = await dcbRetryPool.getQueueDepth(ctx);
    const replayDepth = await eventReplayPool.getQueueDepth(ctx);

    return {
      projectionPool: { depth: projectionDepth, threshold: 20 },
      dcbRetryPool: { depth: dcbRetryDepth, threshold: 20 },
      eventReplayPool: { depth: replayDepth, threshold: 10 },
    };
  },
});
```

_Verified by: Workpool backlog fails readiness, Normal queue depth passes readiness_

**Projection lag tracks distance from Event Store head**

Projection lag = (Event Store max globalPosition) - (Projection checkpoint position)

    Lag indicates how far behind projections are from the source of truth.
    High lag means stale read models and potential user-visible inconsistency.

    **Lag Calculation:**

```typescript
export async function calculateProjectionLag(
  ctx: QueryCtx,
  projectionName: string
): Promise<{ lag: number; checkpointPosition: number; maxPosition: number }> {
  const maxPosition = await eventStore.getMaxGlobalPosition(ctx);
  const checkpoint = await ctx.db
    .query("projectionCheckpoints")
    .withIndex("by_projection", (q) => q.eq("projectionName", projectionName))
    .first();

  const checkpointPosition = checkpoint?.lastGlobalPosition ?? 0;
  const lag = maxPosition - checkpointPosition;

  return { lag, checkpointPosition, maxPosition };
}
```

**Lag Thresholds:**
| Threshold | Status | Action |
| 0-10 | healthy | Normal operation |
| 11-100 | warning | Monitor, may indicate burst |
| 101-1000 | degraded | Investigate, consider scaling |
| 1000+ | critical | Alert, projection may be stuck |

_Verified by: Projection lag is calculated correctly, Missing checkpoint treated as maximum lag, Zero lag is healthy_

**Metrics are collected as structured JSON for Log Streams export**

Convex doesn't support OpenTelemetry SDK directly. Instead: 1. Collect metrics as structured data 2. Log at REPORT level as JSON 3. Log Streams (Axiom/Datadog) parses and indexes

    **Core Metrics:**
    | Metric | Labels | Unit | Purpose |
    | projection.lag_events | projection_name | count | Projection processing delay |
    | events.throughput | stream_type | events/min | Event Store write rate |
    | command.latency_ms | command_type, status | milliseconds | Command processing time |
    | dlq.size | projection_name | count | Failed events awaiting retry |
    | workpool.queue_depth | pool_name | count | Pending items |

    **Collection Pattern:**

```typescript
// monitoring/metrics/collector.ts
export async function collectSystemMetrics(ctx: QueryCtx): Promise<SystemMetrics> {
  const [projectionLags, dlqSizes, workpoolDepths, eventThroughput] = await Promise.all([
    collectProjectionLags(ctx),
    collectDLQSizes(ctx),
    collectWorkpoolDepths(ctx),
    collectEventThroughput(ctx),
  ]);

  return {
    timestamp: Date.now(),
    projectionLags,
    dlqSizes,
    workpoolDepths,
    eventThroughput,
  };
}

// Export via REPORT-level log
export const emitMetrics = internalMutation({
  handler: async (ctx) => {
    const metrics = await collectSystemMetrics(ctx);
    // REPORT level ensures Log Streams captures it
    console.log(JSON.stringify({ type: "METRICS", ...metrics }));
    return metrics;
  },
});
```

**Scheduled Collection:**
Use static cron (convex/crons.ts) to emit metrics every minute:

```typescript
// convex/crons.ts
import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.interval("emit-system-metrics", { minutes: 1 }, internal.monitoring.emitMetrics);

export default crons;
```

_Verified by: Metrics collection gathers all dimensions, Metrics emitted as JSON for Log Streams, Metrics collection handles empty state_

**System health aggregates component statuses**

Overall system health is derived from individual component health.
Any critical component failure makes the system unhealthy.

    **Aggregation Rules:**
    | Component State | System Impact |
    | All healthy | System healthy (200) |
    | Any degraded | System degraded (200 with warning) |
    | Any unhealthy | System unhealthy (503) |

    **Component Health Checks:**

```typescript
interface ComponentHealth {
  name: string;
  status: "healthy" | "degraded" | "unhealthy";
  details?: Record<string, unknown>;
  error?: string;
}

interface SystemHealth {
  status: "healthy" | "degraded" | "unhealthy";
  timestamp: number;
  components: ComponentHealth[];
  summary: {
    healthy: number;
    degraded: number;
    unhealthy: number;
  };
}

export async function aggregateSystemHealth(ctx: QueryCtx): Promise<SystemHealth> {
  const components = await Promise.all([
    checkEventStoreHealth(ctx),
    checkProjectionsHealth(ctx),
    checkWorkpoolHealth(ctx),
    checkDLQHealth(ctx),
  ]);

  const summary = {
    healthy: components.filter((c) => c.status === "healthy").length,
    degraded: components.filter((c) => c.status === "degraded").length,
    unhealthy: components.filter((c) => c.status === "unhealthy").length,
  };

  const status =
    summary.unhealthy > 0 ? "unhealthy" : summary.degraded > 0 ? "degraded" : "healthy";

  return { status, timestamp: Date.now(), components, summary };
}
```

_Verified by: All components healthy yields healthy system, Single unhealthy component makes system unhealthy, Degraded component yields degraded system_

### 📋 Production Hardening

| Property       | Value                                            |
| -------------- | ------------------------------------------------ |
| Status         | planned                                          |
| Effort         | 3w                                               |
| Business Value | operational reliability and system observability |
| Dependencies   | ReactiveProjections, DurableFunctionAdapters     |

**Problem:** Structured logging (Phase 13) exists but no metrics collection, distributed tracing,
or admin tooling for production operations. Teams cannot monitor system health, trace event flows,
or perform operational tasks like projection rebuilds without direct database access.

**Solution:** Comprehensive production-ready infrastructure:

- **Metrics collection** - System health, throughput, latency tracking via Log Streams
- **Distributed tracing** - Event flow visualization with correlation IDs and trace context
- **Health checks** - Kubernetes readiness/liveness probes via httpAction
- **Circuit breakers** - Fault isolation and graceful degradation for external dependencies
- **Admin tooling** - Projection rebuilds, dead letter queue management, diagnostics
- **Durable function integration** - Reliable execution with Action Retrier, Workpool coordination

**Why It Matters for Convex-Native ES:**
| Benefit | How |
| Production visibility | Log Streams integration for metrics export to Prometheus/Datadog |
| Proactive monitoring | Projection lag and event throughput dashboards |
| Fast incident response | Health endpoints and circuit breakers for graceful degradation |
| Operational efficiency | Admin tools for common tasks (rebuild projections, manage DLQ) |

**Note:** This is Phase 18b (WIP). Phase 18a (DurableFunctionAdapters) covers rate limiting
adapter and DCB conflict retry patterns. This spec will be further refined and may be split
into additional focused specs.

#### Acceptance Criteria

**Projection lag is tracked**

- Given a projection with checkpoint at position 100
- And the latest event is at position 150
- When metrics are collected
- Then projection.lag_events should be 50
- And the metric should include projection name label

**Metrics collection handles missing checkpoints**

- Given a projection without a checkpoint entry
- When metrics are collected
- Then projection.lag_events should default to current global position
- And a warning should be logged

**Trace spans command-to-projection flow**

- Given a SubmitOrder command with trace context
- When the command is processed
- And OrderSubmitted event is published
- And projection is updated
- Then all log entries should share the same trace ID
- And logs should show parent-child relationships via spanId

**Missing trace context uses default**

- Given a command without trace context
- When the command is processed
- Then a new trace ID should be generated
- And all downstream operations should use the generated trace

**Readiness probe checks dependencies**

- Given the health endpoint is configured
- When event store is reachable
- And projections are within lag threshold
- Then /health/ready should return 200
- And response body should include component statuses

**Unhealthy dependency fails readiness**

- Given event store is unreachable
- When /health/ready is called
- Then response should be 503
- And response body should identify failed component

**Liveness probe always succeeds**

- Given the health endpoint is configured
- When /health/live is called
- Then response should be 200
- And no dependency checks should be performed

**Workpool backlog fails readiness**

- Given the health endpoint is configured
- And workpool maxParallelism is 10
- And workpool queue depth is 25
- When /health/ready is called
- Then response should be 503
- And response body should identify "workpool_backlog" as degraded
- And suggested action should be "reduce traffic or scale"

**Circuit opens after repeated failures**

- Given a circuit breaker with threshold 5
- When 5 consecutive failures occur
- Then circuit state should be "OPEN"
- And subsequent calls should fail fast with "CIRCUIT_OPEN"

**Circuit transitions to half-open after timeout**

- Given a circuit in "OPEN" state
- When the reset timeout expires (via scheduled function)
- Then circuit state should be "HALF_OPEN"
- And one test request should be allowed through

**Successful half-open request closes circuit**

- Given a circuit in "HALF_OPEN" state
- When a request succeeds
- Then circuit state should be "CLOSED"
- And normal traffic should resume

**Failed half-open request reopens circuit**

- Given a circuit in "HALF_OPEN" state
- When a request fails
- Then circuit state should return to "OPEN"
- And timeout timer should reset

**Projection rebuild re-processes events**

- Given a corrupted projection at position 500
- When admin triggers rebuild from position 0
- Then checkpoint should reset to position 0
- And projection status should be "rebuilding"
- And workpool should re-process all events

**Dead letter retry re-enqueues event**

- Given a dead letter with status "pending"
- When admin retries the dead letter
- Then dead letter status should be "retrying"
- And event should be re-enqueued to workpool

**Event flow trace returns full history**

- Given events with correlation ID "corr-123"
- When admin requests event flow trace
- Then response should include command, events, and projection updates
- And entries should be ordered by timestamp

**Durable function run diagnostics**

- Given an Action Retrier run with ID "run-abc123"
- When admin requests durable function run status
- Then response should include run state (pending, running, completed, failed)
- And response should include attempt count and last error if failed
- And response should include associated context (eventId, projectionName, etc.)

**Circuit breaker uses action retrier for half-open probe**

- Given a circuit breaker "payment-api" in "HALF_OPEN" state
- When a test request is initiated
- Then action retrier should execute with maxFailures=0
- And circuit state should update to "CLOSED" on success

**Failed half-open probe reopens circuit via action retrier**

- Given a circuit breaker "payment-api" in "HALF_OPEN" state
- When the probe action fails
- Then onCircuitProbeComplete should transition to "OPEN"
- And timeout should be rescheduled for next half-open transition

**Dead letter retry uses action retrier for external calls**

- Given a dead letter with status "pending" and eventId "evt-123"
- When admin triggers retry
- Then action retrier should execute processEvent action
- And dead letter status should be "retrying"
- And retryRunId should track the action run

**Failed DLQ retry returns to pending status**

- Given a dead letter in "retrying" status
- When action retrier exhausts all retry attempts
- Then onDLQRetryComplete should update status to "pending"
- And lastError should contain the failure reason
- And item should be available for manual review

**Durable function calls propagate trace context**

- Given an operation with traceContext { traceId: "trace-abc", spanId: "span-001" }
- When action retrier executes the operation
- Then the operation args should include traceContext
- And retry attempts should preserve the same traceId
- And logs from retries should be correlatable via traceId

#### Business Rules

**Metrics track system health indicators**

Projection lag, event throughput, command latency, and DLQ size are the core metrics.
Metrics are collected as structured JSON for export via Convex Log Streams.

    | Metric | Labels | Unit | Purpose |
    | projection.lag_events | projection_name, partition_key | count | Projection processing delay |
    | events.throughput | stream_type | events/min | Event store write rate |
    | command.latency_ms | command_type, status | milliseconds | Command processing time |
    | dlq.size | projection_name | count | Failed events awaiting retry |
    | circuit_breaker.state | breaker_name | enum | Current circuit state |
    | retrier.attempts | operation_name, status | count | Retry attempts per operation |
    | workpool.queue_depth | pool_name | count | Pending items awaiting processing |
    | workflow.step_failures | workflow_name, step | count | Saga compensation triggers |

    **Convex Constraint:** No direct OpenTelemetry SDK - use Log Streams (Axiom/Datadog) with
    structured JSON logs at REPORT level for metrics export.

    **Current State (logging only):**

```typescript
// Current: Structured logging without metrics aggregation
logger.debug("OrderConfirmed event processed", { orderId, timestamp });
```

**Target State (metrics collection):**

```typescript
// Target: Metrics collection with Log Streams export
const metrics = createMetricsCollector(ctx, {
  projectionNames: ["orderSummaries", "inventoryLevels"],
});

// Collect and export as REPORT-level JSON
const systemMetrics = await metrics.collect();
logger.report("System metrics", systemMetrics);
// Output: {"projectionLag":{"orderSummaries":0},"eventThroughput":{"eventsPerMinute":42},...}
```

_Verified by: Projection lag is tracked, Metrics collection handles missing checkpoints_

**Distributed tracing visualizes event flow**

Trace context propagates from command through events to projections using correlation IDs.
Within Convex, this is conceptual tracing via metadata - external visualization via Log Streams.

    **Convex Constraint:** No OpenTelemetry spans inside Convex functions. Instead, correlate
    logs via correlationId and traceContext metadata, then export to Jaeger/Zipkin via Log Streams.

    **Current State (correlation IDs only):**

```typescript
// Current: Commands have correlationId but no trace context
const result = await orchestrator.dispatch({
  commandType: "SubmitOrder",
  payload: { items },
  correlationId: "corr-123",
});
```

**Target State (full trace context):**

```typescript
// Target: Trace context propagates through the flow
const result = await orchestrator.dispatch({
  commandType: "SubmitOrder",
  payload: { items },
  correlationId: "corr-123",
  traceContext: {
    traceId: "trace-abc",
    spanId: "span-001",
    parentSpanId: undefined,
  },
});

// Events carry trace context in metadata
// Projections log with same traceId
// Log Streams export enables Jaeger visualization
```

_Verified by: Trace spans command-to-projection flow, Missing trace context uses default_

**Health endpoints support Kubernetes probes**

/health/ready for readiness (dependencies OK), /health/live for liveness (process running).
Implemented via Convex httpAction for HTTP access.

    | Endpoint | Purpose | Checks | Response |
    | /health/ready | Readiness probe | Event store, projections, workpool depth | 200 OK or 503 |
    | /health/live | Liveness probe | Process alive | 200 OK always |

    **Workpool Depth Check:** Readiness fails if queue depth exceeds threshold (default: maxParallelism * 2).
    This detects backpressure and allows orchestrators to route traffic elsewhere during overload.

    **Implementation via httpAction:**

```typescript
// convex/http.ts
import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";

const http = httpRouter();

http.route({
  path: "/health/ready",
  method: "GET",
  handler: httpAction(async (ctx) => {
    const health = await ctx.runQuery(internal.health.checkReadiness);
    return new Response(JSON.stringify(health), {
      status: health.status === "healthy" ? 200 : 503,
      headers: { "Content-Type": "application/json" },
    });
  }),
});

export default http;
```

_Verified by: Readiness probe checks dependencies, Unhealthy dependency fails readiness, Liveness probe always succeeds, Workpool backlog fails readiness_

**Circuit breakers prevent cascade failures**

Open circuit after threshold failures, half-open for recovery testing.
State persists in Convex table (not memory) for durability across function invocations.

    | State | Behavior | Transition |
    | CLOSED | Normal operation, track failures | → OPEN after threshold failures |
    | OPEN | Fail fast, no requests | → HALF_OPEN after timeout |
    | HALF_OPEN | Allow one test request | → CLOSED on success, → OPEN on failure |

    **Convex Constraint:** No in-memory state across function invocations. Circuit breaker
    state must persist in a Convex table with scheduled function for timeout transitions.

    **Timeout Implementation:** Use `ctx.scheduler.runAfter()` for one-off timeout transitions:

```typescript
// When circuit opens, schedule half-open check
if (newState === "OPEN") {
  await ctx.scheduler.runAfter(
    config.resetTimeoutMs,
    internal.monitoring.circuitBreakers.checkHalfOpen,
    { breakerName, openedAt: Date.now() }
  );
}
```

Note: Use one-off scheduler, not @convex-dev/crons, because timeout is a single
transition per circuit-open event.

    **Implementation pattern:**

```typescript
// Pure state machine (no I/O)
function computeNextState(
  current: CircuitBreakerState,
  event: "success" | "failure" | "timeout",
  config: CircuitBreakerConfig,
  now: number
): CircuitBreakerState;

// App-level wrapper
async function withCircuitBreaker<T>(
  ctx: MutationCtx,
  name: string,
  operation: () => Promise<T>,
  config?: CircuitBreakerConfig
): Promise<T> {
  const state = await loadCircuitState(ctx, name);
  if (state.state === "open") {
    throw new CircuitBreakerOpenError(name);
  }
  // ... execute and update state
}
```

_Verified by: Circuit opens after repeated failures, Circuit transitions to half-open after timeout, Successful half-open request closes circuit, Failed half-open request reopens circuit_

**Admin tooling enables operational tasks**

Projection rebuild, DLQ inspection/retry, event flow tracing, system diagnostics.
Build on existing patterns from sagas/admin.ts and projections/deadLetters.ts.

    | Operation | Endpoint | Purpose |
    | Trigger rebuild | admin.projections.triggerRebuild | Re-process events from position |
    | Cancel rebuild | admin.projections.cancelRebuild | Stop in-progress rebuild |
    | Rebuild status | admin.projections.getRebuildStatus | Check rebuild progress |
    | DLQ list | admin.deadLetters.getPending | View failed events |
    | DLQ retry | admin.deadLetters.retryOne | Retry single dead letter |
    | DLQ bulk retry | admin.deadLetters.retryAll | Retry all with status |
    | Event trace | admin.diagnostics.getEventFlowTrace | Trace event by correlationId |
    | System diagnostics | admin.diagnostics.getSystemState | Full system health snapshot |
    | Durable function run | admin.diagnostics.getDurableFunctionRun | Query Retrier/Workflow run by ID |

    **Projection Rebuild Pattern:**

```typescript
// admin/projections.ts
export const triggerRebuild = internalMutation({
  args: {
    projectionName: v.string(),
    fromGlobalPosition: v.optional(v.number()),
  },
  handler: async (ctx, { projectionName, fromGlobalPosition }) => {
    // Reset checkpoint to target position
    await ctx.db.patch(checkpoint._id, {
      lastGlobalPosition: fromGlobalPosition ?? 0,
      status: "rebuilding",
    });

    // Workpool will pick up and re-process events
    return { rebuildId: generateId(), startedAt: Date.now() };
  },
});
```

**DLQ Population via Workpool onComplete:**

```typescript
// Projection processing with onComplete for automatic DLQ population
await projectionPool.enqueue(
  ctx,
  internal.projections.process,
  { event },
  {
    key: event.streamId, // Partition for entity ordering
    onComplete: internal.projections.handleResult,
    context: { eventId: event.id, projectionName },
  }
);

// Dead letter handler (reference: deadLetters.ts)
export const handleResult = internalMutation({
  args: vOnCompleteArgs(v.object({ eventId: v.string(), projectionName: v.string() })),
  handler: async (ctx, { result, context }) => {
    if (result.kind === "failed") {
      await ctx.db.insert("deadLetters", {
        ...context,
        error: result.error,
        status: "pending",
        timestamp: Date.now(),
      });
    }
  },
});
```

Note: This pattern is already implemented in `examples/order-management/convex/projections/deadLetters.ts`.
The onComplete handler ensures failed projections are automatically recorded for later retry.

_Verified by: Projection rebuild re-processes events, Dead letter retry re-enqueues event, Event flow trace returns full history, Durable function run diagnostics_

**Durable functions provide reliable execution patterns**

Production systems use @convex-dev durable function components for reliability.
Each component serves a specific purpose - choosing the right one is critical.

    | Component | Use Case | Key Feature | Platform Integration Point |
    | Action Retrier | External API calls | Exponential backoff + onComplete | Circuit breaker half-open probe |
    | Workpool | Projection processing | Parallelism + partition ordering | DLQ processing |
    | Workflow | Multi-step sagas | Compensation + awaitEvent | Cross-BC coordination |

    **See also:** Phase 18a (DurableFunctionAdapters) covers rate limiting adapter and DCB conflict retry.

    **Trace Context Propagation (REQUIRED):** All durable function calls MUST include
    `traceContext` in args to ensure distributed tracing continuity through retries.
    Without this, trace chains break at retry boundaries and observability is lost.

    **Component Selection Decision Tree:**

```text
External API call with retry? ──────────► Action Retrier
            │
           No
            ▼
    Projection/batch processing? ──────────► Workpool (parallelism + partition keys)
            │
           No
            ▼
    Multi-step with compensation? ─────────► Workflow (sagas)
```

Note: For rate limiting and DCB conflict retry, see Phase 18a (DurableFunctionAdapters).
Action Retrier only supports actions, not mutations.

    **Circuit Breaker + Action Retrier Integration:**

```typescript
// withCircuitBreaker.ts - Enhanced pattern with action retrier
import { ActionRetrier } from "@convex-dev/action-retrier";
import { retrier } from "./index";

export async function withCircuitBreaker<T>(
  ctx: ActionCtx,
  name: string,
  operation: FunctionReference<"action">,
  args: { traceContext: TraceContext; [key: string]: unknown },
  config?: CircuitBreakerConfig
): Promise<{ runId: string; probeMode?: true } | { error: string; retryAfterMs?: number }> {
  const circuitState = await loadCircuitState(ctx, name);
  const { traceContext, ...rest } = args;

  if (circuitState.state === "open") {
    return { error: `CIRCUIT_OPEN:${name}`, retryAfterMs: circuitState.retryAfterMs };
  }

  if (circuitState.state === "half_open") {
    // Controlled probe - single attempt, no retries
    // IMPORTANT: Always pass traceContext for distributed tracing continuity
    const runId = await retrier.run(
      ctx,
      operation,
      { ...rest, traceContext },
      {
        maxFailures: 0, // No retries for half-open probe
        onComplete: internal.monitoring.onCircuitProbeComplete,
      }
    );
    return { runId, probeMode: true };
  }

  // Closed state - normal operation with configured retries
  // IMPORTANT: Always pass traceContext for distributed tracing continuity
  const runId = await retrier.run(
    ctx,
    operation,
    { ...rest, traceContext },
    {
      maxFailures: config?.maxRetries ?? 3,
      initialBackoffMs: config?.initialBackoffMs ?? 250,
      onComplete: internal.monitoring.onOperationComplete,
    }
  );
  return { runId };
}

// Probe completion handler updates circuit state
export const onCircuitProbeComplete = internalMutation({
  args: { runId: runIdValidator, result: runResultValidator },
  handler: async (ctx, { runId, result }) => {
    const circuit = await findCircuitByProbeRunId(ctx, runId);
    if (!circuit) return;

    if (result.type === "success") {
      await transitionCircuit(ctx, circuit.name, "closed");
    } else {
      await transitionCircuit(ctx, circuit.name, "open");
    }
  },
});
```

**Dead Letter Queue Retry with Action Retrier:**

```typescript
// dlqRetrier.ts - Action retrier for external service DLQ items
export const retryDeadLetter = mutation({
  args: { deadLetterId: v.id("deadLetters") },
  handler: async (ctx, { deadLetterId }) => {
    const deadLetter = await ctx.db.get(deadLetterId);
    if (!deadLetter) throw new Error("Dead letter not found");

    // Use action retrier for external calls with exponential backoff
    // IMPORTANT: Propagate traceContext to maintain distributed tracing through retries
    const runId = await retrier.run(
      ctx,
      internal.external.processEvent,
      {
        eventId: deadLetter.eventId,
        payload: deadLetter.payload,
        traceContext: deadLetter.traceContext,
      },
      {
        initialBackoffMs: 1000, // Start cautiously
        base: 2,
        maxFailures: 5, // More attempts for manual retry
        onComplete: internal.admin.onDLQRetryComplete,
      }
    );

    await ctx.db.patch(deadLetterId, {
      status: "retrying",
      retryRunId: runId,
      lastRetryAt: Date.now(),
      retryCount: (deadLetter.retryCount ?? 0) + 1,
    });

    return { runId };
  },
});

export const onDLQRetryComplete = internalMutation({
  args: { runId: runIdValidator, result: runResultValidator },
  handler: async (ctx, { runId, result }) => {
    const deadLetter = await ctx.db
      .query("deadLetters")
      .withIndex("by_retryRunId", (q) => q.eq("retryRunId", runId))
      .unique();

    if (!deadLetter) return;

    if (result.type === "success") {
      await ctx.db.patch(deadLetter._id, {
        status: "resolved",
        resolvedAt: Date.now(),
      });
    } else if (result.type === "failed") {
      await ctx.db.patch(deadLetter._id, {
        status: "pending", // Back to pending for manual review
        lastError: result.error,
        failedAt: Date.now(),
      });
    }
  },
});
```

_Verified by: Circuit breaker uses action retrier for half-open probe, Failed half-open probe reopens circuit via action retrier, Dead letter retry uses action retrier for external calls, Failed DLQ retry returns to pending status, Durable function calls propagate trace context_

---

[← Back to Remaining Work](../REMAINING-WORK.md)
