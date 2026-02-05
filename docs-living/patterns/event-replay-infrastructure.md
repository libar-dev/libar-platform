# ✅ Event Replay Infrastructure

**Purpose:** Detailed documentation for the Event Replay Infrastructure pattern

---

## Overview

| Property | Value     |
| -------- | --------- |
| Status   | completed |
| Category | DDD       |
| Phase    | 18        |

## Description

**Problem:** When projections become corrupted, require schema migration, or drift from
the Event Store due to bugs, there is no infrastructure to replay events and rebuild them.
Manual intervention requires direct database access and risks data inconsistency. Failed
rebuilds cannot resume from where they left off, wasting compute and time.

**Solution:** Checkpoint-based replay system with durable Workpool processing:

- **Replay checkpoints** - Track progress per projection with resume capability
- **Dedicated Workpool** - Low-priority pool (maxParallelism: 5) preserves live operation budget
- **Chunked processing** - Events processed in batches to avoid timeout/memory limits
- **Admin mutations** - Trigger, cancel, and monitor rebuilds via admin API
- **Atomic scheduling** - Next chunk scheduled atomically with checkpoint update

**Why It Matters for Convex-Native ES:**
| Benefit | How |
| Projection recovery | Rebuild corrupted projections from Event Store source of truth |
| Schema migration | Replay events through new projection logic after schema changes |
| Resume capability | Failed rebuilds continue from last checkpoint, not from scratch |
| Budget preservation | Dedicated low-priority Workpool doesn't starve live projections |
| Operational visibility | Real-time progress tracking for long-running rebuilds |

**Relationship to Existing Patterns:**

- Uses `withCheckpoint` from EventStoreFoundation for idempotent chunk processing
- Uses Workpool from DurableFunctionAdapters for durable execution
- Integrates with projection registry from ProjectionCategories for rebuild ordering
- Admin endpoints follow patterns from existing saga admin tooling

## Dependencies

- Depends on: EventStoreFoundation
- Depends on: DurableFunctionAdapters
- Depends on: EventStoreDurability

- Enables: SchemaMigration
- Enables: ProjectionRecovery

## Implementations

Files that implement this pattern:

- [`progress.ts`](../../packages/platform-core/src/projections/replay/progress.ts) - Progress calculation utilities for replay operations.
- [`types.ts`](../../packages/platform-core/src/projections/replay/types.ts) - Types for event replay and projection rebuilding.

## Acceptance Criteria

**Replay resumes after failure**

- Given a replay was running for "orderSummary" projection
- And the replay processed events up to globalPosition 5000
- And 5 chunks were completed successfully
- And the replay failed due to a transient error
- When the replay is restarted for the same projection
- Then processing should resume from globalPosition 5001
- And events 1-5000 should not be reprocessed
- And eventsProcessed should start at 5000

**Checkpoint updates atomically with chunk completion**

- Given a replay is processing chunk 5 for "orderSummary"
- And the chunk contains events from position 401 to 500
- When all 100 events in the chunk are processed successfully
- Then checkpoint lastPosition should be 500
- And eventsProcessed should increment by 100
- And chunksCompleted should be 5
- And the next chunk should be scheduled atomically

**Replay handles empty event range**

- Given a replay is triggered for "orderSummary" from position 1000
- And the Event Store only has events up to position 500
- When the replay starts
- Then status should be "completed" immediately
- And eventsProcessed should be 0
- And no chunks should be scheduled

**Replay does not starve live projections**

- Given 1000 events are being replayed for "orderSummary"
- And the eventReplayPool has maxParallelism 5
- And the projectionPool has maxParallelism 10
- When 10 new events arrive from live commands
- Then live projection updates should complete within 500ms
- And replay should continue in background at lower throughput

**Only one replay per projection**

- Given a replay is running for "orderSummary" with replayId "replay-001"
- When a second replay is triggered for "orderSummary"
- Then the second trigger should return error "REPLAY_ALREADY_ACTIVE"
- And the original replay should continue unaffected

**Different projections can rebuild concurrently**

