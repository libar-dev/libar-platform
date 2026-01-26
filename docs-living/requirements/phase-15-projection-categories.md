# ✅ Projection Categories

**Purpose:** Detailed requirements for the Projection Categories feature

---

## Overview

| Property     | Value     |
| ------------ | --------- |
| Status       | completed |
| Product Area | Platform  |
| Phase        | 15        |

## Description

**Problem:** Projections exist but categories are implicit. Developers must know
which projection to query for which use case, leading to misuse and performance issues.

**Solution:** A taxonomy that categorizes projections by purpose and query pattern:

- **Logic:** Minimal data for command validation (internal only)
- **View:** Denormalized for UI queries (client-exposed)
- **Reporting:** Analytics and aggregations (async/batch)
- **Integration:** Cross-context synchronization (EventBus)

**Why It Matters for Convex-Native ES:**
| Benefit | How |
| Reactive targeting | Only View projections need reactive layer |
| Performance optimization | Logic projections stay minimal |
| Clear boundaries | Integration projections define cross-context contracts |
| Query routing | Right projection for right use case |

## Acceptance Criteria

**Projection definition includes category**

- Given a projection definition for "orderSummaries"
- When the projection is registered
- Then a category must be specified
- And valid categories are "logic", "view", "reporting", "integration"

**Invalid category is rejected**

- Given a projection definition with category "custom"
- When the projection is registered
- Then registration should fail with code "INVALID_CATEGORY"

**Category determines client exposure**

- Given a projection with category "<category>"
- When checking client exposure rules
- Then client accessible should be <exposed>

**Logic projections have minimal fields**

- Given a "logic" category projection for order existence
- When the projection schema is defined
- Then only fields required for validation should be included
- And no denormalized or computed fields should be present

**Projection without category fails registration**

- Given a projection definition without category field
- When the projection is registered
- Then registration should fail with code "CATEGORY_REQUIRED"
- And error message should suggest valid categories

**Type system enforces category at compile time**

- Given TypeScript strict mode is enabled
- When defining a projection without category
- Then TypeScript should report a type error
- And autocomplete should suggest valid category values

**Logic projections are not client-exposed**

- Given a projection with category "logic"
- When client queries are generated
- Then the projection should not be accessible from client code
- And attempting client access should fail with "INTERNAL_ONLY"

**View projections are client-exposed**

- Given a projection with category "view"
- When client queries are generated
- Then the projection should be accessible via useQuery hook
- And reactive subscriptions should be enabled

**Reporting projections have restricted access**

- Given a projection with category "reporting"
- When client queries are generated
- Then the projection should only be accessible to admin roles
- And non-admin access should fail with "ADMIN_ONLY"

**Integration projections use EventBus**

- Given a projection with category "integration"
- When the projection updates
- Then changes should be published to EventBus
- And direct query access should be disabled

**View projections enable reactive subscriptions**

- Given a projection with category "view"
- When a client subscribes via useQuery
- Then real-time updates should be pushed to the client
- And latency should be under 50ms for local changes

**Logic projections do not support subscriptions**

- Given a projection with category "logic"
- When a subscription is attempted
- Then the operation should fail with "SUBSCRIPTIONS_NOT_SUPPORTED"
- And error should suggest using appropriate category

**Reporting projections use polling or batch refresh**

- Given a projection with category "reporting"
- When data access is requested
- Then point-in-time queries should be used
- And no reactive subscription overhead should be incurred

## Business Rules

**Projections are classified into four distinct categories**

**Invariant:** Every projection must belong to exactly one of four categories:
Logic, View, Reporting, or Integration. Categories are mutually exclusive.

    **Rationale:** Without explicit categories, developers must guess which projection
    to use for which purpose, leading to misuse (e.g., using Logic projections for UI)
    and performance issues (e.g., subscribing to Reporting projections reactively).

    | Category | Purpose | Query Pattern | Example |
    | Logic | Minimal data for command validation | Internal only | orderExists(id) |
    | View | Denormalized for UI queries | Client queries | orderSummaries |
    | Reporting | Analytics and aggregations | Async/batch | dailySalesReport |
    | Integration | Cross-context synchronization | EventBus | orderStatusForShipping |

    **Verified by:** Projection definition includes category, Invalid category is rejected

