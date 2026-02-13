/**
 * @libar-docs
 * @libar-docs-pattern AgentOnCompleteHandler
 * @libar-docs-status completed
 * @libar-docs-infra
 * @libar-docs-arch-role infrastructure
 * @libar-docs-arch-context agent
 * @libar-docs-arch-layer infrastructure
 * @libar-docs-uses AgentAsBoundedContext
 *
 * Workpool job completion handler for agent BC. Manages dead letter tracking,
 * replay, and ignore operations for failed agent event processing.
 */

import { internalMutation } from "../../../_generated/server.js";
import { v } from "convex/values";
import { components } from "../../../_generated/api.js";
import { vOnCompleteValidator } from "@convex-dev/workpool";
import { createPlatformNoOpLogger } from "@libar-dev/platform-core";
import { createAgentDeadLetter } from "@libar-dev/platform-core/agent";
import { CHURN_RISK_AGENT_ID } from "../_config.js";

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
  args: vOnCompleteValidator(
    v.object({
      subscriptionName: v.optional(v.string()),
      eventId: v.string(),
      eventType: v.optional(v.string()),
      globalPosition: v.optional(v.number()),
      partition: v.optional(v.object({ name: v.string(), value: v.string() })),
      correlationId: v.optional(v.string()),
      causationId: v.optional(v.string()),
    })
  ),
  returns: v.null(),
  handler: async (ctx, { workId, context, result }) => {
    const logger = createPlatformNoOpLogger();
    const agentId = CHURN_RISK_AGENT_ID;
    const { eventId, globalPosition, correlationId } = context;

    if (result.kind === "success") {
      logger.debug("Agent job completed successfully", {
        agentId,
        eventId,
      });
      return null;
    }

    if (result.kind === "canceled") {
      logger.debug("Agent job canceled", {
        agentId,
        eventId,
      });
      return null;
    }

    // result.kind === "failed" - create dead letter entry
    const error = result.error;

    logger.warn("Agent job failed", {
      agentId,
      eventId,
      error,
    });

    // Create dead letter for investigation/retry
    const deadLetter = createAgentDeadLetter(
      agentId,
      `sub_${agentId}`,
      eventId,
      globalPosition ?? 0,
      error
    );

    const contextObj: {
      correlationId?: string;
      errorCode?: string;
      ignoreReason?: string;
    } = {};
    if (correlationId) {
      contextObj.correlationId = correlationId;
    }

    // Record dead letter via component (UPSERT semantics: auto-increments attemptCount on retry)
    const dlResult = await ctx.runMutation(components.agentBC.deadLetters.record, {
      agentId: deadLetter.agentId,
      subscriptionId: `sub_${agentId}`,
      eventId,
      globalPosition: globalPosition ?? 0,
      error: deadLetter.error,
      attemptCount: 1,
      workId,
      ...(Object.keys(contextObj).length > 0 && { context: contextObj }),
    });

    if (dlResult.created) {
      logger.info("Created dead letter entry", {
        agentId: deadLetter.agentId,
        eventId: deadLetter.eventId,
        error: deadLetter.error,
      });
    } else {
      logger.warn("Agent dead letter retry (upserted)", {
        agentId: deadLetter.agentId,
        eventId: deadLetter.eventId,
        error: deadLetter.error,
      });
    }

    return null;
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
    eventId: v.string(),
  },
  handler: async (ctx, { eventId }) => {
    const logger = createPlatformNoOpLogger();

    logger.info("Replaying dead letter", { eventId });

    // Mark as replayed via component - the actual replay would be handled by
    // re-publishing the event through EventBus, which is beyond
    // the scope of this handler. The caller should:
    // 1. Load the original event from the event store
    // 2. Re-publish through EventBus
    // 3. This handler marks the dead letter as replayed
    const result = await ctx.runMutation(components.agentBC.deadLetters.updateStatus, {
      eventId,
      newStatus: "replayed",
    });

    if (result.status === "error") {
      throw new Error(result.message);
    }

    return { success: true, eventId };
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
    eventId: v.string(),
    reason: v.string(),
  },
  handler: async (ctx, { eventId, reason }) => {
    const logger = createPlatformNoOpLogger();

    logger.info("Ignoring dead letter", { eventId, reason });

    // Mark as ignored with reason via component
    const result = await ctx.runMutation(components.agentBC.deadLetters.updateStatus, {
      eventId,
      newStatus: "ignored",
      ignoreReason: reason,
    });

    if (result.status === "error") {
      throw new Error(result.message);
    }

    return { success: true, eventId, reason };
  },
});
