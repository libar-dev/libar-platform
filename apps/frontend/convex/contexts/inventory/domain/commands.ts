/**
 * Inventory domain commands.
 */
import { z } from "zod";
import { createCommandSchema } from "@libar-dev/platform-core";
import { ReservationItemSchema } from "./events.js";

// =============================================================================
// Product Commands
// =============================================================================

/**
 * CreateProduct command - adds a new product to inventory.
 */
export const CreateProductPayloadSchema = z.object({
  productId: z.string(),
  productName: z.string(),
  sku: z.string(),
});

export const CreateProductSchema = createCommandSchema("CreateProduct", CreateProductPayloadSchema);

export type CreateProductCommand = z.infer<typeof CreateProductSchema>;

/**
 * AddStock command - replenishes stock for a product.
 *
 * Named "AddStock" (not "UpdateStock") because:
 * - Semantically correct: we're adding to existing quantity, not replacing it
 * - Aligns with event naming: "StockAdded"
 * - Clear intent: distinguishes from potential future operations like "SetStock"
 */
export const AddStockPayloadSchema = z.object({
  productId: z.string(),
  quantity: z.number().int().positive(),
  reason: z.string().optional(),
});

export const AddStockSchema = createCommandSchema("AddStock", AddStockPayloadSchema);

export type AddStockCommand = z.infer<typeof AddStockSchema>;

// =============================================================================
// Reservation Commands
// =============================================================================

/**
 * ReserveStock command - reserves stock for an order.
 * All-or-nothing: either all items are reserved or none.
 */
export const ReserveStockPayloadSchema = z.object({
  orderId: z.string(),
  items: z.array(ReservationItemSchema),
});

export const ReserveStockSchema = createCommandSchema("ReserveStock", ReserveStockPayloadSchema);

export type ReserveStockCommand = z.infer<typeof ReserveStockSchema>;

/**
 * ConfirmReservation command - makes a reservation permanent.
 */
export const ConfirmReservationPayloadSchema = z.object({
  reservationId: z.string(),
});

export const ConfirmReservationSchema = createCommandSchema(
  "ConfirmReservation",
  ConfirmReservationPayloadSchema
);

export type ConfirmReservationCommand = z.infer<typeof ConfirmReservationSchema>;

/**
 * ReleaseReservation command - returns reserved stock.
 */
export const ReleaseReservationPayloadSchema = z.object({
  reservationId: z.string(),
  reason: z.string(),
});

export const ReleaseReservationSchema = createCommandSchema(
  "ReleaseReservation",
  ReleaseReservationPayloadSchema
);

export type ReleaseReservationCommand = z.infer<typeof ReleaseReservationSchema>;

/**
 * ExpireReservation command - internal command to expire a reservation.
 * Used by the cron job for TTL cleanup.
 */
export const ExpireReservationPayloadSchema = z.object({
  reservationId: z.string(),
});

export const ExpireReservationSchema = createCommandSchema(
  "ExpireReservation",
  ExpireReservationPayloadSchema
);

export type ExpireReservationCommand = z.infer<typeof ExpireReservationSchema>;
