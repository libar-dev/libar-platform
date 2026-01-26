/**
 * Reactive Projection Test Fixtures
 *
 * Deterministic factories for creating test events and projection states
 * for reactive projection BDD tests.
 *
 * These fixtures enable testing the reactive projection pattern:
 * - Shared evolve function behavior
 * - Event merging via createReactiveResult()
 * - Conflict detection and resolution
 *
 * @since Phase 23 (Example App Modernization - Rule 2)
 */

import type {
  OrderProjectionEvent,
  OrderSummaryState,
  OrderItemAddedPayload,
  OrderSubmittedPayload,
} from "../../convex/projections/evolve/orderSummary.evolve";

// ============================================================================
// Constants
// ============================================================================

/**
 * Fixed timestamp for deterministic test results.
 * All events and projections use this as the base timestamp.
 */
export const TEST_TIMESTAMP = 1700000000000;

// ============================================================================
// Event Factories
// ============================================================================

/**
 * Create a test event with deterministic timestamp.
 *
 * @param eventType - The event type (OrderCreated, OrderItemAdded, etc.)
 * @param globalPosition - The event's position in the stream
 * @param payload - Event-specific payload fields
 * @returns A complete OrderProjectionEvent
 */
export function createTestEvent(
  eventType: string,
  globalPosition: number,
  payload: Record<string, unknown> = {}
): OrderProjectionEvent {
  return {
    eventType,
    globalPosition,
    payload: {
      ...payload,
      _creationTime: TEST_TIMESTAMP + globalPosition * 1000,
    },
  };
}

/**
 * Create an OrderItemAdded event.
 *
 * @param globalPosition - Event position in the stream
 * @param item - The item being added
 * @param newTotalAmount - The new total after adding the item
 * @returns OrderItemAdded event
 */
export function createItemAddedEvent(
  globalPosition: number,
  item: OrderItemAddedPayload["item"],
  newTotalAmount: number
): OrderProjectionEvent {
  return createTestEvent("OrderItemAdded", globalPosition, {
    orderId: "test-order",
    item,
    newTotalAmount,
  } satisfies Omit<OrderItemAddedPayload, "_creationTime">);
}

/**
 * Create an OrderSubmitted event.
 *
 * @param globalPosition - Event position in the stream
 * @param items - Array of items in the order
 * @param totalAmount - Total order amount
 * @returns OrderSubmitted event
 */
export function createOrderSubmittedEvent(
  globalPosition: number,
  items: OrderSubmittedPayload["items"],
  totalAmount: number
): OrderProjectionEvent {
  return createTestEvent("OrderSubmitted", globalPosition, {
    orderId: "test-order",
    customerId: "test-customer",
    items,
    totalAmount,
    submittedAt: TEST_TIMESTAMP + globalPosition * 1000,
  } satisfies Omit<OrderSubmittedPayload, "_creationTime">);
}

// ============================================================================
// Projection Factories
// ============================================================================

/**
 * Create a base order summary projection state.
 *
 * @param orderId - Order identifier
 * @param status - Current order status
 * @param itemCount - Number of items in the order
 * @param totalAmount - Total order amount
 * @returns A complete OrderSummaryState
 */
export function createBaseProjection(
  orderId: string,
  status: OrderSummaryState["status"] = "draft",
  itemCount: number = 0,
  totalAmount: number = 0
): OrderSummaryState {
  return {
    orderId,
    customerId: "test-customer",
    status,
    itemCount,
    totalAmount,
    createdAt: TEST_TIMESTAMP,
    updatedAt: TEST_TIMESTAMP,
    lastGlobalPosition: 0,
  };
}

/**
 * Create a projection with a specific global position.
 *
 * Useful for testing stale cursor scenarios where the projection
 * is at a known position.
 *
 * @param orderId - Order identifier
 * @param globalPosition - The lastGlobalPosition value
 * @param itemCount - Number of items
 * @param totalAmount - Total amount
 * @returns OrderSummaryState with specified position
 */
export function createProjectionAtPosition(
  orderId: string,
  globalPosition: number,
  itemCount: number = 0,
  totalAmount: number = 0
): OrderSummaryState {
  return {
    ...createBaseProjection(orderId, "draft", itemCount, totalAmount),
    lastGlobalPosition: globalPosition,
    updatedAt: TEST_TIMESTAMP + globalPosition * 1000,
  };
}

// ============================================================================
// Batch Event Factories
// ============================================================================

/**
 * Create a sequence of OrderItemAdded events.
 *
 * @param count - Number of events to create
 * @param startPosition - Starting global position
 * @param baseItemCount - Starting item count (for running totals)
 * @returns Array of OrderItemAdded events
 */
export function createItemAddedEventSequence(
  count: number,
  startPosition: number,
  baseItemCount: number = 0
): OrderProjectionEvent[] {
  const events: OrderProjectionEvent[] = [];

  for (let i = 0; i < count; i++) {
    const position = startPosition + i;
    const currentItemCount = baseItemCount + i + 1;
    const unitPrice = 25; // Fixed price for simplicity

    events.push(
      createItemAddedEvent(
        position,
        {
          productId: `prod_${position}`,
          productName: `Product ${position}`,
          quantity: 1,
          unitPrice,
        },
        currentItemCount * unitPrice
      )
    );
  }

  return events;
}

// ============================================================================
// Test Item Factories
// ============================================================================

/**
 * Create a simple test item for OrderItemAdded events.
 *
 * @param index - Item index (for unique identifiers)
 * @param unitPrice - Price per unit
 * @returns An item object
 */
export function createTestItem(
  index: number,
  unitPrice: number = 25
): OrderItemAddedPayload["item"] {
  return {
    productId: `prod_${index}`,
    productName: `Product ${index}`,
    quantity: 1,
    unitPrice,
  };
}
