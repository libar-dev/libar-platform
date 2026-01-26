/**
 * Order Repository Instance
 *
 * Provides typed CMS access for Order aggregate, eliminating
 * the 5-line boilerplate pattern in command handlers.
 *
 * Usage:
 * ```typescript
 * // Before:
 * const rawCMS = await ctx.db.query("orderCMS")
 *   .withIndex("by_orderId", (q) => q.eq("orderId", orderId))
 *   .first();
 * assertOrderExists(rawCMS);
 * const cms = upcastOrderCMS(rawCMS);
 *
 * // After:
 * const { cms, _id } = await orderRepo.load(ctx, orderId);
 * ```
 */
import { createCMSRepository } from "@libar-dev/platform-core/repository";
import { type OrderCMS, CURRENT_ORDER_CMS_VERSION, upcastOrderCMS } from "./domain/order.js";

/**
 * Order repository for CMS access.
 *
 * - `load(ctx, orderId)` - Load order, throws NotFoundError if missing
 * - `tryLoad(ctx, orderId)` - Load order, returns null if missing
 * - `insert(ctx, cms)` - Insert new order
 * - `update(ctx, docId, updates, version)` - Update with OCC check
 */
export const orderRepo = createCMSRepository<OrderCMS>({
  table: "orderCMS",
  idField: "orderId",
  index: "by_orderId",
  upcast: (raw) => {
    const record = raw as { stateVersion?: number };
    const originalStateVersion = record.stateVersion ?? 0;
    const wasUpcasted = originalStateVersion < CURRENT_ORDER_CMS_VERSION;
    const cms = upcastOrderCMS(raw);
    return { cms, wasUpcasted, originalStateVersion };
  },
});
