# Dynamic Consistency Boundaries (DCB)

> **Pattern:** Multi-entity invariants within bounded contexts

---

## Overview

Dynamic Consistency Boundaries (DCB) enable **cross-entity invariant validation** within a single bounded context. Unlike traditional approaches that require saga coordination (eventual consistency) or sequential commands (race conditions), DCB provides **atomic validation** across multiple entities with scope-based optimistic concurrency control (OCC).

**Key insight:** DCB is for intra-BC coordination. Cross-BC coordination still requires Sagas.

---

## The executeWithDCB Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           executeWithDCB() Flow                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   1. Validate scope key                                                     │
│      └─► tenant isolation check                                             │
│                                                                             │
│   2. Load all entities                                                      │
│      └─► Map<streamId, EntityState>                                         │
│                                                                             │
│   3. Build aggregated state                                                 │
│      └─► DCBAggregatedState { scopeKey, scopeVersion, entities }           │
│                                                                             │
│   4. Execute pure decider                                                   │
│      └─► decider(aggregatedState, command, context)                        │
│                                                                             │
│   5. Handle result                                                          │
│      ├─► rejected → return rejection (no events)                           │
│      ├─► failed   → return failure + failure event                         │
│      └─► success  → continue to step 6                                     │
│                                                                             │
│   6. Apply state updates                                                    │
│      └─► for each entity with update: applyUpdate(ctx, _id, cms, update)   │
│                                                                             │
│   7. Return result with events                                              │
│      └─► { status: "success", data, scopeVersion, events }                 │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Usage Example

### Define a DCB Decider

```typescript
import type { DCBDecider, DCBAggregatedState, DCBStateUpdates } from "@libar-dev/platform-core/dcb";
import { success, rejected } from "@libar-dev/platform-decider";

interface ProductCMS {
  productId: string;
  availableQty: number;
  reservedQty: number;
}

interface ReserveMultipleCommand {
  orderId: string;
  items: Array<{ productId: string; quantity: number }>;
}

interface StockReserved {
  eventType: "StockReserved";
  payload: {
    orderId: string;
    reservations: Array<{ productId: string; quantity: number }>;
  };
}

// DCB decider receives aggregated state from ALL entities in scope
const reserveMultipleDecider: DCBDecider<
  ProductCMS,
  ReserveMultipleCommand,
  StockReserved,
  { reservedProducts: string[] },
  Partial<ProductCMS>
> = (state, command, context) => {
  const updates: DCBStateUpdates<Partial<ProductCMS>> = new Map();
  const reservations: Array<{ productId: string; quantity: number }> = [];

  // Validate ALL products can be reserved (cross-entity invariant)
  for (const item of command.items) {
    const entity = state.entities.get(item.productId);
    if (!entity) {
      return rejected("PRODUCT_NOT_FOUND", `Product ${item.productId} not in scope`);
    }

    if (entity.cms.availableQty < item.quantity) {
      return rejected(
        "INSUFFICIENT_STOCK",
        `Product ${item.productId}: need ${item.quantity}, have ${entity.cms.availableQty}`
      );
    }

    // Stage update (not applied yet)
    updates.set(item.productId, {
      availableQty: entity.cms.availableQty - item.quantity,
      reservedQty: entity.cms.reservedQty + item.quantity,
    });

    reservations.push({ productId: item.productId, quantity: item.quantity });
  }

  // All validations passed - return success
  return success({
    data: { reservedProducts: command.items.map((i) => i.productId) },
    event: {
      eventType: "StockReserved",
      payload: { orderId: command.orderId, reservations },
    },
    stateUpdate: updates,
  });
};
```

### Execute with DCB

```typescript
import { executeWithDCB, createScopeKey } from "@libar-dev/platform-core/dcb";

const result = await executeWithDCB(ctx, {
  scopeKey: createScopeKey("tenant_1", "reservation", "res_123"),
  expectedVersion: 0, // New scope
  boundedContext: "inventory",
  streamType: "Reservation",
  schemaVersion: 1,
  entities: {
    streamIds: ["product-1", "product-2", "product-3"],
    loadEntity: async (ctx, streamId) => {
      const product = await inventoryRepo.tryLoadByProductId(ctx, streamId);
      return product ? { cms: product, _id: product._id } : null;
    },
  },
  decider: reserveMultipleDecider,
  command: {
    orderId: "order_456",
    items: [
      { productId: "product-1", quantity: 2 },
      { productId: "product-2", quantity: 1 },
    ],
  },
  applyUpdate: async (ctx, _id, cms, update, version, timestamp) => {
    await ctx.db.patch(_id, {
      ...update,
      version,
      updatedAt: timestamp,
    });
  },
  commandId: "cmd_789",
  correlationId: "corr_abc",
});

// Handle result
switch (result.status) {
  case "success":
    // Append result.events to Event Store
    // result.scopeVersion is the new version
    break;
  case "rejected":
    // Business rule violation - result.code, result.reason
    break;
  case "failed":
    // Business failure with event - result.events contains failure event
    break;
  case "conflict":
    // OCC conflict - result.currentVersion shows actual version
    // Retry with fresh state
    break;
}
```

