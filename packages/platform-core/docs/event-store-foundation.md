# Event Store Foundation - Centralized Event Storage

> **Pattern:** Stream-based event storage with global ordering and optimistic concurrency control
> **Package:** `@libar-dev/platform-store`

---

## Overview

The Event Store Foundation provides centralized event storage for the Convex-Native ES platform. Unlike traditional event stores that focus on aggregate replay (O(n) event loading), this Event Store serves as an **immutable audit trail** and **projection source** while the CMS maintains current state (O(1) reads).

**Key insight:** Events are never replayed for command processing. They exist for audit trails, projections, and potential CMS rebuilds.

---

## 1. The Problem

Event Sourcing requires centralized storage for domain events with several guarantees:

| Requirement     | Traditional Challenge               | Event Store Solution                      |
| --------------- | ----------------------------------- | ----------------------------------------- |
| **Ordering**    | Events must be processed in order   | Stream versions + global positions        |
| **Concurrency** | Concurrent writes can corrupt state | Optimistic Concurrency Control (OCC)      |
| **Projections** | Need cross-stream ordering          | Global position for checkpoint resumption |
| **Audit**       | Events must be immutable            | No update/delete operations exposed       |
| **Evolution**   | Event schemas change over time      | Schema versioning + category taxonomy     |

Without infrastructure for stream-based storage, bounded contexts cannot maintain audit trails or support projection-based read models.

---

## 2. Stream-Based Storage

### 2.1 Stream Identity

Each stream represents a single entity (aggregate) identified by a composite key:

```typescript
// Stream identity = (streamType, streamId)
{
  streamType: "Order",      // Entity type (aggregate name)
  streamId: "ord_123",      // Unique identifier within type
  boundedContext: "orders", // BC that owns this stream
}
```

### 2.2 Events Table Schema

The `events` table stores all domain events:

| Field            | Type    | Description                                         |
| ---------------- | ------- | --------------------------------------------------- |
| `eventId`        | string  | Unique event identifier                             |
| `eventType`      | string  | Event type name (e.g., "OrderCreated")              |
| `streamType`     | string  | Entity type                                         |
| `streamId`       | string  | Entity identifier                                   |
| `version`        | number  | Per-stream sequence number (1, 2, 3...)             |
| `globalPosition` | number  | Cross-stream ordering value                         |
| `boundedContext` | string  | Owning bounded context                              |
| `category`       | enum    | Event taxonomy (domain/integration/trigger/fat)     |
| `schemaVersion`  | number  | For upcasting pipeline                              |
| `correlationId`  | string  | Request correlation tracking                        |
| `causationId`    | string? | Parent event/command ID                             |
| `timestamp`      | number  | Unix timestamp (ms)                                 |
| `payload`        | any     | Event data (intentionally untyped at storage layer) |
| `metadata`       | any?    | Extensible metadata                                 |
| `idempotencyKey` | string? | Duplicate detection key                             |

### 2.3 Streams Table Schema

The `streams` table tracks per-stream metadata for OCC:

| Field            | Type   | Description                 |
| ---------------- | ------ | --------------------------- |
| `streamType`     | string | Entity type                 |
| `streamId`       | string | Entity identifier           |
| `currentVersion` | number | Latest version in stream    |
| `createdAt`      | number | Stream creation timestamp   |
| `updatedAt`      | number | Last event append timestamp |

### 2.4 Indexes

```typescript
// Efficient queries via indexes
events:
  .index("by_stream", ["streamType", "streamId", "version"])      // Stream reads
  .index("by_global_position", ["globalPosition"])                 // Projection polling
  .index("by_event_type", ["eventType", "timestamp"])             // Type filtering
  .index("by_bounded_context", ["boundedContext", "timestamp"])   // BC filtering
  .index("by_correlation", ["correlationId"])                      // Tracing
  .index("by_event_id", ["eventId"])                              // Direct lookup
  .index("by_category", ["category", "globalPosition"])           // Category filtering
  .index("by_idempotency_key", ["idempotencyKey"])               // Duplicate detection
```

---

## 3. Global Position Formula

### 3.1 The Challenge

