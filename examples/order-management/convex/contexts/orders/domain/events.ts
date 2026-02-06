/**
 * @libar-docs
 * @libar-docs-pattern OrderDomainEvents
 * @libar-docs-status completed
 * @libar-docs-event-sourcing
 * @libar-docs-arch-role bounded-context
 * @libar-docs-arch-context orders
 * @libar-docs-arch-layer domain
 * @libar-docs-used-by OrderCommandHandlers, OrderSummaryProjection, OrderFulfillmentSaga, OrderNotificationPM, ReservationReleasePM
 *
 * Orders BC domain events (6 types, 2 schema versions).
 * V1: Original schemas. V2: OrderSubmitted with CustomerSnapshot (Fat Events).
 * Use upcasters to migrate V1 events to V2 at read time.
 */
import { z } from "zod";
import { createDomainEventSchema } from "@libar-dev/platform-core";
import { OrderItemSchema } from "./order.js";

// Re-export OrderItemSchema for convenience
export { OrderItemSchema };

// =============================================================================
// CUSTOMER SNAPSHOT (for Fat Events)
// =============================================================================

/**
 * Customer snapshot schema for event enrichment.
 *
 * Captures customer data at the time of the event for self-contained processing.
 * Uses nullable fields to handle missing data gracefully.
 */
export const CustomerSnapshotSchema = z.object({
  /** Customer ID (always present) */
  id: z.string(),
  /** Customer name at time of capture (null if not available) */
  name: z.string().nullable(),
  /** Customer email at time of capture (null if not available) */
  email: z.string().nullable(),
});

export type CustomerSnapshot = z.infer<typeof CustomerSnapshotSchema>;

/**
 * OrderCreated event - emitted when a new order is created.
 */
export const OrderCreatedPayloadSchema = z.object({
  orderId: z.string(),
  customerId: z.string(),
});

export const OrderCreatedSchema = createDomainEventSchema({
  eventType: "OrderCreated",
  payloadSchema: OrderCreatedPayloadSchema,
  schemaVersion: 1,
});

export type OrderCreatedEvent = z.infer<typeof OrderCreatedSchema>;

/**
 * OrderItemAdded event - emitted when an item is added to an order.
 */
export const OrderItemAddedPayloadSchema = z.object({
  orderId: z.string(),
  item: OrderItemSchema,
  newTotalAmount: z.number(),
});

export const OrderItemAddedSchema = createDomainEventSchema({
  eventType: "OrderItemAdded",
  payloadSchema: OrderItemAddedPayloadSchema,
  schemaVersion: 1,
});

export type OrderItemAddedEvent = z.infer<typeof OrderItemAddedSchema>;

/**
 * OrderItemRemoved event - emitted when an item is removed from an order.
 */
export const OrderItemRemovedPayloadSchema = z.object({
  orderId: z.string(),
  productId: z.string(),
  newTotalAmount: z.number(),
  removedQuantity: z.number(),
});

export const OrderItemRemovedSchema = createDomainEventSchema({
  eventType: "OrderItemRemoved",
  payloadSchema: OrderItemRemovedPayloadSchema,
  schemaVersion: 1,
});

export type OrderItemRemovedEvent = z.infer<typeof OrderItemRemovedSchema>;

/**
 * OrderSubmitted event V1 - emitted when an order is submitted for processing.
 * Includes full items array for downstream saga processing.
 *
 * @deprecated Use OrderSubmittedV2 for new events. V1 events are upcast to V2
 * at read time with customer: null.
 */
export const OrderSubmittedPayloadSchema = z.object({
  orderId: z.string(),
  customerId: z.string(),
  items: z.array(OrderItemSchema),
  totalAmount: z.number(),
  submittedAt: z.number(),
});

export const OrderSubmittedSchema = createDomainEventSchema({
  eventType: "OrderSubmitted",
  payloadSchema: OrderSubmittedPayloadSchema,
  schemaVersion: 1,
});

export type OrderSubmittedEvent = z.infer<typeof OrderSubmittedSchema>;

/**
 * OrderSubmitted event V2 - enriched with customer snapshot (Fat Events pattern).
 *
 * The customer snapshot captures customer data at submission time, making the
 * event self-contained for downstream processing without cross-BC queries.
 *
 * ## Why Fat Events?
 * - Projections don't need to look up customer data
 * - Historical events preserve point-in-time customer info
 * - Downstream consumers are decoupled from Customer BC
 */
export const OrderSubmittedV2PayloadSchema = z.object({
  orderId: z.string(),
  customerId: z.string(),
  items: z.array(OrderItemSchema),
  totalAmount: z.number(),
  submittedAt: z.number(),
  /** Customer snapshot at submission time (null for upcast V1 events) */
  customer: CustomerSnapshotSchema.nullable(),
});

export const OrderSubmittedV2Schema = createDomainEventSchema({
  eventType: "OrderSubmitted",
  payloadSchema: OrderSubmittedV2PayloadSchema,
  schemaVersion: 2,
});

export type OrderSubmittedV2Event = z.infer<typeof OrderSubmittedV2Schema>;
export type OrderSubmittedV2Payload = z.infer<typeof OrderSubmittedV2PayloadSchema>;

/**
 * OrderConfirmed event - emitted when an order is confirmed.
 * Includes full context for downstream Process Managers (e.g., notification PM).
 */
export const OrderConfirmedPayloadSchema = z.object({
  orderId: z.string(),
  customerId: z.string(),
  totalAmount: z.number(),
  confirmedAt: z.number().positive(),
});

export const OrderConfirmedSchema = createDomainEventSchema({
  eventType: "OrderConfirmed",
  payloadSchema: OrderConfirmedPayloadSchema,
  schemaVersion: 1,
});

export type OrderConfirmedEvent = z.infer<typeof OrderConfirmedSchema>;

/**
 * OrderCancelled event - emitted when an order is cancelled.
 */
export const OrderCancelledPayloadSchema = z.object({
  orderId: z.string(),
  customerId: z.string(),
  reason: z.string(),
});

export const OrderCancelledSchema = createDomainEventSchema({
  eventType: "OrderCancelled",
  payloadSchema: OrderCancelledPayloadSchema,
  schemaVersion: 1,
});

export type OrderCancelledEvent = z.infer<typeof OrderCancelledSchema>;

/**
 * Union of all order events (current versions).
 *
 * Uses V2 schemas where available. V1 events should be upcast before
 * processing via the OrderEventUpcasterRegistry.
 */
export const OrderEventSchema = z.discriminatedUnion("eventType", [
  OrderCreatedSchema,
  OrderItemAddedSchema,
  OrderItemRemovedSchema,
  OrderSubmittedV2Schema, // V2 with customer snapshot
  OrderConfirmedSchema,
  OrderCancelledSchema,
]);

export type OrderEvent = z.infer<typeof OrderEventSchema>;

/**
 * All order event types.
 */
export const ORDER_EVENT_TYPES = [
  "OrderCreated",
  "OrderItemAdded",
  "OrderItemRemoved",
  "OrderSubmitted",
  "OrderConfirmed",
  "OrderCancelled",
] as const;

export type OrderEventType = (typeof ORDER_EVENT_TYPES)[number];
