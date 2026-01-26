# @libar-dev/platform-core

Core infrastructure for Convex-Native Event Sourcing.

## Overview

This package provides the foundational building blocks for implementing Domain-Driven Design (DDD) with Event Sourcing and CQRS patterns on Convex. It includes:

- **Events** — Event schemas, builders, and category taxonomy
- **Commands** — Command factories, schemas, and error handling
- **DCB** — Dynamic Consistency Boundaries for multi-entity invariants
- **Orchestration** — CommandOrchestrator for 7-step command processing
- **Projections** — Checkpoint-based projection lifecycle management
- **Process Managers** — Event-driven process coordination

## Installation

```bash
pnpm add @libar-dev/platform-core
```

**Peer Dependencies:**

- `convex` (>=1.17.0 <1.35.0)
- `zod` (^4.0.0)

## Module Overview

| Module           | Import                                    | Description                        |
| ---------------- | ----------------------------------------- | ---------------------------------- |
| `events`         | `@libar-dev/platform-core/events`         | Event schemas, builders, upcasting |
| `commands`       | `@libar-dev/platform-core/commands`       | Command factories and validation   |
| `dcb`            | `@libar-dev/platform-core/dcb`            | Dynamic Consistency Boundaries     |
| `orchestration`  | `@libar-dev/platform-core/orchestration`  | CommandOrchestrator                |
| `handlers`       | `@libar-dev/platform-core/handlers`       | Handler result utilities           |
| `decider`        | `@libar-dev/platform-core/decider`        | Decider handler factories          |
| `projections`    | `@libar-dev/platform-core/projections`    | Projection lifecycle               |
| `processManager` | `@libar-dev/platform-core/processManager` | Process manager utilities          |
| `cms`            | `@libar-dev/platform-core/cms`            | CMS types and upcasting            |
| `repository`     | `@libar-dev/platform-core/repository`     | Repository patterns                |
| `middleware`     | `@libar-dev/platform-core/middleware`     | Middleware pipeline                |
| `invariants`     | `@libar-dev/platform-core/invariants`     | Invariant validation               |
| `ids`            | `@libar-dev/platform-core/ids`            | ID generation and branded types    |
| `correlation`    | `@libar-dev/platform-core/correlation`    | Correlation chain tracking         |
| `eventbus`       | `@libar-dev/platform-core/eventbus`       | Event bus infrastructure           |
| `integration`    | `@libar-dev/platform-core/integration`    | Integration event patterns         |
| `registry`       | `@libar-dev/platform-core/registry`       | Command registry                   |
| `batch`          | `@libar-dev/platform-core/batch`          | Batch execution utilities          |
| `queries`        | `@libar-dev/platform-core/queries`        | Query factories                    |
| `fsm`            | `@libar-dev/platform-core/fsm`            | FSM re-exports                     |
| `testing`        | `@libar-dev/platform-core/testing`        | Testing utilities                  |

## Quick Start

### Dual-Write Pattern

The core pattern: CMS update + Event append in a single atomic mutation.

```typescript
import { success, rejected } from "@libar-dev/platform-decider";

// Pure decider function (no I/O)
const confirmOrderDecider = (state, command, context) => {
  if (state.status !== "pending") {
    return rejected("ORDER_NOT_PENDING", "Order must be pending to confirm");
  }

  return success({
    data: { confirmedAt: context.now },
    event: { eventType: "OrderConfirmed", payload: { orderId: state.orderId } },
    stateUpdate: { status: "confirmed", confirmedAt: context.now },
  });
};
```

### Dynamic Consistency Boundaries (DCB)

For multi-entity invariants within a bounded context:

```typescript
import { executeWithDCB, createScopeKey } from "@libar-dev/platform-core/dcb";

const result = await executeWithDCB(ctx, {
  scopeKey: createScopeKey(tenantId, "reservation", reservationId),
  expectedVersion: 0,
  boundedContext: "inventory",
  streamType: "Reservation",
  schemaVersion: 1,
  entities: {
    streamIds: ["product-1", "product-2"],
    loadEntity: (ctx, streamId) => inventoryRepo.tryLoad(ctx, streamId),
  },
  decider: reserveMultipleDecider,
  command: { orderId, items },
  applyUpdate: async (ctx, _id, cms, update, version, now) => {
    await ctx.db.patch(_id, { ...update, version, updatedAt: now });
  },
  commandId,
  correlationId,
});
```

See [docs/dcb.md](docs/dcb.md) for complete DCB documentation.

## Documentation

- [DCB (Dynamic Consistency Boundaries)](docs/dcb.md) — Multi-entity coordination
- [Architecture Overview](../../docs/architecture/OVERVIEW.md) — System architecture

## Related Packages

- `@libar-dev/platform-bc` — Bounded context contracts
- `@libar-dev/platform-decider` — Pure decider functions
- `@libar-dev/platform-store` — Event Store component
- `@libar-dev/platform-bus` — Command Bus component
- `@libar-dev/platform-fsm` — Finite State Machine utilities
