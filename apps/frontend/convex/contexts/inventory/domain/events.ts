/**
 * Inventory domain events.
 *
 * All events use createDomainEventSchema which adds:
 * - category: "domain" (event taxonomy)
 * - schemaVersion: explicit versioning for upcasting support
 */
import { z } from "zod";
import { createDomainEventSchema } from "@libar-dev/platform-core";
import { ReservationItemSchema } from "./reservation.js";

// Re-export ReservationItemSchema for convenience
export { ReservationItemSchema };

// =============================================================================
// Product Events
// =============================================================================

/**
 * ProductCreated event - emitted when a new product is added to inventory.
 */
export const ProductCreatedPayloadSchema = z.object({
  productId: z.string(),
  productName: z.string(),
  sku: z.string(),
});

export const ProductCreatedSchema = createDomainEventSchema({
  eventType: "ProductCreated",
  payloadSchema: ProductCreatedPayloadSchema,
  schemaVersion: 1,
});

export type ProductCreatedEvent = z.infer<typeof ProductCreatedSchema>;

/**
 * StockAdded event - emitted when stock is replenished.
 */
export const StockAddedPayloadSchema = z.object({
  productId: z.string(),
  quantity: z.number(),
  newAvailableQuantity: z.number(),
  reason: z.string().optional(),
});

export const StockAddedSchema = createDomainEventSchema({
  eventType: "StockAdded",
  payloadSchema: StockAddedPayloadSchema,
  schemaVersion: 1,
});

export type StockAddedEvent = z.infer<typeof StockAddedSchema>;

// =============================================================================
// Reservation Events
// =============================================================================

/**
 * StockReserved event - emitted when stock is reserved for an order.
 */
export const StockReservedPayloadSchema = z.object({
  reservationId: z.string(),
  orderId: z.string(),
  items: z.array(ReservationItemSchema),
  expiresAt: z.number(),
});

export const StockReservedSchema = createDomainEventSchema({
  eventType: "StockReserved",
  payloadSchema: StockReservedPayloadSchema,
  schemaVersion: 1,
});

export type StockReservedEvent = z.infer<typeof StockReservedSchema>;

/**
 * ReservationFailed event - emitted when reservation cannot be made.
 */
export const ReservationFailedPayloadSchema = z.object({
  orderId: z.string(),
  reason: z.string(),
  failedItems: z.array(
    z.object({
      productId: z.string(),
      requestedQuantity: z.number(),
      availableQuantity: z.number(),
    })
  ),
});

export const ReservationFailedSchema = createDomainEventSchema({
  eventType: "ReservationFailed",
  payloadSchema: ReservationFailedPayloadSchema,
  schemaVersion: 1,
});

export type ReservationFailedEvent = z.infer<typeof ReservationFailedSchema>;

/**
 * ReservationConfirmed event - emitted when reservation is made permanent.
 */
export const ReservationConfirmedPayloadSchema = z.object({
  reservationId: z.string(),
  orderId: z.string(),
});

export const ReservationConfirmedSchema = createDomainEventSchema({
  eventType: "ReservationConfirmed",
  payloadSchema: ReservationConfirmedPayloadSchema,
  schemaVersion: 1,
});

export type ReservationConfirmedEvent = z.infer<typeof ReservationConfirmedSchema>;

/**
 * ReservationReleased event - emitted when reserved stock is returned.
 *
 * IMPORTANT: Contains items array so projections can update stock levels
 * without accessing CMS (proper Event Sourcing pattern).
 */
export const ReservationReleasedPayloadSchema = z.object({
  reservationId: z.string(),
  orderId: z.string(),
  reason: z.string(),
  items: z.array(ReservationItemSchema),
});

export const ReservationReleasedSchema = createDomainEventSchema({
  eventType: "ReservationReleased",
  payloadSchema: ReservationReleasedPayloadSchema,
  schemaVersion: 1,
});

export type ReservationReleasedEvent = z.infer<typeof ReservationReleasedSchema>;

/**
 * ReservationExpired event - emitted when a reservation times out.
 *
 * IMPORTANT: Contains items array so projections can update stock levels
 * without accessing CMS (proper Event Sourcing pattern).
 */
export const ReservationExpiredPayloadSchema = z.object({
  reservationId: z.string(),
  orderId: z.string(),
  items: z.array(ReservationItemSchema),
});

export const ReservationExpiredSchema = createDomainEventSchema({
  eventType: "ReservationExpired",
  payloadSchema: ReservationExpiredPayloadSchema,
  schemaVersion: 1,
});

export type ReservationExpiredEvent = z.infer<typeof ReservationExpiredSchema>;

// =============================================================================
// Event Union
// =============================================================================

/**
 * Union of all inventory events.
 */
export const InventoryEventSchema = z.discriminatedUnion("eventType", [
  ProductCreatedSchema,
  StockAddedSchema,
  StockReservedSchema,
  ReservationFailedSchema,
  ReservationConfirmedSchema,
  ReservationReleasedSchema,
  ReservationExpiredSchema,
]);

export type InventoryEvent = z.infer<typeof InventoryEventSchema>;

/**
 * All inventory event types.
 */
export const INVENTORY_EVENT_TYPES = [
  "ProductCreated",
  "StockAdded",
  "StockReserved",
  "ReservationFailed",
  "ReservationConfirmed",
  "ReservationReleased",
  "ReservationExpired",
] as const;

export type InventoryEventType = (typeof INVENTORY_EVENT_TYPES)[number];
