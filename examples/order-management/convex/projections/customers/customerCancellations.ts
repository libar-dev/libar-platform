/**
 * Customer Cancellations Projection
 *
 * Maintains the customerCancellations read model for agent pattern detection.
 * Replaces O(N) queries in the churn risk agent with O(1) projection lookup.
 *
 * @module projections/customers/customerCancellations
 * @since Phase 22 (AgentAsBoundedContext) - N+1 Query Refactor
 */
import { internalMutation } from "../../_generated/server";
import { v } from "convex/values";
import { withCheckpoint, type MutationCtx } from "../_helpers";
import { createScopedLogger } from "@libar-dev/platform-core";
import { PLATFORM_LOG_LEVEL } from "../../infrastructure.js";

// ============================================================================
// Constants
// ============================================================================

const PROJECTION_NAME = "customerCancellations";
const logger = createScopedLogger("CustomerCancellationsProjection", PLATFORM_LOG_LEVEL);

/**
 * Default rolling window duration for cancellation tracking (30 days in ms).
 */
const DEFAULT_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

// ============================================================================
// Projection Handlers
// ============================================================================

/**
 * Handle OrderCancelled event.
 *
 * Upserts the customer's cancellation record:
 * - Adds the new cancellation to the array
 * - Prunes cancellations outside the rolling window
 * - Updates the count for fast threshold checks
 */
export const onOrderCancelled = internalMutation({
  args: {
    orderId: v.string(),
    customerId: v.string(),
    reason: v.string(),
    eventId: v.string(),
    globalPosition: v.number(),
    timestamp: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { orderId, customerId, reason, eventId, globalPosition } = args;
    const now = Date.now();
    const eventTimestamp = args.timestamp ?? now;
    const windowCutoff = now - DEFAULT_WINDOW_MS;

    return withCheckpoint(ctx, PROJECTION_NAME, customerId, { eventId, globalPosition }, async () => {
      // Load existing record
      const existing = await ctx.db
        .query("customerCancellations")
        .withIndex("by_customerId", (q) => q.eq("customerId", customerId))
        .first();

      // Build new cancellation entry
      const newCancellation = {
        orderId,
        eventId,
        globalPosition,
        reason,
        timestamp: eventTimestamp,
      };

      if (existing) {
        // Filter to keep only cancellations within the rolling window + new one
        const updatedCancellations = [
          ...existing.cancellations.filter((c) => c.timestamp >= windowCutoff),
          newCancellation,
        ];

        // Find oldest timestamp for the remaining cancellations
        const oldestCancellationAt = Math.min(...updatedCancellations.map((c) => c.timestamp));

        await ctx.db.patch(existing._id, {
          cancellations: updatedCancellations,
          cancellationCount: updatedCancellations.length,
          oldestCancellationAt,
          lastGlobalPosition: globalPosition,
          updatedAt: now,
        });

        logger.info("Updated customer cancellations", {
          customerId,
          cancellationCount: updatedCancellations.length,
          eventId,
        });
      } else {
        // Create new record
        await ctx.db.insert("customerCancellations", {
          customerId,
          cancellations: [newCancellation],
          cancellationCount: 1,
          oldestCancellationAt: eventTimestamp,
          lastGlobalPosition: globalPosition,
          updatedAt: now,
        });

        logger.info("Created customer cancellations record", {
          customerId,
          cancellationCount: 1,
          eventId,
        });
      }
    });
  },
});

// ============================================================================
// Query Helpers (for agent use)
// ============================================================================

/**
 * Get cancellation data for a customer within the rolling window.
 *
 * This is a helper function for direct ctx.db access in the agent handler.
 * Returns null if no record exists, otherwise returns filtered cancellations.
 */
export async function getCustomerCancellations(
  ctx: Pick<MutationCtx, "db">,
  customerId: string,
  windowMs: number = DEFAULT_WINDOW_MS
): Promise<{
  cancellations: Array<{
    orderId: string;
    eventId: string;
    globalPosition: number;
    reason: string;
    timestamp: number;
  }>;
  count: number;
} | null> {
  const record = await ctx.db
    .query("customerCancellations")
    .withIndex("by_customerId", (q) => q.eq("customerId", customerId))
    .first();

  if (!record) {
    return null;
  }

  const cutoff = Date.now() - windowMs;
  const filtered = record.cancellations.filter((c) => c.timestamp >= cutoff);

  return {
    cancellations: filtered,
    count: filtered.length,
  };
}
