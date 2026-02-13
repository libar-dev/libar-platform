/**
 * @libar-docs
 * @libar-docs-uses AgentAsBoundedContext
 * @libar-docs-arch-role service
 * @libar-docs-arch-context agent
 * @libar-docs-arch-layer application
 *
 * Agent Command Emission Tool
 *
 * Provides utilities for emitting commands from the agent.
 * In a production system, this would integrate with the Command Bus.
 *
 * @module contexts/agent/tools/emitCommand
 */

import { internalMutation, internalQuery } from "../../../_generated/server.js";
import { v } from "convex/values";
import { components } from "../../../_generated/api.js";
import {
  createEmittedAgentCommand,
  type EmittedAgentCommand,
} from "@libar-dev/platform-core/agent";
import { createPlatformNoOpLogger } from "@libar-dev/platform-core";
import { CHURN_RISK_AGENT_ID } from "../_config.js";

// ============================================================================
// Command Types
// ============================================================================

/**
 * Command types that the churn risk agent can emit.
 */
export const CHURN_RISK_COMMANDS = {
  SUGGEST_CUSTOMER_OUTREACH: "SuggestCustomerOutreach",
  LOG_CHURN_RISK: "LogChurnRisk",
  FLAG_FOR_REVIEW: "FlagCustomerForReview",
} as const;

/**
 * Payload for SuggestCustomerOutreach command.
 */
export interface SuggestCustomerOutreachPayload {
  customerId: string;
  riskLevel: "low" | "medium" | "high";
  cancellationCount: number;
  windowDays: number;
  suggestedChannel?: "email" | "phone" | "inApp";
  suggestedMessage?: string;
}

/**
 * Payload for LogChurnRisk command.
 */
export interface LogChurnRiskPayload {
  customerId: string;
  riskScore: number;
  factors: string[];
  timestamp: number;
}

/**
 * Payload for FlagCustomerForReview command.
 */
export interface FlagCustomerForReviewPayload {
  customerId: string;
  reason: string;
  priority: "low" | "normal" | "high" | "urgent";
  eventIds: string[];
}

// ============================================================================
// Command Emission
// ============================================================================

/**
 * Emit a command from the churn risk agent.
 *
 * This mutation creates an EmittedAgentCommand and stores it for processing.
 * In a production system, this would:
 * 1. Validate the command
 * 2. Store in a commands table
 * 3. Enqueue for processing by Command Bus
 * 4. Record in audit trail
 *
 * @example
 * ```typescript
 * await ctx.runMutation(
 *   internal.contexts.agent.tools.emitCommand.emitAgentCommand,
 *   {
 *     commandType: "SuggestCustomerOutreach",
 *     payload: { customerId: "cust_123", riskLevel: "high", ... },
 *     confidence: 0.92,
 *     reason: "Customer cancelled 5 orders in 30 days",
 *     triggeringEventIds: ["evt_1", "evt_2", "evt_3"],
 *   }
 * );
 * ```
 */
