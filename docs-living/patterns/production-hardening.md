# 📋 Production Hardening

**Purpose:** Detailed documentation for the Production Hardening pattern

---

## Overview

| Property | Value   |
| -------- | ------- |
| Status   | planned |
| Category | DDD     |
| Phase    | 18      |

## Description

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

## Dependencies

- Depends on: ReactiveProjections
- Depends on: DurableFunctionAdapters

## Acceptance Criteria

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

## Business Rules

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

[← Back to Pattern Registry](../PATTERNS.md)
