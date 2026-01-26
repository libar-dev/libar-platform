# Reactive Projections Architecture

> **Pattern:** ReactiveProjections | **Phase:** 17 | **Status:** Active

Hybrid projection model combining Workpool durability with Convex reactive subscriptions for 10-50ms UI updates without polling.

## Problem Statement

Workpool-based projections have 100-500ms latency. Modern users expect instant feedback (10-50ms) for their actions without resorting to polling.

| Challenge                    | Impact                        |
| ---------------------------- | ----------------------------- |
| 100-500ms projection latency | UI feels sluggish             |
| Polling overhead             | Resource waste, battery drain |
| Eventual consistency         | User confusion when UI lags   |

## Solution: Hybrid Model

Combine Workpool durability with reactive push for instant optimistic updates.

```
Command Handler
     ↓ (append event)
Event Store
     ↓
     ├─→ Workpool (durable, 100-500ms)
     │        ↓
     │   Projection Update
     │
     └─→ Reactive Query (instant, 10-50ms)
              ↓
         Client merges:
         projection + applyEvents(recentEvents)
```

### Key Benefits

| Benefit              | How                                       |
| -------------------- | ----------------------------------------- |
| Instant feedback     | 10-50ms via reactive subscriptions        |
| No polling           | Convex handles push automatically         |
| Durability preserved | Workpool ensures eventual consistency     |
| Graceful degradation | Falls back to durable state on conflict   |
| Shared logic         | Same evolve function on client and server |

## Architecture Components

### 1. Core Types (`platform-core/src/projections/reactive.ts`)

```typescript
// Pure function for state transformation
type EvolveFunction<TProjection, TEvent> = (state: TProjection, event: TEvent) => TProjection;

// Configuration for reactive subscription
interface ReactiveProjectionConfig<TProjection, TEvent> {
  projectionName: string;
  category: ProjectionCategory; // Must be "view"
  streamId: string;
  evolve: EvolveFunction<TProjection, TEvent>;
  getPosition: (projection: TProjection) => number;
}

// Result from the reactive hook
interface ReactiveProjectionResult<T> {
  state: T | null;
  isOptimistic: boolean;
  durablePosition: number;
  pendingEvents: number;
  error: ReactiveProjectionError | null;
}
```

### 2. Conflict Detection (`platform-core/src/projections/conflict.ts`)

Detects and resolves divergence between optimistic and durable state.

```typescript
// Compare positions to detect conflicts
const result = detectConflict(optimisticState, durableState);

if (result.hasConflict) {
  // Rollback to durable state
  const resolved = resolveConflict(result, optimisticData, durableData);
  showNotification(resolved.notificationMessage);
}
```

**Conflict Scenarios:**

| Scenario                    | Detection                              | Resolution            |
| --------------------------- | -------------------------------------- | --------------------- |
| Optimistic ahead of durable | `optimisticPosition > durablePosition` | No conflict - wait    |
| Same position, same events  | Positions and IDs match                | Converged - no action |
| Divergent branch            | Different event IDs at same position   | Rollback to durable   |
| Stale optimistic            | Age > 30 seconds                       | Rollback to durable   |

### 3. Shared Evolve Logic (`order-management/convex/projections/evolve/`)

Pure functions that run identically on client and server.

```typescript
// Must be: pure, deterministic, total (handle unknown events)
const evolveOrderSummary: EvolveFunction<OrderSummaryState, OrderEvent> = (state, event) => {
  // Use event timestamp for determinism - same result on client and server
  const timestamp = event.timestamp ?? event.payload?._creationTime ?? Date.now();
  switch (event.eventType) {
    case "OrderSubmitted":
      return { ...state, status: "submitted", updatedAt: timestamp };
    case "OrderConfirmed":
      return { ...state, status: "confirmed", updatedAt: timestamp };
    default:
      return state; // Unknown events pass through unchanged
  }
};
```

### 4. Event Stream Query (`order-management/convex/queries/events.ts`)

Convex query that subscribes to recent events for a specific entity.

```typescript
export const getRecentOrderEvents = query({
  args: {
    orderId: v.string(),
    afterGlobalPosition: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const events = await ctx.runQuery(components.eventStore.lib.readStream, {
      streamType: "Order",
      streamId: args.orderId,
    });

    // Filter to events after checkpoint
    if (args.afterGlobalPosition !== undefined) {
      return events.filter((e) => e.globalPosition > args.afterGlobalPosition);
    }
    return events.slice(-20); // Last 20 for safety
  },
});
```

