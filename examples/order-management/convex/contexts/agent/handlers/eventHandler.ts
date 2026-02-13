/**
 * @libar-docs
 * @libar-docs-pattern ChurnRiskEventHandler
 * @libar-docs-status completed
 * @libar-docs-command
 * @libar-docs-arch-role command-handler
 * @libar-docs-arch-context agent
 * @libar-docs-arch-layer application
 * @libar-docs-uses CustomerCancellationsProjection, AgentAsBoundedContext
 *
 * Legacy mutation handler for rule-only agents.
 * For LLM-integrated agents, use analyzeEvent.ts (action handler).
 *
 * This mutation handler processes OrderCancelled events with checkpoint/idempotency.
 * Loads cancellation history from customerCancellations projection, runs LLM pattern
 * detection (3+ in 30 days), emits SuggestCustomerOutreach command.
 *
 * @see analyzeEvent.ts for the action/mutation split pattern (Phase 22b)
 * @since Phase 22
 */

import { internalMutation } from "../../../_generated/server.js";
import type { MutationCtx } from "../../../_generated/server.js";
import { makeFunctionReference } from "convex/server";
import { v } from "convex/values";
import { components } from "../../../_generated/api.js";
import {
  createAgentEventHandler,
  parseDuration,
  type AgentEventHandlerResult,
  type AgentCheckpoint,
} from "@libar-dev/platform-core/agent";
import { createOpenRouterAgentRuntime } from "../_llm/index.js";
import {
  createPlatformNoOpLogger,
  type PublishedEvent,
  type SafeMutationRef,
} from "@libar-dev/platform-core";
import { churnRiskAgentConfig, extractCustomerId } from "../_config.js";

// TS2589 Prevention: Declare function references at module level
const emitAgentCommandRef = makeFunctionReference<"mutation">(
  "contexts/agent/tools/emitCommand:emitAgentCommand"
) as SafeMutationRef;

const recordPendingApprovalRef = makeFunctionReference<"mutation">(
  "contexts/agent/tools/approval:recordPendingApproval"
) as SafeMutationRef;

// ============================================================================
// Event Handler
// ============================================================================

/**
 * Handle churn risk agent events.
 *
 * This mutation:
 * 1. Loads/creates the agent checkpoint from DB
 * 2. Checks idempotency (skips already-processed events)
 * 3. Loads event history within the pattern window
 * 4. Calls the agent's onEvent handler
 * 5. Handles the decision (emit command, queue approval, etc.)
 * 6. Records audit event
 * 7. Updates the checkpoint
 *
 * @example
 * ```typescript
 * // Registered as EventBus subscription handler
 * const subscription = createAgentSubscription(churnRiskAgentConfig, {
 *   handler: internal.contexts.agent.handlers.eventHandler.handleChurnRiskEvent,
 * });
 * ```
 */
