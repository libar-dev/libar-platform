# ✅ Dynamic Consistency Boundaries

**Purpose:** Detailed documentation for the Dynamic Consistency Boundaries pattern

---

## Overview

| Property | Value     |
| -------- | --------- |
| Status   | completed |
| Category | DDD       |
| Phase    | 16        |

## Description

**Problem:** Cross-entity invariants within a bounded context currently require
sequential commands (no atomicity) or saga coordination (eventual consistency).
This leads to complex compensation logic and race conditions between related
entities that should be validated together.

**Solution:** DCB enables cross-entity invariants by:

1. Defining a **scope** that groups related entities
2. Applying **OCC on the scope** (not individual entities)
3. Using **correlation chains** to track the boundary

Atomic multi-product reservation: scope `tenant:t1:reservation:res_123`.

**Why It Matters for Convex-Native ES:**
| Benefit | How |
| --- | --- |
| Multi-entity invariants | Validate across entities without distributed locking |
| Flexible boundaries | Scope determined at runtime, not design time |
| OCC at scope level | Conflict detection on business boundary |
| Virtual streams | Query events across a scope |

## Dependencies

- Depends on: DeciderPattern

## Acceptance Criteria

**Scope key follows tenant-prefixed format**

- Given a multi-tenant system with tenant "tenant_123"
- And a reservation operation with id "res_456"
- When creating a DCB scope key
- Then the scope key should be "tenant:tenant_123:reservation:res_456"
- And the key should parse into tenantId, scopeType, and scopeId components

**Invalid scope key format is rejected**

- Given a scope key "reservation:res_456" without tenant prefix
- When the scope key is validated
- Then validation should fail with code "INVALID_SCOPE_KEY_FORMAT"
- And error message should indicate tenant prefix is required

**Scope-level OCC prevents concurrent modifications**

- Given a scope "tenant:t1:reservation:res_123" with version 1
- And two concurrent operations on the same scope
- When both operations attempt to commit
- Then one should succeed with version 2
- And the other should fail with OCC conflict code "SCOPE_VERSION_MISMATCH"

**Scope version increments on successful commit**

- Given a scope "tenant:t1:reservation:res_123" with version 5
- When a multi-entity operation commits successfully
- Then the scope version should be 6
- And lastUpdatedAt should reflect the commit timestamp

**New scope starts at version 0**

- Given no existing scope for "tenant:t1:reservation:res_new"
- When creating a new DCB operation
- Then expectedVersion should be 0
- And the first commit should set version to 1

**Query events across scope**

- Given a scope "tenant:t1:reservation:res_123"
- And events on streams "product-1", "product-2", "product-3" within scope
- When querying the virtual stream for the scope
- Then all events from all three streams should be returned
- And events should be ordered by global sequence number

**Virtual stream supports scope-based replay**

- Given a scope with 10 events across 3 entity streams
- When replaying the virtual stream from sequence 5
- Then events 5-10 should be returned in order
- And each event should include its source stream identifier

**Virtual stream excludes events outside scope**

- Given events on "product-1" with scope "tenant:t1:reservation:res_123"
- And events on "product-1" with scope "tenant:t1:reservation:res_999"
- When querying virtual stream for scope "res_123"
- Then only events with scope "res_123" should be returned

**DCB constraint validation**

- Given a DCB operation with <constraint_violation>
- When the operation is validated
- Then it should fail with code "<error_code>"
- And the error should indicate "<error_message>"

**DCB rejects cross-BC scope**

- Given entities from "orders" and "inventory" bounded contexts
- When attempting to create a DCB scope
- Then the operation should be rejected
- And the error should indicate "DCB requires single BC - use Saga for cross-BC"

**Scope includes tenant isolation**

- Given a multi-tenant system
- When creating a DCB scope without tenant prefix
- Then the operation should be rejected with "TENANT_ID_REQUIRED"
- And suggestion should show correct scope key format

