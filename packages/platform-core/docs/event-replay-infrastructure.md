# Event Replay Infrastructure - Architecture

> **Pattern:** Checkpoint-based projection rebuilding
> **Package API:** See [`@libar-dev/platform-core/src/projections/replay`](../../deps/libar-dev-packages/packages/platform/core/src/projections/replay)

---

## Overview

Projections can drift from the event stream due to bugs, schema changes, or failed processing. The Event Replay Infrastructure provides **checkpoint-based resumption** with dedicated low-priority Workpool processing.

| Problem                                 | Impact                              | Solution                      |
| --------------------------------------- | ----------------------------------- | ----------------------------- |
| Projection bug produced incorrect state | Stale/wrong read models             | Rebuild from event history    |
| Schema migration requires reprocessing  | Incompatible projection state       | Full rebuild with new handler |
| Processing failure left gaps            | Missing data in projections         | Resume from last checkpoint   |
| Handler logic changed                   | Historical events need reprocessing | Incremental or full rebuild   |

**Key Characteristics:**

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    EVENT REPLAY INFRASTRUCTURE                          │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  • Checkpoint-based resumption ──► Resume from last successful position  │
│  • Dedicated low-priority pool ──► No impact on live operations         │
│  • Chunked processing ───────────► Memory-efficient large rebuilds      │
│  • Progress visibility ──────────► Monitor rebuild status in real-time  │
│  • Admin operations ─────────────► Trigger, cancel, query rebuilds      │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 1. Checkpoint-Based Resumption

**Location:** `platform-core/src/projections/replay/types.ts`

### The Problem

Large projection rebuilds can take hours. If processing fails partway through, restarting from the beginning wastes time and resources.

### Solution

Track progress via **checkpoints** that store the last successfully processed event position.

### ReplayCheckpoint Schema

```typescript
interface ReplayCheckpoint {
  /** Projection being rebuilt */
  projectionName: string;

  /** Last successfully processed event ID */
  lastEventId: string;

  /** Last successfully processed event timestamp */
  lastEventTimestamp: number;

  /** Total events processed in current run */
  eventsProcessed: number;

  /** When this checkpoint was recorded */
  checkpointedAt: number;

  /** Current rebuild status */
  status: ReplayStatus;

  /** Error message if status is "failed" */
  error?: string;
}

type ReplayStatus =
  | "running" // Actively processing events
  | "paused" // Temporarily stopped (resumable)
  | "completed" // Successfully finished
  | "failed" // Encountered unrecoverable error
  | "cancelled"; // Manually cancelled by admin
```

### Resume Behavior

```
Rebuild starts
    │
    ├─► Check for existing checkpoint
    │       │
    │       ├─► Found → Resume from lastEventId
    │       │
    │       └─► Not found → Start from beginning
    │
    ▼
Process events in chunks
    │
    ├─► After each chunk: Update checkpoint
    │
    ├─► On failure: Record error, status → "failed"
    │
    └─► On completion: status → "completed"
```

### Checkpoint Update Frequency

| Chunk Size   | Checkpoint Frequency | Rationale                              |
| ------------ | -------------------- | -------------------------------------- |
| Small (100)  | Every chunk          | Simple projections, fast processing    |
| Medium (500) | Every chunk          | Balanced throughput                    |
| Large (1000) | Every chunk          | Complex projections, slower processing |

**Note:** Always checkpoint after each chunk to minimize replay on failure.

---

## 2. Dedicated Low-Priority Workpool

### The Problem

Rebuilding projections is CPU-intensive. Running rebuilds through the same Workpool as live operations can degrade user experience.

### Solution

Use a **dedicated Workpool** with lower parallelism for replay operations.

### Configuration

```typescript
// Replay-specific Workpool configuration
const replayWorkpool = new Workpool(components.replayPool, {
  maxParallelism: 5, // Lower than production pool (typically 20-50)
});
```

| Parameter          | Production Pool | Replay Pool    | Rationale                            |
| ------------------ | --------------- | -------------- | ------------------------------------ |
| `maxParallelism`   | 20-50           | 5              | Minimize impact on live operations   |
| Priority           | Normal          | Low            | Yield to production work             |
| Partition strategy | Per-entity      | Per-projection | One rebuild at a time per projection |

### Partition Key Strategy

Uses `replay:${projectionName}` format:

```typescript
// Ensures one active rebuild per projection
const partitionKey = `replay:${projectionName}`;

await replayWorkpool.enqueueAction(
  ctx,
  internal.projections.replay.processChunk,
  { projectionName, fromEventId, chunkSize },
  { key: partitionKey }
);
```

| Pattern                  | Example              | Effect                                |
| ------------------------ | -------------------- | ------------------------------------- |
| `replay:orderSummary`    | Single projection    | Serialized chunks for this projection |
| `replay:inventoryLevels` | Different projection | Can run in parallel with above        |

