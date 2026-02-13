/**
 * Agent Command Bridge Mutation
 *
 * Routes agent-emitted commands to their target handlers.
 * Scheduled by the onComplete handler via ctx.scheduler.runAfter(0, ...).
 *
 * SuggestCustomerOutreach is handled via the dual-write pattern:
 * CMS record (outreachTasks) + OutreachCreated domain event in a single
 * atomic mutation. The bridge handles audit recording and error routing.
 *
 * @since Phase 22c (AgentCommandInfrastructure)
 */

import { internalMutation } from "../../../_generated/server.js";
import type { MutationCtx } from "../../../_generated/server.js";
import { v } from "convex/values";
import {
  createPlatformNoOpLogger,
  generateId,
  generateEventId,
  generateCorrelationId,
} from "@libar-dev/platform-core";
import {
  createCommandBridgeHandler,
  type CommandBridgeConfig,
} from "@libar-dev/platform-core/agent";
import type { AgentCommandRouteMap } from "@libar-dev/platform-core/agent";
import { agentComponent } from "../_component.js";
import { eventStore } from "../../../infrastructure.js";

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
    toOrchestratorArgs: (command, context) => {
      const payload = command.payload as Record<string, unknown> | undefined;
      const customerId = typeof payload?.["customerId"] === "string" ? payload["customerId"] : null;
      if (!customerId) {
        throw new Error("SuggestCustomerOutreach requires a valid customerId in command payload");
      }
      return {
        customerId,
        agentId: context.agentId,
        correlationId: context.correlationId,
        riskLevel: typeof payload?.["riskLevel"] === "string" ? payload["riskLevel"] : "medium",
        cancellationCount:
          typeof payload?.["cancellationCount"] === "number" ? payload["cancellationCount"] : 0,
        triggeringPatternId: command.patternId ?? "unknown",
      };
    },
  },
};

// ============================================================================
// Outreach Registry & Handler
// ============================================================================

/**
 * Command registry for agent-emitted commands.
 * Recognizes SuggestCustomerOutreach for routing through the bridge.
 */
const outreachRegistry = {
  has: (type: string) => type === "SuggestCustomerOutreach",
  getConfig: (type: string) => (type === "SuggestCustomerOutreach" ? { type } : undefined),
};

/**
 * Outreach command handler implementing the dual-write pattern.
 *
 * 1. CMS write: inserts an outreachTasks record (pending status)
 * 2. Event store write: appends OutreachCreated domain event
 *
 * Both writes occur in the same parent mutation transaction, so they
 * are atomic (see CLAUDE.md "Convex Transactions Span Component Boundaries").
 */
const outreachOrchestrator = {
  execute: async (ctx: unknown, _config: unknown, args: Record<string, unknown>) => {
    const mutCtx = ctx as MutationCtx;

    const customerId = typeof args["customerId"] === "string" ? args["customerId"] : undefined;
    if (!customerId) {
      throw new Error("SuggestCustomerOutreach requires customerId");
    }

    const agentId = typeof args["agentId"] === "string" ? args["agentId"] : "unknown";
    const correlationId =
      typeof args["correlationId"] === "string" ? args["correlationId"] : generateCorrelationId();
    const rawRiskLevel = typeof args["riskLevel"] === "string" ? args["riskLevel"] : "medium";
    const riskLevel =
      rawRiskLevel === "high" || rawRiskLevel === "medium" || rawRiskLevel === "low"
        ? rawRiskLevel
        : "medium";
    const cancellationCount =
      typeof args["cancellationCount"] === "number" ? args["cancellationCount"] : 0;
    const triggeringPatternId =
      typeof args["triggeringPatternId"] === "string" ? args["triggeringPatternId"] : "unknown";

    const now = Date.now();
    const outreachId = generateId("agent", "outreach");

    // ---- 1. CMS write: create outreach task record ----
    await mutCtx.db.insert("outreachTasks", {
      outreachId,
      customerId,
      agentId,
      riskLevel,
      cancellationCount,
      correlationId,
      triggeringPatternId,
      status: "pending",
      createdAt: now,
      updatedAt: now,
    });

    // ---- 2. Event store write: append OutreachCreated event ----
    await eventStore.appendToStream(mutCtx, {
      streamType: "Outreach",
      streamId: outreachId,
      expectedVersion: 0,
      boundedContext: "agent",
      events: [
        {
          eventId: generateEventId("agent"),
          eventType: "OutreachCreated",
          payload: {
            outreachId,
            customerId,
            agentId,
            riskLevel,
            cancellationCount,
            correlationId,
          },
          metadata: { correlationId },
        },
      ],
    });

    return { success: true, outreachId, commandType: "SuggestCustomerOutreach" };
  },
};

// ============================================================================
// Bridge Mutation
// ============================================================================

const bridgeConfig: CommandBridgeConfig = {
  agentComponent,
  commandRoutes: agentCommandRoutes,
  commandRegistry: outreachRegistry,
  commandOrchestrator: outreachOrchestrator,
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
