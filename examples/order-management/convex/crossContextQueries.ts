/**
 * Cross-Context Query APIs.
 *
 * These queries read from projections that combine data from multiple bounded contexts.
 * This is only possible because projections live at the app level (not inside components).
 *
 * ## Architecture Pattern
 *
 * In this DDD + Event Sourcing architecture:
 * - **Bounded Contexts** (Orders, Inventory) are isolated components with their own databases
 * - **Projections** live at the app level and can listen to events from ALL contexts
 * - **Cross-context projections** combine data from multiple contexts into unified read models
 *
 * ## How It Works
 *
 * 1. OrderSubmitted event → updates `orderWithInventoryStatus.orderStatus`
 * 2. StockReserved event → updates `orderWithInventoryStatus.reservationStatus`
 * 3. Queries read from the unified projection table
 *
 * ## Consistency Model
 *
 * These projections are **eventually consistent**:
 * - Write commands return immediately (CMS + Event appended synchronously)
 * - Projections update asynchronously via Workpool
 * - Queries may show stale data for a few seconds after a command
 *
 * For real-time updates after commands, use the returned data from the command mutation.
 *
 * ## Usage Examples
 *
 * ```typescript
 * // Get single order with full inventory status (dashboard view)
 * const order = await ctx.runQuery(api.crossContextQueries.getOrderWithInventoryStatus, {
 *   orderId: "order_123"
 * });
 *
 * // Get customer's order history
 * const orders = await ctx.runQuery(api.crossContextQueries.getCustomerOrdersWithInventoryStatus, {
 *   customerId: "customer_456",
 *   limit: 20
 * });
 *
 * // Admin: find all submitted orders pending confirmation
 * const pending = await ctx.runQuery(api.crossContextQueries.getOrdersWithInventoryByStatus, {
 *   orderStatus: "submitted"
 * });
 * ```
 */
import { query } from "./_generated/server";
import { v } from "convex/values";

/**
 * Get order with inventory status.
 *
 * Returns a unified view combining:
 * - Order status (draft → submitted → confirmed/cancelled)
 * - Reservation status (pending → confirmed/released/expired/failed)
 *
 * @param orderId - The order ID to fetch
 * @returns Order with inventory status, or null if not found
 *
 * @example
 * ```typescript
 * const order = await ctx.runQuery(api.crossContextQueries.getOrderWithInventoryStatus, {
 *   orderId: "order_123"
 * });
 * if (order) {
 *   console.log(`Order ${order.orderId}: ${order.orderStatus}, reservation: ${order.reservationStatus}`);
 * }
 * ```
 */
export const getOrderWithInventoryStatus = query({
  args: {
    orderId: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("orderWithInventoryStatus")
      .withIndex("by_orderId", (q) => q.eq("orderId", args.orderId))
      .first();
  },
});

/**
 * Get customer orders with inventory status.
 *
 * Returns a paginated list of customer orders sorted by creation time (newest first).
 * Includes reservation status for each order.
 *
 * @param customerId - The customer ID to fetch orders for
 * @param limit - Maximum number of orders to return (default 100)
 * @returns Array of orders with inventory status
 *
 * @example
 * ```typescript
 * // Get last 10 orders for customer
 * const orders = await ctx.runQuery(api.crossContextQueries.getCustomerOrdersWithInventoryStatus, {
 *   customerId: "customer_456",
 *   limit: 10
 * });
 * ```
 */
export const getCustomerOrdersWithInventoryStatus = query({
  args: {
    customerId: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("orderWithInventoryStatus")
      .withIndex("by_customerId", (q) => q.eq("customerId", args.customerId))
      .order("desc")
      .take(args.limit ?? 100);
  },
});

/**
 * Get orders with inventory status filtered by order status.
 *
 * Useful for admin dashboards to find orders in specific states:
 * - "draft": Orders being prepared by customers
 * - "submitted": Orders awaiting inventory reservation and confirmation
 * - "confirmed": Successfully processed orders
 * - "cancelled": Cancelled orders (either by customer or due to inventory issues)
 *
 * @param orderStatus - Status to filter by
 * @param limit - Maximum number of orders to return (default 100)
 * @returns Array of orders with inventory status
 *
 * @example
 * ```typescript
 * // Find submitted orders that need processing
 * const pendingOrders = await ctx.runQuery(api.crossContextQueries.getOrdersWithInventoryByStatus, {
 *   orderStatus: "submitted"
 * });
 *
 * // Monitor for orders with failed reservations
 * const failedReservations = pendingOrders.filter(o => o.reservationStatus === "failed");
 * ```
 */
export const getOrdersWithInventoryByStatus = query({
  args: {
    orderStatus: v.union(
      v.literal("draft"),
      v.literal("submitted"),
      v.literal("confirmed"),
      v.literal("cancelled")
    ),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("orderWithInventoryStatus")
      .withIndex("by_orderStatus", (q) => q.eq("orderStatus", args.orderStatus))
      .order("desc")
      .take(args.limit ?? 100);
  },
});
