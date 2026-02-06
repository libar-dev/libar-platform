/**
 * @libar-docs
 * @libar-docs-status roadmap
 * @libar-docs-infra
 * @libar-docs-implements AgentBCComponentIsolation
 * @libar-docs-uses EmittedAgentCommand
 * @libar-docs-used-by EventHandler, CommandOrchestrator, AdminUI
 *
 * Agent Component - Command Public API — DS-1 Stub
 *
 * Provides command recording, status tracking, and querying for
 * commands emitted by agents. Commands flow from agent decisions
 * through the CommandOrchestrator to domain handlers.
 *
 * Target: platform-core/src/agent/component/commands.ts
 *
 * ## Command API - Agent Command Lifecycle
 *
 * Access via: `components.agentBC.commands.*`
 *
 * See: DESIGN-2026-005 AD-4 (API Granularity, historical)
 */

/* eslint-disable @typescript-eslint/no-unused-vars */

import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

// ============================================================================
// Shared Validators
// ============================================================================

const commandStatusValidator = v.union(
  v.literal("pending"),
  v.literal("processing"),
  v.literal("completed"),
  v.literal("failed")
);

// ============================================================================
// Mutations
// ============================================================================

/**
 * Record a command emitted by an agent.
 *
 * Called when an agent's analysis results in a command to be processed.
 * The command enters "pending" status and awaits routing through the
 * CommandOrchestrator.
 *
 * @example
 * ```typescript
 * await ctx.runMutation(components.agentBC.commands.record, {
 *   agentId: "churn-risk-agent",
 *   type: "SuggestCustomerOutreach",
 *   payload: { customerId: "cust_123", suggestedAction: "discount-offer" },
 *   confidence: 0.85,
 *   reason: "3 cancellations in 30 days detected",
 *   triggeringEventIds: ["evt_1", "evt_2", "evt_3"],
 *   decisionId: "dec_123_abc",
 *   correlationId: "corr_456",
 * });
 * ```
 */
export const record = mutation({
  args: {
    agentId: v.string(),
    type: v.string(),
    payload: v.any(),
    confidence: v.number(),
    reason: v.string(),
    triggeringEventIds: v.array(v.string()),
    decisionId: v.string(),
    patternId: v.optional(v.string()),
    correlationId: v.optional(v.string()),
    routingAttempts: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    throw new Error("AgentBCComponentIsolation not yet implemented - roadmap pattern");
  },
});

/**
 * Update command processing status.
 *
 * Called by the CommandOrchestrator when command processing begins,
 * completes, or fails.
 *
 * @example
 * ```typescript
 * await ctx.runMutation(components.agentBC.commands.updateStatus, {
 *   decisionId: "dec_123_abc",
 *   status: "completed",
 * });
 * ```
 */
export const updateStatus = mutation({
  args: {
    decisionId: v.string(),
    status: commandStatusValidator,
    error: v.optional(v.string()),
    incrementRoutingAttempts: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    throw new Error("AgentBCComponentIsolation not yet implemented - roadmap pattern");
  },
});

// ============================================================================
// Queries
// ============================================================================

/**
 * Query commands by agent and optional status filter.
 *
 * @example
 * ```typescript
 * const commands = await ctx.runQuery(components.agentBC.commands.queryByAgent, {
 *   agentId: "churn-risk-agent",
 *   status: "pending",
 *   limit: 20,
 * });
 * ```
 */
export const queryByAgent = query({
  args: {
    agentId: v.string(),
    status: v.optional(commandStatusValidator),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    throw new Error("AgentBCComponentIsolation not yet implemented - roadmap pattern");
  },
});

/**
 * Get a command by its decision ID.
 *
 * Used by the command bridge (routeAgentCommand mutation) to load the
 * full command record before routing through CommandOrchestrator.
 *
 * @example
 * ```typescript
 * const command = await ctx.runQuery(components.agentBC.commands.getByDecisionId, {
 *   decisionId: "dec_123_abc",
 * });
 * if (!command) { /* command not found or already processed *\/ }
 * ```
 */
export const getByDecisionId = query({
  args: {
    decisionId: v.string(),
  },
  handler: async (ctx, args) => {
    throw new Error("AgentBCComponentIsolation not yet implemented - roadmap pattern");
  },
});

/**
 * Get all pending commands across agents.
 *
 * Used by the CommandOrchestrator to discover commands that
 * need routing and processing.
 *
 * @example
 * ```typescript
 * const pending = await ctx.runQuery(components.agentBC.commands.getPending, {
 *   limit: 100,
 * });
 * ```
 */
export const getPending = query({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    throw new Error("AgentBCComponentIsolation not yet implemented - roadmap pattern");
  },
});