**Benefit:** Multiple projections can rebuild simultaneously, but each projection's chunks are processed in order.

---

## 3. Chunked Processing

**Location:** `platform-core/src/projections/replay/types.ts`

### The Problem

Processing millions of events in a single transaction exceeds Convex limits and memory constraints.

### Solution

Break replay into **chunks** with configurable size based on projection complexity.

### Chunk Size Guidelines

| Projection Complexity | Events per Chunk | Handler Characteristics      |
| --------------------- | ---------------- | ---------------------------- |
| Simple aggregation    | 1000             | Counter increments, sums     |
| Standard read model   | 500              | Field updates, single table  |
| Complex joins         | 250              | Multi-table updates, lookups |
| External integrations | 100              | API calls, side effects      |

### Processing Flow

```
triggerRebuild(projectionName)
    │
    ▼
┌─────────────────────────────────┐
│ Create initial checkpoint       │
│ status: "running"               │
│ lastEventId: null               │
└─────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────┐
│ Query events from lastEventId   │◄──────────┐
│ Limit: chunkSize                │           │
└─────────────────────────────────┘           │
    │                                         │
    ▼                                         │
┌─────────────────────────────────┐           │
│ Process each event via handler  │           │
│ (from ReplayHandlerRegistry)    │           │
└─────────────────────────────────┘           │
    │                                         │
    ▼                                         │
┌─────────────────────────────────┐           │
│ Update checkpoint               │           │
│ lastEventId: chunk.lastEvent    │           │
│ eventsProcessed += chunk.count  │           │
└─────────────────────────────────┘           │
    │                                         │
    ├─► More events? ─────────────────────────┘
    │
    ▼
┌─────────────────────────────────┐
│ Mark status: "completed"        │
└─────────────────────────────────┘
```

### Handler Registry

```typescript
import { createReplayHandlerRegistry } from "@libar-dev/platform-core/projections/replay";

// Register handlers for each event type
const registry = createReplayHandlerRegistry({
  OrderCreated: orderSummaryHandlers.onOrderCreated,
  OrderConfirmed: orderSummaryHandlers.onOrderConfirmed,
  OrderShipped: orderSummaryHandlers.onOrderShipped,
  // ... additional handlers
});

// During replay, events are routed to appropriate handler
await registry.handle(ctx, event);
```

**The registry maps event types to projection handlers**, enabling the replay engine to process events without knowing projection-specific logic.

---

## 4. Progress Visibility

**Location:** `platform-core/src/projections/replay/progress.ts`

### ReplayProgress Interface

```typescript
interface ReplayProgress {
  /** Projection being rebuilt */
  projectionName: string;

  /** Current status */
  status: ReplayStatus;

  /** Events processed so far */
  eventsProcessed: number;

  /** Total events to process (estimated) */
  totalEvents: number;

  /** Completion percentage (0-100) */
  percentComplete: number;

  /** Estimated time remaining in milliseconds */
  estimatedRemainingMs: number;

  /** When rebuild started */
  startedAt: number;

  /** Processing rate (events per second) */
  eventsPerSecond: number;

  /** Error message if failed */
  error?: string;
}
```

### Progress Calculation

```typescript
import {
  calculateProgress,
  estimateRemainingTime,
  calculatePercentComplete,
} from "@libar-dev/platform-core/projections/replay";

// Calculate current progress
const progress = calculateProgress({
  checkpoint,
  totalEventCount,
  startTime,
});

// Estimate remaining time based on processing rate
const remainingMs = estimateRemainingTime({
  eventsProcessed: checkpoint.eventsProcessed,
  totalEvents: totalEventCount,
  elapsedMs: Date.now() - startTime,
});

// Calculate percentage
const percent = calculatePercentComplete(checkpoint.eventsProcessed, totalEventCount);
```

### Status Values

| Status      | Meaning                         | Next Actions       |
| ----------- | ------------------------------- | ------------------ |
| `running`   | Actively processing events      | Wait or cancel     |
| `paused`    | Temporarily stopped             | Resume or cancel   |
| `completed` | Successfully finished           | None (terminal)    |
| `failed`    | Encountered unrecoverable error | Investigate, retry |
| `cancelled` | Manually cancelled by admin     | Optionally restart |

---

## 5. Admin Operations

### Available Operations

| Function             | Purpose                    | Parameters                   |
| -------------------- | -------------------------- | ---------------------------- |
| `triggerRebuild`     | Start a projection rebuild | `projectionName`, `options?` |
| `cancelRebuild`      | Cancel an active rebuild   | `projectionName`             |
| `getRebuildStatus`   | Get current rebuild status | `projectionName`             |
| `listActiveRebuilds` | List all active rebuilds   | None                         |

