# Workpool Partitioning Strategy

> **Purpose:** Guide for selecting partition keys in Workpool-based event processing to ensure per-entity ordering and prevent OCC conflicts.

---

## Quick Reference

| Projection Type | Helper                              | Key Format      | Use Case                     |
| --------------- | ----------------------------------- | --------------- | ---------------------------- |
| Per-entity      | `createEntityPartitionKey("Order")` | `Order:ord-123` | orderSummary, productCatalog |
| Per-customer    | `createCustomerPartitionKey()`      | `cust-123`      | customerOrderHistory         |
| Cross-context   | `createSagaPartitionKey()`          | `corr-123`      | orderWithInventory           |
| Global rollup   | `GLOBAL_PARTITION_KEY`              | `global`        | dailySalesSummary            |
| DCB retry       | `createDCBPartitionKey(scopeKey)`   | `dcb:scope-key` | DCB conflict retries         |

---

## Decision Tree

```
What does this projection aggregate?
    │
    ├─► Single entity (Order, Product, User)
    │       └─► Use createEntityPartitionKey("EntityType")
    │           Ensures FIFO per entity, parallel across entities
    │
    ├─► Multiple entities for same customer
    │       └─► Use createCustomerPartitionKey()
    │           All customer-affecting events serialize
    │
    ├─► Multiple entities across a saga/workflow
    │       └─► Use createSagaPartitionKey()
    │           Causal ordering across bounded contexts
    │
    └─► Global aggregate (daily totals, system metrics)
            └─► Use GLOBAL_PARTITION_KEY or maxParallelism: 1
                Single writer prevents OCC conflicts
```

---

## Usage Examples

### Entity Partition (Most Common)

```typescript
import { createEntityPartitionKey } from "@libar-dev/platform-core/workpool/partitioning";

const createOrderConfig: CommandConfig = {
  commandType: "CreateOrder",
  projection: {
    handler: orderSummaryOnCreated,
    projectionName: "orderSummary",
    toProjectionArgs: (args, event) => ({ orderId: args.orderId, ...event }),
    // Events for same order serialize; different orders parallelize
    getPartitionKey: createEntityPartitionKey("Order"),
  },
};
```

### Customer Partition

```typescript
import { createCustomerPartitionKey } from "@libar-dev/platform-core/workpool/partitioning";

const customerHistoryConfig = {
  projectionName: "customerOrderHistory",
  // All events affecting this customer serialize (regardless of order/product)
  getPartitionKey: createCustomerPartitionKey(),
};
```

### Saga Partition (Cross-Context)

```typescript
import { createSagaPartitionKey } from "@libar-dev/platform-core/workpool/partitioning";

// Cross-context projection joining Orders + Inventory data
secondaryProjections: [{
  handler: orderWithInventoryOnSubmitted,
  projectionName: "orderWithInventory",
  // Events from same saga serialize for causal ordering
  getPartitionKey: createSagaPartitionKey(),
}],
```

### Global Partition (Rollups)

```typescript
import { GLOBAL_PARTITION_KEY } from "@libar-dev/platform-core/workpool/partitioning";

const dailySalesConfig = {
  projectionName: "dailySalesSummary",
  // All events serialize to prevent OCC conflicts on aggregate doc
  getPartitionKey: () => GLOBAL_PARTITION_KEY,
};

// Alternative: Dedicated Workpool
export const globalRollupPool = new Workpool(components.globalRollupPool, {
  maxParallelism: 1, // Single worker, no partition key needed
});
```

---

## Why Partition Keys Matter

### Without Partitioning: Out-of-Order Processing

```
Events: ItemAdded(pos:1), ItemRemoved(pos:2), ItemAdded(pos:3)

Worker A picks ItemRemoved(pos:2) ────► ❌ Removes item not yet added
Worker B picks ItemAdded(pos:1) ───────► Adds item
Worker C picks ItemAdded(pos:3) ───────► ❌ State inconsistent
```

### With Entity Partition: FIFO Per Entity

