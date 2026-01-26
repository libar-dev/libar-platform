/**
 * Dead Letter Queue management for cross-context event publications.
 *
 * Handles failed publication delivery with support for:
 * - Recording failures from Workpool onComplete callbacks
 * - Updating publication status
 * - Manual retry/ignore
 *
 * @since Phase 18b (EventStoreDurability)
 */
import { internalMutation, internalQuery } from "../_generated/server";
import { v } from "convex/values";
import { vOnCompleteValidator } from "@convex-dev/workpool";
import { createScopedLogger } from "@libar-dev/platform-core";
import { PLATFORM_LOG_LEVEL } from "../infrastructure";

/**
 * Logger for publication dead letter operations.
 */
const logger = createScopedLogger("Integration:DeadLetter", PLATFORM_LOG_LEVEL);

/**
 * onComplete handler for cross-context event publications.
 *
 * Updates publication status and records failures to the dead letter state.
 * Used with Workpool's onComplete callback.
 */
export const onPublicationComplete = internalMutation({
  args: vOnCompleteValidator(
    v.object({
      publicationId: v.string(),
      eventId: v.string(),
      targetContext: v.string(),
      sourceContext: v.string(),
      maxAttempts: v.optional(v.number()),
      isRetry: v.optional(v.boolean()),
    })
  ),
  handler: async (ctx, { context, result }) => {
    const now = Date.now();

    // Find the publication record
    const publication = await ctx.db
      .query("eventPublications")
      .withIndex("by_publicationId", (q) => q.eq("publicationId", context.publicationId))
      .first();

    if (!publication) {
      logger.warn("Publication not found for onComplete", {
        publicationId: context.publicationId,
        eventId: context.eventId,
      });
      return;
    }

    if (result.kind === "success") {
      // Update publication as delivered
      await ctx.db.patch(publication._id, {
        status: "delivered",
        deliveredAt: now,
        updatedAt: now,
      });

      logger.info("Publication delivered successfully", {
        publicationId: context.publicationId,
        eventId: context.eventId,
        targetContext: context.targetContext,
      });
    } else if (result.kind === "failed") {
      // Update attempt count
      const newAttemptCount = (publication.attemptCount ?? 0) + 1;
      const maxAttempts = context.maxAttempts ?? 5;

      // Check if we should dead letter
      if (newAttemptCount >= maxAttempts) {
        await ctx.db.patch(publication._id, {
          status: "dead_lettered",
          attemptCount: newAttemptCount,
          lastAttemptAt: now,
          lastError: result.error,
          updatedAt: now,
        });

        logger.error("Publication dead lettered", {
          publicationId: context.publicationId,
          eventId: context.eventId,
          targetContext: context.targetContext,
          sourceContext: context.sourceContext,
          attemptCount: newAttemptCount,
          error: result.error,
        });
      } else {
        await ctx.db.patch(publication._id, {
          status: "failed",
          attemptCount: newAttemptCount,
          lastAttemptAt: now,
          lastError: result.error,
          updatedAt: now,
        });

        logger.warn("Publication attempt failed", {
          publicationId: context.publicationId,
          eventId: context.eventId,
          targetContext: context.targetContext,
          attemptCount: newAttemptCount,
          maxAttempts,
          error: result.error,
        });
      }
    } else if (result.kind === "canceled") {
      // Handle Workpool cancellation - mark as failed with cancellation reason
      await ctx.db.patch(publication._id, {
        status: "failed",
        lastAttemptAt: now,
        lastError: "Publication canceled",
        updatedAt: now,
      });

      logger.warn("Publication canceled", {
        publicationId: context.publicationId,
        eventId: context.eventId,
        targetContext: context.targetContext,
      });
    }
  },
});

/**
 * Retry a failed or dead-lettered publication.
 *
 * Returns the data needed for the app layer to re-enqueue
 * the delivery via Workpool.
 */
