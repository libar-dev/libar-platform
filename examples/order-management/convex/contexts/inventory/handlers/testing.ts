/**
 * Inventory Component Testing Helpers
 *
 * Minimal testing functions for CMS-only operations.
 * Projections are at app level - these only handle component CMS.
 */

import { mutation, query } from "../_generated/server";
import { v } from "convex/values";
import { ensureTestEnvironment } from "@libar-dev/platform-core/testing";

/**
 * Create a test product directly in CMS.
 */
export const createTestProduct = mutation({
  args: {
    productId: v.string(),
    productName: v.string(),
    sku: v.string(),
    unitPrice: v.optional(v.number()),
    availableQuantity: v.optional(v.number()),
    reservedQuantity: v.optional(v.number()),
    version: v.optional(v.number()), // Accept version from app-level wrapper
  },
  handler: async (ctx, args) => {
    ensureTestEnvironment();

    const now = Date.now();
    // Calculate version: if passed, use it; otherwise calculate from args
    // Version = 1 (ProductCreated) + 1 if availableQuantity > 0 (StockAdded)
    const calculatedVersion = args.version ?? 1 + ((args.availableQuantity ?? 0) > 0 ? 1 : 0);

    const id = await ctx.db.insert("inventoryCMS", {
      productId: args.productId,
      productName: args.productName,
      sku: args.sku,
      unitPrice: args.unitPrice ?? 49.99, // Default price for tests
      availableQuantity: args.availableQuantity ?? 0,
      reservedQuantity: args.reservedQuantity ?? 0,
      version: calculatedVersion,
      stateVersion: 2, // Updated to v2 for unitPrice
      createdAt: now,
      updatedAt: now,
    });

    return { id: id.toString(), productId: args.productId };
  },
});

/**
 * Create a test reservation directly in CMS.
 */
export const createTestReservation = mutation({
  args: {
    reservationId: v.string(),
    orderId: v.string(),
    items: v.array(
      v.object({
        productId: v.string(),
        quantity: v.number(),
      })
    ),
    status: v.optional(
      v.union(
        v.literal("pending"),
        v.literal("confirmed"),
        v.literal("released"),
        v.literal("expired")
      )
    ),
    expiresAt: v.optional(v.number()),
    version: v.optional(v.number()), // Accept version from app-level wrapper
  },
  handler: async (ctx, args) => {
    ensureTestEnvironment();

    const now = Date.now();
    const oneHour = 60 * 60 * 1000;
    const status = args.status ?? "pending";

    // Calculate version if not passed:
    // pending = 1 (StockReserved)
    // confirmed/released/expired = 2 (StockReserved + transition event)
    const calculatedVersion = args.version ?? (status === "pending" ? 1 : 2);

    const id = await ctx.db.insert("reservationCMS", {
      reservationId: args.reservationId,
      orderId: args.orderId,
      items: args.items,
      status,
      expiresAt: args.expiresAt ?? now + oneHour,
      version: calculatedVersion,
      stateVersion: 1,
      createdAt: now,
      updatedAt: now,
    });

    return { id: id.toString(), reservationId: args.reservationId };
  },
});

/**
 * Get test product CMS by productId.
 */
export const getTestProduct = query({
  args: {
    productId: v.string(),
  },
  handler: async (ctx, args) => {
    ensureTestEnvironment();
    return await ctx.db
      .query("inventoryCMS")
      .withIndex("by_productId", (q) => q.eq("productId", args.productId))
      .first();
  },
});

/**
 * Get test reservation CMS by reservationId.
 */
export const getTestReservation = query({
  args: {
    reservationId: v.string(),
  },
  handler: async (ctx, args) => {
    ensureTestEnvironment();
    return await ctx.db
      .query("reservationCMS")
      .withIndex("by_reservationId", (q) => q.eq("reservationId", args.reservationId))
      .first();
  },
});

/**
 * Get test reservation CMS by orderId.
 */
export const getTestReservationByOrderId = query({
  args: {
    orderId: v.string(),
  },
  handler: async (ctx, args) => {
    ensureTestEnvironment();
    return await ctx.db
      .query("reservationCMS")
      .withIndex("by_orderId", (q) => q.eq("orderId", args.orderId))
      .first();
  },
});
