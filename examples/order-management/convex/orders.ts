/**
 * @libar-docs
 * @libar-docs-pattern OrderPublicAPI
 * @libar-docs-status completed
 * @libar-docs-infra
 * @libar-docs-arch-role infrastructure
 * @libar-docs-arch-context orders
 * @libar-docs-arch-layer infrastructure
 *
 * App-level public API for Orders bounded context.
 * Exposes CommandOrchestrator-backed mutations for external consumers.
 */
import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { createCorrelationChain, generateCommandId, toCommandId } from "@libar-dev/platform-core";
import { commandOrchestrator, integrationPublisher } from "./infrastructure";
import {
  createOrderConfig,
  addOrderItemConfig,
  removeOrderItemConfig,
  submitOrderConfig,
  confirmOrderConfig,
  cancelOrderConfig,
} from "./commands/orders/configs";

// ============================================
// COMMAND MUTATIONS
// ============================================

/**
 * Create a new order.
 */
export const createOrder = mutation({
  args: {
    orderId: v.string(),
    customerId: v.string(),
    commandId: v.optional(v.string()),
  },
  handler: (ctx, args) => commandOrchestrator.execute(ctx, createOrderConfig, args),
});

/**
 * Add an item to an order.
 */
export const addOrderItem = mutation({
  args: {
    orderId: v.string(),
    productId: v.string(),
    productName: v.string(),
    quantity: v.number(),
    unitPrice: v.number(),
    commandId: v.optional(v.string()),
  },
  handler: (ctx, args) => commandOrchestrator.execute(ctx, addOrderItemConfig, args),
});

/**
 * Remove an item from an order.
 */
export const removeOrderItem = mutation({
  args: {
    orderId: v.string(),
    productId: v.string(),
    commandId: v.optional(v.string()),
  },
  handler: (ctx, args) => commandOrchestrator.execute(ctx, removeOrderItemConfig, args),
});

/**
 * Submit an order for processing.
 *
 * In addition to the standard command flow (projection, saga), this also
 * publishes an OrderPlacedIntegration event for loosely-coupled subscribers.
 */
export const submitOrder = mutation({
  args: {
    orderId: v.string(),
    commandId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Execute command via orchestrator (handles projection + saga)
    const result = await commandOrchestrator.execute(ctx, submitOrderConfig, args);

    // Publish integration event for loosely-coupled subscribers
    if (result.status === "success" && result.globalPosition !== undefined) {
      // Create correlation chain from the command ID for tracing
      // (the orchestrator creates its own chain internally, but we create a new one here
      // for the integration event - this links integration events to the source command flow)
      // Convert string to branded type at API boundary
      const commandId = args.commandId ? toCommandId(args.commandId) : generateCommandId();
      const chain = createCorrelationChain(commandId);
      const timestamp = Date.now();

      await integrationPublisher.publish(
        ctx,
        {
          eventId: result.eventId,
          eventType: "OrderSubmitted",
          boundedContext: "orders",
          globalPosition: result.globalPosition,
          timestamp,
          correlation: {
            correlationId: chain.correlationId,
            causationId: chain.causationId,
          },
          payload: {
            orderId: result.data.orderId,
            customerId: result.data.customerId,
            items: result.data.items,
            totalAmount: result.data.totalAmount,
            submittedAt: timestamp,
          },
        },
        chain
      );
    }

    return result;
  },
});

/**
 * Confirm an order.
 */
export const confirmOrder = mutation({
  args: {
    orderId: v.string(),
    commandId: v.optional(v.string()),
    correlationId: v.optional(v.string()),
  },
  handler: (ctx, args) => commandOrchestrator.execute(ctx, confirmOrderConfig, args),
});

/**
 * Cancel an order.
 */
export const cancelOrder = mutation({
  args: {
    orderId: v.string(),
    reason: v.string(),
    commandId: v.optional(v.string()),
    correlationId: v.optional(v.string()),
  },
  handler: (ctx, args) => commandOrchestrator.execute(ctx, cancelOrderConfig, args),
});

// ============================================
// QUERY APIs (Read from app-level projections)
// ============================================

/**
 * Get order summary by ID.
 */
export const getOrderSummary = query({
  args: {
    orderId: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("orderSummaries")
      .withIndex("by_orderId", (q) => q.eq("orderId", args.orderId))
      .first();
  },
});

/**
 * Get orders for a customer.
 */
export const getCustomerOrders = query({
  args: {
    customerId: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("orderSummaries")
      .withIndex("by_customerId", (q) => q.eq("customerId", args.customerId))
      .order("desc")
      .take(args.limit ?? 100);
  },
});

/**
 * Get orders by status.
 */
export const getOrdersByStatus = query({
  args: {
    status: v.union(
      v.literal("draft"),
      v.literal("submitted"),
      v.literal("confirmed"),
      v.literal("cancelled")
    ),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("orderSummaries")
      .withIndex("by_status", (q) => q.eq("status", args.status))
      .order("desc")
      .take(args.limit ?? 100);
  },
});

/**
 * Get all orders (paginated).
 */
export const getAllOrders = query({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("orderSummaries")
      .order("desc")
      .take(args.limit ?? 100);
  },
});

/**
 * Get order items for a specific order.
 *
 * Returns all line items in the order, enabling the Order Detail page
 * to display individual products, quantities, and prices.
 */
export const getOrderItems = query({
  args: {
    orderId: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("orderItems")
      .withIndex("by_orderId", (q) => q.eq("orderId", args.orderId))
      .collect();
  },
});
