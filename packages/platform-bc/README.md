# @libar-dev/platform-bc

TypeScript contracts for Convex DDD/ES bounded contexts.

## Overview

This package provides type-safe contracts for defining bounded contexts **without any Convex runtime dependency**. It's purely for TypeScript type definitions and documentation.

## Installation

```bash
pnpm add @libar-dev/platform-bc
```

## Usage

### Define a Context Contract

```typescript
// contexts/orders/contract.ts
import type { DualWriteContextContract, CMSTypeDefinition } from "@libar-dev/platform-bc";

export const OrdersContextContract = {
  identity: {
    name: "orders",
    description: "Order management bounded context",
    version: 1,
    streamTypePrefix: "Order",
  },
  executionMode: "dual-write",
  commandTypes: ["CreateOrder", "AddItem", "SubmitOrder", "CancelOrder"] as const,
  eventTypes: ["OrderCreated", "ItemAdded", "OrderSubmitted", "OrderCancelled"] as const,
  cmsTypes: {
    orderCMS: {
      tableName: "orderCMS",
      currentStateVersion: 1,
      description: "Order aggregate state",
    },
  },
  errorCodes: ["ORDER_NOT_FOUND", "ORDER_ALREADY_EXISTS", "ORDER_NOT_IN_DRAFT"],
} as const satisfies DualWriteContextContract<
  readonly ["CreateOrder", "AddItem", "SubmitOrder", "CancelOrder"],
  readonly ["OrderCreated", "ItemAdded", "OrderSubmitted", "OrderCancelled"],
  { orderCMS: CMSTypeDefinition }
>;
```

### Extract Types from Contract

```typescript
import type { ExtractCommandTypes, ExtractEventTypes } from "@libar-dev/platform-bc";
import { OrdersContextContract } from "./contract";

// Get union type of all command types
type OrderCommand = ExtractCommandTypes<typeof OrdersContextContract>;
// => "CreateOrder" | "AddItem" | "SubmitOrder" | "CancelOrder"

// Get union type of all event types
type OrderEvent = ExtractEventTypes<typeof OrdersContextContract>;
// => "OrderCreated" | "ItemAdded" | "OrderSubmitted" | "OrderCancelled"
```

## API Reference

### `BoundedContextIdentity`

Core identification for a bounded context.

```typescript
interface BoundedContextIdentity {
  name: string; // Unique context name (lowercase)
  description: string; // Human-readable description
  version: number; // Contract version
  streamTypePrefix: string; // Event stream prefix
}
```

### `DualWriteContextContract`

Contract for dual-write bounded contexts (CMS + Event in same transaction).

```typescript
interface DualWriteContextContract<
  TCommandTypes extends readonly string[],
  TEventTypes extends readonly string[],
  TCMSTypes extends Record<string, CMSTypeDefinition>,
> {
  identity: BoundedContextIdentity;
  executionMode: "dual-write";
  commandTypes: TCommandTypes;
  eventTypes: TEventTypes;
  cmsTypes: TCMSTypes;
  errorCodes: readonly string[];
}
```

### `CMSTypeDefinition`

Metadata about a CMS table.

```typescript
interface CMSTypeDefinition {
  tableName: string;
  currentStateVersion: number;
  description: string;
}
```

## Type Helpers

- `ExtractCommandTypes<T>` - Extract command type union from contract
- `ExtractEventTypes<T>` - Extract event type union from contract
- `ExtractCMSTableNames<T>` - Extract CMS table name union from contract