Projections need to process events in causal order across ALL streams. Per-stream versions only provide ordering within a single stream. We need a **globally unique, monotonically increasing** position for cross-stream ordering.

### 3.2 Formula

```
globalPosition = timestamp * 1,000,000 + streamHash * 1,000 + (version % 1000)
```

| Component        | Multiplier | Purpose                                |
| ---------------- | ---------- | -------------------------------------- |
| `timestamp`      | 1,000,000  | Primary sort key (time ordering)       |
| `streamHash`     | 1,000      | Stream differentiation (0-999 buckets) |
| `version % 1000` | 1          | Tiebreaker within stream (0-999)       |

### 3.3 Stream Hash Calculation

```typescript
// djb2 hash algorithm for stream identity
const streamIdentity = `${streamType}:${streamId}`;
let hash = 5381;
for (let i = 0; i < streamIdentity.length; i++) {
  hash = (hash * 33) ^ streamIdentity.charCodeAt(i);
}
const streamHash = Math.abs(hash % 1000);
```

### 3.4 Guarantees

| Guarantee                   | How Achieved                                                               |
| --------------------------- | -------------------------------------------------------------------------- |
| **Globally unique**         | Stream hash differentiates concurrent appends                              |
| **Time-ordered**            | Timestamp as primary sort key                                              |
| **Monotonic within stream** | Version increment ensures stream ordering                                  |
| **No collisions**           | Same ms + same hash bucket + same version % 1000 is effectively impossible |

### 3.5 Precision Trade-off

With real timestamps (~1.7 x 10^12 ms since epoch), the formula result exceeds `Number.MAX_SAFE_INTEGER` (~9 x 10^15). This is accepted because:

1. **Uniqueness maintained** - Stream hash differentiation prevents collisions
2. **Ordering sufficient** - Approximate ordering is adequate for checkpointing
3. **Collision probability** - Effectively zero in practice

---

## 4. Optimistic Concurrency Control (OCC)

### 4.1 How It Works

When appending events, callers provide an `expectedVersion`:

```typescript
const result = await eventStore.appendToStream(ctx, {
  streamType: "Order",
  streamId: "ord_123",
  expectedVersion: 5,  // Must match current stream version
  boundedContext: "orders",
  events: [{ eventId, eventType: "OrderConfirmed", payload: {...} }],
});

if (result.status === "conflict") {
  // Someone else modified the stream concurrently
  console.log(`Expected 5, but current is ${result.currentVersion}`);
}
```

### 4.2 Version Rules

| Scenario         | expectedVersion | Behavior                               |
| ---------------- | --------------- | -------------------------------------- |
| New stream       | 0               | Creates stream with version 1          |
| Existing stream  | Current version | Appends and increments version         |
| Version mismatch | Any             | Returns `conflict` with currentVersion |

### 4.3 Conflict Resolution

```
Append Request ──→ Load Stream ──→ Check Version ──→ Match? ──→ Append + Increment
                                                       │
                                                       ↓
                                                   Mismatch ──→ Return {status: "conflict"}
```

OCC enables safe concurrent access without locks while ensuring business invariants are validated against consistent state.

---

## 5. Read/Write APIs

### 5.1 Write API: appendToStream

Append events to a stream with OCC:

```typescript
// Mutation: appendToStream
const result = await eventStore.appendToStream(ctx, {
  streamType: string,        // Entity type
  streamId: string,          // Entity ID
  expectedVersion: number,   // OCC check (0 for new streams)
  boundedContext: string,    // Owning BC
  events: [{
    eventId: string,         // Unique event ID
    eventType: string,       // Event type name
    payload: any,            // Event data
    category?: EventCategory, // Default: "domain"
    schemaVersion?: number,  // Default: 1
    metadata?: {
      correlationId: string,
      causationId?: string,
      userId?: string,
    },
    idempotencyKey?: string, // For duplicate detection
  }],
});

// Result type (discriminated union)
type AppendResult =
  | { status: "success"; eventIds: string[]; globalPositions: number[]; newVersion: number }
  | { status: "conflict"; currentVersion: number };
```

### 5.2 Read API: readStream

Read events from a specific stream:

