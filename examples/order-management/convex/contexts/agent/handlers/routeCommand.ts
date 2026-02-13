/**
 * Agent Command Bridge Mutation
 *
 * Routes agent-emitted commands to their target handlers.
 * Scheduled by the onComplete handler via ctx.scheduler.runAfter(0, ...).
 *
 * For this example app, SuggestCustomerOutreach is a simple notification
 * command. Full CommandOrchestrator integration is demonstrated by the
 * platform-core command-bridge module.
 *
 * @since Phase 22c (AgentCommandInfrastructure)
 */

import { internalMutation } from "../../../_generated/server.js";
import { v } from "convex/values";
import { createPlatformNoOpLogger } from "@libar-dev/platform-core";
import {
  createCommandBridgeHandler,
  type CommandBridgeConfig,
} from "@libar-dev/platform-core/agent";
import type { AgentCommandRouteMap } from "@libar-dev/platform-core/agent";
import { agentComponent } from "../_component.js";

// ============================================================================
// Command Route Map
// ============================================================================

/**
 * Route map for agent-emitted commands.
 *
 * Maps agent command types to their target handlers.
 * SuggestCustomerOutreach is routed as a notification command.
 */
const agentCommandRoutes: AgentCommandRouteMap = {
  SuggestCustomerOutreach: {
    commandType: "SuggestCustomerOutreach",
    boundedContext: "agent",
    toOrchestratorArgs: (command, context) => ({
      customerId: (command.payload as Record<string, unknown>)?.["customerId"] ?? "unknown",
      agentId: context.agentId,
      correlationId: context.correlationId,
      riskLevel: (command.payload as Record<string, unknown>)?.["riskLevel"] ?? "medium",
      triggeringPatternId: command.patternId ?? "unknown",
    }),
  },
};

// ============================================================================
// Minimal Registry & Orchestrator (for example app)
// ============================================================================

/**
 * Minimal command registry that recognizes SuggestCustomerOutreach.
 * In a production app, this would be the actual commandRegistry singleton.
 */
const minimalRegistry = {
  has: (type: string) => type === "SuggestCustomerOutreach",
  getConfig: (type: string) => (type === "SuggestCustomerOutreach" ? { type } : undefined),
};

/**
 * Minimal orchestrator that logs the command execution.
 * In a production app, this would use the full CommandOrchestrator.
 */
const minimalOrchestrator = {
  execute: async (_ctx: unknown, _config: unknown, args: Record<string, unknown>) => {
    // In a real implementation, this would:
    // 1. Create a notification/task for the customer success team
    // 2. Update a CRM system
    // 3. Trigger an integration event
    // For now, the command is just routed through the bridge
    // and audit-recorded -- the routing itself is the deliverable.
    return { success: true, commandType: "SuggestCustomerOutreach", args };
  },
};

// ============================================================================
// Bridge Mutation
// ============================================================================

const bridgeConfig: CommandBridgeConfig = {
  agentComponent,
  commandRoutes: agentCommandRoutes,
  commandRegistry: minimalRegistry,
  commandOrchestrator: minimalOrchestrator,
  logger: createPlatformNoOpLogger(),
};

const bridgeHandler = createCommandBridgeHandler(bridgeConfig);

/**
 * Route an agent command through the command bridge.
 *
 * Called by onComplete via ctx.scheduler.runAfter(0, routeAgentCommandRef, args).
 */
export const routeAgentCommand = internalMutation({
  args: {
    decisionId: v.string(),
    commandType: v.string(),
    agentId: v.string(),
    correlationId: v.string(),
    patternId: v.optional(v.string()),
    payload: v.optional(v.any()),
    confidence: v.optional(v.number()),
    reason: v.optional(v.string()),
    triggeringEventIds: v.optional(v.array(v.string())),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await bridgeHandler(ctx, args);
    return null;
  },
});
