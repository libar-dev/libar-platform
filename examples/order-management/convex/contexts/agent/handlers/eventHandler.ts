/**
 * Churn Risk Agent Event Handler
 *
 * Handles events for the churn risk detection agent.
 * This mutation is called by the EventBus when matching events are published.
 *
 * @module contexts/agent/handlers/eventHandler
 */

import { internalMutation } from "../../../_generated/server.js";
import { v } from "convex/values";
// Note: AgentEventHandlerArgs type documents the expected shape of incoming args
import {
  createMockAgentRuntime,
  createAgentEventHandler,
  type AgentEventHandlerResult,
  type AgentCheckpoint,
} from "@libar-dev/platform-core/agent";
import { createPlatformNoOpLogger, type PublishedEvent } from "@libar-dev/platform-core";
import { churnRiskAgentConfig } from "../config.js";

// ============================================================================
// Event Handler
// ============================================================================

/**
 * Handle churn risk agent events.
 *
 * This mutation:
 * 1. Loads/creates the agent checkpoint
 * 2. Loads event history within the pattern window
 * 3. Calls the agent's onEvent handler
 * 4. Handles the decision (emit command, queue approval, etc.)
 * 5. Updates the checkpoint
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

    // Load or create checkpoint (simplified for demo)
    const checkpoint: AgentCheckpoint = {
      agentId: args.agentId,
      subscriptionId: `sub_${args.agentId}_${Date.now()}`,
      lastProcessedPosition: -1,
      lastEventId: "",
      status: "active",
      eventsProcessed: 0,
      updatedAt: Date.now(),
    };

    // Check if we've already processed this event (idempotency)
    if (event.globalPosition <= checkpoint.lastProcessedPosition) {
      logger.debug("Event already processed, skipping", {
        agentId: args.agentId,
        eventId: args.eventId,
        eventPosition: event.globalPosition,
        checkpointPosition: checkpoint.lastProcessedPosition,
      });
      return { success: true, decision: null };
    }

    // Create the event handler with dependencies
    const handler = createAgentEventHandler({
      config: churnRiskAgentConfig,
      runtime: createMockAgentRuntime(),
      logger,

      // Load event history for pattern detection
      loadHistory: async (_streamId: string): Promise<PublishedEvent[]> => {
        // In a real implementation, query the event store for recent events
        // For this demo, we return an empty array (the config's onEvent
        // will use ctx.history which is populated by the init infrastructure)
        return [];
      },

      // Load checkpoint
      loadCheckpoint: async (_agentId: string): Promise<AgentCheckpoint | null> => {
        return checkpoint;
      },

      // Update checkpoint after processing
      updateCheckpoint: async (
        _agentId: string,
        _eventId: string,
        _globalPosition: number
      ): Promise<void> => {
        // In a real implementation, update the checkpoint in the database
        // For this demo, we skip the actual update
        logger.debug("Checkpoint updated", {
          agentId: _agentId,
          eventId: _eventId,
          globalPosition: _globalPosition,
        });
      },
    });

    // Process the event
    const result = await handler(event, checkpoint);

    // Handle emitted command (if any)
    if (result.emittedCommand) {
      // In a real implementation, send to command bus
      // For this demo, we log the command
      logger.info("Agent emitting command", {
        commandType: result.emittedCommand.type,
        payload: result.emittedCommand.payload,
        confidence: result.emittedCommand.metadata.confidence,
        reason: result.emittedCommand.metadata.reason,
      });
    }

    // Handle pending approval (if any)
    if (result.pendingApproval) {
      logger.info("Agent created pending approval", {
        approvalId: result.pendingApproval.approvalId,
        action: result.pendingApproval.action.type,
        confidence: result.pendingApproval.confidence,
      });
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
