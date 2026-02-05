/**
 * App-Level Testing Wrappers
 *
 * These internal functions wrap component testing functions,
 * making them callable from test clients (ConvexTestingHelper).
 *
 * Component functions can only be called from within the Convex backend
 * via ctx.runMutation()/ctx.runQuery(). Tests need app-level internal
 * functions that wrap those calls.
 *
 * IMPORTANT: createTestOrder also creates events in the Event Store to
 * ensure CMS version consistency with the Event Store. This is necessary
 * because subsequent commands (submit, cancel) validate expected versions.
 */

// Type declarations for Node.js globals that exist at runtime in Convex
declare const process: { env: Record<string, string | undefined> };
declare const console: { log: (...args: unknown[]) => void };

import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { makeFunctionReference } from "convex/server";
import type { SafeMutationRef } from "@libar-dev/platform-core";
import { components } from "./_generated/api";
import { eventStore } from "./infrastructure";
import { generateEventId } from "@libar-dev/platform-core";
import type { OrderEventType } from "./contexts/orders/domain/events.js";

/**
 * Guards test-only functions from production execution.
 *
 * Security model:
 * - Unit tests: __CONVEX_TEST_MODE__ is set by setup.ts
 * - Integration tests: Self-hosted Docker backend (ephemeral, localhost-only)
 * - Production: Cloud Convex with CONVEX_CLOUD_URL env var
 *
 * Note: Self-hosted Convex doesn't reliably expose env vars via process.env,
 * so we use a heuristic: if CONVEX_CLOUD_URL is NOT set, we assume test mode.
 * In production (cloud Convex), this env var is always present.
 */
function ensureTestEnvironment(): void {
  // Check for convex-test unit test mode (set by setup.ts)
  if (typeof globalThis !== "undefined" && globalThis.__CONVEX_TEST_MODE__ === true) {
    return; // Unit test environment, allow
  }

  // In convex-test runtime, process may not be defined - which is fine for tests
  if (typeof process === "undefined") {
    return; // convex-test environment without globalThis flag, allow
  }

  // Check for IS_TEST env var (explicit test mode)
  const env = process.env || {};
  if (env["IS_TEST"]) {
    return; // Explicit test mode, allow
  }

  // In self-hosted Convex (Docker), env vars may not be accessible via process.env.
  // Cloud Convex always has CONVEX_CLOUD_URL set. If it's absent, we're likely in
  // a self-hosted test environment.
  if (!env["CONVEX_CLOUD_URL"]) {
    return; // Self-hosted (likely Docker test backend), allow
  }

  throw new Error("SECURITY: Test-only function called without IS_TEST environment variable");
}

/**
 * Item type for test orders.
 */
type TestOrderItem = {
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: number;
};

