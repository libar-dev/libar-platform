# @libar-dev/platform-store

Central event storage, stream ordering, and idempotency conflict auditing for Convex.

## What this package gives you

- a typed event-store client wrapper
- stream appends with optimistic concurrency control
- globally ordered event reads for projections
- correlation-based event tracing
- verification-proof wiring for append and scope-commit calls
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
- `AppendArgs`, `AppendResult`, `CommitScopeArgs`, `CommitScopeResult`, `StoredEvent`
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

- `appendToStream` and `commitScope` attach verification proofs, but the current proof scheme is a **development boundary marker**, not a production-grade cryptographic trust mechanism.
- The current implementation uses source-visible target secrets plus a custom hash. It is appropriate for repository-controlled server code and local negative tests, but not for hostile-code or multi-team production trust boundaries.
- Production hardening requires server-held keys or capabilities, standard signing, explicit audience binding, and rotation/expiry policy outside source control. Prefer asymmetric signing when verification happens inside mounted components; an HMAC secret copied into component source/config is still not a safe trust boundary.
- DCB scope records are bound to the creating bounded context; another bounded context in the same tenant cannot reuse the same scope key.
- Scoped event appends require an existing scope owned by the same bounded context and tenant as the proof.
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