### triggerRebuild

```typescript
import { triggerRebuild } from "@libar-dev/platform-core/projections/replay";

const result = await triggerRebuild(ctx, {
  projectionName: "orderSummary",
  options: {
    fromEventId: undefined, // Start from beginning (or specify event ID)
    chunkSize: 500, // Events per chunk
    priority: "low", // Workpool priority
  },
  dependencies: {
    replayWorkpool,
    processChunkAction: internal.projections.replay.processChunk,
    getCheckpoint: internal.projections.replay.getCheckpoint,
    upsertCheckpoint: internal.projections.replay.upsertCheckpoint,
  },
});

// TriggerRebuildResult type
type TriggerRebuildResult =
  | { status: "started"; checkpointId: string }
  | { status: "already_running"; checkpointId: string }
  | { status: "resumed"; checkpointId: string; fromEventId: string };
```

### cancelRebuild

```typescript
const result = await cancelRebuild(ctx, {
  projectionName: "orderSummary",
  dependencies: {
    getCheckpoint: internal.projections.replay.getCheckpoint,
    updateCheckpointStatus: internal.projections.replay.updateStatus,
  },
});

// Returns: { status: "cancelled" } | { status: "not_found" } | { status: "not_running" }
```

### getRebuildStatus

```typescript
const status = await getRebuildStatus(ctx, {
  projectionName: "orderSummary",
  dependencies: {
    getCheckpoint: internal.projections.replay.getCheckpoint,
    countEvents: internal.eventStore.queries.countEvents,
  },
});

// Returns: ReplayProgress | null
```

### listActiveRebuilds

```typescript
const activeRebuilds = await listActiveRebuilds(ctx, {
  dependencies: {
    listCheckpoints: internal.projections.replay.listByStatus,
    countEvents: internal.eventStore.queries.countEvents,
  },
});

// Returns: ReplayProgress[]
```

---

## 6. Error Handling

### Transient vs Permanent Failures

| Error Type | Example                         | Handling           |
| ---------- | ------------------------------- | ------------------ |
| Transient  | OCC conflict, timeout           | Retry via Workpool |
| Permanent  | Invalid event data, handler bug | Mark failed, alert |

### Failure Recovery

```
Event processing fails
    │
    ├─► Transient error?
    │       │
    │       └─► Yes → Workpool retries automatically
    │
    └─► Permanent error?
            │
            └─► Mark checkpoint status: "failed"
                Record error message
                Alert operator
```

### Recovery from Failed State

```typescript
// 1. Investigate the error
const status = await getRebuildStatus(ctx, { projectionName: "orderSummary", ... });
console.log(`Failed at event ${status.checkpoint.lastEventId}: ${status.error}`);

// 2. Fix the underlying issue (handler bug, bad event, etc.)

// 3. Resume from last checkpoint
const result = await triggerRebuild(ctx, {
  projectionName: "orderSummary",
  // Omit fromEventId to resume from checkpoint
  ...
});
// Returns: { status: "resumed", fromEventId: "last-successful-event" }
```

---

## 7. Decision Tree

```
Projection showing stale data?
    │
    ├─► Single entity affected?
    │       └─► Re-process specific events (targeted fix)
    │
    └─► Many entities affected?
            │
            ├─► Schema change required?
            │       └─► Full rebuild with new handler
            │
            ├─► Bug in handler logic?
            │       └─► Fix handler, then full rebuild
            │
            └─► Processing gap (failed events)?
                    └─► Resume from checkpoint

Already have active rebuild?
    │
    ├─► Yes → Check status via getRebuildStatus
    │         Wait for completion or cancel if stuck
    │
    └─► No → triggerRebuild to start fresh
```

---

## 8. Configuration Reference

### TriggerRebuildOptions

| Parameter     | Type                | Default     | Description                                           |
| ------------- | ------------------- | ----------- | ----------------------------------------------------- |
| `fromEventId` | `string?`           | `undefined` | Start from specific event (or resume from checkpoint) |
| `chunkSize`   | `number`            | `500`       | Events per processing chunk                           |
| `priority`    | `"low" \| "normal"` | `"low"`     | Workpool priority                                     |

### ReplayWorkpoolConfig

| Parameter        | Type     | Default | Description                 |
| ---------------- | -------- | ------- | --------------------------- |
| `maxParallelism` | `number` | `5`     | Concurrent chunk processing |

---

## Related Documents

- [event-store-durability.md](event-store-durability.md) - Durable event persistence patterns
- [workpool-partitioning.md](workpool-partitioning.md) - Partition key strategies for Workpool
- [projection-categories.md](projection-categories.md) - View vs Logic vs Integration projections
- [reactive-projections.md](reactive-projections.md) - Real-time projection updates