- Given a replay is running for "orderSummary"
- When a replay is triggered for "productCatalog"
- Then both replays should run concurrently
- And each should have its own checkpoint
- And partition keys should be different

**Chunk processes correct number of events**

- Given a replay for "orderSummary" with chunkSize 100
- And the Event Store has 250 events
- When chunk 1 is processed
- Then exactly 100 events should be processed
- And checkpoint lastPosition should be event 100's globalPosition
- And chunk 2 should be scheduled automatically

**Final chunk handles remainder**

- Given a replay for "orderSummary" with chunkSize 100
- And the Event Store has 250 events
- When chunk 3 is processed
- Then exactly 50 events should be processed
- And status should be "completed"
- And no further chunks should be scheduled

**Chunk size respects projection complexity**

- Given projection "orderWithInventory" is marked as "complex"
- When a replay is triggered with default settings
- Then chunkSize should be 25
- And processing should complete without timeout

**Query replay progress**

- Given a replay is running for "orderSummary"
- And total events to process is 10000
- And 4500 events have been processed
- And 45 chunks have been completed
- When querying replay status
- Then response should include:
- And estimatedRemainingMs should be calculated based on throughput

| Field           | Value   |
| --------------- | ------- |
| status          | running |
| eventsProcessed | 4500    |
| totalEvents     | 10000   |
| percentComplete | 45.0    |
| chunksCompleted | 45      |

**List all active rebuilds**

- Given replays are running for "orderSummary" and "productCatalog"
- When listing active rebuilds
- Then response should include 2 entries
- And each entry should have progress information

**Progress handles completed replay**

- Given a replay completed for "orderSummary"
- When querying replay status
- Then status should be "completed"
- And percentComplete should be 100
- And completedAt should be set
- And estimatedRemainingMs should be undefined

**Trigger rebuild creates checkpoint and schedules first chunk**

- Given projection "orderSummary" exists
- And no active replay exists for "orderSummary"
- When admin triggers rebuild from position 0
- Then a replayCheckpoints record should be created
- And status should be "running"
- And first chunk should be scheduled via eventReplayPool
- And response should include replayId and totalEvents

**Cancel rebuild stops processing**

- Given a replay is running for "orderSummary" with replayId "replay-001"
- When admin cancels the rebuild
- Then status should be "cancelled"
- And no new chunks should be scheduled
- And response should include eventsProcessedBeforeCancel

**Cannot trigger duplicate rebuild**

- Given a replay is running for "orderSummary"
- When admin triggers another rebuild for "orderSummary"
- Then response should include error "REPLAY_ALREADY_ACTIVE"
- And existing replay should continue unaffected

## Business Rules

**Replay must resume from last successful checkpoint**

**Invariant:** A replay operation must never reprocess events that have already been
successfully applied to the projection—resume from last checkpoint, not from scratch.

    **Rationale:** Replaying millions of events wastes compute, risks projection corruption
    if handlers aren't idempotent, and extends recovery time. Checkpoints enable reliable
    long-running rebuilds that survive transient failures.

    **API:** See `@libar-dev/platform-core/src/projections/replay/types.ts`

    **Verified by:** Replay resumes after failure, Checkpoint updates atomically with
    chunk completion, Replay handles empty event range

    Replay state is persisted in the `replayCheckpoints` table. If a replay fails or is
    interrupted, it resumes from the last successfully processed globalPosition, not
    from the beginning. This saves compute and enables reliable long-running rebuilds.

    **Checkpoint Schema:**
    | Field | Type | Purpose |
    | replayId | string | Unique identifier for this replay operation |
    | projection | string | Target projection name |
    | lastPosition | number | Last successfully processed globalPosition |
    | targetPosition | number (optional) | End position (null = current max) |
    | status | enum | running, paused, completed, failed, cancelled |
    | eventsProcessed | number | Total events processed so far |
    | chunksCompleted | number | Number of chunks completed |
    | error | string (optional) | Error message if failed |
    | startedAt | number | Timestamp when replay started |
    | updatedAt | number | Last checkpoint update timestamp |
    | completedAt | number (optional) | Timestamp when completed |

    **Current State (no replay capability):**

