import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

/**
 * Inventory Bounded Context Schema.
 *
 * This component contains ONLY CMS (Command Model State) tables.
 * Projections (read models) live at the app level for:
 * - Cross-context views
 * - Proper CQRS separation
 * - Flexibility in query design
 */
export default defineSchema({
  /**
   * Inventory CMS (Command Model State) - stock level per product.
   *
   * IMPORTANT: Never query this table directly for reads!
   * Always use app-level projections (read models) for queries.
   */
  inventoryCMS: defineTable({
    // Identity
    productId: v.string(),
    productName: v.string(),
    sku: v.string(),

    // Pricing
    unitPrice: v.number(), // Price per unit in dollars

    // Stock levels
    availableQuantity: v.number(), // Available for reservation
    reservedQuantity: v.number(), // Sum of active reservations

    // Version tracking
    version: v.number(), // Stream version for OCC
    stateVersion: v.number(), // Schema version for lazy upcast

    // Timestamps
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_productId", ["productId"])
    .index("by_sku", ["sku"]),

  /**
   * Reservation CMS (Command Model State) - reservation per order.
   *
   * Tracks stock reservations linked to orders.
   * Has TTL-based expiration for uncommitted reservations.
   */
  reservationCMS: defineTable({
    // Identity
    reservationId: v.string(),
    orderId: v.string(), // Correlation to Orders context

    // Reservation details
    items: v.array(
      v.object({
        productId: v.string(),
        quantity: v.number(),
      })
    ),

    // State
    status: v.union(
      v.literal("pending"), // Active reservation, not yet confirmed
      v.literal("confirmed"), // Reservation permanent (order completed)
      v.literal("released"), // Stock returned (order cancelled)
      v.literal("expired") // Timed out
    ),

    // TTL handling
    expiresAt: v.number(), // Timestamp when reservation expires (1 hour default)

    // Version tracking
    version: v.number(),
    stateVersion: v.number(),

    // Timestamps
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_reservationId", ["reservationId"])
    .index("by_orderId", ["orderId"])
    .index("by_status", ["status", "createdAt"])
    .index("by_expiresAt", ["status", "expiresAt"]),
});