export const retryPublication = internalMutation({
  args: {
    publicationId: v.string(),
  },
  handler: async (ctx, { publicationId }) => {
    const publication = await ctx.db
      .query("eventPublications")
      .withIndex("by_publicationId", (q) => q.eq("publicationId", publicationId))
      .first();

    if (!publication) {
      logger.warn("Publication not found for retry", { publicationId });
      return { status: "not_found" as const };
    }

    if (publication.status === "delivered") {
      logger.debug("Publication already delivered", {
        publicationId,
        eventId: publication.eventId,
      });
      return { status: "already_delivered" as const };
    }

    if (publication.status === "pending") {
      logger.debug("Publication still pending", {
        publicationId,
        eventId: publication.eventId,
      });
      return { status: "still_pending" as const };
    }

    // Mark as pending for retry
    await ctx.db.patch(publication._id, {
      status: "pending",
      updatedAt: Date.now(),
    });

    logger.info("Publication prepared for retry", {
      publicationId,
      eventId: publication.eventId,
      targetContext: publication.targetContext,
    });

    return {
      status: "ready" as const,
      eventId: publication.eventId,
      sourceContext: publication.sourceContext,
      targetContext: publication.targetContext,
      publicationId,
    };
  },
});

/**
 * Get dead-lettered publications for review.
 */
export const getDeadLetteredPublications = internalQuery({
  args: {
    limit: v.optional(v.number()),
    targetContext: v.optional(v.string()),
    sourceContext: v.optional(v.string()),
  },
  handler: async (ctx, { limit, targetContext, sourceContext }) => {
    let results = await ctx.db
      .query("eventPublications")
      .withIndex("by_status", (q) => q.eq("status", "dead_lettered"))
      .order("desc")
      .take(limit ?? 100);

    // Filter by context if provided
    if (targetContext) {
      results = results.filter((p) => p.targetContext === targetContext);
    }
    if (sourceContext) {
      results = results.filter((p) => p.sourceContext === sourceContext);
    }

    return results;
  },
});

/**
 * Get publication statistics.
 */
export const getPublicationStats = internalQuery({
  args: {
    targetContext: v.optional(v.string()),
  },
  handler: async (ctx, { targetContext }) => {
    const pending = await ctx.db
      .query("eventPublications")
      .withIndex("by_status", (q) => q.eq("status", "pending"))
      .collect();

    const delivered = await ctx.db
      .query("eventPublications")
      .withIndex("by_status", (q) => q.eq("status", "delivered"))
      .collect();

    const failed = await ctx.db
      .query("eventPublications")
      .withIndex("by_status", (q) => q.eq("status", "failed"))
      .collect();

    const deadLettered = await ctx.db
      .query("eventPublications")
      .withIndex("by_status", (q) => q.eq("status", "dead_lettered"))
      .collect();

    // Filter by target context if provided
    const filterByContext = (items: typeof pending) =>
      targetContext ? items.filter((p) => p.targetContext === targetContext) : items;

    // Group by target context
    const byTargetContext: Record<string, number> = {};
    for (const pub of filterByContext(deadLettered)) {
      byTargetContext[pub.targetContext] = (byTargetContext[pub.targetContext] ?? 0) + 1;
    }

    return {
      total:
        filterByContext(pending).length +
        filterByContext(delivered).length +
        filterByContext(failed).length +
        filterByContext(deadLettered).length,
      pending: filterByContext(pending).length,
      delivered: filterByContext(delivered).length,
      failed: filterByContext(failed).length,
      deadLettered: filterByContext(deadLettered).length,
      byTargetContext,
    };
  },
});

/**
 * Bulk retry all dead-lettered publications.
 */
export const bulkRetryPublications = internalMutation({
  args: {
    targetContext: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { targetContext, limit = 100 }) => {
    let deadLettered = await ctx.db
      .query("eventPublications")
      .withIndex("by_status", (q) => q.eq("status", "dead_lettered"))
      .take(limit);

    // Filter by target context if provided
    if (targetContext) {
      deadLettered = deadLettered.filter((p) => p.targetContext === targetContext);
    }

    const now = Date.now();
    const retriedIds: string[] = [];

    for (const pub of deadLettered) {
      await ctx.db.patch(pub._id, {
        status: "pending",
        updatedAt: now,
      });
      retriedIds.push(pub.publicationId);
    }

    logger.report("Bulk retry publications", {
      count: retriedIds.length,
      targetContext: targetContext ?? "all",
    });

    return {
      status: "retried" as const,
      count: retriedIds.length,
      publicationIds: retriedIds,
    };
  },
});