```typescript
// Current: No way to rebuild a projection
// If orderSummaries gets corrupted, only option is:
// 1. Delete all records manually
// 2. Hope live events eventually rebuild it
// 3. Or write ad-hoc scripts with no progress tracking
```

**Target State (checkpoint-based replay):**

```typescript
// Target: Durable replay with progress tracking
const { replayId } = await ctx.runMutation(admin.projections.triggerRebuild, {
  projectionName: "orderSummaries",
  fromGlobalPosition: 0, // Start from beginning
});

// Check progress
const status = await ctx.runQuery(admin.projections.getRebuildStatus, { replayId });
// { status: "running", eventsProcessed: 4500, totalEvents: 10000, percentComplete: 45 }

// If interrupted, restart continues from checkpoint
// eventsProcessed will be 4500, not 0
```

_Verified by: Replay resumes after failure, Checkpoint updates atomically with chunk completion, Replay handles empty event range_

**Replay uses dedicated low-priority Workpool**

**Invariant:** Replay operations must not starve live projection updates—dedicated
low-priority pool with maxParallelism ≤ 50% of projectionPool.

    **Rationale:** Live user-facing projections must maintain low latency. Replay is
    background recovery work that can tolerate higher latency. Separate Workpool with
    lower parallelism ensures budget preservation.

    **API:** See `examples/order-management/convex/infrastructure.ts` for Workpool config

    **Verified by:** Replay does not starve live projections, Only one replay per
    projection, Different projections can rebuild concurrently

    Event replay is background work that should not compete with live projection updates.
    A dedicated `eventReplayPool` with low parallelism (5) ensures:
    - Live projections maintain priority (projectionPool: 10)
    - Replay doesn't exhaust the action/mutation budget
    - Backpressure is controlled via Workpool queue depth

    **Workpool Configuration:**
    | Parameter | Value | Rationale |
    | maxParallelism | 5 | Low priority, preserves 50%+ budget for live ops |
    | retryActionsByDefault | false | Replay mutations, not actions |
    | defaultRetryBehavior.maxAttempts | 5 | More retries for background work |
    | defaultRetryBehavior.initialBackoffMs | 1000 | Longer backoff for batch work |
    | logLevel | INFO | Production observability |

    **Partition Key Strategy:**
    Replay uses partition key `replay:{projectionName}` to ensure:
    - Only one active replay per projection (no concurrent rebuilds)
    - Chunks for same projection execute in FIFO order
    - Different projections can rebuild in parallel

    **Target Implementation:**

```typescript
// infrastructure.ts
export const eventReplayPool = new Workpool(components.eventReplayPool, {
  maxParallelism: 5, // Low priority
  defaultRetryBehavior: {
    maxAttempts: 5,
    initialBackoffMs: 1000,
    base: 2,
  },
  logLevel: "INFO",
});

// In triggerRebuild mutation
await eventReplayPool.enqueueMutation(
  ctx,
  internal.admin.projections.processReplayChunk,
  { replayId, projectionName, fromPosition: 0, chunkSize: 100 },
  { key: `replay:${projectionName}` } // Partition key
);
```

_Verified by: Replay does not starve live projections, Only one replay per projection, Different projections can rebuild concurrently_

**Events are processed in configurable chunks**

**Invariant:** Each replay chunk must complete within Convex mutation timeout limits
(10s)—chunk size must be configurable based on projection complexity.

    **Rationale:** Large event stores have millions of events. Processing all in one
    mutation would timeout. Chunked processing with complexity-aware sizing ensures
    reliable completion: simple projections use 100, complex ones use 10-25.

    **API:** See `processReplayChunk` in `examples/order-management/convex/admin/projections.ts`

    **Verified by:** Chunk processes correct number of events, Final chunk handles
    remainder, Chunk size respects projection complexity

    Processing all events in a single mutation would timeout for large event stores.
    Chunked processing:
    - Fetches N events per chunk (default: 100)
    - Applies projection logic to each event
    - Updates checkpoint atomically
    - Schedules next chunk if more events exist

    **Chunk Size Guidelines:**
    | Projection Complexity | Chunk Size | Rationale |
    | Simple (single table update) | 100 | Fast processing, high throughput |
    | Medium (multiple tables) | 50 | More writes per event |
    | Complex (cross-context joins) | 25 | Avoid timeout, more I/O |
    | Very complex (external lookups) | 10 | Maximum safety margin |

    **Chunk Processing Flow:**

