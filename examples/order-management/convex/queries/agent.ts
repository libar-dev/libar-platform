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
 * All queries delegate to the agentBC component API.
 *
 * @since Phase 22 (AgentAsBoundedContext)
 */

import { query } from "../_generated/server";
import { v } from "convex/values";
import { components } from "../_generated/api";
import type { AgentAuditEventType } from "@libar-dev/platform-core/agent";

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
    return await ctx.runQuery(components.agentBC.checkpoints.getByAgentId, {
      agentId,
    });
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
 *   eventType: "PatternDetected",
 *   limit: 10,
 * });
 * ```
 */
export const getAuditEvents = query({
  args: {
    /** Agent BC identifier */
    agentId: v.string(),
    /** Optional: filter by event type */
    eventType: v.optional(v.string()),
    /** Maximum events to return (default: 100) */
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { agentId, eventType, limit }) => {
    return await ctx.runQuery(components.agentBC.audit.queryByAgent, {
      agentId,
      ...(eventType !== undefined && { eventType: eventType as AgentAuditEventType }),
      limit: limit ?? 100,
    });
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
  handler: async (ctx, { agentId, status, limit }) => {
    return await ctx.runQuery(components.agentBC.deadLetters.queryByAgent, {
      agentId,
      ...(status !== undefined && { status }),
      limit: limit ?? 100,
    });
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
    return await ctx.runQuery(components.agentBC.checkpoints.listActive, {});
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
    return await ctx.runQuery(components.agentBC.deadLetters.getStats, {});
  },
});

// =============================================================================
// APPROVAL QUERIES (Phase 22.4)
// =============================================================================

/**
 * Get pending approvals.
 *
 * Returns approval requests awaiting human review.
 * Can filter by agent ID and/or status.
 *
 * @example
 * ```typescript
 * // Get all pending approvals for an agent
 * const approvals = await ctx.runQuery(api.queries.agent.getPendingApprovals, {
 *   agentId: "churn-risk-agent",
 *   status: "pending",
 * });
 *
 * // Get all pending approvals (no filter)
 * const allPending = await ctx.runQuery(api.queries.agent.getPendingApprovals, {
 *   status: "pending",
 * });
 * ```
 */
export const getPendingApprovals = query({
  args: {
    /** Optional: filter by agent ID */
    agentId: v.optional(v.string()),
    /** Optional: filter by status */
    status: v.optional(
      v.union(
        v.literal("pending"),
        v.literal("approved"),
        v.literal("rejected"),
        v.literal("expired")
      )
    ),
    /** Maximum entries to return (default: 100) */
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { agentId, status, limit }) => {
    return await ctx.runQuery(components.agentBC.approvals.queryApprovals, {
      ...(agentId !== undefined && { agentId }),
      ...(status !== undefined && { status }),
      limit: limit ?? 100,
    });
  },
});

/**
 * Get a specific approval by ID.
 *
 * Returns the full approval record for display in a review UI.
 *
 * @example
 * ```typescript
 * const approval = await ctx.runQuery(api.queries.agent.getApprovalById, {
 *   approvalId: "apr_123_abc",
 * });
 * ```
 */
export const getApprovalById = query({
  args: {
    /** Approval ID to look up */
    approvalId: v.string(),
  },
  handler: async (ctx, { approvalId }) => {
    return await ctx.runQuery(components.agentBC.approvals.getById, {
      approvalId,
    });
  },
});
