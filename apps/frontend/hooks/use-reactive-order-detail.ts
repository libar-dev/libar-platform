"use client";

/**
 * ## useReactiveOrderDetail - Reactive Order Summary Hook
 *
 * Provides instant UI updates (10-50ms) for order detail views.
 *
 * Combines:
 * - Durable orderSummary projection (Workpool-processed)
 * - Recent events from event store (reactive push)
 * - Shared evolve logic (same on client and server)
 *
 * @libar-docs
 * @libar-docs-implements ReactiveProjections
 * @libar-docs-status completed
 */

import { useQuery } from "convex/react";
import { makeFunctionReference } from "convex/server";
import type { FunctionReference } from "convex/server";
import { useReactiveProjection, type ReactiveProjectionResult } from "./use-reactive-projection";
import type { OrderStatus } from "@/types";

// ============================================================================
// Type Guards
// ============================================================================

/**
 * Valid order statuses for runtime validation.
 * Must match the OrderStatus type definition in @/types.
 */
const ORDER_STATUSES = ["draft", "submitted", "confirmed", "cancelled"] as const;

/**
 * Type guard to validate OrderStatus at runtime.
 *
 * Prevents silent type errors if the schema evolves with new statuses
 * that the client doesn't recognize yet.
 *
 * @param s - String to validate
 * @returns True if s is a valid OrderStatus
 */
function isOrderStatus(s: string): s is OrderStatus {
  return (ORDER_STATUSES as readonly string[]).includes(s);
}

// ============================================================================
// Types
// ============================================================================

/**
 * Order summary state for reactive projection.
 *
 * Matches the orderSummaries table schema.
 */
export interface OrderSummaryState {
  orderId: string;
  customerId: string;
  status: OrderStatus;
  itemCount: number;
  totalAmount: number;
  createdAt: number;
  updatedAt: number;
  /** Last processed event's global position for conflict detection */
  lastGlobalPosition: number;
}

/**
 * Order event for reactive projection.
 */
export interface OrderProjectionEvent {
  eventType: string;
  globalPosition: number;
  payload: Record<string, unknown>;
}

// ============================================================================
// Query References (TS2589 Prevention)
// ============================================================================
// Using makeFunctionReference() bypasses Convex's FilterApi recursive type
// resolution entirely. This prevents TS2589 errors when accessing api paths.
// ============================================================================

/** Return type for getOrderSummary query */
interface OrderSummaryProjection {
  _id: string;
  _creationTime: number;
  orderId: string;
  customerId: string;
  status: string;
  itemCount: number;
  totalAmount: number;
  createdAt: number;
  updatedAt: number;
  lastGlobalPosition?: number;
}

/** Return type for getRecentOrderEvents query */
interface RecentEvent {
  eventId: string;
  eventType: string;
  globalPosition: number;
  timestamp: number;
  payload: Record<string, unknown>;
}

const getOrderSummaryQuery = makeFunctionReference<"query">(
  "orders:getOrderSummary"
) as FunctionReference<"query", "public", { orderId: string }, OrderSummaryProjection | null>;

const getRecentOrderEventsQuery = makeFunctionReference<"query">(
  "queries/events:getRecentOrderEvents"
) as FunctionReference<
  "query",
  "public",
  { orderId: string; afterGlobalPosition?: number },
  RecentEvent[]
>;

// ============================================================================
// Evolve Function
// ============================================================================

/**
 * Evolve order summary state based on a domain event.
 *
 * This is a PURE FUNCTION - runs identically on client and server.
 *
 * NOTE: This duplicates the server-side evolve logic. In a production setup,
 * you would share this via a common package that both client and server import.
 *
 * @param state - Current order summary state
 * @param event - Domain event to apply
 * @returns New state after applying the event
 *
 * TODO(shared-evolve): Extract shared evolve functions into a common package.
 *
 * **Server-side canonical version:**
 * - `examples/order-management/convex/projections/evolve/orderSummary.evolve.ts`
 *
 * **Why direct import doesn't work:**
 * - Convex folder is compiled separately for the Convex runtime
 * - Frontend uses different build system (Next.js/Vite) with different path resolution
 * - Cross-boundary imports would require coordinated bundler configuration
 *
 * **Implementation approach:**
 * 1. Create `packages/platform-order-evolve` package with shared evolve functions
 * 2. Export types (OrderSummaryState, OrderProjectionEvent) and evolve function
 * 3. Configure both frontend and convex to resolve the shared package
 * 4. Update this file to import from the shared package
 *
 * **When to do this:** When adding more reactive projections, the duplication cost exceeds setup cost.
 *
 * NOTE(purity): Use event timestamp for deterministic client/server consistency.
 * Falls back to Date.now() only if event timestamp is not available.
 */