```text
processReplayChunk(replayId, projectionName, fromPosition, chunkSize)
        │
        ├─► Fetch events [fromPosition, fromPosition + chunkSize)
        │
        ├─► For each event:
        │       └─► Apply projection handler (same as live)
        │
        ├─► Update checkpoint (atomic)
        │       ├─► lastPosition = events[last].globalPosition
        │       ├─► eventsProcessed += events.length
        │       └─► chunksCompleted += 1
        │
        └─► Schedule next chunk (atomic with checkpoint)
                └─► If events.length === chunkSize, more events exist
```

**Target Implementation:**

```typescript
export const processReplayChunk = internalMutation({
  args: {
    replayId: v.id("replayCheckpoints"),
    projectionName: v.string(),
    fromPosition: v.number(),
    chunkSize: v.number(),
  },
  handler: async (ctx, args) => {
    const { replayId, projectionName, fromPosition, chunkSize } = args;

    // 1. Fetch events from Event Store
    const events = await eventStore.readFromPosition(ctx, {
      fromPosition,
      limit: chunkSize,
    });

    if (events.length === 0) {
      // Replay complete
      await ctx.db.patch(replayId, {
        status: "completed",
        completedAt: Date.now(),
      });
      return { status: "completed" };
    }

    // 2. Apply projection logic to each event
    const handler = getProjectionHandler(projectionName);
    for (const event of events) {
      await handler(ctx, event);
    }

    // 3. Update checkpoint
    const lastEvent = events[events.length - 1];
    const checkpoint = await ctx.db.get(replayId);
    await ctx.db.patch(replayId, {
      lastPosition: lastEvent.globalPosition,
      eventsProcessed: (checkpoint?.eventsProcessed ?? 0) + events.length,
      chunksCompleted: (checkpoint?.chunksCompleted ?? 0) + 1,
      updatedAt: Date.now(),
    });

    // 4. Schedule next chunk (atomic with checkpoint update)
    if (events.length === chunkSize) {
      await eventReplayPool.enqueueMutation(
        ctx,
        internal.admin.projections.processReplayChunk,
        {
          replayId,
          projectionName,
          fromPosition: lastEvent.globalPosition + 1,
          chunkSize,
        },
        { key: `replay:${projectionName}` }
      );
    } else {
      // No more events
      await ctx.db.patch(replayId, {
        status: "completed",
        completedAt: Date.now(),
      });
    }

    return { status: "processing", eventsProcessed: events.length };
  },
});
```

_Verified by: Chunk processes correct number of events, Final chunk handles remainder, Chunk size respects projection complexity_

**Replay progress is queryable in real-time**

**Invariant:** Operations teams must be able to query replay progress at any time—
status, percentage complete, and estimated remaining time.

    **Rationale:** Long-running rebuilds (hours for large projections) need visibility.
    Without progress tracking, operators cannot estimate completion, detect stuck
    replays, or plan maintenance windows.

    **API:** See `@libar-dev/platform-core/src/projections/replay/progress.ts`

    **Verified by:** Query replay progress, List all active rebuilds, Progress handles
    completed replay

    Operations teams need visibility into long-running rebuilds. Progress queries provide:
    - Current status (running, paused, completed, failed, cancelled)
    - Events processed vs total (with percentage)
    - Estimated time remaining (based on throughput)
    - Error details if failed

    **Progress Calculation:**

```typescript
interface ReplayProgress {
  replayId: string;
  projectionName: string;
  status: "running" | "paused" | "completed" | "failed" | "cancelled";
  eventsProcessed: number;
  totalEvents: number; // Current max globalPosition - startPosition
  percentComplete: number;
  chunksCompleted: number;
  startedAt: number;
  updatedAt: number;
  completedAt?: number;
  estimatedRemainingMs?: number;
  error?: string;
}

// Estimated remaining calculation
const elapsedMs = Date.now() - startedAt;
const eventsPerMs = eventsProcessed / elapsedMs;
const remainingEvents = totalEvents - eventsProcessed;
const estimatedRemainingMs = remainingEvents / eventsPerMs;
```

