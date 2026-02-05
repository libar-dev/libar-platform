/**
 * @target platform-core/src/agent/component/deadLetters.ts
 *
 * Agent Component - Dead Letter Public API
 *
 * Provides dead letter recording, status management, and querying for
 * agent events that failed processing. Dead letters enable investigation,
 * manual replay, and monitoring of agent health.
 *
 * @libar-docs
 * @libar-docs-status roadmap
 * @libar-docs-infra
 * @libar-docs-uses AgentDeadLetter
 * @libar-docs-used-by EventHandler, AdminUI, OnCompleteHandler
 *
 * ## Dead Letter API - Failed Event Management
 *
 * Access via: `components.agent.deadLetters.*`
 *
 * @see DESIGN-2026-005 AD-4 (API Granularity, historical)
 */

/* eslint-disable @typescript-eslint/no-unused-vars */

import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

// ============================================================================
// Shared Validators
// ============================================================================

const deadLetterStatusValidator = v.union(
  v.literal("pending"),
  v.literal("replayed"),
  v.literal("ignored")
);

const contextValidator = v.optional(
  v.object({
    correlationId: v.optional(v.string()),
    errorCode: v.optional(v.string()),
    ignoreReason: v.optional(v.string()),
  })
);

// ============================================================================
// Mutations
// ============================================================================

/**
 * Record a dead letter for failed event processing.
 *
 * Called when an event fails processing and exhausts retry attempts.
 * Creates a pending dead letter for investigation and potential replay.
 *
 * @example
 * ```typescript
 * await ctx.runMutation(components.agent.deadLetters.record, {
 *   agentId: "churn-risk-agent",
 *   subscriptionId: "sub_churn_001",
 *   eventId: "evt_123",
 *   globalPosition: 42,
 *   error: "LLM timeout after 30s",
 *   attemptCount: 3,
 * });
 * ```
 */
export const record = mutation({
  args: {
    agentId: v.string(),
    subscriptionId: v.string(),
    eventId: v.string(),
    globalPosition: v.number(),
    error: v.string(),
    attemptCount: v.number(),
    workId: v.optional(v.string()),
    context: contextValidator,
  },
  handler: async (ctx, args) => {
    throw new Error("AgentBCComponentIsolation not yet implemented - roadmap pattern");
  },
});

/**
 * Update dead letter status (replay or ignore).
 *
 * Used by admin UI to manage dead letters:
 * - "replayed": Event was successfully re-processed
 * - "ignored": Event was reviewed and marked as not requiring replay
 *
 * @example
 * ```typescript
 * await ctx.runMutation(components.agent.deadLetters.updateStatus, {
 *   eventId: "evt_123",
 *   newStatus: "ignored",
 *   ignoreReason: "Duplicate event from EventBus replay",
 * });
 * ```
 */
export const updateStatus = mutation({
  args: {
    eventId: v.string(),
    newStatus: deadLetterStatusValidator,
    ignoreReason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    throw new Error("AgentBCComponentIsolation not yet implemented - roadmap pattern");
  },
});

// ============================================================================
// Queries
// ============================================================================

/**
 * Query dead letters by agent and optional status filter.
 *
 * @example
 * ```typescript
 * const pending = await ctx.runQuery(components.agent.deadLetters.queryByAgent, {
 *   agentId: "churn-risk-agent",
 *   status: "pending",
 *   limit: 50,
 * });
 * ```
 */
export const queryByAgent = query({
  args: {
    agentId: v.string(),
    status: v.optional(deadLetterStatusValidator),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    throw new Error("AgentBCComponentIsolation not yet implemented - roadmap pattern");
  },
});

/**
 * Get dead letter statistics (pending counts per agent).
 *
 * Used by monitoring dashboards to surface agent health issues.
 *
 * @example
 * ```typescript
 * const stats = await ctx.runQuery(components.agent.deadLetters.getStats, {});
 * // Returns: [{ agentId: "churn-risk-agent", pendingCount: 3 }]
 * ```
 */
export const getStats = query({
  args: {},
  handler: async (ctx) => {
    throw new Error("AgentBCComponentIsolation not yet implemented - roadmap pattern");
  },
});
