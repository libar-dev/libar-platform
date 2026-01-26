# @libar-dev/platform-store

Event Store component for Convex-Native Event Sourcing.

## Overview

Central event storage with global ordering and OCC:

- **Optimistic Concurrency** — Version-based conflict detection
- **Global Position** — Monotonic ordering for projection checkpoints
- **Stream Isolation** — Events grouped by `streamType` + `streamId`
- **Correlation Tracing** — Query events by `correlationId`
- **Event Categories** — Domain, integration, trigger, fat events

## Installation

```bash
pnpm add @libar-dev/platform-store
```

**Peer Dependencies:**

- `convex` (>=1.17.0 <1.35.0)

## Quick Start

### Setup Component

```typescript
// convex/convex.config.ts
import { defineApp } from "convex/server";
import eventStore from "@libar-dev/platform-store/convex.config";

const app = defineApp();
app.use(eventStore, { name: "eventStore" });
export default app;
```

### Use EventStore Client

```typescript
import { EventStore } from "@libar-dev/platform-store";
import { components } from "./_generated/api";

const eventStore = new EventStore(components.eventStore);

// Append event with OCC
const result = await eventStore.appendToStream(ctx, {
  streamType: "Order",
  streamId: orderId,
  expectedVersion: 0, // 0 = new stream, n = expected current version
  boundedContext: "orders",
  events: [
    {
      eventId: uuid(),
      eventType: "OrderCreated",
      payload: { customerId, items },
      category: "domain",
      schemaVersion: 1,
      metadata: { correlationId, causationId },
    },
  ],
});

if (result.status === "conflict") {
  // Handle version conflict - retry or reject
  console.log(`Expected version conflict. Current: ${result.currentVersion}`);
}

// Read for projections
const events = await eventStore.readFromPosition(ctx, {
  fromPosition: lastCheckpoint,
  limit: 100,
});
```

## API Reference

### Event Operations

| Method              | Description                                    |
| ------------------- | ---------------------------------------------- |
| `appendToStream`    | Append events with OCC (`expectedVersion`)     |
| `readStream`        | Read events from specific stream               |
| `readFromPosition`  | Read globally ordered events (for projections) |
| `getStreamVersion`  | Get current version of a stream                |
| `getByCorrelation`  | Query events by `correlationId`                |
| `getGlobalPosition` | Get current global position                    |

### Append Result

| Status     | Meaning                                                              |
| ---------- | -------------------------------------------------------------------- |
| `success`  | Events appended, returns `eventIds`, `globalPositions`, `newVersion` |
| `conflict` | Version mismatch, returns `currentVersion` for retry                 |

### Event Categories

| Category      | Purpose                                              |
| ------------- | ---------------------------------------------------- |
| `domain`      | Internal facts within bounded context (ES replay)    |
| `integration` | Cross-context communication with versioned contracts |
| `trigger`     | ID-only notifications for GDPR compliance            |
| `fat`         | Full state snapshots for external systems            |

## Dual-Write Pattern

The EventStore is used as part of the dual-write pattern:

```typescript
// In mutation handler:
// 1. Update CMS (current state)
await ctx.db.patch(orderId, cmsUpdate);

// 2. Append event (audit trail) - atomic with CMS update
await eventStore.appendToStream(ctx, {
  streamType: "Order",
  streamId: orderId,
  expectedVersion: currentVersion,
  boundedContext: "orders",
  events: [event],
});
```

Both operations happen in the same Convex mutation, ensuring atomicity.

## Related Packages

- `@libar-dev/platform-core` — CommandOrchestrator uses EventStore
- `@libar-dev/platform-bus` — Command Bus component
- `@libar-dev/platform-decider` — Pure decider functions
