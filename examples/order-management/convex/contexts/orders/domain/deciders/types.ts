/**
 * Types for Order decider functions.
 *
 * Defines the event payloads and command inputs for pure decider functions.
 * These types enable type-safe decider outputs without infrastructure dependencies.
 *
 * ## Schema Versions
 *
 * - OrderSubmittedPayload: V1 (legacy, no customer)
 * - OrderSubmittedV2Payload: V2 (with CustomerSnapshot for Fat Events)
 */

import type { DeciderEvent, DeciderContext } from "@libar-dev/platform-core/decider";
import type { OrderCMS, OrderItem } from "../order.js";
import type { CustomerSnapshot } from "../customer.js";

// =============================================================================
// Event Payloads
// =============================================================================

export interface OrderCreatedPayload {
  orderId: string;
  customerId: string;
}

export interface OrderItemAddedPayload {
  orderId: string;
  item: OrderItem;
  newTotalAmount: number;
}

export interface OrderItemRemovedPayload {
  orderId: string;
  productId: string;
  newTotalAmount: number;
  removedQuantity: number;
}

/**
 * OrderSubmitted V1 payload (legacy).
 * @deprecated Use OrderSubmittedV2Payload for new events.
 */
export interface OrderSubmittedPayload {
  orderId: string;
  customerId: string;
  items: OrderItem[];
  totalAmount: number;
  submittedAt: number;
}

/**
 * OrderSubmitted V2 payload (Fat Events pattern).
 *
 * Includes customer snapshot captured at submission time for
 * self-contained downstream processing.
 */
export interface OrderSubmittedV2Payload extends OrderSubmittedPayload {
  /** Customer snapshot at submission time (null for upcast V1 events) */
  customer: CustomerSnapshot | null;
}

export interface OrderConfirmedPayload {
  orderId: string;
  customerId: string;
  totalAmount: number;
  confirmedAt: number;
}

export interface OrderCancelledPayload {
  orderId: string;
  customerId: string;
  reason: string;
}

// =============================================================================
// Event Types (with typed payloads)
// =============================================================================

export type OrderCreatedEvent = DeciderEvent<OrderCreatedPayload> & {
  eventType: "OrderCreated";
};

export type OrderItemAddedEvent = DeciderEvent<OrderItemAddedPayload> & {
  eventType: "OrderItemAdded";
};

export type OrderItemRemovedEvent = DeciderEvent<OrderItemRemovedPayload> & {
  eventType: "OrderItemRemoved";
};

/**
 * OrderSubmitted V1 event (legacy).
 * @deprecated Use OrderSubmittedV2Event for new events.
 */
export type OrderSubmittedEvent = DeciderEvent<OrderSubmittedPayload> & {
  eventType: "OrderSubmitted";
};

/**
 * OrderSubmitted V2 event (Fat Events pattern).
 */
export type OrderSubmittedV2Event = DeciderEvent<OrderSubmittedV2Payload> & {
  eventType: "OrderSubmitted";
};

export type OrderConfirmedEvent = DeciderEvent<OrderConfirmedPayload> & {
  eventType: "OrderConfirmed";
};

export type OrderCancelledEvent = DeciderEvent<OrderCancelledPayload> & {
  eventType: "OrderCancelled";
};

// Union of all order events
// Note: Uses OrderSubmittedV2Event (Fat Events pattern) instead of deprecated V1
export type OrderEvent =
  | OrderCreatedEvent
  | OrderItemAddedEvent
  | OrderItemRemovedEvent
  | OrderSubmittedV2Event
  | OrderConfirmedEvent
  | OrderCancelledEvent;

// =============================================================================
// Command Inputs (without commandId/correlationId - those come from context)
// =============================================================================

export interface CreateOrderInput {
  orderId: string;
  customerId: string;
}

export interface AddOrderItemInput {
  orderId: string;
  item: OrderItem;
}

export interface RemoveOrderItemInput {
  orderId: string;
  productId: string;
}

export interface SubmitOrderInput {
  orderId: string;
}

export interface ConfirmOrderInput {
  orderId: string;
}

export interface CancelOrderInput {
  orderId: string;
  reason: string;
}

// =============================================================================
// State Update Types
// =============================================================================

/**
 * Partial OrderCMS state update from decider.
 * Handler wrapper adds version and timestamp.
 */
export type OrderStateUpdate = Partial<Pick<OrderCMS, "status" | "items" | "totalAmount">>;

// =============================================================================
// Success Data Types (canonical definitions - handlers re-export these)
// =============================================================================

export interface CreateOrderData {
  orderId: string;
  customerId: string;
}

export interface AddOrderItemData {
  orderId: string;
  itemCount: number;
  totalAmount: number;
}

export interface RemoveOrderItemData {
  orderId: string;
  itemCount: number;
  totalAmount: number;
}

export interface SubmitOrderData {
  orderId: string;
  customerId: string;
  totalAmount: number;
  itemCount: number;
  items: OrderItem[];
}

export interface ConfirmOrderData {
  orderId: string;
}

export interface CancelOrderData {
  orderId: string;
  customerId: string;
  reason: string;
}

// =============================================================================
// Extended Context Types
// =============================================================================

/**
 * Extended context for SubmitOrder decider with customer enrichment.
 *
 * The customerSnapshot is loaded by the handler before calling the decider,
 * keeping the decider pure while enabling Fat Events enrichment.
 */
export interface SubmitOrderContext extends DeciderContext {
  /** Customer snapshot for event enrichment */
  customerSnapshot: CustomerSnapshot;
}

// =============================================================================
// Re-export context type for convenience
// =============================================================================

export type { DeciderContext };
export type { CustomerSnapshot };