export const handleChurnRiskEvent = internalMutation({
  args: {
    // AgentEventHandlerArgs fields
    eventId: v.string(),
    eventType: v.string(),
    globalPosition: v.number(),
    correlationId: v.string(),
    streamType: v.string(),
    streamId: v.string(),
    payload: v.any(),
    timestamp: v.number(),
    category: v.string(),
    boundedContext: v.string(),
    agentId: v.string(),
  },
  handler: async (ctx, args): Promise<AgentEventHandlerResult> => {
    const logger = createPlatformNoOpLogger();

    // Convert args to PublishedEvent
    const event: PublishedEvent = {
      eventId: args.eventId,
      eventType: args.eventType,
      globalPosition: args.globalPosition,
      streamType: args.streamType,
      streamId: args.streamId,
      payload: args.payload,
      timestamp: args.timestamp,
      category: args.category as "domain" | "integration" | "trigger" | "fat",
      boundedContext: args.boundedContext,
      schemaVersion: 1,
      correlation: {
        correlationId: args.correlationId,
        causationId: args.eventId,
      },
    };

    // 1. Load or create checkpoint via component
    const subscriptionId = `sub_${args.agentId}`;
    const { checkpoint: loadedCheckpoint } = await ctx.runMutation(
      components.agentBC.checkpoints.loadOrCreate,
      { agentId: args.agentId, subscriptionId }
    );

    const checkpoint: AgentCheckpoint = {
      agentId: loadedCheckpoint.agentId,
      subscriptionId: loadedCheckpoint.subscriptionId,
      lastProcessedPosition: loadedCheckpoint.lastProcessedPosition,
      lastEventId: loadedCheckpoint.lastEventId,
      status: loadedCheckpoint.status,
      eventsProcessed: loadedCheckpoint.eventsProcessed,
      updatedAt: loadedCheckpoint.updatedAt,
    };

    // 2. Check idempotency - skip if already processed
    if (event.globalPosition <= checkpoint.lastProcessedPosition) {
      logger.debug("Event already processed, skipping", {
        agentId: args.agentId,
        eventId: args.eventId,
        eventPosition: event.globalPosition,
        checkpointPosition: checkpoint.lastProcessedPosition,
      });
      return { success: true, decision: null };
    }

    // 3. Check if agent is active
    if (checkpoint.status !== "active") {
      logger.debug("Agent is not active, skipping", {
        agentId: args.agentId,
        status: checkpoint.status,
      });
      return { success: true, decision: null };
    }

    // 4. Create handler and process
    // Uses OpenRouter runtime when OPENROUTER_API_KEY is set, otherwise falls back to mock
    // Note: In Convex, process.env is available but not typed. We use a type assertion.
    // The API key should be set via: npx convex env set OPENROUTER_API_KEY "sk-or-v1-..."
    const globalProcess = globalThis as { process?: { env?: Record<string, string> } };
    const apiKey = globalProcess.process?.env?.["OPENROUTER_API_KEY"];
    const handler = createAgentEventHandler({
      config: churnRiskAgentConfig,
      runtime: createOpenRouterAgentRuntime(apiKey),
      logger,

      // Load event history from the event store
      loadHistory: async (streamId: string) => {
        return await loadEventHistory(ctx, event, streamId);
      },

      // Load checkpoint (already loaded above)
      loadCheckpoint: async () => checkpoint,

      // Update checkpoint after processing via component
      updateCheckpoint: async (_agentId: string, eventId: string, globalPosition: number) => {
        await ctx.runMutation(components.agentBC.checkpoints.update, {
          agentId: args.agentId,
          subscriptionId: checkpoint.subscriptionId,
          lastProcessedPosition: globalPosition,
          lastEventId: eventId,
          incrementEventsProcessed: true,
        });
        // Note: checkpoint is read-only, so we don't update local state
        // The persisted state is the source of truth
      },
    });

    // Process the event
    const result = await handler(event, checkpoint);

    // 5. Handle emitted command
    if (result.emittedCommand) {
      await ctx.runMutation(emitAgentCommandRef, {
        commandType: result.emittedCommand.type,
        payload: result.emittedCommand.payload,
        confidence: result.emittedCommand.metadata.confidence,
        reason: result.emittedCommand.metadata.reason,
        triggeringEventIds: [...result.emittedCommand.metadata.eventIds],
        agentId: args.agentId,
        correlationId: args.correlationId,
      });

      logger.info("Agent emitted command", {
        commandType: result.emittedCommand.type,
        confidence: result.emittedCommand.metadata.confidence,
        agentId: args.agentId,
      });
    }

    // 6. Record audit event
    if (result.decision) {
      const decisionId = `dec_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

      await ctx.runMutation(components.agentBC.audit.record, {
        eventType: "PatternDetected",
        agentId: args.agentId,
        decisionId,
        timestamp: Date.now(),
        payload: {
          patternDetected: result.decision.command ? "churn-risk" : null,
          confidence: result.decision.confidence,
          reasoning: result.decision.reason,
          action: result.decision.command
            ? {
                type: result.decision.command,
                executionMode: result.decision.requiresApproval
                  ? "flag-for-review"
                  : "auto-execute",
              }
            : null,
          triggeringEvents: result.decision.triggeringEvents,
          sourceEventId: args.eventId,
        },
      });

      logger.debug("Recorded audit event", {
        decisionId,
        agentId: args.agentId,
        hasCommand: result.decision.command !== null,
      });
    }

    // Handle pending approval (if any)
    if (result.pendingApproval) {
      logger.info("Agent created pending approval", {
        approvalId: result.pendingApproval.approvalId,
        action: result.pendingApproval.action.type,
        confidence: result.pendingApproval.confidence,
      });

      // Persist the pending approval for human review
      await ctx.runMutation(recordPendingApprovalRef, {
        approvalId: result.pendingApproval.approvalId,
        agentId: args.agentId,
        decisionId: result.pendingApproval.decisionId,
        action: result.pendingApproval.action,
        confidence: result.pendingApproval.confidence,
        reason: result.pendingApproval.reason,
        triggeringEventIds: [...(result.decision?.triggeringEvents ?? [])],
        expiresAt: result.pendingApproval.expiresAt,
      });
    }

    // Handle dead letter (if any)
    if (result.deadLetter) {
      logger.warn("Agent event processing failed", {
        agentId: result.deadLetter.agentId,
        eventId: result.deadLetter.eventId,
        error: result.deadLetter.error,
      });

      // Build context for dead letter
      const deadLetterContext: {
        correlationId?: string;
        errorCode?: string;
      } = {};
      if (result.deadLetter.context?.correlationId !== undefined) {
        deadLetterContext.correlationId = result.deadLetter.context.correlationId;
      }
      if (result.deadLetter.context?.errorCode !== undefined) {
        deadLetterContext.errorCode = result.deadLetter.context.errorCode;
      }

      // Persist dead letter via component (UPSERT semantics)
      await ctx.runMutation(components.agentBC.deadLetters.record, {
        agentId: result.deadLetter.agentId,
        subscriptionId: result.deadLetter.subscriptionId,
        eventId: result.deadLetter.eventId,
        globalPosition: result.deadLetter.globalPosition,
        error: result.deadLetter.error,
        attemptCount: result.deadLetter.attemptCount,
        ...(Object.keys(deadLetterContext).length > 0 && { context: deadLetterContext }),
      });
    }

    return result;
  },
});

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Load event history for pattern detection.
 *
 * Uses the customerCancellations projection for O(1) lookup instead of N+1 queries.
 * The projection is updated by the command orchestrator when OrderCancelled events occur.
 *
 * For churn risk detection:
 * 1. Extract customer ID from the event
 * 2. Query the customerCancellations projection (single O(1) lookup)
 * 3. Convert to PublishedEvent format for pattern detection
 *
 * @since Phase 22 - Refactored from N+1 query pattern to projection-based lookup
 */
async function loadEventHistory(
  ctx: Pick<MutationCtx, "db" | "runQuery">,
  currentEvent: PublishedEvent,
  _streamId: string
): Promise<PublishedEvent[]> {
  const config = churnRiskAgentConfig;

  // Calculate window boundary
  const windowMs = parseDuration(config.patternWindow.duration);
  if (windowMs === null) {
    // Invalid duration, return empty history
    return [];
  }
  const cutoffTime = Date.now() - windowMs;

  // Extract customerId from the event
  const customerId = extractCustomerId(currentEvent);
  if (!customerId) {
    return [];
  }

  // O(1) lookup: Query customerCancellations projection directly
  const customerData = await ctx.db
    .query("customerCancellations")
    .withIndex("by_customerId", (q) => q.eq("customerId", customerId))
    .first();

  // Build events from projection data
  const events: PublishedEvent[] = [];

  if (customerData) {
    // Filter to cancellations within window and convert to PublishedEvent format
    const windowCancellations = customerData.cancellations
      .filter((c) => c.timestamp >= cutoffTime)
      .map(
        (c): PublishedEvent => ({
          eventId: c.eventId,
          eventType: "OrderCancelled",
          globalPosition: c.globalPosition,
          streamType: "Order",
          streamId: c.orderId,
          payload: {
            orderId: c.orderId,
            customerId: customerId,
            reason: c.reason,
          },
          timestamp: c.timestamp,
          category: "domain" as const,
          boundedContext: "orders",
          schemaVersion: 1,
          correlation: {
            correlationId: "",
            causationId: "",
          },
        })
      );

    events.push(...windowCancellations);
  }

  // Add the current event if it's a cancellation and not already in the list
  // (projection may not have been updated yet for this event)
  if (currentEvent.eventType === "OrderCancelled") {
    if (!events.some((e) => e.eventId === currentEvent.eventId)) {
      events.push(currentEvent);
    }
  }

  // Sort by timestamp and limit
  return events
    .sort((a, b) => a.timestamp - b.timestamp)
    .slice(-(config.patternWindow.eventLimit ?? 100));
}
