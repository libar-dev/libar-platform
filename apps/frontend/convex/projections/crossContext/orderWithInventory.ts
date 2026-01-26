/**
 * @libar-docs
 * @libar-docs-pattern OrderWithInventoryProjection
 * @libar-docs-status completed
 * @libar-docs-projection
 * @libar-docs-arch-role projection
 * @libar-docs-arch-layer application
 * @libar-docs-uses OrderCommandHandlers, InventoryCommandHandlers
 *
 * OrderWithInventoryStatus cross-context projection handlers (app-level).
 *
 * Combines order status with inventory reservation status for dashboard views.
 * This projection is updated by events from BOTH Orders and Inventory contexts.
 *
 * This demonstrates the power of app-level projections: cross-context views
 * that would be impossible if projections lived inside bounded contexts.
 */
import { internalMutation } from "../../_generated/server";
import { v } from "convex/values";
import { withCheckpoint, type MutationCtx } from "../_helpers";
import type { Doc } from "../../_generated/dataModel";

const PROJECTION_NAME = "orderWithInventory";

/**
 * Helper to get existing order with inventory status.
 */
async function getOrderWithInventory(
  ctx: MutationCtx,
  orderId: string
): Promise<Doc<"orderWithInventoryStatus"> | null> {
  return await ctx.db
    .query("orderWithInventoryStatus")
    .withIndex("by_orderId", (q) => q.eq("orderId", orderId))
    .first();
}

// =============================================================================
// Order Events -> Update order-related fields
// =============================================================================

/**
 * Handle OrderCreated event.
 * Creates the initial cross-context view for an order.
 */
export const onOrderCreated = internalMutation({
  args: {
    orderId: v.string(),
    customerId: v.string(),
    eventId: v.string(),
    globalPosition: v.number(),
  },
  handler: async (ctx, args) => {
    const { orderId, customerId } = args;

    return withCheckpoint(ctx, PROJECTION_NAME, orderId, args, async () => {
      const now = Date.now();
      await ctx.db.insert("orderWithInventoryStatus", {
        orderId,
        customerId,
        orderStatus: "draft",
        // reservationId and reservationStatus are optional - omit them initially
        totalAmount: 0,
        itemCount: 0,
        createdAt: now,
        updatedAt: now,
      });
    });
  },
});

/**
 * Handle OrderItemAdded event.
 */
export const onOrderItemAdded = internalMutation({
  args: {
    orderId: v.string(),
    itemCount: v.number(),
    totalAmount: v.number(),
    eventId: v.string(),
    globalPosition: v.number(),
  },
  handler: async (ctx, args) => {
    const { orderId, itemCount, totalAmount } = args;

    return withCheckpoint(ctx, PROJECTION_NAME, orderId, args, async () => {
      const existing = await getOrderWithInventory(ctx, orderId);
      if (existing) {
        await ctx.db.patch(existing._id, {
          itemCount,
          totalAmount,
          updatedAt: Date.now(),
        });
      }
    });
  },
});

/**
 * Handle OrderItemRemoved event.
 */
export const onOrderItemRemoved = internalMutation({
  args: {
    orderId: v.string(),
    itemCount: v.number(),
    totalAmount: v.number(),
    eventId: v.string(),
    globalPosition: v.number(),
  },
  handler: async (ctx, args) => {
    const { orderId, itemCount, totalAmount } = args;

    return withCheckpoint(ctx, PROJECTION_NAME, orderId, args, async () => {
      const existing = await getOrderWithInventory(ctx, orderId);
      if (existing) {
        await ctx.db.patch(existing._id, {
          itemCount,
          totalAmount,
          updatedAt: Date.now(),
        });
      }
    });
  },
});

/**
 * Handle OrderSubmitted event.
 */
export const onOrderSubmitted = internalMutation({
  args: {
    orderId: v.string(),
    eventId: v.string(),
    globalPosition: v.number(),
  },
  handler: async (ctx, args) => {
    const { orderId } = args;

    return withCheckpoint(ctx, PROJECTION_NAME, orderId, args, async () => {
      const existing = await getOrderWithInventory(ctx, orderId);
      if (existing) {
        await ctx.db.patch(existing._id, {
          orderStatus: "submitted",
          updatedAt: Date.now(),
        });
      }
    });
  },
});

/**
 * Handle OrderConfirmed event.
 */
