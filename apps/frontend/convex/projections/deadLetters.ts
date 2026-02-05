// SYNC NOTE: This file must stay in sync with:
// examples/order-management/convex/projections/deadLetters.ts

/**
 * Dead Letter Queue management for projections.
 *
 * Handles failed projection processing with support for:
 * - Recording failures
 * - Manual replay/ignore
 * - Retry workflow
 */
import { mutation, query, internalMutation } from "../_generated/server";
import { v } from "convex/values";
import { vOnCompleteValidator } from "@convex-dev/workpool";
import { createScopedLogger } from "@libar-dev/platform-core";
import { PLATFORM_LOG_LEVEL } from "../infrastructure";

/**
 * Logger for dead letter queue operations.
 */
const logger = createScopedLogger("Projection:DeadLetter", PLATFORM_LOG_LEVEL);

/**
 * onComplete handler for projection processing.
 *
 * Records failed projections to the dead letter queue for later replay
 * or manual intervention. Used with Workpool's onComplete callback.
 */
export const onProjectionComplete = internalMutation({
  args: vOnCompleteValidator(
    /**
     * Context passed from CommandOrchestrator (projections) or EventBus (subscriptions).
     * Supports both projection and subscription contexts for shared dead letter handling.
     *
     * Projection context: { projectionName, partition, eventId, ... }
     * Subscription context: { subscriptionName, eventType, partition, eventId, ... }
     */
    v.object({
      eventId: v.string(),
      // Projection context fields
      projectionName: v.optional(v.string()),
      // Subscription context fields (EventBus handlers like PM, agents)
      subscriptionName: v.optional(v.string()),
      eventType: v.optional(v.string()),
      // Partition key for workpool ordering (e.g., { name: "orderId", value: "ord_123" })
      partition: v.optional(
        v.object({
          name: v.string(),
          value: v.string(),
        })
      ),
      // Correlation chain for tracing
      correlationId: v.optional(v.string()),
      causationId: v.optional(v.string()),
    })
  ),
  handler: async (ctx, { context, result }) => {
    if (result.kind === "failed") {
      // Use projectionName for projections, subscriptionName for EventBus handlers
      const handlerName = context.projectionName ?? context.subscriptionName ?? "unknown";

      // Check if this event already has a dead letter entry
      const existing = await ctx.db
        .query("projectionDeadLetters")
        .withIndex("by_eventId", (q) => q.eq("eventId", context.eventId))
        .first();

      if (existing) {
        // Only update if status is "pending" - don't interfere with retrying/terminal states
        if (existing.status === "pending") {
          await ctx.db.patch(existing._id, {
            attemptCount: existing.attemptCount + 1,
            error: result.error,
            failedAt: Date.now(),
          });
          logger.error("Handler failed (retry)", {
            projectionName: handlerName,
            eventId: context.eventId,
            attemptCount: existing.attemptCount + 1,
            error: result.error,
            ...(context.correlationId && { correlationId: context.correlationId }),
          });
        }
        // If status is "retrying" and we got another failure, it means the retry failed
        // Reset to pending with incremented count so admin can retry again
        else if (existing.status === "retrying") {
          await ctx.db.patch(existing._id, {
            status: "pending",
            attemptCount: existing.attemptCount + 1,
            error: result.error,
            failedAt: Date.now(),
          });
          logger.error("Retry failed, reset to pending", {
            projectionName: handlerName,
            eventId: context.eventId,
            attemptCount: existing.attemptCount + 1,
            error: result.error,
            ...(context.correlationId && { correlationId: context.correlationId }),
          });
        }
        // Don't update terminal states (retried, replayed, ignored)
      } else {
        // Create new dead letter entry
        await ctx.db.insert("projectionDeadLetters", {
          eventId: context.eventId,
          projectionName: handlerName,
          error: result.error,
          attemptCount: 1,
          status: "pending",
          failedAt: Date.now(),
        });
        logger.error("Handler failed (new dead letter)", {
          projectionName: handlerName,
          eventId: context.eventId,
          error: result.error,
          ...(context.correlationId && { correlationId: context.correlationId }),
        });
      }
    }
  },
});

/**
 * Replay a dead letter event.
 *
 * Marks the dead letter as replayed. The caller is responsible for
 * re-triggering the projection with the appropriate event data.
 */
export const replayDeadLetter = mutation({
  args: {
    deadLetterId: v.id("projectionDeadLetters"),
  },
  handler: async (ctx, { deadLetterId }) => {
    const deadLetter = await ctx.db.get(deadLetterId);
    if (!deadLetter) {
      logger.warn("Dead letter not found for replay", { deadLetterId });
      return { status: "not_found" as const };
    }

    if (deadLetter.status !== "pending") {
      logger.debug("Dead letter already processed", {
        deadLetterId,
        eventId: deadLetter.eventId,
        currentStatus: deadLetter.status,
      });
      return { status: "already_processed" as const, currentStatus: deadLetter.status };
    }

    // Mark as replayed
    await ctx.db.patch(deadLetterId, {
      status: "replayed",
    });

    logger.info("Dead letter replayed", {
      deadLetterId,
      eventId: deadLetter.eventId,
      projectionName: deadLetter.projectionName,
    });

    return { status: "replayed" as const, eventId: deadLetter.eventId };
  },
});

/**
 * Ignore a dead letter (mark as not requiring replay).
 */
