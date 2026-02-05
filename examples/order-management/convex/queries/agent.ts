/**
 * ## Agent BC Queries
 *
 * Provides queries for accessing agent infrastructure data:
 * - Checkpoints (position tracking)
 * - Audit events (decision history)
 * - Dead letters (failed events)
 *
 * Used by:
 * - Integration tests to verify agent behavior
 * - Admin interfaces to monitor agent health
 * - Debugging to trace agent decisions
 *
 * @since Phase 22 (AgentAsBoundedContext)
 */

import { query } from "../_generated/server";
import { v } from "convex/values";

/**
 * Get agent checkpoint by agent ID.
 *
 * Returns the current checkpoint state for an agent, including:
 * - Last processed position (for exactly-once semantics)
 * - Status (active, paused, stopped)
 * - Events processed count
 *
 * @example
 * ```typescript
 * const checkpoint = await ctx.runQuery(api.queries.agent.getCheckpoint, {
 *   agentId: "churn-risk-agent",
 * });
 * ```
 */
export const getCheckpoint = query({
  args: {
    /** Agent BC identifier */
    agentId: v.string(),
  },
  handler: async (ctx, { agentId }) => {
    return await ctx.db
      .query("agentCheckpoints")
      .withIndex("by_agentId", (q) => q.eq("agentId", agentId))
      .first();
  },
});

/**
 * Get agent audit events.
 *
 * Returns audit events for an agent, ordered by timestamp (descending).
 * Audit events track all agent decisions for explainability.
 *
 * @example
 * ```typescript
 * const audits = await ctx.runQuery(api.queries.agent.getAuditEvents, {
 *   agentId: "churn-risk-agent",
 *   eventType: "AgentDecisionMade",
 *   limit: 10,
 * });
 * ```
 */
export const getAuditEvents = query({
  args: {
    /** Agent BC identifier */
    agentId: v.string(),
    /** Optional: filter by event type */
    eventType: v.optional(
      v.union(
        v.literal("AgentDecisionMade"),
        v.literal("AgentActionApproved"),
        v.literal("AgentActionRejected"),
        v.literal("AgentActionExpired"),
        v.literal("AgentAnalysisCompleted"),
        v.literal("AgentAnalysisFailed")
      )
    ),
    /** Maximum events to return (default: 100) */
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { agentId, eventType, limit = 100 }) => {
    const query = ctx.db
      .query("agentAuditEvents")
      .withIndex("by_agentId_timestamp", (q) => q.eq("agentId", agentId));

    const results = await query.order("desc").take(limit);

    // Filter by event type if specified
    if (eventType) {
      return results.filter((e) => e.eventType === eventType);
    }

    return results;
  },
});

/**
 * Get agent dead letters.
 *
 * Returns dead letter entries for an agent, ordered by failedAt (descending).
 * Dead letters track events that failed processing for investigation.
 *
 * @example
 * ```typescript
 * const deadLetters = await ctx.runQuery(api.queries.agent.getDeadLetters, {
 *   agentId: "churn-risk-agent",
 *   status: "pending",
 *   limit: 50,
 * });
 * ```
 */
export const getDeadLetters = query({
  args: {
    /** Agent BC identifier */
    agentId: v.string(),
    /** Optional: filter by status */
    status: v.optional(v.union(v.literal("pending"), v.literal("replayed"), v.literal("ignored"))),
    /** Maximum entries to return (default: 100) */
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { agentId, status, limit = 100 }) => {
    if (status) {
      return await ctx.db
        .query("agentDeadLetters")
        .withIndex("by_agentId_status", (q) => q.eq("agentId", agentId).eq("status", status))
        .order("desc")
        .take(limit);
    }

    // No status filter - get all for this agent
    const results = await ctx.db
      .query("agentDeadLetters")
      .withIndex("by_agentId_status", (q) => q.eq("agentId", agentId))
      .order("desc")
      .take(limit);

    return results;
  },
});

/**
 * Get all active agent checkpoints.
 *
 * Returns all checkpoints with "active" status, useful for monitoring.
 *
 * @example
 * ```typescript
 * const activeAgents = await ctx.runQuery(api.queries.agent.getActiveAgents, {});
 * ```
 */
export const getActiveAgents = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query("agentCheckpoints")
      .withIndex("by_status", (q) => q.eq("status", "active"))
      .collect();
  },
});

/**
 * Get dead letter statistics by agent.
 *
 * Returns counts of pending dead letters per agent for monitoring.
 *
 * @example
 * ```typescript
 * const stats = await ctx.runQuery(api.queries.agent.getDeadLetterStats, {});
 * ```
 */
export const getDeadLetterStats = query({
  args: {},
  handler: async (ctx) => {
    const pending = await ctx.db
      .query("agentDeadLetters")
      .withIndex("by_status", (q) => q.eq("status", "pending"))
      .collect();

    // Group by agent
    const byAgent = new Map<string, number>();
    for (const dl of pending) {
      byAgent.set(dl.agentId, (byAgent.get(dl.agentId) ?? 0) + 1);
    }

    return Array.from(byAgent.entries()).map(([agentId, count]) => ({
      agentId,
      pendingCount: count,
    }));
  },
});