_Verified by: Query replay progress, List all active rebuilds, Progress handles completed replay_

**Admin mutations enable operational control**

**Invariant:** Replay operations must only be triggerable via internal mutations—
no public API exposure for admin operations.

    **Rationale:** Replay can be expensive (compute, time) and disruptive if misused.
    Internal mutations ensure only authorized code paths can trigger rebuilds,
    preventing accidental or malicious replay triggering.

    **API:** See `examples/order-management/convex/admin/projections.ts`

    **Verified by:** Trigger rebuild creates checkpoint and schedules first chunk,
    Cancel rebuild stops processing, Cannot trigger duplicate rebuild

    Operations teams need to trigger, monitor, cancel, and manage rebuilds.
    All admin operations use internal mutations for security.

    **Admin Operations:**
    | Operation | Mutation/Query | Purpose |
    | Trigger rebuild | triggerRebuild | Start new rebuild from position |
    | Cancel rebuild | cancelRebuild | Stop in-progress rebuild |
    | Get status | getRebuildStatus | Query single rebuild progress |
    | List active | listActiveRebuilds | Query all running rebuilds |
    | Pause rebuild | pauseRebuild | Temporarily pause (future) |
    | Resume rebuild | resumeRebuild | Resume paused rebuild (future) |

    **Target Implementation:**

```typescript
// admin/projections.ts
export const triggerRebuild = internalMutation({
  args: {
    projectionName: v.string(),
    fromGlobalPosition: v.optional(v.number()),
    chunkSize: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { projectionName, fromGlobalPosition = 0, chunkSize = 100 } = args;

    // Check no active replay exists
    const existing = await ctx.db
      .query("replayCheckpoints")
      .withIndex("by_projection_status", (q) =>
        q.eq("projection", projectionName).eq("status", "running")
      )
      .first();

    if (existing) {
      return { error: "REPLAY_ALREADY_ACTIVE", existingReplayId: existing._id };
    }

    // Get total events for progress calculation
    const maxPosition = await eventStore.getMaxGlobalPosition(ctx);
    const totalEvents = maxPosition - fromGlobalPosition;

    // Create checkpoint
    const replayId = await ctx.db.insert("replayCheckpoints", {
      projection: projectionName,
      lastPosition: fromGlobalPosition,
      targetPosition: maxPosition,
      status: "running",
      eventsProcessed: 0,
      chunksCompleted: 0,
      startedAt: Date.now(),
      updatedAt: Date.now(),
    });

    // Schedule first chunk
    await eventReplayPool.enqueueMutation(
      ctx,
      internal.admin.projections.processReplayChunk,
      { replayId, projectionName, fromPosition: fromGlobalPosition, chunkSize },
      { key: `replay:${projectionName}` }
    );

    return { replayId, totalEvents };
  },
});

export const cancelRebuild = internalMutation({
  args: { replayId: v.id("replayCheckpoints") },
  handler: async (ctx, { replayId }) => {
    const checkpoint = await ctx.db.get(replayId);
    if (!checkpoint) {
      return { error: "REPLAY_NOT_FOUND" };
    }
    if (checkpoint.status !== "running") {
      return { error: "REPLAY_NOT_RUNNING", currentStatus: checkpoint.status };
    }

    await ctx.db.patch(replayId, {
      status: "cancelled",
      updatedAt: Date.now(),
    });

    // Note: In-flight chunks will complete but no new chunks scheduled
    // because status check happens at chunk start

    return { success: true, eventsProcessedBeforeCancel: checkpoint.eventsProcessed };
  },
});
```

_Verified by: Trigger rebuild creates checkpoint and schedules first chunk, Cancel rebuild stops processing, Cannot trigger duplicate rebuild_

---

[← Back to Pattern Registry](../PATTERNS.md)