---

## Scope Key

A scope key uniquely identifies a consistency boundary with mandatory tenant isolation.

**Format:** `tenant:${tenantId}:${scopeType}:${scopeId}`

```typescript
import { createScopeKey, parseScopeKey, validateScopeKey } from "@libar-dev/platform-core/dcb";

// Create a scope key
const scopeKey = createScopeKey("tenant_123", "reservation", "res_456");
// Result: "tenant:tenant_123:reservation:res_456"

// Parse components
const parsed = parseScopeKey(scopeKey);
// { tenantId: "tenant_123", scopeType: "reservation", scopeId: "res_456", raw: ... }

// Validate format
const error = validateScopeKey("invalid:key");
// { code: "INVALID_SCOPE_KEY_FORMAT", message: "..." }
```

**Tenant Prefix is Mandatory:** The `tenant:` prefix ensures multi-tenant isolation at the scope level.

---

## When to Use DCB vs Saga

| Criterion            | DCB                       | Saga                         |
| -------------------- | ------------------------- | ---------------------------- |
| **Scope**            | Single bounded context    | Cross-BC coordination        |
| **Consistency**      | Atomic (all-or-nothing)   | Eventual (with compensation) |
| **Invariants**       | Multi-entity validation   | Choreography steps           |
| **Boundaries**       | Runtime-determined        | Design-time defined          |
| **Failure handling** | Reject/rollback           | Compensating transactions    |
| **Use case**         | Multi-product reservation | Order → Inventory → Shipping |

### Decision Tree

```
Cross-BC coordination needed? ─────► Yes → Saga
        │
        No
        ▼
Multi-entity invariants? ─────────► Yes → DCB
        │
        No
        ▼
Single entity operation? ─────────► Regular Decider
```

---

## API Reference

### Types

```typescript
// Branded scope key type
type DCBScopeKey = string & { readonly __brand: "DCBScopeKey" };

// Parsed scope key components
interface ParsedScopeKey {
  tenantId: string;
  scopeType: string;
  scopeId: string;
  raw: DCBScopeKey;
}

// Aggregated state for decider
interface DCBAggregatedState<TCms> {
  scopeKey: DCBScopeKey;
  scopeVersion: number;
  entities: Map<string, DCBEntityState<TCms>>;
}

// Execution results
type DCBExecutionResult<TData> =
  | DCBSuccessResult<TData> // { status: "success", data, scopeVersion, events }
  | DCBRejectedResult // { status: "rejected", code, reason }
  | DCBFailedResult // { status: "failed", reason, events }
  | DCBConflictResult; // { status: "conflict", currentVersion }
```

### Functions

```typescript
// Scope key utilities
createScopeKey(tenantId, scopeType, scopeId): DCBScopeKey
tryCreateScopeKey(tenantId, scopeType, scopeId): DCBScopeKey | null
parseScopeKey(scopeKey): ParsedScopeKey | null
validateScopeKey(scopeKey): ScopeKeyValidationError | null
isValidScopeKey(scopeKey): boolean
assertValidScopeKey(scopeKey): void

// Tenant operations
isScopeTenant(scopeKey, tenantId): boolean
extractTenantId(scopeKey): string
extractScopeType(scopeKey): string
extractScopeId(scopeKey): string

// Main execution
executeWithDCB(ctx, config): Promise<DCBExecutionResult<TData>>
```

---

## Constraints and Guarantees

### Mandatory Constraints

| Constraint       | Enforcement        | Error Code             |
| ---------------- | ------------------ | ---------------------- |
| Single BC only   | Runtime validation | `CROSS_BC_NOT_ALLOWED` |
| Tenant-aware     | Scope key format   | `TENANT_ID_REQUIRED`   |
| Decider required | Type system        | `DECIDER_REQUIRED`     |

### Guarantees

| Guarantee          | How                                        |
| ------------------ | ------------------------------------------ |
| Tenant isolation   | Scope key must include tenant prefix       |
| Atomicity          | All state updates + events commit together |
| OCC protection     | Scope version checked before commit        |
| No partial updates | Rejected/failed = no state changes         |