**DCB execution requires decider**

- Given a multi-entity reservation command
- When the reservation is processed with DCB
- Then a decider function must be provided
- And the decider receives aggregated state from all entities

**Decider result determines operation outcome**

- Given a DCB operation with a decider that returns rejected
- When the operation is executed
- Then no events should be persisted
- And no state changes should occur
- And the rejection should propagate to the caller

## Business Rules

**DCB defines four core concepts for scope-based coordination**

These concepts work together to enable multi-entity invariants within
a bounded context. Each concept has a specific role in the coordination.

    | Concept | Description |
    | Scope Key | Unique identifier for consistency boundary (format: tenant:${tenantId}:${scopeType}:${scopeId}) |
    | Scope Table | dcbScopes in Event Store for scope-level version tracking |
    | Virtual Stream | Logical composition of events within scope across physical streams |
    | Scope OCC | expectedVersion checked on commit to prevent concurrent modifications |

_Verified by: Scope key follows tenant-prefixed format, Invalid scope key format is rejected_

**Scope key uniquely identifies consistency boundary with OCC**

All entities within a scope are validated together with scope-level OCC.
The scope version tracks the last modification across all entities in
the boundary, not individual entity versions.

    **Current State (Saga-based):**

```typescript
// Current: Saga for multi-product reservation
workflow.step("reserve-product-1", () => reserveStock(product1));
workflow.step("reserve-product-2", () => reserveStock(product2));
workflow.step("reserve-product-3", () => reserveStock(product3));
// Eventual consistency, complex compensation on failure
```

**Target State (DCB-based):**

```typescript
// Target: DCB for atomic multi-product
await executeWithDCB(ctx, {
  scopeKey: `tenant:${tenantId}:reservation:${reservationId}`,
  expectedVersion: currentVersion,
  deciders: [
    { streamId: "product-1", decider: productDecider },
    { streamId: "product-2", decider: productDecider },
    { streamId: "product-3", decider: productDecider },
  ],
});
// Single atomic operation with scope-level OCC
```

_Verified by: Scope-level OCC prevents concurrent modifications, Scope version increments on successful commit, New scope starts at version 0_

**Virtual streams compose events across scope**

Virtual streams provide a logical view of all events within a scope,
regardless of which physical stream (entity) they belong to. This enables
scope-based event queries and replay for the entire consistency boundary.

_Verified by: Query events across scope, Virtual stream supports scope-based replay, Virtual stream excludes events outside scope_

**DCB enforces three mandatory constraints**

These constraints ensure DCB operates safely within the Convex-Native ES model.
Violations are rejected at validation time, before any operation is attempted.

    | Constraint | Reason |
    | Single-BC only | Cross-BC invariants must use Sagas for compensation |
    | Tenant-aware | Multi-tenant isolation enforced at scope level |
    | Decider required | Pure validation logic via Decider pattern |

_Verified by: DCB constraint validation, DCB rejects cross-BC scope, Scope includes tenant isolation_

**Operations must use Decider pattern**

DCB builds on pure deciders for validation logic. The decider receives
aggregated state from all entities in the scope, enabling cross-entity
business rule validation in a pure function.

```typescript
// Decider receives aggregated state from all scope entities
function reserveMultipleDecider(
  scopeState: { products: ProductCMS[] },
  command: ReserveMultipleCommand
): DeciderOutput {
  // Validate across all products in scope
  const allAvailable = scopeState.products.every((p) => p.availableQty >= command.quantities[p.id]);

  if (!allAvailable) {
    return rejected("INSUFFICIENT_STOCK", "One or more products unavailable");
  }

  return success({
    events: scopeState.products.map((p) => ({
      type: "StockReserved",
      productId: p.id,
      quantity: command.quantities[p.id],
    })),
  });
}
```

_Verified by: DCB execution requires decider, Decider result determines operation outcome_

---

[← Back to Pattern Registry](../PATTERNS.md)
