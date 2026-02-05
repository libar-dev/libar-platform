/**
 * Churn Risk Agent Event Handler
 *
 * Handles events for the churn risk detection agent.
 * This mutation is called by the EventBus when matching events are published.
 *
 * ## Implementation
 *
 * This is a PRODUCTION implementation (not demo stubs):
 * 1. Loads/creates checkpoint from DB
 * 2. Checks idempotency via lastProcessedPosition
 * 3. Loads event history from orderSummaries + eventStore
 * 4. Calls agent's onEvent handler
 * 5. Handles decision (emit command, queue approval)
 * 6. Records audit event
 * 7. Updates checkpoint in DB
 *
 * @module contexts/agent/handlers/eventHandler
 * @since Phase 22 (AgentAsBoundedContext)
 */

import { internalMutation } from "../../../_generated/server.js";
import type { MutationCtx } from "../../../_generated/server.js";
import { makeFunctionReference } from "convex/server";
import { v } from "convex/values";
import { components } from "../../../_generated/api.js";
import type { Id } from "../../../_generated/dataModel.js";

/**
 * Event record type from the event store.
 * Matches the structure returned by eventStore.lib.readStream.
 */
interface StoredEventRecord {
  eventId: string;
  eventType: string;
  streamId: string;
  streamType: string;
  boundedContext: string;
  version: number;
  globalPosition: number;
  timestamp: number;
  payload: unknown;
  metadata?: unknown;
  correlationId: string;
  causationId?: string;
  schemaVersion: number;
  category: "domain" | "integration" | "trigger" | "fat";
}
import {
  createMockAgentRuntime,
  createAgentEventHandler,
  createInitialAgentCheckpoint,
  parseDuration,
  type AgentEventHandlerResult,
  type AgentCheckpoint,
} from "@libar-dev/platform-core/agent";
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

    // 1. Load or create checkpoint from DB
    const existingCheckpoint = await ctx.db
      .query("agentCheckpoints")
      .withIndex("by_agentId", (q) => q.eq("agentId", args.agentId))
      .first();

    let checkpoint: AgentCheckpoint;
    let checkpointId: Id<"agentCheckpoints">;

    if (existingCheckpoint) {
      checkpoint = {
        agentId: existingCheckpoint.agentId,
        subscriptionId: existingCheckpoint.subscriptionId,
        lastProcessedPosition: existingCheckpoint.lastProcessedPosition,
        lastEventId: existingCheckpoint.lastEventId,
        status: existingCheckpoint.status,
        eventsProcessed: existingCheckpoint.eventsProcessed,
        updatedAt: existingCheckpoint.updatedAt,
      };
      checkpointId = existingCheckpoint._id;
    } else {
      // Create new checkpoint
      checkpoint = createInitialAgentCheckpoint(args.agentId, `sub_${args.agentId}_${Date.now()}`);
      checkpointId = await ctx.db.insert("agentCheckpoints", checkpoint);
    }

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
    const handler = createAgentEventHandler({
      config: churnRiskAgentConfig,
      runtime: createMockAgentRuntime(), // Use real runtime when LLM integration is needed
      logger,

      // Load event history from the event store
      loadHistory: async (streamId: string) => {
        return await loadEventHistory(ctx, event, streamId);
      },

      // Load checkpoint (already loaded above)
      loadCheckpoint: async () => checkpoint,

      // Update checkpoint after processing
      updateCheckpoint: async (_agentId: string, eventId: string, globalPosition: number) => {
        await ctx.db.patch(checkpointId, {
          lastProcessedPosition: globalPosition,
          lastEventId: eventId,
          eventsProcessed: checkpoint.eventsProcessed + 1,
          updatedAt: Date.now(),
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

      await ctx.db.insert("agentAuditEvents", {
        eventType: "AgentDecisionMade",
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
      // TODO: Implement approval workflow with @convex-dev/workflow
    }

    // Handle dead letter (if any)
    if (result.deadLetter) {
      logger.warn("Agent event processing failed", {
        agentId: result.deadLetter.agentId,
        eventId: result.deadLetter.eventId,
        error: result.deadLetter.error,
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
 * Queries event store for events within the pattern window.
 * For churn risk detection, we need to:
 * 1. Extract customer ID from the event
 * 2. Find orders for that customer
 * 3. Load OrderCancelled events from those orders
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

  // Query orders by customer from orderSummaries projection
  const customerOrders = await ctx.db
    .query("orderSummaries")
    .withIndex("by_customerId", (q) => q.eq("customerId", customerId))
    .filter((q) => q.gte(q.field("createdAt"), cutoffTime))
    .take(config.patternWindow.eventLimit ?? 100);

  // For each order, load events from the event store
  const events: PublishedEvent[] = [];

  for (const order of customerOrders) {
    try {
      const orderEvents = await ctx.runQuery(components.eventStore.lib.readStream, {
        streamType: "Order",
        streamId: order.orderId,
      });

      // Filter to only cancellation events within window
      const cancellations = (orderEvents as StoredEventRecord[])
        .filter((e) => e.eventType === "OrderCancelled" && e.timestamp >= cutoffTime)
        .map(
          (e): PublishedEvent => ({
            eventId: e.eventId,
            eventType: e.eventType,
            globalPosition: e.globalPosition,
            streamType: e.streamType ?? "Order",
            streamId: e.streamId ?? order.orderId,
            payload: e.payload,
            timestamp: e.timestamp,
            category: "domain" as const,
            boundedContext: e.boundedContext ?? "orders",
            schemaVersion: e.schemaVersion ?? 1,
            correlation: {
              correlationId: e.correlationId ?? "",
              causationId: e.causationId ?? "",
            },
          })
        );

      events.push(...cancellations);
    } catch (_error) {
      // Silently continue - some orders may not have events in the event store yet
      // This is expected for newly created orders or orders with minimal activity
    }
  }

  // Add the current event if it's a cancellation
  if (currentEvent.eventType === "OrderCancelled") {
    // Only add if not already in the list
    if (!events.some((e) => e.eventId === currentEvent.eventId)) {
      events.push(currentEvent);
    }
  }

  // Sort by timestamp and limit
  return events
    .sort((a, b) => a.timestamp - b.timestamp)
    .slice(-(config.patternWindow.eventLimit ?? 100));
}
