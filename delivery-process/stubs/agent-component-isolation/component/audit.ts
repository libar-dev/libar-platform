/**
 * @target platform-core/src/agent/component/audit.ts
 *
 * Agent Component - Audit Public API
 *
 * Provides audit event recording and querying for agent decision explainability.
 * Every agent decision, approval, rejection, and analysis result is recorded
 * as an audit event for compliance and debugging.
 *
 * @libar-docs
 * @libar-docs-status roadmap
 * @libar-docs-infra
 * @libar-docs-uses AgentAuditEvent
 * @libar-docs-used-by EventHandler, AdminUI
 *
 * ## Audit API - Decision Tracking
 *
 * Access via: `components.agent.audit.*`
 *
 * @see DESIGN-2026-005 AD-4 (API Granularity, historical)
 */

/* eslint-disable @typescript-eslint/no-unused-vars */

import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

// ============================================================================
// Shared Validators
// ============================================================================

const auditEventTypeValidator = v.union(
  v.literal("AgentDecisionMade"),
  v.literal("AgentActionApproved"),
  v.literal("AgentActionRejected"),
  v.literal("AgentActionExpired"),
  v.literal("AgentAnalysisCompleted"),
  v.literal("AgentAnalysisFailed"),
  v.literal("CommandEmitted"),
  v.literal("CommandProcessed")
);

// ============================================================================
// Mutations
// ============================================================================

/**
 * Record an audit event.
 *
 * Called after each agent decision to create an immutable audit trail.
 *
 * @example
 * ```typescript
 * await ctx.runMutation(components.agent.audit.record, {
 *   eventType: "AgentDecisionMade",
 *   agentId: "churn-risk-agent",
 *   decisionId: "dec_123_abc",
 *   timestamp: Date.now(),
 *   payload: { patternDetected: "churn-risk", confidence: 0.85 },
 * });
 * ```
 */
export const record = mutation({
  args: {
    eventType: auditEventTypeValidator,
    agentId: v.string(),
    decisionId: v.string(),
    timestamp: v.number(),
    payload: v.any(),
  },
  handler: async (ctx, args) => {
    throw new Error("AgentBCComponentIsolation not yet implemented - roadmap pattern");
  },
});

// ============================================================================
// Queries
// ============================================================================

/**
 * Query audit events by agent.
 *
 * Returns audit events ordered by timestamp (descending).
 * Optionally filter by event type.
 *
 * @example
 * ```typescript
 * const decisions = await ctx.runQuery(components.agent.audit.queryByAgent, {
 *   agentId: "churn-risk-agent",
 *   eventType: "AgentDecisionMade",
 *   limit: 10,
 * });
 * ```
 */
export const queryByAgent = query({
  args: {
    agentId: v.string(),
    eventType: v.optional(auditEventTypeValidator),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    throw new Error("AgentBCComponentIsolation not yet implemented - roadmap pattern");
  },
});

/**
 * Get audit event by decision ID.
 *
 * Correlates audit events with commands and approvals via the shared decisionId.
 *
 * @example
 * ```typescript
 * const audit = await ctx.runQuery(components.agent.audit.getByDecisionId, {
 *   decisionId: "dec_123_abc",
 * });
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