### 5. React Hook (`apps/frontend/hooks/use-reactive-projection.ts`)

Combines durable projection with optimistic events.

```typescript
function useReactiveProjection<TProjection, TEvent>({
  projection,       // From useQuery (durable)
  recentEvents,     // From useQuery (events after checkpoint)
  evolve,           // Pure evolve function
  getPosition,      // Extract position from projection
}): ReactiveProjectionResult<TProjection> {
  return useMemo(() => {
    if (!projection) return { state: null, isLoading: true, ... };
    if (!recentEvents?.length) return { state: projection, isOptimistic: false, ... };

    // Merge durable + optimistic
    const merged = recentEvents.reduce(
      (state, event) => evolve(state, event),
      projection
    );

    return {
      state: merged,
      isOptimistic: true,
      durablePosition: getPosition(projection),
      pendingEvents: recentEvents.length,
    };
  }, [projection, recentEvents, evolve, getPosition]);
}
```

## Usage Example

```tsx
function OrderDetail({ orderId }: { orderId: string }) {
  // Option 1: Use the specific reactive hook
  const { state, isOptimistic, pendingEvents } = useReactiveOrderDetail(orderId);

  // Option 2: Build with the generic hook
  const projection = useQuery(api.orders.getOrderSummary, { orderId });
  const events = useQuery(api.queries.events.getRecentOrderEvents, { orderId });

  // Note: Projection should include lastGlobalPosition for accurate conflict detection
  // See v2 roadmap for schema migration to add this field
  const result = useReactiveProjection({
    projection,
    recentEvents: events,
    evolve: evolveOrderSummary,
    getPosition: (p) => p.lastGlobalPosition ?? 0,
  });

  if (result.isLoading) return <Skeleton />;
  if (!result.state) return <NotFound />;

  return (
    <Card>
      <h2>Order {result.state.orderId}</h2>
      <Badge>{result.state.status}</Badge>
      {result.isOptimistic && (
        <span className="text-muted">Updating... ({result.pendingEvents} pending)</span>
      )}
    </Card>
  );
}
```

## Eligibility Rules

**Only "view" category projections support reactive subscriptions.**

| Category    | Reactive | Reason                                |
| ----------- | -------- | ------------------------------------- |
| view        | ✓        | Client-facing, needs instant feedback |
| logic       | ✗        | Internal validation, no UI            |
| reporting   | ✗        | Analytics, eventual consistency OK    |
| integration | ✗        | Cross-BC sync via EventBus            |

```typescript
// Check eligibility before using reactive
if (!isReactiveEligible(projectionCategory)) {
  throw new Error("REACTIVE_NOT_SUPPORTED");
}
```

## Performance Considerations

### Event Filtering

- Limit to last 20 events per entity
- Filter by `afterGlobalPosition` to avoid re-processing
- Scope queries to specific `streamId`

### Evolve Function

- Must be pure (no side effects)
- Must be fast (< 1ms per event)
- Must be stable (same reference across renders)

### Conflict Detection

- Use `globalPosition` (not timestamps) for reliable ordering
- Check on every durable update
- Rollback immediately on conflict

## Implementation Checklist

- [x] Core types in `platform-core/src/projections/reactive.ts`
- [x] Conflict detection in `platform-core/src/projections/conflict.ts`
- [x] Shared evolve in `order-management/convex/projections/evolve/`
- [x] Event stream query in `order-management/convex/queries/events.ts`
- [x] React hook in `apps/frontend/hooks/use-reactive-projection.ts`
- [x] BDD tests in `platform-core/tests/steps/projections/reactive.steps.ts`

## Related Patterns

| Pattern                         | Relationship                          |
| ------------------------------- | ------------------------------------- |
| ProjectionCategories (Phase 15) | Provides `isViewProjection()` check   |
| Event Store                     | Source of events for reactive queries |
| Workpool                        | Handles durable projection processing |

## References

- [Feature Spec](/delivery-process/specs/platform/reactive-projections.feature)
- [Platform Core Package](/deps/libar-dev-packages/packages/platform/core/src/projections/)
- [Frontend Hooks](/apps/frontend/hooks/)
