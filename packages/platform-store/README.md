# @libar-dev/platform-store

Central event storage, stream ordering, and idempotency conflict auditing for Convex.

## What this package gives you

- a typed event-store client wrapper
- stream appends with optimistic concurrency control
- globally ordered event reads for projections
- correlation-based event tracing
- verification-proof wiring for append calls
- idempotency conflict audit lookup support

## Install

```bash
pnpm add @libar-dev/platform-store @libar-dev/platform-core convex
```

## Example

```ts
import { defineApp } from "convex/server";
import eventStoreComponent from "@libar-dev/platform-store/convex.config";
import { EventStore } from "@libar-dev/platform-store";

const app = defineApp();
app.use(eventStoreComponent, { name: "eventStore" });

const eventStore = new EventStore(components.eventStore);

const appendResult = await eventStore.appendToStream(ctx, {
  streamType: "Order",
  streamId: orderId,
  expectedVersion: 0,
  boundedContext: "orders",
  events: [
    {
      eventId,
      eventType: "OrderCreated",
      payload: { orderId, customerId },
      metadata: { correlationId },
    },
  ],
});

if (appendResult.status === "conflict") {
  return appendResult.currentVersion;
}

const page = await eventStore.readFromPosition(ctx, { fromPosition: 0n, limit: 100 });
```

## Main exports

- `EventStore`
- `AppendArgs`, `AppendResult`, `StoredEvent`
- `ReadStreamArgs`, `ReadFromPositionArgs`, `ReadFromPositionResult`
- `GetByCorrelationResult`, `IdempotencyConflictAudit`

## Stability

| Surface                            | Status | Notes                                          |
| ---------------------------------- | ------ | ---------------------------------------------- |
| Client wrapper                     | Stable | Covered by unit and isolated integration tests |
| Component config export            | Stable | Used by the example app and platform harnesses |
| Idempotency conflict audit surface | Stable | Added for the stricter event append contract   |

## Known limitations

- The store appends and reads events. It does not update CMS state for you.
- Callers still need to choose event category and schema version sensibly.
- Workpool key-based ordering is still awaiting upstream support.

## Security notes

- `appendToStream` attaches a verification proof and should be called from trusted bounded-context code.
- Treat correlation and tenant fields as auditable metadata, not as auth decisions by themselves.
- Idempotency conflicts are hard failures because same-key different-payload reuse is rejected and audited.

## Dependency notes

- `@libar-dev/platform-store` depends on the published `@libar-dev/platform-core` export surfaces for global-position helpers, verification-proof creation, validation utilities, and process-manager lifecycle helpers.
- Consumers should use those `@libar-dev/platform-core/*` public subpaths too, not private `src/**` reach-throughs.

## Testing

```bash
pnpm --filter @libar-dev/platform-store test
pnpm --filter @libar-dev/platform-store test:integration:ci
pnpm --filter @libar-dev/platform-store test:coverage
```