_Verified by: Projection definition includes category, Invalid category is rejected_

**Categories determine projection characteristics**

**Invariant:** Each category prescribes specific characteristics for cardinality,
freshness requirements, and client exposure. These are not suggestions but enforced
at registration time.

    **Rationale:** Consistent characteristics per category enable infrastructure
    optimizations (e.g., reactive subscriptions only for View) and security enforcement
    (e.g., Logic projections never exposed to clients).

    | Category | Cardinality | Freshness | Client Exposed |
    | Logic | Minimal fields | Always current | No |
    | View | Denormalized | Near real-time | Yes |
    | Reporting | Aggregated | Eventual | Admin only |
    | Integration | Contract-defined | Event-driven | No (EventBus) |

    **Verified by:** Category determines client exposure, Logic projections have minimal fields

_Verified by: Category determines client exposure, Logic projections have minimal fields_

**Projections must declare explicit category**

**Invariant:** Category must be specified at projection definition time.
Projections without explicit category fail registration with CATEGORY_REQUIRED.

    **Rationale:** Implicit categories (guessed from naming or usage) lead to
    inconsistent behavior. Explicit declaration forces developers to think about
    the projection's purpose and enables compile-time validation.

    **Current State (implicit):**

```typescript
// Current: No category metadata
defineProjection({
  name: "orderSummaries",
  subscribes: ["OrderCreated", "OrderSubmitted"],
  handler: async (ctx, event) => {
    // Category is implied but not enforced
  },
});
```

**Target State (explicit):**

```typescript
// Target: Explicit category with type safety
defineProjection({
  name: "orderSummaries",
  category: "view", // <-- Explicit, validated at registration
  subscribes: ["OrderCreated", "OrderSubmitted"],
  handler: async (ctx, event) => {
    // Category enables correct query routing
  },
});
```

**Verified by:** Projection without category fails registration, Type system enforces category at compile time

_Verified by: Projection without category fails registration, Type system enforces category at compile time_

**Category determines client exposure**

**Invariant:** Client exposure is determined solely by category. Logic and
Integration projections are never client-accessible. View projections are
always client-accessible. Reporting projections require admin role.

    **Rationale:** Security and performance concerns require clear boundaries.
    Logic projections contain internal validation state that shouldn't leak.
    Integration projections are for cross-BC communication, not direct queries.

    **Verified by:** Logic projections are not client-exposed, View projections are client-exposed,
    Reporting projections have restricted access, Integration projections use EventBus

_Verified by: Logic projections are not client-exposed, View projections are client-exposed, Reporting projections have restricted access, Integration projections use EventBus_

**Only View projections require reactive subscriptions**

**Invariant:** Reactive subscriptions (real-time push updates) are only
supported for View category projections. Other categories reject subscription
attempts with SUBSCRIPTIONS_NOT_SUPPORTED.

    **Rationale:** Reactive infrastructure is expensive (WebSocket connections,
    change detection, client memory). Limiting reactivity to View projections
    ensures resources are used only where instant UI feedback is needed.

    **Verified by:** View projections enable reactive subscriptions,
    Logic projections do not support subscriptions, Reporting projections use polling or batch refresh

_Verified by: View projections enable reactive subscriptions, Logic projections do not support subscriptions, Reporting projections use polling or batch refresh_

## Deliverables

- ProjectionCategory type definition (complete)
- Category metadata in defineProjection() (complete)
- Query routing validation (complete)
- Category documentation (complete)
- Example categorization (complete)

---

[← Back to Product Requirements](../PRODUCT-REQUIREMENTS.md)
