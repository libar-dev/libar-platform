import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

/**
 * Orders Bounded Context Schema.
 *
 * This component contains ONLY CMS (Command Model State) tables.
 * Projections (read models) live at the app level for:
 * - Cross-context views
 * - Proper CQRS separation
 * - Flexibility in query design
 */
export default defineSchema({
  /**
   * Order CMS (Command Model State) - the aggregate state.
   *
   * IMPORTANT: Never query this table directly for reads!
   * Always use app-level projections (read models) for queries.
   */
  orderCMS: defineTable({
    // Identity
    orderId: v.string(),
    customerId: v.string(),

    // State
    status: v.union(
      v.literal("draft"),
      v.literal("submitted"),
      v.literal("confirmed"),
      v.literal("cancelled")
    ),

    // Order items
    items: v.array(
      v.object({
        productId: v.string(),
        productName: v.string(),
        quantity: v.number(),
        unitPrice: v.number(),
      })
    ),

    // Calculated values
    totalAmount: v.number(),

    // Version tracking
    version: v.number(), // Stream version for OCC
    stateVersion: v.number(), // Schema version for lazy upcast

    // Timestamps
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_orderId", ["orderId"]),
});