export const emitAgentCommand = internalMutation({
  args: {
    commandType: v.string(),
    payload: v.any(),
    confidence: v.number(),
    reason: v.string(),
    triggeringEventIds: v.array(v.string()),
    patternId: v.optional(v.string()),
    agentId: v.optional(v.string()),
    correlationId: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<{ commandId: string; command: EmittedAgentCommand }> => {
    const logger = createPlatformNoOpLogger();
    const agentId = args.agentId ?? CHURN_RISK_AGENT_ID;
    const now = Date.now();

    // Create the emitted command with full explainability
    const command = createEmittedAgentCommand(
      agentId,
      args.commandType,
      args.payload,
      args.confidence,
      args.reason,
      args.triggeringEventIds,
      args.patternId ? { patternId: args.patternId } : undefined
    );

    logger.info("Agent emitting command", {
      agentId,
      commandType: command.type,
      decisionId: command.metadata.decisionId,
      confidence: command.metadata.confidence,
    });

    // Generate command ID for external reference
    const commandId = `cmd_${now}_${Math.random().toString(36).substring(2, 8)}`;

    // Store the command via component
    await ctx.runMutation(components.agentBC.commands.record, {
      agentId,
      type: command.type,
      payload: command.payload,
      confidence: command.metadata.confidence,
      reason: command.metadata.reason,
      triggeringEventIds: [...command.metadata.eventIds],
      decisionId: command.metadata.decisionId,
      ...(command.metadata.patternId && { patternId: command.metadata.patternId }),
      ...(args.correlationId && { correlationId: args.correlationId }),
    });

    // Record in audit trail via component
    await ctx.runMutation(components.agentBC.audit.record, {
      eventType: "CommandEmitted",
      agentId,
      decisionId: command.metadata.decisionId,
      timestamp: now,
      payload: {
        commandId,
        commandType: command.type,
        confidence: command.metadata.confidence,
        reason: command.metadata.reason,
      },
    });

    return { commandId, command };
  },
});

// ============================================================================
// Command Queries
// ============================================================================

/**
 * Get pending commands from the agent.
 *
 * @example
 * ```typescript
 * const pending = await ctx.runQuery(
 *   internal.contexts.agent.tools.emitCommand.getPendingCommands,
 *   { agentId: "churn-risk-agent", limit: 10 }
 * );
 * ```
 */
export const getPendingCommands = internalQuery({
  args: {
    agentId: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const agentId = args.agentId ?? CHURN_RISK_AGENT_ID;
    return await ctx.runQuery(components.agentBC.commands.queryByAgent, {
      agentId,
      status: "pending",
      limit: args.limit ?? 10,
    });
  },
});

/**
 * Get command history for an agent.
 *
 * @example
 * ```typescript
 * const history = await ctx.runQuery(
 *   internal.contexts.agent.tools.emitCommand.getCommandHistory,
 *   { agentId: "churn-risk-agent", days: 7 }
 * );
 * ```
 */
export const getCommandHistory = internalQuery({
  args: {
    agentId: v.optional(v.string()),
    days: v.optional(v.number()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const agentId = args.agentId ?? CHURN_RISK_AGENT_ID;
    const days = args.days ?? 7;
    const cutoffTime = Date.now() - days * 24 * 60 * 60 * 1000;

    // Component returns in desc order by createdAt; apply days filter post-fetch
    const results = await ctx.runQuery(components.agentBC.commands.queryByAgent, {
      agentId,
      limit: args.limit ?? 100,
    });

    return results.filter((c: { createdAt: number }) => c.createdAt >= cutoffTime);
  },
});

// ============================================================================
// Command Processing
// ============================================================================

/**
 * Process a pending command.
 *
 * Looks up command by decisionId, updates status through lifecycle,
 * and records audit events.
 *
 * In a production system, real handlers would route to external systems:
 * - SuggestCustomerOutreach: Send notification to CRM
 * - LogChurnRisk: Record risk score in analytics
 * - FlagCustomerForReview: Create support ticket
 */
export const processCommand = internalMutation({
  args: {
    commandId: v.string(),
  },
  handler: async (ctx, { commandId }) => {
    const logger = createPlatformNoOpLogger();
    const now = Date.now();

    logger.info("Processing agent command", { commandId });

    // Load the command by decisionId via component
    const command = await ctx.runQuery(components.agentBC.commands.getByDecisionId, {
      decisionId: commandId,
    });

    if (!command) {
      throw new Error(`Command not found: ${commandId}`);
    }

    // Update status to processing via component
    await ctx.runMutation(components.agentBC.commands.updateStatus, {
      decisionId: command.decisionId,
      status: "processing",
    });

    try {
      // Route to appropriate handler based on command type
      // For now, just log and mark as completed
      logger.info("Command processed", {
        commandType: command.type,
        decisionId: command.decisionId,
      });

      // Update status to completed via component
      await ctx.runMutation(components.agentBC.commands.updateStatus, {
        decisionId: command.decisionId,
        status: "completed",
      });

      // Record audit event via component
      // Note: "CommandProcessed" is not in the 16 audit types; use "CommandEmitted" with outcome in payload
      await ctx.runMutation(components.agentBC.audit.record, {
        eventType: "CommandEmitted",
        agentId: command.agentId,
        decisionId: command.decisionId,
        timestamp: now,
        payload: {
          commandId,
          commandType: command.type,
          outcome: "completed",
        },
      });

      return { success: true, commandId };
    } catch (error) {
      // Update status to failed via component
      await ctx.runMutation(components.agentBC.commands.updateStatus, {
        decisionId: command.decisionId,
        status: "failed",
        error: error instanceof Error ? error.message : String(error),
      });

      throw error;
    }
  },
});