/**
 * Create a test order via the Orders component.
 *
 * Also creates the corresponding events in the Event Store to ensure
 * version consistency for subsequent commands.
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
    console.log("Creating test order:", args.orderId, "status:", args.status);

    // Build events list based on desired state
    // Using OrderEventType for type safety on event type names
    const events: Array<{
      eventId: string;
      eventType: OrderEventType;
      payload: Record<string, unknown>;
      metadata: { correlationId: string; causationId: string };
    }> = [];

    const now = Date.now();
    const items = args.items ?? [];
    const totalAmount = items.reduce(
      (sum: number, item: TestOrderItem) => sum + item.quantity * item.unitPrice,
      0
    );

    // Always start with OrderCreated
    events.push({
      eventId: generateEventId("orders"),
      eventType: "OrderCreated",
      payload: { orderId: args.orderId, customerId: args.customerId },
      metadata: { correlationId: `test-${args.orderId}`, causationId: `test-cmd-${args.orderId}` },
    });

    // Add OrderItemAdded for each item
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      events.push({
        eventId: generateEventId("orders"),
        eventType: "OrderItemAdded",
        payload: {
          orderId: args.orderId,
          item,
          itemCount: i + 1,
          totalAmount: items
            .slice(0, i + 1)
            .reduce((sum: number, it: TestOrderItem) => sum + it.quantity * it.unitPrice, 0),
        },
        metadata: {
          correlationId: `test-${args.orderId}`,
          causationId: `test-cmd-item-${args.orderId}`,
        },
      });
    }

    // Add status transition events
    const status = args.status ?? "draft";
    if (status === "submitted" || status === "confirmed") {
      events.push({
        eventId: generateEventId("orders"),
        eventType: "OrderSubmitted",
        payload: {
          orderId: args.orderId,
          customerId: args.customerId,
          items,
          totalAmount,
          submittedAt: now,
        },
        metadata: {
          correlationId: `test-${args.orderId}`,
          causationId: `test-cmd-submit-${args.orderId}`,
        },
      });
    }

    if (status === "confirmed") {
      events.push({
        eventId: generateEventId("orders"),
        eventType: "OrderConfirmed",
        payload: {
          orderId: args.orderId,
          customerId: args.customerId,
          confirmedAt: now,
        },
        metadata: {
          correlationId: `test-${args.orderId}`,
          causationId: `test-cmd-confirm-${args.orderId}`,
        },
      });
    }

    if (status === "cancelled") {
      events.push({
        eventId: generateEventId("orders"),
        eventType: "OrderCancelled",
        payload: {
          orderId: args.orderId,
          customerId: args.customerId,
          reason: "Test cancellation",
          cancelledAt: now,
        },
        metadata: {
          correlationId: `test-${args.orderId}`,
          causationId: `test-cmd-cancel-${args.orderId}`,
        },
      });
    }

    // 1. Append events to Event Store FIRST
    // This ensures if event append fails, no CMS is created (safer failure mode).
    // Component mutations are separate transactions, so we order them to minimize
    // inconsistent state: orphaned events are preferable to CMS without events.
    console.log("Creating test order events:", events.length, "events for version", events.length);
    const appendResult = await eventStore.appendToStream(ctx, {
      streamType: "Order",
      streamId: args.orderId,
      expectedVersion: 0, // New stream
      boundedContext: "orders",
      events,
    });

    if (appendResult.status === "conflict") {
      throw new Error(`Failed to create test order events: stream version conflict`);
    }

    // 2. Create CMS entry via component
    // Done after events to maintain consistency: if this fails, events exist
    // but CMS doesn't - which is recoverable via test cleanup.
    const result = await ctx.runMutation(components.orders.handlers.testing.createTestOrder, args);

    // 3. Create projection entries (orderSummaries)
    // This ensures projections have data for tests that don't go through command flow
    const projectionNow = Date.now();
    const orderStatus = args.status ?? "draft";

    await ctx.db.insert("orderSummaries", {
      orderId: args.orderId,
      customerId: args.customerId,
      status: orderStatus,
      itemCount: items.length,
      totalAmount,
      createdAt: projectionNow,
      updatedAt: projectionNow,
      lastGlobalPosition: 0, // Test data - no real event position
    });

    // Also create orderWithInventoryStatus projection entry
    await ctx.db.insert("orderWithInventoryStatus", {
      orderId: args.orderId,
      customerId: args.customerId,
      orderStatus,
      totalAmount,
      itemCount: items.length,
      createdAt: projectionNow,
      updatedAt: projectionNow,
    });

    console.log("Created test order with", events.length, "events and projection data");
    return result;
  },
});

/**
 * Get test order from CMS via the Orders component.
 */
export const getTestOrder = query({
  args: {
    orderId: v.string(),
  },
  handler: async (ctx, args) => {
    ensureTestEnvironment();
    return await ctx.runQuery(components.orders.handlers.testing.getTestOrder, args);
  },
});

/**
 * Get test order summaries by customer from app-level projections.
 */
export const getTestOrdersByCustomer = query({
  args: {
    customerId: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    ensureTestEnvironment();
    const query = ctx.db
      .query("orderSummaries")
      .withIndex("by_customerId", (q) => q.eq("customerId", args.customerId));
    if (args.limit) {
      return await query.take(args.limit);
    }
    return await query.collect();
  },
});

/**
 * Get projection checkpoint from app-level tables.
 */
export const getTestProjectionCheckpoint = query({
  args: {
    projectionName: v.string(),
    partitionKey: v.string(),
  },
  handler: async (ctx, args) => {
    ensureTestEnvironment();
    return await ctx.db
      .query("projectionCheckpoints")
      .withIndex("by_projection_partition", (q) =>
        q.eq("projectionName", args.projectionName).eq("partitionKey", args.partitionKey)
      )
      .first();
  },
});

/**
 * Get dead letters from app-level tables.
 */
