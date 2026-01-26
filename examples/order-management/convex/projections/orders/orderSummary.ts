/**
 * @libar-docs
 * @libar-docs-pattern OrderSummaryProjection
 * @libar-docs-status completed
 * @libar-docs-projection
 * @libar-docs-arch-role projection
 * @libar-docs-arch-context orders
 * @libar-docs-arch-layer application
 * @libar-docs-uses EventStore
 *
 * OrderSummary projection handlers (app-level).
 *
 * Updates the orderSummaries read model based on order events.
 * Uses globalPosition-based checkpointing for idempotency.
 * Wraps key handlers with poison event handling for durability.
 *
 * NOTE: These handlers receive all data via event args - no CMS access.
 * This is proper Event Sourcing: projections are built from events only.
 *
 * @since Phase 18.5 - Added poison event handling wrapper to onOrderCreated
 */
import { internalMutation } from "../../_generated/server";
import { makeFunctionReference } from "convex/server";
import { v } from "convex/values";
import { withCheckpoint, type MutationCtx } from "../_helpers";
import type { Doc } from "../../_generated/dataModel";
import {
  createScopedLogger,
  type SafeQueryRef,
  type SafeMutationRef,
} from "@libar-dev/platform-core";
import { PLATFORM_LOG_LEVEL } from "../../infrastructure.js";

// ============================================================================
// Logger
// ============================================================================
const logger = createScopedLogger("OrderSummaryProjection", PLATFORM_LOG_LEVEL);

// ============================================================================
// TS2589 Prevention: Module-level function references
// ============================================================================
const getPoisonRecordRef = makeFunctionReference<"query">(
  "admin/poison:getPoisonRecord"
) as SafeQueryRef;

const upsertPoisonRecordRef = makeFunctionReference<"mutation">(
  "admin/poison:upsertPoisonRecord"
) as SafeMutationRef;

const PROJECTION_NAME = "orderSummary";

// ============================================================================
// Poison Event Handling Configuration
// ============================================================================
const POISON_MAX_ATTEMPTS = 3;

/**
 * Status from poison record query result.
 */
type PoisonStatus = "pending" | "quarantined" | "replayed" | "ignored";

/**
 * Poison record shape returned from getPoisonRecord query.
 */
interface PoisonRecordFromDb {
  eventId: string;
  eventType?: string;
  projectionName: string;
  status: PoisonStatus;
  attemptCount: number;
  error?: string;
  errorStack?: string;
  eventPayload?: unknown;
  quarantinedAt?: number;
  createdAt?: number;
  updatedAt?: number;
}

/**
 * Helper to get the order summary for an orderId.
 * Throws if not found (triggers Workpool failure -> dead letter).
 */
async function getOrderSummaryOrThrow(
  ctx: MutationCtx,
  orderId: string
): Promise<Doc<"orderSummaries">> {
  const summary = await ctx.db
    .query("orderSummaries")
    .withIndex("by_orderId", (q) => q.eq("orderId", orderId))
    .first();

  if (!summary) {
    throw new Error(`Order summary not found for orderId: ${orderId}`);
  }

  return summary;
}

/**
 * Core logic for OrderCreated event processing.
 * Extracted to enable poison event handling wrapper.
 */
async function processOrderCreated(
  ctx: MutationCtx,
  args: {
    orderId: string;
    customerId: string;
    eventId: string;
    globalPosition: number;
  }
): Promise<{ status: "skipped" | "processed" }> {
  const { orderId, customerId } = args;

  return withCheckpoint(ctx, PROJECTION_NAME, orderId, args, async () => {
    const now = Date.now();
    await ctx.db.insert("orderSummaries", {
      orderId,
      customerId,
      status: "draft",
      itemCount: 0,
      totalAmount: 0,
      createdAt: now,
      updatedAt: now,
      lastGlobalPosition: args.globalPosition,
    });
  });
}

/**
 * Handle OrderCreated event with poison event handling.
 *
 * Wraps the core processing logic with poison event detection and quarantine.
 * After POISON_MAX_ATTEMPTS failures, the event is quarantined and skipped
 * to prevent blocking other events.
 */
export const onOrderCreated = internalMutation({
  args: {
    orderId: v.string(),
    customerId: v.string(),
    eventId: v.string(),
    globalPosition: v.number(),
  },
  handler: async (ctx, args) => {
    const { eventId } = args;

    // Check if event is already quarantined
    const existingRecord = (await ctx.runQuery(getPoisonRecordRef, {
      eventId,
      projectionName: PROJECTION_NAME,
    })) as PoisonRecordFromDb | null;

    if (existingRecord?.status === "quarantined") {
      // Skip quarantined events silently
      logger.info("Skipping quarantined event", { eventId, projectionName: PROJECTION_NAME });
      return { status: "skipped" as const };
    }

    try {
      // Attempt to process the event
      return await processOrderCreated(ctx, args);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : undefined;
      const now = Date.now();

      // Calculate new attempt count
      const attempts = (existingRecord?.attemptCount ?? 0) + 1;
      const shouldQuarantine = attempts >= POISON_MAX_ATTEMPTS;

      // Upsert the poison record
      await ctx.runMutation(upsertPoisonRecordRef, {
        eventId,
        eventType: "OrderCreated",
        projectionName: PROJECTION_NAME,
        status: shouldQuarantine ? "quarantined" : "pending",
        attemptCount: attempts,
        error: errorMessage,
        errorStack,
        eventPayload: args,
        quarantinedAt: shouldQuarantine ? now : existingRecord?.quarantinedAt,
        updatedAt: now,
      });

      if (shouldQuarantine) {
        // Log quarantine for operator visibility
        logger.error("Event quarantined", {
          projectionName: PROJECTION_NAME,
          eventId,
          attempts,
          error: errorMessage,
        });
        // Swallow the error to allow other events to process
        return { status: "skipped" as const };
      }

      // Re-throw if not yet quarantined (allow Workpool to retry)
      throw error;
    }
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
      const summary = await getOrderSummaryOrThrow(ctx, orderId);
      await ctx.db.patch(summary._id, {
        itemCount,
        totalAmount,
        updatedAt: Date.now(),
        lastGlobalPosition: args.globalPosition,
      });
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
      const summary = await getOrderSummaryOrThrow(ctx, orderId);
      await ctx.db.patch(summary._id, {
        itemCount,
        totalAmount,
        updatedAt: Date.now(),
        lastGlobalPosition: args.globalPosition,
      });
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
      const summary = await getOrderSummaryOrThrow(ctx, orderId);
      await ctx.db.patch(summary._id, {
        status: "submitted",
        updatedAt: Date.now(),
        lastGlobalPosition: args.globalPosition,
      });
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
      const summary = await getOrderSummaryOrThrow(ctx, orderId);
      await ctx.db.patch(summary._id, {
        status: "confirmed",
        updatedAt: Date.now(),
        lastGlobalPosition: args.globalPosition,
      });
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
      const summary = await getOrderSummaryOrThrow(ctx, orderId);
      await ctx.db.patch(summary._id, {
        status: "cancelled",
        updatedAt: Date.now(),
        lastGlobalPosition: args.globalPosition,
      });
    });
  },
});
