# Dynamic Consistency Boundaries (DCB) - Architecture

> **Pattern:** Multi-entity invariants within bounded contexts
> **Package API:** See [`dcb.md`](./dcb.md)

---

## Overview

Dynamic Consistency Boundaries (DCB) enable **cross-entity invariant validation** within a single bounded context. Unlike traditional approaches that require saga coordination (eventual consistency) or sequential commands (race conditions), DCB provides **atomic validation** across multiple entities with scope-based optimistic concurrency control (OCC).

**Key insight:** DCB is for intra-BC coordination. Cross-BC coordination still requires Sagas.

---

## 1. The Problem DCB Solves

### 1.1 Current State: Saga-Based Multi-Entity Operations

When reserving multiple products for an order, the traditional approach uses sagas:

```typescript
// Current: Saga for multi-product reservation
workflow.step("reserve-product-1", () => reserveStock(product1));
workflow.step("reserve-product-2", () => reserveStock(product2));
workflow.step("reserve-product-3", () => reserveStock(product3));
// Problems:
// - Eventual consistency (not atomic)
// - Complex compensation on partial failure
// - Race conditions between steps
```

### 1.2 Target State: DCB-Based Atomic Operations

```typescript
// Target: DCB for atomic multi-product reservation
const result = await executeWithDCB(ctx, {
  scopeKey: createScopeKey(tenantId, "reservation", reservationId),
  expectedVersion: 0,
  entities: {
    streamIds: ["product-1", "product-2", "product-3"],
    loadEntity: (ctx, streamId) => inventoryRepo.tryLoad(ctx, streamId),
  },
  decider: reserveMultipleDecider,
  command: { orderId, items },
  // ...
});
// Benefits:
// - Single atomic operation
// - Scope-level OCC prevents concurrent conflicts
// - No compensation needed (all-or-nothing)
```

---

## 2. Core Concepts

### 2.1 Scope Key

A scope key uniquely identifies a consistency boundary with mandatory tenant isolation.

**Format:** `tenant:${tenantId}:${scopeType}:${scopeId}`

**Tenant Prefix is Mandatory:** The `tenant:` prefix ensures multi-tenant isolation at the scope level. A scope key without tenant prefix is rejected with `INVALID_SCOPE_KEY_FORMAT`.

### 2.2 Scope Table

The `dcbScopes` table in the Event Store tracks scope-level versioning:

| Field          | Description                                 |
| -------------- | ------------------------------------------- |
| scopeKey       | Unique identifier (indexed)                 |
| currentVersion | OCC version counter                         |
| tenantId       | Tenant isolation                            |
| scopeType      | Scope category                              |
| scopeId        | Unique ID within type                       |
| streamIds      | Participating streams (for virtual streams) |
| createdAt      | Creation timestamp                          |
| lastUpdatedAt  | Last modification                           |

### 2.3 Scope-Level OCC

Unlike entity-level OCC (version per aggregate), DCB uses **scope-level OCC**:

```
Expected Version 5 ──→ Check scope version ──→ Match? ──→ Commit (version 6)
                                                 │
                                                 ↓
                                            Mismatch ──→ SCOPE_VERSION_MISMATCH
```

- **New scopes** start at version 0
- **Each commit** atomically increments the version
- **Concurrent operations** on the same scope: one succeeds, others get `conflict` result

### 2.4 Virtual Streams

Virtual streams compose events from all entities within a scope, enabling scope-based queries and replay:

```typescript
// Query all events in a reservation scope
const events = await queryVirtualStream(ctx, {
  scopeKey: "tenant:t1:reservation:res_123",
  fromSequence: 0,
});
// Returns events from product-1, product-2, product-3 in global sequence order
```

---

## 3. When to Use DCB vs Saga

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

## 4. Constraints and Guarantees

### 4.1 Mandatory Constraints

| Constraint       | Enforcement        | Error Code             |
| ---------------- | ------------------ | ---------------------- |
| Single BC only   | Runtime validation | `CROSS_BC_NOT_ALLOWED` |
| Tenant-aware     | Scope key format   | `TENANT_ID_REQUIRED`   |
| Decider required | Type system        | `DECIDER_REQUIRED`     |

### 4.2 Guarantees

| Guarantee          | How                                        |
| ------------------ | ------------------------------------------ |
| Tenant isolation   | Scope key must include tenant prefix       |
| Atomicity          | All state updates + events commit together |
| OCC protection     | Scope version checked before commit        |
| No partial updates | Rejected/failed = no state changes         |

---

## 5. Integration with Event Store

DCB integrates with the centralized Event Store:

1. **dcbScopes table** - Tracks scope versions (in Event Store component)
2. **Virtual streams** - Query events across scope via `dcbScopeKey` index
3. **Event append** - Success events tagged with scope key for correlation

```typescript
// Events in scope include dcbScopeKey in metadata
{
  eventId: "evt_...",
  streamId: "product-1",
  eventType: "StockReserved",
  metadata: {
    correlationId: "...",
    dcbScopeKey: "tenant:t1:reservation:res_123",
  },
}
```

---

## Related Documents

- [Package API Reference](./dcb.md) - API documentation
- [Decider Pattern](../../../../docs/architecture/PATTERNS.md#decider) - Pure business logic functions
- [Component Isolation](../../../../docs/architecture/COMPONENT_ISOLATION.md) - BC physical boundaries
- [Architecture Overview](../../../../docs/architecture/OVERVIEW.md) - Full system architecture
