/**
 * Dead Letter Queue management for event appends.
 *
 * Handles failed durable append operations with support for:
 * - Recording failures from Workpool onComplete callbacks
 * - Manual retry/ignore
 * - Status tracking
 *
 * @since Phase 18b (EventStoreDurability)
 */
import { query, internalMutation } from "../_generated/server";
import { v } from "convex/values";
import { vOnCompleteValidator } from "@convex-dev/workpool";
import { createScopedLogger } from "@libar-dev/platform-core";
import { PLATFORM_LOG_LEVEL } from "../infrastructure";

/**
 * Logger for event append dead letter operations.
 */
const logger = createScopedLogger("EventStore:DeadLetter", PLATFORM_LOG_LEVEL);

/**
 * onComplete handler for durable append operations.
 *
 * Records failed appends to the dead letter queue for later retry
 * or manual intervention. Used with Workpool's onComplete callback.
 */
export const onAppendComplete = internalMutation({
  args: vOnCompleteValidator(
    v.object({
      idempotencyKey: v.string(),
      streamType: v.string(),
      streamId: v.string(),
      correlationId: v.optional(v.string()),
      eventType: v.optional(v.string()),
      boundedContext: v.optional(v.string()),
    })
  ),
  handler: async (ctx, { context, result }) => {
    if (result.kind === "failed") {
      // Check if this idempotency key already has a dead letter entry
      const existing = await ctx.db
        .query("eventAppendDeadLetters")
        .withIndex("by_idempotencyKey", (q) => q.eq("idempotencyKey", context.idempotencyKey))
        .first();

      const now = Date.now();

      if (existing) {
        // Only update if status is "pending" - don't interfere with retrying/terminal states
        if (existing.status === "pending") {
          await ctx.db.patch(existing._id, {
            attemptCount: existing.attemptCount + 1,
            error: result.error,
            failedAt: now,
            updatedAt: now,
          });
          logger.error("Append failed (retry)", {
            idempotencyKey: context.idempotencyKey,
            streamType: context.streamType,
            streamId: context.streamId,
            attemptCount: existing.attemptCount + 1,
            error: result.error,
            ...(context.correlationId && { correlationId: context.correlationId }),
          });
        } else if (existing.status === "retrying") {
          // Retry failed, reset to pending for another attempt
          await ctx.db.patch(existing._id, {
            status: "pending",
            attemptCount: existing.attemptCount + 1,
            error: result.error,
            failedAt: now,
            updatedAt: now,
          });
          logger.error("Retry failed, reset to pending", {
            idempotencyKey: context.idempotencyKey,
            streamType: context.streamType,
            streamId: context.streamId,
            attemptCount: existing.attemptCount + 1,
            error: result.error,
            ...(context.correlationId && { correlationId: context.correlationId }),
          });
        }
        // Don't update terminal states (retried, ignored)
      } else {
        // Create new dead letter entry
        // Build the record, conditionally including optional fields
        const deadLetterRecord: {
          idempotencyKey: string;
          streamType: string;
          streamId: string;
          error: string;
          attemptCount: number;
          status: "pending";
          failedAt: number;
          updatedAt: number;
          eventType?: string;
          boundedContext?: string;
          correlationId?: string;
        } = {
          idempotencyKey: context.idempotencyKey,
          streamType: context.streamType,
          streamId: context.streamId,
          error: result.error,
          attemptCount: 1,
          status: "pending",
          failedAt: now,
          updatedAt: now,
        };
        if (context.eventType !== undefined) {
          deadLetterRecord.eventType = context.eventType;
        }
        if (context.boundedContext !== undefined) {
          deadLetterRecord.boundedContext = context.boundedContext;
        }
        if (context.correlationId !== undefined) {
          deadLetterRecord.correlationId = context.correlationId;
        }
        await ctx.db.insert("eventAppendDeadLetters", deadLetterRecord);
        logger.error("Append failed (new dead letter)", {
          idempotencyKey: context.idempotencyKey,
          streamType: context.streamType,
          streamId: context.streamId,
          error: result.error,
          ...(context.correlationId && { correlationId: context.correlationId }),
        });
      }
    }
  },
});

/**
 * Retry a dead letter append.
 *
 * Marks the dead letter as retrying and returns the data needed
 * for the app layer to re-enqueue the append via Workpool.
 */
