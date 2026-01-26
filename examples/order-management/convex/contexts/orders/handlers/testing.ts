/**
 * Orders Component Testing Helpers
 *
 * Minimal testing functions for CMS-only operations.
 * Projections are at app level - these only handle component CMS.
 */

import { mutation, query } from "../_generated/server";
import { v } from "convex/values";
import { ensureTestEnvironment } from "@libar-dev/platform-core/testing";

/**
 * Create a test order directly in CMS.
 * Used by app-level testing wrappers.
 */
export const createTestOrder = mutation({
  args: {
    orderId: v.string(),
    customerId: v.string(),
    status: v.optional(
      v.union(
        v.literal("draft"),
        v.literal("submitted"),
        v.literal("confirmed"),
        v.literal("cancelled")
      )
    ),
    items: v.optional(
      v.array(
        v.object({
          productId: v.string(),
          productName: v.string(),
          quantity: v.number(),
          unitPrice: v.number(),
        })
      )
    ),
  },
  handler: async (ctx, args) => {
    ensureTestEnvironment();

    const now = Date.now();
    const items = args.items ?? [];
    const totalAmount = items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
    const version =
      1 +
      items.length +
      (args.status === "submitted" || args.status === "confirmed" ? 1 : 0) +
      (args.status === "confirmed" ? 1 : 0) +
      (args.status === "cancelled" ? 1 : 0);

    const id = await ctx.db.insert("orderCMS", {
      orderId: args.orderId,
      customerId: args.customerId,
      status: args.status ?? "draft",
      items,
      totalAmount,
      version,
      stateVersion: 1,
      createdAt: now,
      updatedAt: now,
    });

    return { id: id.toString(), orderId: args.orderId };
  },
});

/**
 * Get test order CMS by orderId.
 */
export const getTestOrder = query({
  args: {
    orderId: v.string(),
  },
  handler: async (ctx, args) => {
    ensureTestEnvironment();
    return await ctx.db
      .query("orderCMS")
      .withIndex("by_orderId", (q) => q.eq("orderId", args.orderId))
      .first();
  },
});
