/**
 * @libar-docs
 * @libar-docs-uses AgentAsBoundedContext
 * @libar-docs-arch-role application-service
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

    // Store the command in the database
    // Note: Only include optional fields if they have values
    const commandRecord: {
      agentId: string;
      type: string;
      payload: unknown;
      status: "pending";
      confidence: number;
      reason: string;
      triggeringEventIds: string[];
      decisionId: string;
      patternId?: string;
      correlationId?: string;
      createdAt: number;
    } = {
      agentId,
      type: command.type,
      payload: command.payload,
      status: "pending",
      confidence: command.metadata.confidence,
      reason: command.metadata.reason,
      triggeringEventIds: [...command.metadata.eventIds],
      decisionId: command.metadata.decisionId,
      createdAt: now,
    };

    // Only add optional fields if they have values
    if (command.metadata.patternId) {
      commandRecord.patternId = command.metadata.patternId;
    }
    if (args.correlationId) {
      commandRecord.correlationId = args.correlationId;
    }

    await ctx.db.insert("agentCommands", commandRecord);

    // Record in audit trail
    await ctx.db.insert("agentAuditEvents", {
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
    const limit = args.limit ?? 10;

    const commands = await ctx.db
      .query("agentCommands")
      .withIndex("by_agentId_status", (q) => q.eq("agentId", agentId).eq("status", "pending"))
      .take(limit);

    return commands;
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
    const limit = args.limit ?? 100;

    const cutoffTime = Date.now() - days * 24 * 60 * 60 * 1000;

    const commands = await ctx.db
      .query("agentCommands")
      .withIndex("by_agentId_createdAt", (q) =>
        q.eq("agentId", agentId).gte("createdAt", cutoffTime)
      )
      .order("desc")
      .take(limit);

    return commands;
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

    // Load the command by decisionId (commandId contains the decision ID pattern)
    // Commands are keyed by decisionId for correlation
    let command = await ctx.db
      .query("agentCommands")
      .withIndex("by_decisionId", (q) => q.eq("decisionId", commandId))
      .first();

    if (!command) {
      // If not found by decisionId, try filtering by the commandId pattern
      // This supports both lookup methods
      const allPending = await ctx.db
        .query("agentCommands")
        .withIndex("by_status", (q) => q.eq("status", "pending"))
        .take(100);

      const matchingCommand = allPending.find(
        (c) => c.decisionId === commandId || c.decisionId.includes(commandId.split("_")[1] ?? "")
      );

      if (!matchingCommand) {
        throw new Error(`Command not found: ${commandId}`);
      }

      command = matchingCommand;
    }

    // Update status to processing
    await ctx.db.patch(command._id, { status: "processing" as const });

    try {
      // Route to appropriate handler based on command type
      // For now, just log and mark as completed
      logger.info("Command processed", {
        commandType: command.type,
        decisionId: command.decisionId,
      });

      // Update status to completed
      await ctx.db.patch(command._id, {
        status: "completed" as const,
        processedAt: now,
      });

      // Record audit event
      await ctx.db.insert("agentAuditEvents", {
        eventType: "CommandProcessed",
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
      // Update status to failed
      await ctx.db.patch(command._id, {
        status: "failed" as const,
        error: error instanceof Error ? error.message : String(error),
        processedAt: now,
      });

      throw error;
    }
  },
});
