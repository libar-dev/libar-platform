/**
 * @libar-docs
 * @libar-docs-pattern InventoryPublicAPI
 * @libar-docs-status completed
 * @libar-docs-infra
 * @libar-docs-arch-role infrastructure
 * @libar-docs-arch-context inventory
 * @libar-docs-arch-layer infrastructure
 *
 * App-level public API for Inventory bounded context.
 * Exposes CommandOrchestrator-backed mutations for external consumers.
 */
import { mutation, query, internalMutation } from "./_generated/server";
import { components } from "./_generated/api";
import { v } from "convex/values";
import { commandOrchestrator } from "./infrastructure";
import {
  createProductConfig,
  addStockConfig,
  reserveStockConfig,
  reserveStockDCBConfig,
  confirmReservationConfig,
  releaseReservationConfig,
  expireReservationConfig,
} from "./commands/inventory/configs";

// ============================================
// COMMAND MUTATIONS
// ============================================

/**
 * Create a new product in inventory.
 */
export const createProduct = mutation({
  args: {
    productId: v.string(),
    productName: v.string(),
    sku: v.string(),
    unitPrice: v.number(),
    commandId: v.optional(v.string()),
  },
  handler: (ctx, args) => commandOrchestrator.execute(ctx, createProductConfig, args),
});

/**
 * Add stock to a product.
 */
export const addStock = mutation({
  args: {
    productId: v.string(),
    quantity: v.number(),
    reason: v.optional(v.string()),
    commandId: v.optional(v.string()),
  },
  handler: (ctx, args) => commandOrchestrator.execute(ctx, addStockConfig, args),
});

/**
 * Reserve stock for an order.
 *
 * Note: This mutation can return { status: "failed" } if there is insufficient stock.
 * In that case, a ReservationFailed event is still emitted.
 */
export const reserveStock = mutation({
  args: {
    orderId: v.string(),
    items: v.array(
      v.object({
        productId: v.string(),
        quantity: v.number(),
      })
    ),
    commandId: v.optional(v.string()),
  },
  handler: (ctx, args) => commandOrchestrator.execute(ctx, reserveStockConfig, args),
});

/**
 * Confirm a reservation (makes it permanent).
 */
export const confirmReservation = mutation({
  args: {
    reservationId: v.string(),
    commandId: v.optional(v.string()),
  },
  handler: (ctx, args) => commandOrchestrator.execute(ctx, confirmReservationConfig, args),
});

/**
 * Release a reservation (returns stock to available).
 */
export const releaseReservation = mutation({
  args: {
    reservationId: v.string(),
    reason: v.string(),
    commandId: v.optional(v.string()),
  },
  handler: (ctx, args) => commandOrchestrator.execute(ctx, releaseReservationConfig, args),
});

/**
 * Reserve stock using DCB (Dynamic Consistency Boundaries).
 *
 * Demonstrates the DCB pattern from Phase 16 - atomic multi-product reservation
 * with cross-entity invariant validation via `executeWithDCB`.
 *
 * This is the **reference implementation** showing how to use DCB with the
 * CommandOrchestrator. The orchestrator provides:
 * - Command Bus idempotency (via commandId)
 * - Event Store append (dual-write guarantee)
 * - Projection triggering via Workpool
 * - Command status updates
 *
 * Result types:
 * - `success`: All products reserved atomically
 * - `rejected`: Validation failed (missing products, invalid items)
 * - `failed`: Insufficient stock (with ReservationFailed event)
 *
 * @since Phase 23 (Example App Modernization - Rule 1)
 */
export const reserveStockDCB = mutation({
  args: {
    tenantId: v.string(),
    orderId: v.string(),
    items: v.array(
      v.object({
        productId: v.string(),
        quantity: v.number(),
      })
    ),
    commandId: v.optional(v.string()),
  },
  handler: (ctx, args) => commandOrchestrator.execute(ctx, reserveStockDCBConfig, args),
});

// ============================================
// QUERY APIs (Read from app-level projections)
// ============================================

/**
 * Get a product by ID.
 */
export const getProduct = query({
  args: {
    productId: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("productCatalog")
      .withIndex("by_productId", (q) => q.eq("productId", args.productId))
      .first();
  },
});

