/**
 * @libar-docs
 * @libar-docs-pattern AgentOnCompleteHandler
 * @libar-docs-status completed
 * @libar-docs-infra
 * @libar-docs-arch-role infrastructure
 * @libar-docs-arch-context agent
 * @libar-docs-arch-layer infrastructure
 * @libar-docs-uses AgentAsBoundedContext, AgentLLMIntegration
 *
 * Workpool job completion handler for agent BC.
 * This is the MUTATION half of the action/mutation split pattern.
 *
 * Handles:
 * - Success: audit -> command -> approval -> checkpoint (LAST, AD-7)
 * - Failure: dead letter + failure audit (checkpoint NOT advanced)
 * - Canceled: log only (checkpoint NOT advanced)
 * - Dead letter replay and ignore operations
 *
 * @since Phase 22b (AgentLLMIntegration) -- factory-based handler
 */

import { internalMutation } from "../../../_generated/server.js";
import type { MutationCtx } from "../../../_generated/server.js";
import { makeFunctionReference, type FunctionReference } from "convex/server";
import { v } from "convex/values";
import { components } from "../../../_generated/api.js";
import { vOnCompleteValidator } from "@convex-dev/workpool";
import { createPlatformNoOpLogger } from "@libar-dev/platform-core";
import {
  createAgentOnCompleteHandler,
  parseApprovalTimeout,
  DEFAULT_APPROVAL_TIMEOUT_MS,
} from "@libar-dev/platform-core/agent";
import { churnRiskAgentConfig } from "../_config.js";
import { agentComponent } from "../_component.js";

// TS2589 Prevention: Agent command bridge mutation reference at module level.
// Double cast via unknown per CLAUDE.md internal visibility pattern --
// AgentOnCompleteConfig.routeCommandRef expects FunctionReference<"mutation"> (public).
const routeAgentCommandRef = makeFunctionReference<"mutation">(
  "contexts/agent/handlers/routeCommand:routeAgentCommand"
) as unknown as FunctionReference<"mutation">;

// ============================================================================
// onComplete Handler (Factory-Based)
// ============================================================================

/**
 * Create the onComplete handler using the platform factory.
 *
 * The factory creates a handler that:
 * 1. On success: persists audit -> command -> approval -> checkpoint (LAST)
 * 2. On failure: creates dead letter, does NOT advance checkpoint
 * 3. On canceled: logs, does NOT advance checkpoint
 *
 * All persistence uses the agent component API. The handler is a NO-THROW
 * ZONE -- failures are dead-lettered, never thrown.
 *
 * Note: agentComponent is imported from ../_component.ts (shared wiring).
 * Component refs have "internal" visibility, but AgentComponentAPI expects
 * FunctionReference<"mutation"> (public). Cast via unknown per CLAUDE.md
 * internal visibility pattern -- Convex validates args at runtime.
 */

// Derive approval timeout from agent config (humanInLoop.approvalTimeout)
const approvalTimeoutMs = churnRiskAgentConfig.humanInLoop?.approvalTimeout
  ? (parseApprovalTimeout(churnRiskAgentConfig.humanInLoop.approvalTimeout) ??
    DEFAULT_APPROVAL_TIMEOUT_MS)
  : DEFAULT_APPROVAL_TIMEOUT_MS;

const onCompleteHandler = createAgentOnCompleteHandler<MutationCtx>({
  agentComponent,
  logger: createPlatformNoOpLogger(),
  approvalTimeoutMs,
  routeCommandRef: routeAgentCommandRef,
});

/**
 * Handle Workpool job completion for the churn risk agent.
 *
 * Called by Workpool when an agent action completes (success, failure, or cancel).
 * The context validator matches AgentWorkpoolContext shape produced by
 * createAgentSubscription's toWorkpoolContext.
 *
 * @example
 * ```typescript
 * // Registered as EventBus action subscription onComplete handler
 * const subscription = createAgentSubscription(churnRiskAgentConfig, {
 *   actionHandler: analyzeChurnRiskEventRef,
 *   onComplete: handleChurnRiskOnCompleteRef,
 *   retry: { maxAttempts: 3, initialBackoffMs: 1000, base: 2 },
 * });
 * ```
 */
export const handleChurnRiskOnComplete = internalMutation({
  args: vOnCompleteValidator(
    v.object({
      agentId: v.string(),
      subscriptionId: v.string(),
      eventId: v.string(),
      eventType: v.string(),
      globalPosition: v.number(),
      correlationId: v.string(),
      causationId: v.string(),
      streamId: v.string(),
      streamType: v.string(),
      boundedContext: v.string(),
    })
  ),
  returns: v.null(),
  handler: async (ctx, args) => {
    await onCompleteHandler(ctx, args);
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
