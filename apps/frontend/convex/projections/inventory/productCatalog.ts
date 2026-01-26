/**
 * ProductCatalog projection handlers (app-level).
 *
 * Updates the productCatalog read model based on product events.
 * Also updates stockAvailability as a secondary projection.
 *
 * NOTE: These handlers receive all data via event args - no CMS access.
 */
import { internalMutation } from "../../_generated/server";
import { v } from "convex/values";
import { withCheckpoint, type MutationCtx } from "../_helpers";
import type { Doc } from "../../_generated/dataModel";

const PROJECTION_NAME = "productCatalog";

/**
 * Helper to get the product catalog entry.
 * Throws if not found.
 */
async function getProductCatalogOrThrow(
  ctx: MutationCtx,
  productId: string
): Promise<Doc<"productCatalog">> {
  const catalog = await ctx.db
    .query("productCatalog")
    .withIndex("by_productId", (q) => q.eq("productId", productId))
    .first();

  if (!catalog) {
    throw new Error(`Product catalog entry not found for productId: ${productId}`);
  }

  return catalog;
}

/**
 * Handle ProductCreated event.
 */
export const onProductCreated = internalMutation({
  args: {
    productId: v.string(),
    productName: v.string(),
    sku: v.string(),
    unitPrice: v.number(),
    eventId: v.string(),
    globalPosition: v.number(),
  },
  handler: async (ctx, args) => {
    const { productId, productName, sku, unitPrice } = args;

    return withCheckpoint(ctx, PROJECTION_NAME, productId, args, async () => {
      const now = Date.now();

      // Create product catalog entry
      await ctx.db.insert("productCatalog", {
        productId,
        productName,
        sku,
        unitPrice,
        availableQuantity: 0,
        reservedQuantity: 0,
        totalQuantity: 0,
        createdAt: now,
        updatedAt: now,
      });

      // Create stock availability entry
      await ctx.db.insert("stockAvailability", {
        productId,
        availableQuantity: 0,
        reservedQuantity: 0,
        updatedAt: now,
      });
    });
  },
});

/**
 * Handle StockAdded event.
 */
export const onStockAdded = internalMutation({
  args: {
    productId: v.string(),
    newAvailableQuantity: v.number(),
    eventId: v.string(),
    globalPosition: v.number(),
  },
  handler: async (ctx, args) => {
    const { productId, newAvailableQuantity } = args;

    return withCheckpoint(ctx, PROJECTION_NAME, productId, args, async () => {
      const now = Date.now();
      const catalog = await getProductCatalogOrThrow(ctx, productId);
      const totalQuantity = newAvailableQuantity + catalog.reservedQuantity;

      // Update product catalog
      await ctx.db.patch(catalog._id, {
        availableQuantity: newAvailableQuantity,
        totalQuantity,
        updatedAt: now,
      });

      // Update stock availability
      const stockAvail = await ctx.db
        .query("stockAvailability")
        .withIndex("by_productId", (q) => q.eq("productId", productId))
        .first();

      if (stockAvail) {
        await ctx.db.patch(stockAvail._id, {
          availableQuantity: newAvailableQuantity,
          updatedAt: now,
        });
      }
    });
  },
});