export const getTestDeadLetters = query({
  args: {
    status: v.optional(v.union(v.literal("pending"), v.literal("replayed"), v.literal("ignored"))),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    ensureTestEnvironment();
    let query = ctx.db.query("projectionDeadLetters");
    if (args.status) {
      query = query.filter((q) => q.eq(q.field("status"), args.status));
    }
    if (args.limit) {
      return await query.take(args.limit);
    }
    return await query.collect();
  },
});

// =============================================================================
// Inventory Testing Wrappers
// =============================================================================

/**
 * Create a test product via the Inventory component.
 *
 * Also creates the corresponding events in the Event Store to ensure
 * version consistency for subsequent commands.
 */
export const createTestProduct = mutation({
  args: {
    productId: v.string(),
    productName: v.string(),
    sku: v.string(),
    unitPrice: v.optional(v.number()),
    availableQuantity: v.optional(v.number()),
    reservedQuantity: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    ensureTestEnvironment();
    console.log("Creating test product:", args.productId, "stock:", args.availableQuantity ?? 0);

    const unitPrice = args.unitPrice ?? 49.99; // Default price for tests

    // Build events list based on desired state
    const events: Array<{
      eventId: string;
      eventType: string;
      payload: Record<string, unknown>;
      metadata: { correlationId: string; causationId: string };
    }> = [];

    // Always start with ProductCreated
    events.push({
      eventId: generateEventId("inventory"),
      eventType: "ProductCreated",
      payload: {
        productId: args.productId,
        productName: args.productName,
        sku: args.sku,
        unitPrice,
      },
      metadata: {
        correlationId: `test-${args.productId}`,
        causationId: `test-cmd-${args.productId}`,
      },
    });

    // Add StockAdded if availableQuantity > 0
    const availableQty = args.availableQuantity ?? 0;
    if (availableQty > 0) {
      events.push({
        eventId: generateEventId("inventory"),
        eventType: "StockAdded",
        payload: {
          productId: args.productId,
          quantity: availableQty,
          newAvailableQuantity: availableQty,
          reason: "Test stock initialization",
        },
        metadata: {
          correlationId: `test-${args.productId}`,
          causationId: `test-cmd-stock-${args.productId}`,
        },
      });
    }

    // 1. Append events to Event Store FIRST
    console.log(
      "Creating test product events:",
      events.length,
      "events for version",
      events.length
    );
    const appendResult = await eventStore.appendToStream(ctx, {
      streamType: "Inventory",
      streamId: args.productId,
      expectedVersion: 0, // New stream
      boundedContext: "inventory",
      events,
    });

    if (appendResult.status === "conflict") {
      throw new Error(`Failed to create test product events: stream version conflict`);
    }

    // 2. Create CMS entry via component with correct version
    const result = await ctx.runMutation(components.inventory.handlers.testing.createTestProduct, {
      ...args,
      unitPrice,
      version: events.length, // Pass calculated version
    });

    // 3. Create projection entries (productCatalog and stockAvailability)
    // This ensures projections have data for tests that don't go through command flow
    const now = Date.now();

    await ctx.db.insert("productCatalog", {
      productId: args.productId,
      productName: args.productName,
      sku: args.sku,
      unitPrice,
      availableQuantity: availableQty,
      reservedQuantity: args.reservedQuantity ?? 0,
      totalQuantity: availableQty + (args.reservedQuantity ?? 0),
      createdAt: now,
      updatedAt: now,
    });

    await ctx.db.insert("stockAvailability", {
      productId: args.productId,
      availableQuantity: availableQty,
      reservedQuantity: args.reservedQuantity ?? 0,
      updatedAt: now,
    });

    console.log("Created test product with", events.length, "events and projection data");
    return result;
  },
});

