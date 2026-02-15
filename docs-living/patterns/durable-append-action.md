# ✅ Durable Append Action

**Purpose:** Detailed documentation for the Durable Append Action pattern

---

## Overview

| Property | Value     |
| -------- | --------- |
| Status   | completed |
| Category | Arch      |

## Description

Durable Append - Workpool-backed event append with retry.

Provides the action handler for durableAppendEvent() from platform-core.
Failed appends are recorded to eventAppendDeadLetters for manual recovery.

### Architecture

```
durableAppendEvent(ctx, config)
  -> Workpool.enqueueAction(appendEventAction, ...)
     -> appendEventAction calls idempotentAppendEvent
     -> On failure, Workpool retries with exponential backoff
     -> After exhausting retries, onAppendComplete records dead letter
```

### Usage

```typescript
import { durableAppendEvent } from "@libar-dev/platform-core";
import { durableAppendPool } from "../infrastructure";
import { internal } from "../_generated/api";

// In a saga step or scheduled job:
await durableAppendEvent(ctx, {
  workpool: durableAppendPool,
  actionRef: internal.eventStore.durableAppend.appendEventAction,
  append: {
    event: {
      idempotencyKey: `saga:${sagaId}:reserveStock`,
      streamType: "Inventory",
      streamId: productId,
      eventType: "StockReserved",
      eventData: { quantity, orderId },
      boundedContext: "inventory",
    },
    dependencies: {
      getByIdempotencyKey: components.eventStore.lib.getByIdempotencyKey,
      appendToStream: components.eventStore.lib.appendToStream,
    },
  },
  options: {
    onComplete: internal.eventStore.deadLetters.onAppendComplete,
    context: { sagaId, step: "reserveStock" },
  },
});
```

---

[← Back to Pattern Registry](../PATTERNS.md)
