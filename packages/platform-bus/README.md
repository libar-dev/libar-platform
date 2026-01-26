# @libar-dev/platform-bus

Command Bus component for idempotent command execution with correlation tracking.

## Overview

This package provides a Convex component for command lifecycle management:

- **Idempotency** — Prevents duplicate command processing via `commandId`
- **Status Tracking** — Pending → Executed/Rejected/Failed transitions
- **Correlation** — Traces commands through the system via `correlationId`
- **TTL Cleanup** — Expired commands cleaned up periodically

## Installation

```bash
pnpm add @libar-dev/platform-bus
```

**Peer Dependencies:**

- `convex` (>=1.17.0 <1.35.0)
- `zod` (^4.0.0)

## Quick Start

### Setup Component

```typescript
// convex/convex.config.ts
import { defineApp } from "convex/server";
import commandBus from "@libar-dev/platform-bus/convex.config";

const app = defineApp();
app.use(commandBus, { name: "commandBus" });
export default app;
```

### Use CommandBus Client

```typescript
import { CommandBus } from "@libar-dev/platform-bus";
import { components } from "./_generated/api";

const commandBus = new CommandBus(components.commandBus);

// 1. Record command (check idempotency)
const recordResult = await commandBus.recordCommand(ctx, {
  commandId,
  commandType: "CreateOrder",
  targetContext: "orders",
  payload: { customerId, items },
  metadata: { correlationId, timestamp: Date.now() },
});

if (recordResult.status === "duplicate") {
  return recordResult.result; // Return cached result
}

// 2. Execute handler (in bounded context)
const result = await handleCreateOrder(ctx, payload);

// 3. Update status
await commandBus.updateCommandResult(ctx, {
  commandId,
  status: result.status === "success" ? "executed" : "rejected",
  result,
});
```

## API Reference

| Method                | Description                                                    |
| --------------------- | -------------------------------------------------------------- |
| `recordCommand`       | Record new command (idempotent) — returns `new` or `duplicate` |
| `updateCommandResult` | Update command status after execution                          |
| `getCommandStatus`    | Query command status by `commandId`                            |
| `getByCorrelation`    | Find related commands by `correlationId`                       |
| `cleanupExpired`      | Remove expired commands (call via cron)                        |

### Command Status Flow

```
pending → executed  (success)
        → rejected  (business rule failed)
        → failed    (system error)
```

### Record Command Result

| Status      | Meaning                                        |
| ----------- | ---------------------------------------------- |
| `new`       | Command recorded, proceed with execution       |
| `duplicate` | Command already exists, return cached `result` |

## Related Packages

- `@libar-dev/platform-core` — CommandOrchestrator uses CommandBus
- `@libar-dev/platform-store` — Event Store component
- `@libar-dev/platform-decider` — Pure decider functions
