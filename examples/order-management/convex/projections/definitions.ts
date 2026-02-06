/**
 * @libar-docs
 * @libar-docs-pattern ProjectionDefinitions
 * @libar-docs-status completed
 * @libar-docs-infra
 * @libar-docs-arch-role infrastructure
 * @libar-docs-arch-layer infrastructure
 *
 * Registry of all projection definitions and replay handler registry.
 * Central configuration for projection infrastructure.
 *
 * @since Phase 12
 */

import { defineProjection } from "@libar-dev/platform-bc";
import {
  createProjectionRegistry,
  createReplayHandlerRegistry,
  type StoredEventForReplay,
} from "@libar-dev/platform-core";
import { makeFunctionReference } from "convex/server";

// =============================================================================
// Orders Context Projections
// =============================================================================

/**
 * Order Summary Projection
 *
 * Maintains the orderSummaries table with order listings.
 * Updated on all order lifecycle events.
 */
export const orderSummaryProjection = defineProjection({
  projectionName: "orderSummary",
  description: "Order listing with status, totals, and item counts",
  targetTable: "orderSummaries",
  partitionKeyField: "orderId",
  eventSubscriptions: [
    "OrderCreated",
    "OrderItemAdded",
    "OrderItemRemoved",
    "OrderSubmitted",
    "OrderConfirmed",
    "OrderCancelled",
  ] as const,
  context: "orders",
  type: "primary",
  category: "view", // Client-facing order list UI
});

// =============================================================================
// Inventory Context Projections
// =============================================================================

/**
 * Active Reservations Projection
 *
 * Tracks active stock reservations for monitoring.
 * Updated on reservation lifecycle events.
 */
export const activeReservationsProjection = defineProjection({
  projectionName: "activeReservations",
  description: "Active stock reservations for monitoring and expiration",
  targetTable: "activeReservations",
  partitionKeyField: "reservationId",
  eventSubscriptions: [
    "StockReserved",
    "ReservationConfirmed",
    "ReservationReleased",
    "ReservationExpired",
  ] as const,
  context: "inventory",
  type: "primary",
  category: "view", // Client-facing reservation monitoring
});

/**
 * Product Catalog Projection
 *
 * Maintains the product catalog with stock availability.
 * Also updates the stockAvailability table as a secondary effect.
 */
export const productCatalogProjection = defineProjection({
  projectionName: "productCatalog",
  description: "Product catalog with current stock levels",
  targetTable: "productCatalog",
  partitionKeyField: "productId",
  eventSubscriptions: ["ProductCreated", "StockAdded"] as const,
  context: "inventory",
  type: "primary",
  category: "view", // Client-facing product listing
  secondaryTables: ["stockAvailability"],
});

// =============================================================================
// Customer Projections (for Agent Pattern Detection)
// =============================================================================

/**
 * Customer Cancellations Projection
 *
 * Maintains customer-level cancellation history for agent pattern detection.
 * Enables O(1) lookup instead of N+1 queries for churn risk analysis.
 *
 * @since Phase 22 (AgentAsBoundedContext) - N+1 Query Refactor
 */
export const customerCancellationsProjection = defineProjection({
  projectionName: "customerCancellations",
  description: "Customer cancellation history for agent pattern detection",
  targetTable: "customerCancellations",
  partitionKeyField: "customerId",
  eventSubscriptions: ["OrderCancelled"] as const,
  context: "orders",
  type: "primary",
  category: "logic", // Used by agent business logic, not direct UI
});

// =============================================================================
// Cross-Context Projections
// =============================================================================

/**
 * Order with Inventory Projection
 *
 * Cross-context view combining order and inventory status.
 * Useful for dashboards showing order fulfillment status.
 */
export const orderWithInventoryProjection = defineProjection({
  projectionName: "orderWithInventory",
  description: "Cross-context view of orders with inventory reservation status",
  targetTable: "orderWithInventoryStatus",
  partitionKeyField: "orderId",
  eventSubscriptions: [
    // Order events
    "OrderCreated",
    "OrderItemAdded",
    "OrderSubmitted",
    "OrderConfirmed",
    "OrderCancelled",
    // Inventory events
    "StockReserved",
    "ReservationFailed",
    "ReservationConfirmed",
    "ReservationReleased",
    "ReservationExpired",
  ] as const,
  context: "cross-context",
  type: "cross-context",
  category: "integration", // Cross-context synchronization
  sources: ["orders", "inventory"],
});

// =============================================================================
// Projection Registry
// =============================================================================

/**
 * All projection definitions for the order-management example app.
 */
export const PROJECTION_DEFINITIONS = {
  orderSummary: orderSummaryProjection,
  activeReservations: activeReservationsProjection,
  productCatalog: productCatalogProjection,
  orderWithInventory: orderWithInventoryProjection,
  customerCancellations: customerCancellationsProjection,
} as const;

/**
 * Projection names type.
 */
export type ProjectionName = keyof typeof PROJECTION_DEFINITIONS;