export const onOrderConfirmed = internalMutation({
  args: {
    orderId: v.string(),
    eventId: v.string(),
    globalPosition: v.number(),
  },
  handler: async (ctx, args) => {
    const { orderId } = args;

    return withCheckpoint(ctx, PROJECTION_NAME, orderId, args, async () => {
      const existing = await getOrderWithInventory(ctx, orderId);
      if (existing) {
        await ctx.db.patch(existing._id, {
          orderStatus: "confirmed",
          updatedAt: Date.now(),
        });
      }
    });
  },
});

/**
 * Handle OrderCancelled event.
 */
export const onOrderCancelled = internalMutation({
  args: {
    orderId: v.string(),
    eventId: v.string(),
    globalPosition: v.number(),
  },
  handler: async (ctx, args) => {
    const { orderId } = args;

    return withCheckpoint(ctx, PROJECTION_NAME, orderId, args, async () => {
      const existing = await getOrderWithInventory(ctx, orderId);
      if (existing) {
        await ctx.db.patch(existing._id, {
          orderStatus: "cancelled",
          updatedAt: Date.now(),
        });
      }
    });
  },
});

// =============================================================================
// Inventory Events -> Update reservation-related fields
// =============================================================================

/**
 * Handle StockReserved event.
 * Links a reservation to an order.
 */
export const onStockReserved = internalMutation({
  args: {
    reservationId: v.string(),
    orderId: v.string(),
    eventId: v.string(),
    globalPosition: v.number(),
  },
  handler: async (ctx, args) => {
    const { orderId, reservationId } = args;

    return withCheckpoint(ctx, PROJECTION_NAME, orderId, args, async () => {
      const existing = await getOrderWithInventory(ctx, orderId);
      if (existing) {
        await ctx.db.patch(existing._id, {
          reservationId,
          reservationStatus: "pending",
          updatedAt: Date.now(),
        });
      }
    });
  },
});

/**
 * Handle ReservationFailed event.
 * Marks that the reservation failed for this order.
 */
export const onReservationFailed = internalMutation({
  args: {
    orderId: v.string(),
    reason: v.string(),
    eventId: v.string(),
    globalPosition: v.number(),
  },
  handler: async (ctx, args) => {
    const { orderId } = args;

    return withCheckpoint(ctx, PROJECTION_NAME, orderId, args, async () => {
      const existing = await getOrderWithInventory(ctx, orderId);
      if (existing) {
        await ctx.db.patch(existing._id, {
          reservationStatus: "failed",
          updatedAt: Date.now(),
        });
      }
    });
  },
});

/**
 * Handle ReservationConfirmed event.
 */
export const onReservationConfirmed = internalMutation({
  args: {
    reservationId: v.string(),
    orderId: v.string(),
    eventId: v.string(),
    globalPosition: v.number(),
  },
  handler: async (ctx, args) => {
    const { orderId } = args;

    return withCheckpoint(ctx, PROJECTION_NAME, orderId, args, async () => {
      const existing = await getOrderWithInventory(ctx, orderId);
      if (existing) {
        await ctx.db.patch(existing._id, {
          reservationStatus: "confirmed",
          updatedAt: Date.now(),
        });
      }
    });
  },
});

/**
 * Handle ReservationReleased event.
 */
export const onReservationReleased = internalMutation({
  args: {
    reservationId: v.string(),
    orderId: v.string(),
    eventId: v.string(),
    globalPosition: v.number(),
  },
  handler: async (ctx, args) => {
    const { orderId } = args;

    return withCheckpoint(ctx, PROJECTION_NAME, orderId, args, async () => {
      const existing = await getOrderWithInventory(ctx, orderId);
      if (existing) {
        await ctx.db.patch(existing._id, {
          reservationStatus: "released",
          updatedAt: Date.now(),
        });
      }
    });
  },
});

/**
 * Handle ReservationExpired event.
 */
export const onReservationExpired = internalMutation({
  args: {
    reservationId: v.string(),
    orderId: v.string(),
    eventId: v.string(),
    globalPosition: v.number(),
  },
  handler: async (ctx, args) => {
    const { orderId } = args;

    return withCheckpoint(ctx, PROJECTION_NAME, orderId, args, async () => {
      const existing = await getOrderWithInventory(ctx, orderId);
      if (existing) {
        await ctx.db.patch(existing._id, {
          reservationStatus: "expired",
          updatedAt: Date.now(),
        });
      }
    });
  },
});
