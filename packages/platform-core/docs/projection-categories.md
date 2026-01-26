# Projection Categories

> Query Routing Taxonomy for Convex-Native Event Sourcing

## Overview

Projection categories classify projections by their **purpose** and **query pattern**, enabling:

- **Query routing** - Right projection for right use case
- **Reactive targeting** - Only View projections need real-time updates
- **Performance optimization** - Logic projections stay minimal
- **Clear boundaries** - Integration projections define cross-context contracts

## Category Taxonomy

| Category      | Purpose                             | Query Pattern  | Client Exposed |
| ------------- | ----------------------------------- | -------------- | -------------- |
| `logic`       | Minimal data for command validation | Internal only  | No             |
| `view`        | Denormalized for UI queries         | Client queries | Yes (reactive) |
| `reporting`   | Analytics and aggregations          | Async/batch    | Admin only     |
| `integration` | Cross-context synchronization       | EventBus       | No             |

## Category Details

### Logic Projections

**Purpose:** Command validation and internal business logic.

**Characteristics:**

- Minimal fields - only what's needed for validation
- Always current - no eventual consistency tolerance
- Not client-exposed - internal use only
- No reactive overhead

**Example Use Cases:**

- `orderExists(id)` - Simple existence check
- `customerCreditLimit` - Validation data
- `productAvailability` - Stock check for commands

```typescript
defineProjection({
  projectionName: "orderExistence",
  description: "Minimal projection for order existence validation",
  category: "logic",
  // ... other fields
});
```

### View Projections

**Purpose:** Client-facing UI queries with reactive updates.

**Characteristics:**

- Denormalized for efficient queries
- Near real-time freshness (< 50ms for local changes)
- Client-exposed via `useQuery` hooks
- Reactive subscription support

**Example Use Cases:**

- Order list with status and totals
- Product catalog with prices
- User dashboard data

```typescript
defineProjection({
  projectionName: "orderSummary",
  description: "Order listing with status, totals, and item counts",
  category: "view",
  // ... other fields
});
```

### Reporting Projections

**Purpose:** Analytics, aggregations, and admin dashboards.

**Characteristics:**

- Aggregated data (counts, sums, averages)
- Eventually consistent - batch updates acceptable
- Admin-only access (future: role-based restrictions)
- No reactive subscription overhead

**Example Use Cases:**

- Daily sales reports
- Inventory turnover analytics
- Customer behavior metrics

```typescript
defineProjection({
  projectionName: "dailySalesReport",
  description: "Aggregated daily sales metrics",
  category: "reporting",
  // ... other fields
});
```

### Integration Projections

**Purpose:** Cross-context data synchronization via EventBus.

**Characteristics:**

- Contract-defined schemas
- Event-driven updates
- Not client-exposed (use EventBus for consumption)
- Enables bounded context communication

**Example Use Cases:**

- Order status for shipping context
- Customer data for billing context
- Inventory levels for storefront

```typescript
defineProjection({
  projectionName: "orderStatusForShipping",
  description: "Order status updates for shipping bounded context",
  category: "integration",
  // ... other fields
});
```

## Decision Matrix

```
Is this for command validation?
  └─ Yes → "logic"
  └─ No ↓

Is this client-facing UI data?
  └─ Yes → "view"
  └─ No ↓

Is this analytics/reporting?
  └─ Yes → "reporting"
  └─ No ↓

Is this cross-context communication?
  └─ Yes → "integration"
```

## API Reference

### Type Guard

```typescript
import { isProjectionCategory } from "@libar-dev/platform-core";

if (isProjectionCategory(value)) {
  // value is typed as ProjectionCategory
}
```

### Helper Functions

```typescript
import {
  isLogicProjection,
  isViewProjection,
  isReportingProjection,
  isIntegrationProjection,
  isClientExposed,
} from "@libar-dev/platform-core";

// Check category
if (isViewProjection(projection.category)) {
  // Enable reactive subscriptions
}

// Check client exposure
if (isClientExposed(projection.category)) {
  // Include in client API
}
```

### Validation

```typescript
import { validateProjectionCategory, PROJECTION_VALIDATION_ERRORS } from "@libar-dev/platform-core";

const result = validateProjectionCategory(input);
if (!result.valid) {
  // result.error.code is "CATEGORY_REQUIRED" or "INVALID_CATEGORY"
  console.log(result.error.suggestedCategories);
}
```

### Registry Lookup

```typescript
import { createProjectionRegistry } from "@libar-dev/platform-core";

const registry = createProjectionRegistry();
// ... register projections

// Get all view projections (for reactive layer)
const viewProjections = registry.getByCategory("view");

// Get all integration projections (for EventBus routing)
const integrationProjections = registry.getByCategory("integration");
```

## Future Enhancements

The following features are planned for future patterns:

1. **Runtime Client Exposure Enforcement** - Block non-view projections from client queries
2. **Reactive Subscription Blocking** - Prevent subscriptions on non-view categories
3. **Admin Role Enforcement** - Restrict reporting projections to admin users
4. **EventBus Integration** - Auto-publish integration projection updates

## Related Patterns

- [Reactive Projections](../patterns/reactive-projections.md) (Phase 17)
- [Integration Patterns](../patterns/integration.md) (Phase 21)
- [Query Routing](../patterns/query-routing.md) (Future)

## References

- Roadmap Spec: `delivery-process/specs/platform/projection-categories.feature`
- Type Definition: `@libar-dev/platform-core/src/projections/categories.ts`
- Validation: `@libar-dev/platform-core/src/projections/validation.ts`
