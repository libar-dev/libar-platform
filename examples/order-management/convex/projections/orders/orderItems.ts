/**
 * @libar-docs
 * @libar-docs-pattern OrderItemsProjection
 * @libar-docs-status completed
 * @libar-docs-projection
 * @libar-docs-arch-role projection
 * @libar-docs-arch-context orders
 * @libar-docs-arch-layer application
 * @libar-docs-uses OrderCommandHandlers
 *
 * Order line items read model. Upsert behavior for individual items.
 * Handles OrderItemAdded, OrderItemRemoved.
 */
import { internalMutation } from "../../_generated/server";
import { v } from "convex/values";
import { withCheckpoint } from "../_helpers";

const PROJECTION_NAME = "orderItems";

/**
 * Handle OrderItemAdded event.
 *
 * Inserts or updates an order item. If the same product is added again,
 * it will update the existing row (upsert behavior via compound index).
 */
export const onOrderItemAdded = internalMutation({
  args: {
    orderId: v.string(),
    productId: v.string(),
    productName: v.string(),
    quantity: v.number(),
    unitPrice: v.number(),
    eventId: v.string(),
    globalPosition: v.number(),
  },
  handler: async (ctx, args) => {
    const { orderId, productId, productName, quantity, unitPrice } = args;

    return withCheckpoint(ctx, PROJECTION_NAME, orderId, args, async () => {
      const now = Date.now();
      const lineTotal = quantity * unitPrice;

      // Check if item already exists (upsert)
      const existing = await ctx.db
        .query("orderItems")
        .withIndex("by_orderId_productId", (q) =>
          q.eq("orderId", orderId).eq("productId", productId)
        )
        .first();

      if (existing) {
        // Update existing item
        await ctx.db.patch(existing._id, {
          productName,
          quantity,
          unitPrice,
          lineTotal,
          updatedAt: now,
        });
      } else {
        // Insert new item
        await ctx.db.insert("orderItems", {
          orderId,
          productId,
          productName,
          quantity,
          unitPrice,
          lineTotal,
          createdAt: now,
          updatedAt: now,
        });
      }
    });
  },
});

/**
 * Handle OrderItemRemoved event.
 *
 * Deletes the order item from the read model.
 */
export const onOrderItemRemoved = internalMutation({
  args: {
    orderId: v.string(),
    productId: v.string(),
    eventId: v.string(),
    globalPosition: v.number(),
  },
  handler: async (ctx, args) => {
    const { orderId, productId } = args;

    return withCheckpoint(ctx, PROJECTION_NAME, orderId, args, async () => {
      const item = await ctx.db
        .query("orderItems")
        .withIndex("by_orderId_productId", (q) =>
          q.eq("orderId", orderId).eq("productId", productId)
        )
        .first();

      if (item) {
        await ctx.db.delete(item._id);
      }
    });
  },
});