/**
 * Centralized projection registry.
 *
 * Use this for introspection, monitoring, and rebuild operations.
 *
 * @example
 * ```typescript
 * // Get projections that handle OrderCreated
 * const handlers = projectionRegistry.getByEventType("OrderCreated");
 *
 * // Get rebuild order (primary before cross-context)
 * const rebuildOrder = projectionRegistry.getRebuildOrder();
 * ```
 */
export const projectionRegistry = createProjectionRegistry();

// Register all projections
projectionRegistry.register(orderSummaryProjection);
projectionRegistry.register(activeReservationsProjection);
projectionRegistry.register(productCatalogProjection);
projectionRegistry.register(orderWithInventoryProjection);
projectionRegistry.register(customerCancellationsProjection);

// =============================================================================
// Replay Handler Registry (Phase 18b-1)
// =============================================================================

// TS2589 Prevention: Pre-declare handler function references at module level
const onOrderCreatedRef = makeFunctionReference<"mutation">(
  "projections/orders/orderSummary:onOrderCreated"
);
const onOrderItemAddedRef = makeFunctionReference<"mutation">(
  "projections/orders/orderSummary:onOrderItemAdded"
);
const onOrderItemRemovedRef = makeFunctionReference<"mutation">(
  "projections/orders/orderSummary:onOrderItemRemoved"
);
const onOrderSubmittedRef = makeFunctionReference<"mutation">(
  "projections/orders/orderSummary:onOrderSubmitted"
);
const onOrderConfirmedRef = makeFunctionReference<"mutation">(
  "projections/orders/orderSummary:onOrderConfirmed"
);
const onOrderCancelledRef = makeFunctionReference<"mutation">(
  "projections/orders/orderSummary:onOrderCancelled"
);

// Customer cancellations projection handler
const onCustomerCancellationRef = makeFunctionReference<"mutation">(
  "projections/customers/customerCancellations:onOrderCancelled"
);

/**
 * Replay handler registry for projection rebuilding.
 *
 * Maps (projectionName, eventType) to handler mutations with arg transformers.
 * Used by processReplayChunk to apply projection logic during replay.
 *
 * @example
 * ```typescript
 * const handler = replayHandlerRegistry.get("orderSummary", "OrderCreated");
 * if (handler) {
 *   const args = handler.toArgsFromEvent(event);
 *   await ctx.runMutation(handler.handler, args);
 * }
 * ```
 */
export const replayHandlerRegistry = createReplayHandlerRegistry();

// Register orderSummary projection handlers
replayHandlerRegistry.register("orderSummary", {
  OrderCreated: {
    handler: onOrderCreatedRef,
    toArgsFromEvent: (event: StoredEventForReplay) => ({
      orderId: event.payload["orderId"] as string,
      customerId: event.payload["customerId"] as string,
      eventId: event.eventId,
      globalPosition: event.globalPosition,
    }),
  },
  OrderItemAdded: {
    handler: onOrderItemAddedRef,
    toArgsFromEvent: (event: StoredEventForReplay) => ({
      orderId: event.payload["orderId"] as string,
      itemCount: event.payload["itemCount"] as number,
      totalAmount: event.payload["totalAmount"] as number,
      eventId: event.eventId,
      globalPosition: event.globalPosition,
    }),
  },
  OrderItemRemoved: {
    handler: onOrderItemRemovedRef,
    toArgsFromEvent: (event: StoredEventForReplay) => ({
      orderId: event.payload["orderId"] as string,
      itemCount: event.payload["itemCount"] as number,
      totalAmount: event.payload["totalAmount"] as number,
      eventId: event.eventId,
      globalPosition: event.globalPosition,
    }),
  },
  OrderSubmitted: {
    handler: onOrderSubmittedRef,
    toArgsFromEvent: (event: StoredEventForReplay) => ({
      orderId: event.payload["orderId"] as string,
      eventId: event.eventId,
      globalPosition: event.globalPosition,
    }),
  },
  OrderConfirmed: {
    handler: onOrderConfirmedRef,
    toArgsFromEvent: (event: StoredEventForReplay) => ({
      orderId: event.payload["orderId"] as string,
      eventId: event.eventId,
      globalPosition: event.globalPosition,
    }),
  },
  OrderCancelled: {
    handler: onOrderCancelledRef,
    toArgsFromEvent: (event: StoredEventForReplay) => ({
      orderId: event.payload["orderId"] as string,
      reason: event.payload["reason"] as string | undefined,
      eventId: event.eventId,
      globalPosition: event.globalPosition,
    }),
  },
});

// Register customerCancellations projection handler (for agent pattern detection)
replayHandlerRegistry.register("customerCancellations", {
  OrderCancelled: {
    handler: onCustomerCancellationRef,
    toArgsFromEvent: (event: StoredEventForReplay) => ({
      orderId: event.payload["orderId"] as string,
      customerId: event.payload["customerId"] as string,
      reason: (event.payload["reason"] as string) ?? "",
      eventId: event.eventId,
      globalPosition: event.globalPosition,
      timestamp: event.timestamp,
    }),
  },
});

// Note: Additional projections (activeReservations, productCatalog) can be
// registered here when their replay handlers are needed.
