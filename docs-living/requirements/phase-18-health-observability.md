# 📋 Health Observability

**Purpose:** Detailed requirements for the Health Observability feature

---

## Overview

| Property       | Value                                     |
| -------------- | ----------------------------------------- |
| Status         | planned                                   |
| Product Area   | Platform                                  |
| Business Value | production monitoring and k8s integration |
| Phase          | 18                                        |

## Description

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

## Acceptance Criteria

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

## Business Rules

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

## Deliverables

- Health check types (pending)
- checkReadiness query (pending)
- checkLiveness query (pending)
- HTTP router with /health/\* routes (pending)
- Metrics types (pending)
- MetricsCollector (pending)
- Projection lag calculator (pending)
- Workpool depth query (pending)
- System health aggregator (pending)

---

[← Back to Product Requirements](../PRODUCT-REQUIREMENTS.md)
