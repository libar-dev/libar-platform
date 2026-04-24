# @libar-dev/platform-bc

TypeScript-only contracts and metadata helpers for bounded contexts.

## What this package gives you

- bounded-context identity and dual-write contract types
- metadata helpers for commands, events, queries, projections, process managers, and CMS upcasters
- no Convex runtime dependency

## Install

```bash
pnpm add @libar-dev/platform-bc zod
```

## Example

```ts
import type { CMSTypeDefinition, DualWriteContextContract } from "@libar-dev/platform-bc";
import { defineCommand, defineEvent } from "@libar-dev/platform-bc";

export const OrdersContract = {
  identity: {
    name: "orders",
    description: "Order management bounded context",
    version: 1,
    streamTypePrefix: "Order",
  },
  executionMode: "dual-write",
  commandTypes: ["CreateOrder", "SubmitOrder"] as const,
  eventTypes: ["OrderCreated", "OrderSubmitted"] as const,
  cmsTypes: {
    orderCMS: {
      tableName: "orderCMS",
      currentStateVersion: 1,
      description: "Current order state",
    },
  },
  errorCodes: ["ORDER_NOT_FOUND"],
} as const satisfies DualWriteContextContract<
  readonly ["CreateOrder", "SubmitOrder"],
  readonly ["OrderCreated", "OrderSubmitted"],
  { orderCMS: CMSTypeDefinition }
>;

export const CreateOrder = defineCommand({
  commandType: "CreateOrder",
  description: "Create a new order",
  targetAggregate: "Order",
  createsAggregate: true,
  producesEvents: ["OrderCreated"],
});

export const OrderCreated = defineEvent({
  eventType: "OrderCreated",
  description: "Order creation domain event",
  category: "domain",
});
```

## Main exports

- `DualWriteContextContract`
- `defineCommand`, `defineEvent`, `defineProjection`, `defineQuery`, `defineProcessManager`, `defineUpcaster`
- `ExtractCommandTypes`, `ExtractEventTypes`, `ExtractCMSTableNames`

## Stability

| Surface | Status | Notes |
| --- | --- | --- |
| Contract types | Stable | Used across platform packages and example app |
| Definition helpers | Stable | Suitable for package and app metadata declarations |
| Registry-style metadata types | Stable | Useful for docs and introspection, not runtime execution |

## Known limitations

- This package documents metadata. It does not execute commands or queries.
- Runtime behavior still lives in `@libar-dev/platform-core`, `@libar-dev/platform-bus`, and `@libar-dev/platform-store`.
- The definition layer is intentionally verbose so generated docs stay explicit.

## Security notes

- These helpers describe contracts. They do not enforce auth or tenancy by themselves.
- Treat metadata as documentation and typing support, not as a replacement for runtime validation.

## Testing

```bash
pnpm --filter @libar-dev/platform-bc test
pnpm --filter @libar-dev/platform-bc test:coverage
```