export const ignoreDeadLetter = mutation({
  args: {
    deadLetterId: v.id("projectionDeadLetters"),
  },
  handler: async (ctx, { deadLetterId }) => {
    const deadLetter = await ctx.db.get(deadLetterId);
    if (!deadLetter) {
      logger.warn("Dead letter not found for ignore", { deadLetterId });
      return { status: "not_found" as const };
    }

    await ctx.db.patch(deadLetterId, {
      status: "ignored",
    });

    logger.info("Dead letter ignored", {
      deadLetterId,
      eventId: deadLetter.eventId,
      projectionName: deadLetter.projectionName,
    });

    return { status: "ignored" as const, eventId: deadLetter.eventId };
  },
});

/**
 * Get pending dead letters for review.
 */
export const getPendingDeadLetters = query({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { limit }) => {
    return await ctx.db
      .query("projectionDeadLetters")
      .withIndex("by_status", (q) => q.eq("status", "pending"))
      .order("desc")
      .take(limit ?? 100);
  },
});

/**
 * Prepare a dead letter for retrigger.
 *
 * Marks the dead letter as "retrying" and returns the data needed
 * for the app layer to re-enqueue the projection via Workpool.
 */
export const prepareDeadLetterRetrigger = mutation({
  args: {
    deadLetterId: v.id("projectionDeadLetters"),
  },
  handler: async (ctx, { deadLetterId }) => {
    const deadLetter = await ctx.db.get(deadLetterId);
    if (!deadLetter) {
      logger.warn("Dead letter not found for retrigger", { deadLetterId });
      return { status: "not_found" as const };
    }

    if (deadLetter.status !== "pending") {
      logger.debug("Dead letter already processed for retrigger", {
        deadLetterId,
        eventId: deadLetter.eventId,
        currentStatus: deadLetter.status,
      });
      return {
        status: "already_processed" as const,
        currentStatus: deadLetter.status,
      };
    }

    // Mark as retrying with timestamp for timeout detection
    await ctx.db.patch(deadLetterId, {
      status: "retrying",
      retryStartedAt: Date.now(),
    });

    logger.info("Dead letter prepared for retrigger", {
      deadLetterId,
      eventId: deadLetter.eventId,
      projectionName: deadLetter.projectionName,
    });

    return {
      status: "ready" as const,
      eventId: deadLetter.eventId,
      projectionName: deadLetter.projectionName,
      deadLetterId,
    };
  },
});

/**
 * Mark a dead letter as successfully retried.
 *
 * Called after the app layer successfully re-enqueues and processes the event.
 */
export const markDeadLetterRetried = mutation({
  args: {
    deadLetterId: v.id("projectionDeadLetters"),
  },
  handler: async (ctx, { deadLetterId }) => {
    const deadLetter = await ctx.db.get(deadLetterId);
    if (!deadLetter) {
      logger.warn("Dead letter not found for marking retried", { deadLetterId });
      return { status: "not_found" as const };
    }

    await ctx.db.patch(deadLetterId, {
      status: "retried",
    });

    logger.info("Dead letter successfully retried", {
      deadLetterId,
      eventId: deadLetter.eventId,
      projectionName: deadLetter.projectionName,
    });

    return { status: "retried" as const, eventId: deadLetter.eventId };
  },
});

/**
 * Mark all pending dead letters as retrying (bulk operation).
 *
 * Use this before bulk retriggering to track which items are being retried.
 */
export const markAllRetrying = mutation({
  args: {
    projectionName: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { projectionName, limit = 100 }) => {
    const query = ctx.db
      .query("projectionDeadLetters")
      .withIndex("by_status", (q) => q.eq("status", "pending"));

    const pending = await query.take(limit);

    // Filter by projection name if provided
    const filtered = projectionName
      ? pending.filter((dl) => dl.projectionName === projectionName)
      : pending;

    // Mark each as retrying
    for (const dl of filtered) {
      await ctx.db.patch(dl._id, {
        status: "retrying",
        attemptCount: dl.attemptCount + 1,
        retryStartedAt: Date.now(),
      });
    }

    logger.report("Bulk retry operation", {
      markedCount: filtered.length,
      projectionName: projectionName ?? "all",
      limit,
    });

    return {
      markedCount: filtered.length,
      projectionName: projectionName ?? "all",
    };
  },
});

/**
 * Get all dead letters ready for bulk replay.
 *
 * Returns the event IDs and projection names for dead letters in "retrying" status.
 */
export const getRetryingDeadLetters = query({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { limit = 100 }) => {
    const retrying = await ctx.db
      .query("projectionDeadLetters")
      .filter((q) => q.eq(q.field("status"), "retrying"))
      .take(limit);

    return retrying.map((dl) => ({
      _id: dl._id,
      eventId: dl.eventId,
      projectionName: dl.projectionName,
      attemptCount: dl.attemptCount,
      failedAt: dl.failedAt,
    }));
  },
});

/**
 * Mark dead letters as successfully retried (after bulk replay completes).
 */
export const markBulkRetried = mutation({
  args: {
    deadLetterIds: v.array(v.id("projectionDeadLetters")),
  },
  handler: async (ctx, { deadLetterIds }) => {
    let successCount = 0;

    for (const id of deadLetterIds) {
      const dl = await ctx.db.get(id);
      if (dl && dl.status === "retrying") {
        await ctx.db.patch(id, {
          status: "retried",
        });
        successCount++;
      }
    }

    logger.report("Bulk retry completed", {
      successCount,
      totalRequested: deadLetterIds.length,
    });

    return { successCount, totalRequested: deadLetterIds.length };
  },
});