```
Partition key: "Order:ord-123"

All events for ord-123 route to same worker:
  ItemAdded(pos:1) → Worker A → ✅
  ItemRemoved(pos:2) → Worker A → ✅ (after pos:1)
  ItemAdded(pos:3) → Worker A → ✅ (after pos:2)

Events for ord-456 can process in parallel on Worker B
```

### Global Rollup: Single Writer Prevents OCC

```
Without single writer:
  Event 1 (qty: +5) → Worker A → Read total=100, Write total=105
  Event 2 (qty: +3) → Worker B → Read total=100, Write total=103 ← STALE!
                                   ↓
                          OCC CONFLICT or WRONG TOTAL

With GLOBAL_PARTITION_KEY:
  Event 1 (qty: +5) → Worker A → Read total=100, Write total=105
  Event 2 (qty: +3) → Worker A → Read total=105, Write total=108 ← CORRECT
```

---

## Parallelism Recommendations

| Strategy | Recommended | Rationale                                          |
| -------- | ----------- | -------------------------------------------------- |
| entity   | 10+         | High parallelism; events serialize per-entity only |
| customer | 5           | Medium; broader scope than entity                  |
| saga     | 5           | Medium; saga events are typically lower volume     |
| global   | 1           | Must be 1 to prevent OCC conflicts                 |

```typescript
import { getRecommendedParallelism } from "@libar-dev/platform-core/workpool/partitioning";

const parallelism = getRecommendedParallelism("entity"); // 10
```

---

## Validation

Command configs should be validated at startup to catch missing partition keys:

```typescript
import { assertValidPartitionKeys } from "@libar-dev/platform-core/orchestration";

// During app initialization
assertValidPartitionKeys([createOrderConfig, submitOrderConfig, addItemConfig]);
// Throws if any projection is missing getPartitionKey
```

---

## DCB Alignment

When using `withDCBRetry`, align partition keys with DCB scope keys:

```typescript
import { createDCBPartitionKey } from "@libar-dev/platform-core/workpool/partitioning";

const handler = withDCBRetry(ctx, {
  workpool: dcbRetryPool,
  scopeKey: createScopeKey(tenantId, "reservation", reservationId),
  // Partition key derived from scope key ensures retry serializes
  // with new operations on same scope
  getRetryPartitionKey: (scopeKey) => createDCBPartitionKey(scopeKey),
});
```

| DCB Scope                       | Partition Key                       | Behavior                                  |
| ------------------------------- | ----------------------------------- | ----------------------------------------- |
| `tenant:T:entity:Order:ord-123` | `dcb:tenant:T:entity:Order:ord-123` | Retry serializes with new order events    |
| `tenant:T:reservation:res-456`  | `dcb:tenant:T:reservation:res-456`  | Retry serializes with reservation changes |

---

## Migration Guide

### Before (Inconsistent)

```typescript
// Different patterns, no standardization
getPartitionKey: (args) => ({ name: "orderId", value: args.orderId }),
getPartitionKey: (args) => ({ name: "streamId", value: args.streamId }),
getPartitionKey: () => ({ name: "global", value: "global" }),
```

### After (Standardized)

```typescript
import {
  createEntityPartitionKey,
  createCustomerPartitionKey,
  GLOBAL_PARTITION_KEY,
} from "@libar-dev/platform-core/workpool/partitioning";

// Entity projections
getPartitionKey: createEntityPartitionKey("Order"),

// Customer projections
getPartitionKey: createCustomerPartitionKey(),

// Global rollups
getPartitionKey: () => GLOBAL_PARTITION_KEY,
```

---

## Related Documents

- [ADR-018: Workpool Partitioning Strategy](../../docs/decisions/adr-018-workpool-partitioning.md)
- [CONVEX-DURABILITY-REFERENCE.md](./CONVEX-DURABILITY-REFERENCE.md) - Workpool configuration
- [dcb-architecture.md](./dcb-architecture.md) - DCB scope key patterns