```typescript
// Query: readStream
const events = await eventStore.readStream(ctx, {
  streamType: "Order",
  streamId: "ord_123",
  fromVersion: 0, // Optional: start after this version
  limit: 1000, // Optional: max events to return
});

// Returns: StoredEvent[] ordered by version
```

### 5.3 Read API: readFromPosition

Read events globally for projections:

```typescript
// Query: readFromPosition
const events = await eventStore.readFromPosition(ctx, {
  fromPosition: lastCheckpoint, // Exclusive: events > this position
  limit: 100, // Max events to return
  eventTypes: ["OrderCreated"], // Optional: filter (in-memory)
  boundedContext: "orders", // Optional: filter (query-level)
});

// Returns: StoredEvent[] ordered by globalPosition
```

**Note on eventTypes filter:** Filtering happens in-memory after fetching 3x the limit. For sparse event types (<10% of events), query the `by_event_type` index directly.

### 5.4 Supporting APIs

```typescript
// Get current stream version (for OCC)
const version = await eventStore.getStreamVersion(ctx, {
  streamType: "Order",
  streamId: "ord_123",
});

// Get events by correlation ID (for tracing)
const events = await eventStore.getByCorrelation(ctx, {
  correlationId: "corr_abc",
});

// Get current global position
const position = await eventStore.getGlobalPosition(ctx);

// Get event by idempotency key (duplicate detection)
const existing = await eventStore.getByIdempotencyKey(ctx, {
  idempotencyKey: "cmd:cmd_123:OrderCreated",
});
```

---

## 6. Event Categories (Taxonomy)

Events are categorized for different processing needs:

| Category      | Purpose                     | Payload Content       | Use Case                      |
| ------------- | --------------------------- | --------------------- | ----------------------------- |
| `domain`      | Internal facts within BC    | Minimal, ES-focused   | CMS rebuild, BC projections   |
| `integration` | Cross-context communication | Versioned contracts   | BC-to-BC event publishing     |
| `trigger`     | ID-only notifications       | Just entity IDs       | GDPR compliance, minimal data |
| `fat`         | Full state snapshots        | Complete entity state | External system sync          |

### 6.1 Default Behavior

```typescript
// Category defaults to "domain" if not specified
events: [
  {
    eventId: "evt_123",
    eventType: "OrderCreated",
    payload: { orderId, customerId },
    // category: "domain" (implicit)
    // schemaVersion: 1 (implicit)
  },
];
```

### 6.2 Integration Events

```typescript
// Cross-BC communication with versioned contract
events: [
  {
    eventId: "evt_456",
    eventType: "OrderShipped",
    category: "integration",
    schemaVersion: 2, // Contract version
    payload: {
      orderId: "ord_123",
      shippedAt: timestamp,
      trackingNumber: "TRK123",
    },
  },
];
```

### 6.3 Querying by Category

```typescript
// Index: by_category supports category-based filtering
const integrationEvents = await ctx.db
  .query("events")
  .withIndex("by_category", (q) =>
    q.eq("category", "integration").gt("globalPosition", lastPosition)
  )
  .take(100);
```

---

## 7. Event Immutability

### 7.1 The Principle

Once an event is appended to a stream, it **cannot be modified or deleted**. Events form a permanent audit trail that serves as the source of truth for both CMS state and projection data.

### 7.2 Enforcement

Immutability is enforced at the API level - the Event Store provides no update or delete operations for events:

| Operation          | Available? | Rationale            |
| ------------------ | ---------- | -------------------- |
| `appendToStream`   | Yes        | Create new events    |
| `readStream`       | Yes        | Read events          |
| `readFromPosition` | Yes        | Read for projections |
| `updateEvent`      | **No**     | Events are immutable |
| `deleteEvent`      | **No**     | Events are immutable |

### 7.3 Schema Evolution

Instead of modifying events, use schema versioning and upcasting:

```typescript
// Event with schemaVersion for evolution
{
  eventType: "OrderCreated",
  schemaVersion: 2,  // New schema version
  payload: { /* v2 structure */ },
}

// Upcaster transforms v1 to v2 at read time
function upcastOrderCreated(event: StoredEvent): OrderCreatedV2 {
  if (event.schemaVersion === 1) {
    return transformV1ToV2(event.payload);
  }
  return event.payload as OrderCreatedV2;
}
```