/**
 * Get a product by SKU.
 */
export const getProductBySku = query({
  args: {
    sku: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("productCatalog")
      .withIndex("by_sku", (q) => q.eq("sku", args.sku))
      .first();
  },
});

/**
 * List all products.
 */
export const listProducts = query({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("productCatalog")
      .order("desc")
      .take(args.limit ?? 100);
  },
});

/**
 * Get stock availability for a product.
 */
export const getStockAvailability = query({
  args: {
    productId: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("stockAvailability")
      .withIndex("by_productId", (q) => q.eq("productId", args.productId))
      .first();
  },
});

/**
 * Check availability for multiple items.
 */
export const checkAvailability = query({
  args: {
    items: v.array(
      v.object({
        productId: v.string(),
        quantity: v.number(),
      })
    ),
  },
  handler: async (ctx, args) => {
    const results = [];
    for (const item of args.items) {
      const stock = await ctx.db
        .query("stockAvailability")
        .withIndex("by_productId", (q) => q.eq("productId", item.productId))
        .first();

      results.push({
        productId: item.productId,
        requestedQuantity: item.quantity,
        availableQuantity: stock?.availableQuantity ?? 0,
        isAvailable: (stock?.availableQuantity ?? 0) >= item.quantity,
      });
    }

    return {
      items: results,
      allAvailable: results.every((r) => r.isAvailable),
    };
  },
});

/**
 * Get a reservation by ID.
 */
export const getReservation = query({
  args: {
    reservationId: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("activeReservations")
      .withIndex("by_reservationId", (q) => q.eq("reservationId", args.reservationId))
      .first();
  },
});

/**
 * Get a reservation by order ID.
 */
export const getReservationByOrderId = query({
  args: {
    orderId: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("activeReservations")
      .withIndex("by_orderId", (q) => q.eq("orderId", args.orderId))
      .first();
  },
});

/**
 * List reservations by status.
 */
export const listReservationsByStatus = query({
  args: {
    status: v.union(
      v.literal("pending"),
      v.literal("confirmed"),
      v.literal("released"),
      v.literal("expired")
    ),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("activeReservations")
      .withIndex("by_status", (q) => q.eq("status", args.status))
      .order("desc")
      .take(args.limit ?? 100);
  },
});

/**
 * List pending reservations.
 */
export const listPendingReservations = query({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("activeReservations")
      .withIndex("by_status", (q) => q.eq("status", "pending"))
      .order("desc")
      .take(args.limit ?? 100);
  },
});

// ============================================
// INTERNAL MUTATIONS (Cron Jobs)
// ============================================

/**
 * Expire all pending reservations that have passed their TTL.
 *
 * This is called by the app-level cron job. It:
 * 1. Queries the component for expired reservation IDs
 * 2. Processes each via CommandOrchestrator for proper dual-write
 *
 * This approach ensures:
 * - Each reservation expires atomically (Convex mutation guarantee)
 * - Events are emitted for each expiration
 * - Projections are triggered via Workpool
 * - Idempotency is handled by CommandBus
 *
 * Note: This uses CommandOrchestrator as a pragmatic solution. The ideal
 * abstraction would be a dedicated Process Manager (see ROADMAP Phase 9).
 */
export const expireExpiredReservations = internalMutation({
  args: {},
  handler: async (ctx) => {
    // 1. Find expired reservations (query-like operation in component)
    const expired = await ctx.runMutation(
      components.inventory.handlers.internal.findExpiredReservations,
      {}
    );

    const results = {
      processed: 0,
      skipped: 0,
      failed: 0,
    };

    // 2. Process each via CommandOrchestrator (atomic per-reservation)
    // Note: correlationId is generated internally by the orchestrator
    for (const { reservationId } of expired) {
      try {
        const result = await commandOrchestrator.execute(ctx, expireReservationConfig, {
          reservationId,
        });

        if (result.status === "success") {
          results.processed++;
        } else if (result.status === "rejected" && result.code === "RESERVATION_NOT_PENDING") {
          // Already expired/released by another process - expected race condition
          results.skipped++;
        } else {
          results.failed++;
        }
      } catch {
        // Log error but continue processing other reservations
        results.failed++;
      }
    }

    return results;
  },
});
