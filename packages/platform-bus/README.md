# @libar-dev/platform-bus

Command idempotency and command-status tracking for Convex components.

## What this package gives you

- a typed client wrapper for the command-bus component API
- duplicate-command detection keyed by command ID
- command status tracking across pending, executed, rejected, and failed states
- correlation-based lookups for tracing and audit work

## Install

```bash
pnpm add @libar-dev/platform-bus convex zod
```

## Example

```ts
import { defineApp } from "convex/server";
import commandBusComponent from "@libar-dev/platform-bus/convex.config";
import { CommandBus } from "@libar-dev/platform-bus";

const app = defineApp();
app.use(commandBusComponent, { name: "commandBus" });

const commandBus = new CommandBus(components.commandBus);

const recordResult = await commandBus.recordCommand(ctx, {
  commandId,
  commandType: "CreateOrder",
  targetContext: "orders",
  payload: { customerId, items },
  metadata: { correlationId, timestamp: Date.now() },
});

if (recordResult.status === "new") {
  const result = await handleCreateOrder(ctx, payload);
  await commandBus.updateCommandResult(ctx, {
    commandId,
    status: result.status === "success" ? "executed" : "rejected",
    result,
  });
}
```

## Main exports

- `CommandBus`
- `CommandBusApi`
- `RecordCommandArgs`, `RecordCommandResult`
- `CommandStatusInfo`, `GetByCorrelationResult`, `CleanupExpiredResult`

## Stability

| Surface | Status | Notes |
| --- | --- | --- |
| Client wrapper | Stable | Covered by unit and isolated integration tests |
| Component config export | Stable | Mounts cleanly from consuming Convex apps |
| Agent subscription helper | Emerging | Useful when integrating agent flows, still less battle-tested than the core bus path |

## Known limitations

- The package tracks command IDs and status. It does not execute business logic for you.
- Exactly-once semantics depend on callers reusing the same `commandId` on retries.
- Auth decisions still belong inside the bounded-context mutation, not in the bus wrapper.

## Security notes

- Do not treat a recorded command as an authorization decision.
- Pass verified actor context through the owning mutation boundary.
- Use correlation data for traceability, not as a trust token.

## Testing

```bash
pnpm --filter @libar-dev/platform-bus test
pnpm --filter @libar-dev/platform-bus test:integration:ci
pnpm --filter @libar-dev/platform-bus test:coverage
```
