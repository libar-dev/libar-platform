/**
 * ## OrderSummary Evolve Function - Shared Client/Server Logic
 *
 * Pure function for evolving order summary state based on domain events.
 *
 * This function runs identically on:
 * - **Server**: During durable projection updates via Workpool
 * - **Client**: During optimistic UI updates via useReactiveProjection
 *
 * ### Critical Requirements
 *
 * 1. **Pure Function**: No side effects, no I/O, no ctx access
 * 2. **Deterministic**: Same inputs always produce same outputs
 * 3. **Total**: Handles ALL event types (unknown types return state unchanged)
 *
 * @libar-docs
 * @libar-docs-implements ReactiveProjections
 * @libar-docs-status completed
 */

// Types for documentation purposes - the evolve function implements EvolveFunction pattern
// import type { EvolveFunction, ReactiveDomainEvent } from "@libar-dev/platform-core";

// ============================================================================
// State Type
// ============================================================================

/**
 * Order summary projection state.
 *
 * This type matches the `orderSummaries` table schema.
 */
export interface OrderSummaryState {
  /** Order identifier */
  orderId: string;
  /** Customer identifier */
  customerId: string;
  /** Current order status */
  status: "draft" | "submitted" | "confirmed" | "cancelled";
  /** Number of items in the order */
  itemCount: number;
  /** Total order amount in cents */
  totalAmount: number;
  /** When the order was created */
  createdAt: number;
  /** When the order was last updated */
  updatedAt: number;
  /** Last processed event's global position for conflict detection */
  lastGlobalPosition: number;
}

// ============================================================================
// Event Types
// ============================================================================

/**
 * Order domain event for reactive projection.
 *
 * Uses the base ReactiveDomainEvent interface with Order-specific event types.
 */
export interface OrderProjectionEvent {
  eventType: OrderEventType | string;
  globalPosition: number;
  payload: Record<string, unknown>;
}

export type OrderEventType =
  | "OrderCreated"
  | "OrderItemAdded"
  | "OrderItemRemoved"
  | "OrderSubmitted"
  | "OrderConfirmed"
  | "OrderCancelled";

/**
 * Discriminated union of all order event payloads.
 */
export type OrderEventPayload =
  | OrderCreatedPayload
  | OrderItemAddedPayload
  | OrderItemRemovedPayload
  | OrderSubmittedPayload
  | OrderConfirmedPayload
  | OrderCancelledPayload;

export interface OrderCreatedPayload {
  orderId: string;
  customerId: string;
}

export interface OrderItemAddedPayload {
  orderId: string;
  item: {
    productId: string;
    productName: string;
    quantity: number;
    unitPrice: number;
  };
  newTotalAmount: number;
}

export interface OrderItemRemovedPayload {
  orderId: string;
  productId: string;
  newTotalAmount: number;
  removedQuantity: number;
}

export interface OrderSubmittedPayload {
  orderId: string;
  customerId: string;
  items: Array<{
    productId: string;
    productName: string;
    quantity: number;
    unitPrice: number;
  }>;
  totalAmount: number;
  submittedAt: number;
}

export interface OrderConfirmedPayload {
  orderId: string;
  customerId: string;
  totalAmount: number;
  confirmedAt: number;
}

export interface OrderCancelledPayload {
  orderId: string;
  reason: string;
}

// ============================================================================
// Evolve Function
// ============================================================================