function evolveOrderSummary(
  state: OrderSummaryState,
  event: OrderProjectionEvent
): OrderSummaryState {
  const payload = event.payload;
  // Derive timestamp from event for deterministic results across client/server
  // The event store includes _creationTime on all events, accessible via payload._creationTime
  // Falls back to Date.now() for backwards compatibility with events missing timestamps
  const now = (payload._creationTime as number) ?? (payload.timestamp as number) ?? Date.now();

  switch (event.eventType) {
    case "OrderCreated": {
      return {
        orderId: (payload.orderId as string) ?? state.orderId,
        customerId: (payload.customerId as string) ?? state.customerId,
        status: "draft",
        itemCount: 0,
        totalAmount: 0,
        createdAt: now,
        updatedAt: now,
        lastGlobalPosition: event.globalPosition,
      };
    }

    case "OrderItemAdded": {
      const item = payload.item as { quantity?: number } | undefined;
      const newTotalAmount = payload.newTotalAmount as number | undefined;
      return {
        ...state,
        itemCount: state.itemCount + (item?.quantity ?? 1),
        totalAmount: newTotalAmount ?? state.totalAmount,
        updatedAt: now,
        lastGlobalPosition: event.globalPosition,
      };
    }

    case "OrderItemRemoved": {
      const newTotalAmount = payload.newTotalAmount as number | undefined;
      const removedQuantity = payload.removedQuantity as number | undefined;
      return {
        ...state,
        itemCount: Math.max(0, state.itemCount - (removedQuantity ?? 0)),
        totalAmount: newTotalAmount ?? state.totalAmount,
        updatedAt: now,
        lastGlobalPosition: event.globalPosition,
      };
    }

    case "OrderSubmitted": {
      const items = payload.items as Array<{ quantity: number }> | undefined;
      const totalAmount = payload.totalAmount as number | undefined;
      const itemCount = items?.reduce((sum, item) => sum + item.quantity, 0);
      return {
        ...state,
        status: "submitted",
        itemCount: itemCount ?? state.itemCount,
        totalAmount: totalAmount ?? state.totalAmount,
        updatedAt: now,
        lastGlobalPosition: event.globalPosition,
      };
    }

    case "OrderConfirmed": {
      return {
        ...state,
        status: "confirmed",
        updatedAt: now,
        lastGlobalPosition: event.globalPosition,
      };
    }

    case "OrderCancelled": {
      return {
        ...state,
        status: "cancelled",
        updatedAt: now,
        lastGlobalPosition: event.globalPosition,
      };
    }

    default:
      // Unknown event type - return state unchanged
      return state;
  }
}

/**
 * Get position from order summary state.
 * Uses lastGlobalPosition for accurate conflict detection.
 */
function getPosition(state: OrderSummaryState): number {
  return state.lastGlobalPosition ?? 0;
}

// ============================================================================
// Hook
// ============================================================================

/**
 * Hook for reactive order detail with instant UI updates.
 *
 * @param orderId - Order ID to fetch and subscribe to
 * @returns Reactive projection result with order summary state
 *
 * @example
 * ```tsx
 * function OrderDetail({ orderId }: { orderId: string }) {
 *   const { state, isOptimistic, isLoading, pendingEvents } =
 *     useReactiveOrderDetail(orderId);
 *
 *   if (isLoading) return <Skeleton />;
 *   if (!state) return <NotFound />;
 *
 *   return (
 *     <Card>
 *       <CardHeader>
 *         <h2>Order {state.orderId}</h2>
 *         {isOptimistic && <Badge>Updating...</Badge>}
 *       </CardHeader>
 *       <CardContent>
 *         <p>Status: {state.status}</p>
 *         <p>Items: {state.itemCount}</p>
 *         <p>Total: ${state.totalAmount}</p>
 *       </CardContent>
 *     </Card>
 *   );
 * }
 * ```
 */
export function useReactiveOrderDetail(
  orderId: string | undefined
): ReactiveProjectionResult<OrderSummaryState> {
  // Subscribe to durable projection (skip when orderId is undefined)
  const projection = useQuery(getOrderSummaryQuery, orderId ? { orderId } : "skip");

  // Subscribe to recent events after the projection checkpoint
  // We use updatedAt as a proxy for global position since the projection
  // doesn't store globalPosition directly
  //
  // TODO(optimization): Events are fetched unconditionally. In Convex, the "skip"
  // pattern would be: useQuery(api.queries.events.getRecentOrderEvents, projection ? { ... } : "skip")
  // However, this creates a cascading dependency where events can't be fetched until
  // projection loads, adding latency. The current approach trades slightly more
  // bandwidth for faster initial load by fetching both in parallel.
  //
  // If bandwidth becomes a concern, consider:
  // 1. Using the "skip" pattern and accepting the latency
  // 2. Adding a dedicated query that combines projection + events in one call
  const recentEvents = useQuery(
    getRecentOrderEventsQuery,
    orderId
      ? {
          orderId,
          // Note: We can't dynamically pass afterGlobalPosition: projection?.updatedAt
          // due to React hook rules (can't conditionally call hooks)
        }
      : "skip"
  );

  // Transform durable projection to our state type
  const projectionState: OrderSummaryState | null | undefined =
    projection === undefined
      ? undefined
      : projection === null
        ? null
        : {
            orderId: projection.orderId,
            customerId: projection.customerId,
            // Use type guard for runtime safety - defaults to 'draft' for unknown statuses
            status: isOrderStatus(projection.status) ? projection.status : "draft",
            itemCount: projection.itemCount,
            totalAmount: projection.totalAmount,
            createdAt: projection.createdAt,
            updatedAt: projection.updatedAt,
            // Default to 0 if not set (projection may not have lastGlobalPosition column)
            lastGlobalPosition: projection.lastGlobalPosition ?? 0,
          };

  // Transform events to our event type
  const events: OrderProjectionEvent[] | null | undefined =
    recentEvents === undefined
      ? undefined
      : recentEvents === null
        ? null
        : recentEvents.map((e) => ({
            eventType: e.eventType,
            globalPosition: e.globalPosition,
            payload: e.payload as Record<string, unknown>,
          }));

  // Use the reactive projection hook
  return useReactiveProjection({
    projection: projectionState,
    recentEvents: events,
    evolve: evolveOrderSummary,
    getPosition,
  });
}