/**
 * Create a test reservation via the Inventory component.
 *
 * Also creates the corresponding events in the Event Store to ensure
 * version consistency for subsequent commands.
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
  },
  handler: async (ctx, args) => {
    ensureTestEnvironment();
    console.log("Creating test reservation:", args.reservationId, "for order:", args.orderId);

    const now = Date.now();
    const oneHour = 60 * 60 * 1000;
    const expiresAt = args.expiresAt ?? now + oneHour;
    const status = args.status ?? "pending";

    // Build events list based on desired state
    const events: Array<{
      eventId: string;
      eventType: string;
      payload: Record<string, unknown>;
      metadata: { correlationId: string; causationId: string };
    }> = [];

    // Always start with StockReserved
    events.push({
      eventId: generateEventId("inventory"),
      eventType: "StockReserved",
      payload: {
        reservationId: args.reservationId,
        orderId: args.orderId,
        items: args.items,
        expiresAt,
      },
      metadata: {
        correlationId: `test-${args.reservationId}`,
        causationId: `test-cmd-${args.reservationId}`,
      },
    });

    // Add status transition events
    if (status === "confirmed") {
      events.push({
        eventId: generateEventId("inventory"),
        eventType: "ReservationConfirmed",
        payload: {
          reservationId: args.reservationId,
          orderId: args.orderId,
        },
        metadata: {
          correlationId: `test-${args.reservationId}`,
          causationId: `test-cmd-confirm-${args.reservationId}`,
        },
      });
    }

    if (status === "released") {
      events.push({
        eventId: generateEventId("inventory"),
        eventType: "ReservationReleased",
        payload: {
          reservationId: args.reservationId,
          orderId: args.orderId,
          reason: "Test release",
          items: args.items,
        },
        metadata: {
          correlationId: `test-${args.reservationId}`,
          causationId: `test-cmd-release-${args.reservationId}`,
        },
      });
    }

    if (status === "expired") {
      events.push({
        eventId: generateEventId("inventory"),
        eventType: "ReservationExpired",
        payload: {
          reservationId: args.reservationId,
          orderId: args.orderId,
          items: args.items,
        },
        metadata: {
          correlationId: `test-${args.reservationId}`,
          causationId: `test-cmd-expire-${args.reservationId}`,
        },
      });
    }

    // 1. Append events to Event Store FIRST
    console.log(
      "Creating test reservation events:",
      events.length,
      "events for version",
      events.length
    );
    const appendResult = await eventStore.appendToStream(ctx, {
      streamType: "Reservation",
      streamId: args.reservationId,
      expectedVersion: 0, // New stream
      boundedContext: "inventory",
      events,
    });

    if (appendResult.status === "conflict") {
      throw new Error(`Failed to create test reservation events: stream version conflict`);
    }

    // 2. Create CMS entry via component with correct version
    const result = await ctx.runMutation(
      components.inventory.handlers.testing.createTestReservation,
      {
        ...args,
        version: events.length, // Pass calculated version
      }
    );

    // 3. Create projection entry (activeReservations)
    // This ensures projections have data for tests that don't go through command flow
    const projectionNow = Date.now();

    await ctx.db.insert("activeReservations", {
      reservationId: args.reservationId,
      orderId: args.orderId,
      status,
      itemCount: args.items.length,
      items: args.items,
      expiresAt,
      createdAt: projectionNow,
      updatedAt: projectionNow,
    });

    // 4. Update productCatalog and stockAvailability for reserved items
    // (only for pending reservations - stock is already deducted)
    if (status === "pending" || status === "confirmed") {
      for (const item of args.items) {
        // Update product catalog
        const catalog = await ctx.db
          .query("productCatalog")
          .withIndex("by_productId", (q) => q.eq("productId", item.productId))
          .first();

        if (catalog) {
          await ctx.db.patch(catalog._id, {
            availableQuantity: catalog.availableQuantity - item.quantity,
            reservedQuantity: catalog.reservedQuantity + item.quantity,
            updatedAt: projectionNow,
          });
        }

        // Update stock availability
        const stockAvail = await ctx.db
          .query("stockAvailability")
          .withIndex("by_productId", (q) => q.eq("productId", item.productId))
          .first();

        if (stockAvail) {
          await ctx.db.patch(stockAvail._id, {
            availableQuantity: stockAvail.availableQuantity - item.quantity,
            reservedQuantity: stockAvail.reservedQuantity + item.quantity,
            updatedAt: projectionNow,
          });
        }
      }
    }

    console.log("Created test reservation with", events.length, "events and projection data");
    return result;
  },
});

/**
 * Get test product from CMS via the Inventory component.
 */
export const getTestProduct = query({
  args: {
    productId: v.string(),
  },
  handler: async (ctx, args) => {
    ensureTestEnvironment();
    return await ctx.runQuery(components.inventory.handlers.testing.getTestProduct, args);
  },
});