export const prepareAppendRetry = internalMutation({
  args: {
    deadLetterId: v.id("eventAppendDeadLetters"),
  },
  handler: async (ctx, { deadLetterId }) => {
    const deadLetter = await ctx.db.get(deadLetterId);
    if (!deadLetter) {
      logger.warn("Dead letter not found for retry", { deadLetterId });
      return { status: "not_found" as const };
    }

    if (deadLetter.status !== "pending") {
      logger.debug("Dead letter already processed", {
        deadLetterId,
        idempotencyKey: deadLetter.idempotencyKey,
        currentStatus: deadLetter.status,
      });
      return {
        status: "already_processed" as const,
        currentStatus: deadLetter.status,
      };
    }

    // Mark as retrying
    await ctx.db.patch(deadLetterId, {
      status: "retrying",
      updatedAt: Date.now(),
    });

    logger.info("Dead letter prepared for retry", {
      deadLetterId,
      idempotencyKey: deadLetter.idempotencyKey,
      streamType: deadLetter.streamType,
      streamId: deadLetter.streamId,
    });

    return {
      status: "ready" as const,
      idempotencyKey: deadLetter.idempotencyKey,
      streamType: deadLetter.streamType,
      streamId: deadLetter.streamId,
      boundedContext: deadLetter.boundedContext,
      deadLetterId,
    };
  },
});

/**
 * Mark a dead letter as successfully retried.
 */
export const markAppendRetried = internalMutation({
  args: {
    deadLetterId: v.id("eventAppendDeadLetters"),
  },
  handler: async (ctx, { deadLetterId }) => {
    const deadLetter = await ctx.db.get(deadLetterId);
    if (!deadLetter) {
      logger.warn("Dead letter not found for marking retried", { deadLetterId });
      return { status: "not_found" as const };
    }

    await ctx.db.patch(deadLetterId, {
      status: "retried",
      updatedAt: Date.now(),
    });

    logger.info("Dead letter successfully retried", {
      deadLetterId,
      idempotencyKey: deadLetter.idempotencyKey,
    });

    return {
      status: "retried" as const,
      idempotencyKey: deadLetter.idempotencyKey,
    };
  },
});

/**
 * Ignore a dead letter (mark as not requiring retry).
 */
export const ignoreAppendDeadLetter = internalMutation({
  args: {
    deadLetterId: v.id("eventAppendDeadLetters"),
    reviewNotes: v.optional(v.string()),
  },
  handler: async (ctx, { deadLetterId, reviewNotes }) => {
    const deadLetter = await ctx.db.get(deadLetterId);
    if (!deadLetter) {
      logger.warn("Dead letter not found for ignore", { deadLetterId });
      return { status: "not_found" as const };
    }

    await ctx.db.patch(deadLetterId, {
      status: "ignored",
      updatedAt: Date.now(),
      reviewNotes,
    });

    logger.info("Dead letter ignored", {
      deadLetterId,
      idempotencyKey: deadLetter.idempotencyKey,
    });

    return {
      status: "ignored" as const,
      idempotencyKey: deadLetter.idempotencyKey,
    };
  },
});

/**
 * Get pending append dead letters for review.
 */
export const getPendingAppendDeadLetters = query({
  args: {
    limit: v.optional(v.number()),
    streamType: v.optional(v.string()),
  },
  handler: async (ctx, { limit, streamType }) => {
    let results = await ctx.db
      .query("eventAppendDeadLetters")
      .withIndex("by_status", (q) => q.eq("status", "pending"))
      .order("desc")
      .take(limit ?? 100);

    // Filter by stream type if provided
    if (streamType) {
      results = results.filter((dl) => dl.streamType === streamType);
    }

    return results;
  },
});

/**
 * Get dead letter statistics.
 */
export const getAppendDeadLetterStats = query({
  args: {},
  handler: async (ctx) => {
    const pending = await ctx.db
      .query("eventAppendDeadLetters")
      .withIndex("by_status", (q) => q.eq("status", "pending"))
      .collect();

    const retrying = await ctx.db
      .query("eventAppendDeadLetters")
      .withIndex("by_status", (q) => q.eq("status", "retrying"))
      .collect();

    const retried = await ctx.db
      .query("eventAppendDeadLetters")
      .withIndex("by_status", (q) => q.eq("status", "retried"))
      .collect();

    const ignored = await ctx.db
      .query("eventAppendDeadLetters")
      .withIndex("by_status", (q) => q.eq("status", "ignored"))
      .collect();

    // Group by stream type
    const byStreamType: Record<string, number> = {};
    for (const dl of pending) {
      byStreamType[dl.streamType] = (byStreamType[dl.streamType] ?? 0) + 1;
    }

    return {
      total: pending.length + retrying.length + retried.length + ignored.length,
      pending: pending.length,
      retrying: retrying.length,
      retried: retried.length,
      ignored: ignored.length,
      byStreamType,
    };
  },
});
