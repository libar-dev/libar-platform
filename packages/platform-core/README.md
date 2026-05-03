# @libar-dev/platform-core

Shared runtime, orchestration, projection, middleware, and agent utilities for the Convex event sourcing stack.

## What this package gives you

- command schemas, errors, and orchestration helpers
- event helpers, global-position utilities, and correlation support
- projection lifecycle, replay, and registration tools
- middleware, repository, testing, monitoring, and workpool helpers
- agent, security, durability, and DCB support used by the example app

## Install

```bash
pnpm add @libar-dev/platform-core @libar-dev/platform-bc @libar-dev/platform-decider @libar-dev/platform-fsm convex zod
```

## Example

```ts
import { createAggregateCommandSchema } from "@libar-dev/platform-core/commands";
import { CommandErrors } from "@libar-dev/platform-core/commands";
import { createQueryRegistry, createReadModelQuery } from "@libar-dev/platform-core/queries";
import { executeWithDCB, createScopeKey } from "@libar-dev/platform-core/dcb";
import { z } from "zod";

export const CreateOrderSchema = createAggregateCommandSchema({
  commandType: "CreateOrder",
  payloadSchema: z.object({
    orderId: z.string(),
    customerId: z.string(),
  }),
  aggregateTarget: {
    type: "Order",
    idField: "orderId",
  },
});

export const orderQueries = createQueryRegistry("orders", "orderSummary", {
  getById: createReadModelQuery(
    {
      queryName: "getById",
      description: "Fetch a single order summary",
      sourceProjection: "orderSummary",
      targetTable: "orderSummaries",
    },
    "single"
  ),
});

export async function reserveInventory(ctx: unknown, tenantId: string, reservationId: string) {
  return executeWithDCB(ctx as never, {
    scopeKey: createScopeKey(tenantId, "reservation", reservationId),
    expectedVersion: 0,
    boundedContext: "inventory",
    streamType: "Reservation",
    schemaVersion: 1,
    entities: {
      streamIds: [reservationId],
      loadEntity: async () => null,
    },
    decider: () => {
      throw CommandErrors.validation("NOT_IMPLEMENTED", "Replace example decider");
    },
    command: { reservationId },
    applyUpdate: async () => undefined,
    commandId: "cmd_demo",
    correlationId: "corr_demo",
  });
}
```

## Main subpath exports

- `@libar-dev/platform-core/commands`
- `@libar-dev/platform-core/events`
- `@libar-dev/platform-core/orchestration`
- `@libar-dev/platform-core/projections`
- `@libar-dev/platform-core/middleware`
- `@libar-dev/platform-core/validation`
- `@libar-dev/platform-core/repository`
- `@libar-dev/platform-core/queries`
- `@libar-dev/platform-core/testing`
- `@libar-dev/platform-core/agent`
- `@libar-dev/platform-core/security`
- `@libar-dev/platform-core/durability`
- `@libar-dev/platform-core/dcb`

## Stability

| Surface                                             | Status | Notes                                                                      |
| --------------------------------------------------- | ------ | -------------------------------------------------------------------------- |
| Commands, queries, projections, repository, testing | Stable | Used broadly across the repo                                               |
| Agent, security, durability, DCB, reservations      | Active | Real code paths exist, but the surface area is still evolving fastest here |
| Metrics and monitoring helpers                      | Stable | Good for instrumentation, still intentionally lightweight                  |

## Known limitations

- This package is broad. Consumers should prefer subpath imports over the root barrel when possible.
- A few runtime areas, especially agent and reservation support, still have more API churn than the older command and query helpers.
- Workpool key-based ordering is still gated by upstream support.

## Security notes

- Verification proofs and boundary validation live here, but the caller still needs to wire them correctly.
- The current proof implementation is a **development-only boundary marker**: it relies on source-visible target secrets and a custom hash, so it should not be presented as production-grade component authorization.
- Treat current proofs as defense-in-depth for trusted server code paths and negative tests only. Production-grade trust requires server-held keys or capabilities, standard signing, explicit audience binding, and rotation outside source control. Prefer asymmetric signing for mounted components; HMAC only fits when the verifier can keep the secret outside source/config.
- Do not bypass component boundaries by reaching into private tables or assuming auth passthrough.
- Use typed error categories instead of loose string reasons at orchestration boundaries.

## Testing

```bash
pnpm --filter @libar-dev/platform-core test
pnpm --filter @libar-dev/platform-core test:integration:ci
pnpm --filter @libar-dev/platform-core test:coverage
```