/**
 * Evolve order summary state based on a domain event.
 *
 * This is a PURE FUNCTION - no side effects, no I/O.
 * It can run on both server (durable) and client (optimistic).
 *
 * @param state - Current order summary state
 * @param event - Domain event to apply
 * @returns New state after applying the event
 *
 * @example
 * ```typescript
 * // On server (durable projection)
 * const newState = evolveOrderSummary(currentState, orderSubmittedEvent);
 *
 * // On client (optimistic update)
 * const optimisticState = evolveOrderSummary(projectionData, recentEvent);
 * ```
 *
 * ---
 *
 * ### Type Assertion Pattern (Code Review Note)
 *
 * The `as unknown as` pattern used below is intentional for evolve functions:
 *
 * ```typescript
 * const payload = event.payload as unknown as OrderCreatedPayload;
 * ```
 *
 * **Why this approach:**
 * - Event payloads come from the event store as `Record<string, unknown>`
 * - Runtime validation happens at the event store level during write
 * - Evolve functions assume valid events (trust the event store)
 * - Discriminated unions would require full payload validation per-call
 *
 * **Alternative approaches considered:**
 * - Runtime type guards: Adds overhead to hot path, benefits unclear
 * - Zod parsing: Heavy dependency, too slow for optimistic updates
 * - Full discriminated unions: Requires complete rewrite of event schemas
 *
 * The current approach provides type safety at development time while
 * trusting the event store's write-time validation at runtime.
 *
 * ---
 *
 * NOTE(purity): Use event timestamp for deterministic client/server consistency.
 * Falls back to Date.now() only if event timestamp is not available.
 */
export const evolveOrderSummary = (
  state: OrderSummaryState,
  event: OrderProjectionEvent
): OrderSummaryState => {
  // Derive timestamp from event for deterministic results across client/server
  // The event store includes _creationTime on all events
  // Falls back to Date.now() for backwards compatibility with events missing timestamps
  const payload = event.payload;
  const now =
    (payload["_creationTime"] as number) ?? (payload["timestamp"] as number) ?? Date.now();

  switch (event.eventType) {
    case "OrderCreated": {
      const payload = event.payload as unknown as OrderCreatedPayload;
      return {
        orderId: payload.orderId,
        customerId: payload.customerId,
        status: "draft" as const,
        itemCount: 0,
        totalAmount: 0,
        createdAt: now,
        updatedAt: now,
        lastGlobalPosition: event.globalPosition,
      };
    }

    case "OrderItemAdded": {
      const payload = event.payload as unknown as OrderItemAddedPayload;
      return {
        ...state,
        itemCount: state.itemCount + payload.item.quantity,
        totalAmount: payload.newTotalAmount,
        updatedAt: now,
        lastGlobalPosition: event.globalPosition,
      };
    }

    case "OrderItemRemoved": {
      const payload = event.payload as unknown as OrderItemRemovedPayload;
      return {
        ...state,
        itemCount: Math.max(0, state.itemCount - payload.removedQuantity),
        totalAmount: payload.newTotalAmount,
        updatedAt: now,
        lastGlobalPosition: event.globalPosition,
      };
    }

    case "OrderSubmitted": {
      const payload = event.payload as unknown as OrderSubmittedPayload;
      const itemCount = payload.items.reduce((sum, item) => sum + item.quantity, 0);
      return {
        ...state,
        status: "submitted" as const,
        itemCount,
        totalAmount: payload.totalAmount,
        updatedAt: now,
        lastGlobalPosition: event.globalPosition,
      };
    }

    case "OrderConfirmed": {
      return {
        ...state,
        status: "confirmed" as const,
        updatedAt: now,
        lastGlobalPosition: event.globalPosition,
      };
    }

    case "OrderCancelled": {
      return {
        ...state,
        status: "cancelled" as const,
        updatedAt: now,
        lastGlobalPosition: event.globalPosition,
      };
    }

    default:
      // Unknown event type - return state unchanged (no error)
      // This is critical for forward compatibility when new events are added
      return state;
  }
};

/**
 * Create initial order summary state from an OrderCreated event.
 *
 * Use this when the projection doesn't exist yet and we receive
 * the creation event.
 *
 * @param event - OrderCreated event
 * @returns Initial order summary state
 */
export function createInitialOrderSummary(event: OrderProjectionEvent): OrderSummaryState {
  if (event.eventType !== "OrderCreated") {
    throw new Error(`Cannot create initial state from event type: ${event.eventType}`);
  }

  const payload = event.payload as unknown as OrderCreatedPayload;
  // Derive timestamp from event for deterministic results
  const now =
    (event.payload["_creationTime"] as number) ??
    (event.payload["timestamp"] as number) ??
    Date.now();

  return {
    orderId: payload.orderId,
    customerId: payload.customerId,
    status: "draft",
    itemCount: 0,
    totalAmount: 0,
    createdAt: now,
    updatedAt: now,
    lastGlobalPosition: event.globalPosition,
  };
}