/**
 * Get test reservation from CMS via the Inventory component.
 */
export const getTestReservation = query({
  args: {
    reservationId: v.string(),
  },
  handler: async (ctx, args) => {
    ensureTestEnvironment();
    return await ctx.runQuery(components.inventory.handlers.testing.getTestReservation, args);
  },
});

/**
 * Get test reservation by order ID from CMS via the Inventory component.
 */
export const getTestReservationByOrderId = query({
  args: {
    orderId: v.string(),
  },
  handler: async (ctx, args) => {
    ensureTestEnvironment();
    return await ctx.runQuery(
      components.inventory.handlers.testing.getTestReservationByOrderId,
      args
    );
  },
});

/**
 * Get inventory projection checkpoint (uses same app-level table).
 */
export const getInventoryProjectionCheckpoint = query({
  args: {
    projectionName: v.string(),
    partitionKey: v.string(),
  },
  handler: async (ctx, args) => {
    ensureTestEnvironment();
    return await ctx.db
      .query("projectionCheckpoints")
      .withIndex("by_projection_partition", (q) =>
        q.eq("projectionName", args.projectionName).eq("partitionKey", args.partitionKey)
      )
      .first();
  },
});

/**
 * Get inventory dead letters (uses same app-level table).
 */
export const getInventoryDeadLetters = query({
  args: {
    status: v.optional(
      v.union(
        v.literal("pending"),
        v.literal("retrying"),
        v.literal("retried"),
        v.literal("replayed"),
        v.literal("ignored")
      )
    ),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    ensureTestEnvironment();
    let query = ctx.db.query("projectionDeadLetters");
    if (args.status) {
      query = query.filter((q) => q.eq(q.field("status"), args.status));
    }
    if (args.limit) {
      return await query.take(args.limit);
    }
    return await query.collect();
  },
});

// =============================================================================
// Inventory Testing Wrappers
// =============================================================================

/**
 * Test wrapper for expireExpiredReservations (internal mutation).
 * This wraps the internalMutation to make it callable from test clients.
 */
export const expireExpiredReservations = mutation({
  args: {},
  returns: v.object({
    processed: v.number(),
    skipped: v.number(),
    failed: v.number(),
  }),
  handler: async (ctx): Promise<{ processed: number; skipped: number; failed: number }> => {
    ensureTestEnvironment();
    // Using makeFunctionReference to bypass FilterApi recursive type resolution (TS2589 prevention)
    const expireMutation = makeFunctionReference<"mutation">(
      "inventory:expireExpiredReservations"
    ) as SafeMutationRef;
    return (await ctx.runMutation(expireMutation, {})) as {
      processed: number;
      skipped: number;
      failed: number;
    };
  },
});

// =============================================================================
// Agent Testing Wrappers
// =============================================================================

/**
 * Get customer cancellations projection data.
 * Used for testing agent pattern detection via projections.
 */
export const getTestCustomerCancellations = query({
  args: {
    customerId: v.string(),
  },
  handler: async (ctx, args) => {
    ensureTestEnvironment();
    return await ctx.db
      .query("customerCancellations")
      .withIndex("by_customerId", (q) => q.eq("customerId", args.customerId))
      .first();
  },
});

/**
 * Get all agent dead letters for testing.
 */
export const getTestAgentDeadLetters = query({
  args: {
    agentId: v.optional(v.string()),
    status: v.optional(v.union(v.literal("pending"), v.literal("replayed"), v.literal("ignored"))),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    ensureTestEnvironment();

    if (args.agentId && args.status) {
      return await ctx.db
        .query("agentDeadLetters")
        .withIndex("by_agentId_status", (q) =>
          q.eq("agentId", args.agentId!).eq("status", args.status!)
        )
        .take(args.limit ?? 100);
    }

    if (args.agentId) {
      return await ctx.db
        .query("agentDeadLetters")
        .withIndex("by_agentId_status", (q) => q.eq("agentId", args.agentId!))
        .take(args.limit ?? 100);
    }

    if (args.status) {
      return await ctx.db
        .query("agentDeadLetters")
        .withIndex("by_status", (q) => q.eq("status", args.status!))
        .take(args.limit ?? 100);
    }

    return await ctx.db.query("agentDeadLetters").take(args.limit ?? 100);
  },
});