---

## 8. Checkpoint-Based Projection Resumption

### 8.1 The Pattern

Projections track their `lastProcessedPosition` (a globalPosition value). On restart, they query events starting from their checkpoint:

```typescript
// Projection processing loop
async function processProjection(ctx, projection) {
  // Read from last checkpoint
  const events = await eventStore.readFromPosition(ctx, {
    fromPosition: projection.lastGlobalPosition,
    limit: 100,
  });

  for (const event of events) {
    await applyEventToProjection(ctx, event);
    await updateCheckpoint(ctx, projection.id, event.globalPosition);
  }
}
```

### 8.2 Exactly-Once Semantics

| Guarantee               | How Achieved                               |
| ----------------------- | ------------------------------------------ |
| No events missed        | Checkpoint persisted after processing      |
| No duplicate processing | globalPosition is monotonically increasing |
| Resumable               | Query from lastProcessedPosition           |

### 8.3 Projection Status Table

The Event Store includes a `projectionStatus` table for tracking projection state:

```typescript
{
  projectionName: string,
  status: "active" | "rebuilding" | "paused" | "error",
  lastGlobalPosition: number,  // Checkpoint
  eventsProcessed: number,
  eventsFailed: number,
  createdAt: number,
  lastUpdatedAt: number,
  errorMessage?: string,
}
```

---

## 9. Client Wrapper

### 9.1 Type-Safe Client

The `EventStore` class provides a type-safe wrapper around the component:

```typescript
import { EventStore } from "@libar-dev/platform-store";
import { components } from "./_generated/api";

// Initialize with component reference
const eventStore = new EventStore(components.eventStore);

// All operations are type-safe
const result = await eventStore.appendToStream(ctx, {
  streamType: "Order",
  streamId: orderId,
  expectedVersion: 0,
  boundedContext: "orders",
  events: [{ eventId, eventType: "OrderCreated", payload }],
});
```

### 9.2 Available Methods

| Method                        | Purpose                       |
| ----------------------------- | ----------------------------- |
| `appendToStream(ctx, args)`   | Append events with OCC        |
| `readStream(ctx, args)`       | Read from specific stream     |
| `readFromPosition(ctx, args)` | Read globally for projections |
| `getStreamVersion(ctx, args)` | Get current stream version    |
| `getByCorrelation(ctx, args)` | Query by correlation ID       |
| `getGlobalPosition(ctx)`      | Get current global position   |

---

## 10. Integration with CMS Dual-Write

The Event Store is used as part of the CMS dual-write pattern:

```
Command ──→ Load CMS (O(1)) ──→ Decider ──→ ATOMIC {
                                              • Patch CMS table
                                              • Append to Event Store
                                            }
```

**Key principle:** Both the CMS update and event append happen in the same mutation, ensuring atomic dual-write. If either fails, neither is persisted.

```typescript
// CommandOrchestrator dual-write pattern
async function handleCommand(ctx, command) {
  // 1. Load current state from CMS
  const cms = await cmsRepo.load(ctx, command.entityId);

  // 2. Run decider (pure function)
  const result = decider(cms, command);
  if (result.status !== "success") return result;

  // 3. Atomic dual-write in same mutation
  await cmsRepo.update(ctx, command.entityId, result.stateUpdate);
  await eventStore.appendToStream(ctx, {
    streamType: "Order",
    streamId: command.entityId,
    expectedVersion: cms.version,
    boundedContext: "orders",
    events: [result.event],
  });
}
```

---

## Related Documents

- [event-store-durability.md](./event-store-durability.md) - Idempotent append and durability guarantees
- [fat-events.md](./fat-events.md) - Full state snapshot events for external systems
- [dcb-architecture.md](./dcb-architecture.md) - Multi-entity invariants with scope-based OCC
- [projection-categories.md](./projection-categories.md) - View, logic, and integration projections
- [reactive-projections.md](./reactive-projections.md) - Real-time UI updates via event streams
