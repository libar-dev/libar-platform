/**
 * Churn Risk Agent onComplete Handler
 *
 * Handles Workpool job completion for the churn risk agent.
 * Used for dead letter tracking and checkpoint updates.
 *
 * @module contexts/agent/handlers/onComplete
 */

import { internalMutation } from "../../../_generated/server.js";
import { v } from "convex/values";
import { createPlatformNoOpLogger } from "@libar-dev/platform-core";
import { createAgentDeadLetter } from "@libar-dev/platform-core/agent";
import { CHURN_RISK_AGENT_ID } from "../config.js";

// ============================================================================
// onComplete Handler
// ============================================================================

/**
 * Handle Workpool job completion for the churn risk agent.
 *
 * This mutation is called by Workpool when a job completes (successfully or not).
 * It handles:
 * - Success: Update checkpoint metrics
 * - Failure: Create dead letter entry for retry/investigation
 *
 * @example
 * ```typescript
 * // Registered as EventBus subscription onComplete handler
 * const subscription = createAgentSubscription(churnRiskAgentConfig, {
 *   handler: internal.contexts.agent.handlers.eventHandler.handleChurnRiskEvent,
 *   onComplete: internal.contexts.agent.handlers.onComplete.handleChurnRiskOnComplete,
 * });
 * ```
 */
export const handleChurnRiskOnComplete = internalMutation({
  args: {
    workId: v.string(),
    status: v.union(v.literal("success"), v.literal("error")),
    result: v.optional(v.any()),
    error: v.optional(v.string()),
    retryCount: v.number(),
    args: v.any(),
  },
  handler: async (ctx, args) => {
    const logger = createPlatformNoOpLogger();
    const { workId, status, error, retryCount, args: jobArgs } = args;

    // Extract event info from job args
    const eventId = jobArgs?.eventId as string | undefined;
    const globalPosition = jobArgs?.globalPosition as number | undefined;
    const agentId = jobArgs?.agentId as string | undefined ?? CHURN_RISK_AGENT_ID;

    if (status === "success") {
      // Job completed successfully
      logger.debug("Agent job completed successfully", {
        workId,
        agentId,
        eventId,
      });

      // Update metrics (optional)
      // await ctx.db.patch(metricsId, {
      //   successCount: metrics.successCount + 1,
      //   lastSuccessAt: Date.now(),
      // });

      return;
    }

    // Job failed - create dead letter entry
    logger.warn("Agent job failed", {
      workId,
      agentId,
      eventId,
      error,
      retryCount,
    });

    // Create dead letter for investigation/retry
    if (eventId && globalPosition !== undefined) {
      const deadLetter = createAgentDeadLetter(
        agentId,
        `sub_${agentId}`, // subscriptionId
        eventId,
        globalPosition,
        error ?? "Unknown error"
      );

      // Store in dead letter queue
      // In a real implementation:
      // await ctx.db.insert("agentDeadLetters", {
      //   ...deadLetter,
      //   workId,
      //   retryCount,
      // });

      logger.info("Created dead letter entry", {
        agentId: deadLetter.agentId,
        eventId: deadLetter.eventId,
        error: deadLetter.error,
      });
    }

    // Update failure metrics (optional)
    // await ctx.db.patch(metricsId, {
    //   failureCount: metrics.failureCount + 1,
    //   lastFailureAt: Date.now(),
    //   lastError: error,
    // });
  },
});

// ============================================================================
// Dead Letter Replay
// ============================================================================

/**
 * Replay a dead letter event.
 *
 * This mutation allows manual replay of failed events after investigation.
 *
 * @example
 * ```typescript
 * // From admin interface
 * await ctx.runMutation(
 *   internal.contexts.agent.handlers.onComplete.replayDeadLetter,
 *   { deadLetterId: "dl_123" }
 * );
 * ```
 */
export const replayDeadLetter = internalMutation({
  args: {
    deadLetterId: v.string(),
  },
  handler: async (ctx, { deadLetterId }) => {
    const logger = createPlatformNoOpLogger();

    // Load dead letter
    // const deadLetter = await ctx.db
    //   .query("agentDeadLetters")
    //   .withIndex("by_id", (q) => q.eq("deadLetterId", deadLetterId))
    //   .first();
    //
    // if (!deadLetter) {
    //   throw new Error(`Dead letter not found: ${deadLetterId}`);
    // }
    //
    // if (deadLetter.status !== "pending") {
    //   throw new Error(`Dead letter already processed: ${deadLetter.status}`);
    // }

    logger.info("Replaying dead letter", { deadLetterId });

    // Re-enqueue the event for processing
    // This would typically:
    // 1. Load the original event from the event store
    // 2. Re-publish through EventBus
    // 3. Mark dead letter as "replayed"
    //
    // const event = await ctx.db
    //   .query("events")
    //   .withIndex("by_eventId", (q) => q.eq("eventId", deadLetter.eventId))
    //   .first();
    //
    // await eventBus.publish(ctx, event, correlationChain);
    //
    // await ctx.db.patch(deadLetter._id, {
    //   status: "replayed",
    //   replayedAt: Date.now(),
    // });

    return { success: true, deadLetterId };
  },
});

/**
 * Ignore a dead letter event.
 *
 * Marks a dead letter as ignored after investigation determines
 * the event should not be reprocessed.
 *
 * @example
 * ```typescript
 * // From admin interface
 * await ctx.runMutation(
 *   internal.contexts.agent.handlers.onComplete.ignoreDeadLetter,
 *   { deadLetterId: "dl_123", reason: "Duplicate event" }
 * );
 * ```
 */
export const ignoreDeadLetter = internalMutation({
  args: {
    deadLetterId: v.string(),
    reason: v.string(),
  },
  handler: async (ctx, { deadLetterId, reason }) => {
    const logger = createPlatformNoOpLogger();

    logger.info("Ignoring dead letter", { deadLetterId, reason });

    // Mark as ignored
    // await ctx.db.patch(deadLetter._id, {
    //   status: "ignored",
    //   ignoredAt: Date.now(),
    //   ignoreReason: reason,
    // });

    return { success: true, deadLetterId, reason };
  },
});
