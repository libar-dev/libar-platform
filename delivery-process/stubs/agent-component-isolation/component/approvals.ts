/**
 * @libar-docs
 * @libar-docs-status roadmap
 * @libar-docs-infra
 * @libar-docs-implements AgentBCComponentIsolation
 * @libar-docs-uses PendingApproval, HumanInLoopConfig
 * @libar-docs-used-by EventHandler, ApprovalWorkflow, AdminUI
 *
 * Agent Component - Approval Public API — DS-1 Stub
 *
 * Provides human-in-loop approval workflow for agent actions.
 * Low-confidence agent decisions are flagged for human review before
 * commands are emitted.
 *
 * Target: platform-core/src/agent/component/approvals.ts
 *
 * ## Approval API - Human-in-Loop Workflow
 *
 * Access via: `components.agentBC.approvals.*`
 *
 * Status flow: pending → approved/rejected/expired
 *
 * See: DESIGN-2026-005 AD-4 (API Granularity, historical)
 */

/* eslint-disable @typescript-eslint/no-unused-vars */

import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

// ============================================================================
// Shared Validators
// ============================================================================

const approvalStatusValidator = v.union(
  v.literal("pending"),
  v.literal("approved"),
  v.literal("rejected"),
  v.literal("expired")
);

// ============================================================================
// Mutations
// ============================================================================

/**
 * Create a pending approval request.
 *
 * Idempotent: if an approval with the same approvalId already exists,
 * returns "already_exists" without creating a duplicate.
 *
 * @example
 * ```typescript
 * const result = await ctx.runMutation(components.agentBC.approvals.create, {
 *   approvalId: "apr_123_abc",
 *   agentId: "churn-risk-agent",
 *   decisionId: "dec_123_abc",
 *   action: { type: "SuggestCustomerOutreach", payload: { customerId: "cust_1" } },
 *   confidence: 0.65,
 *   reason: "Moderate churn risk detected",
 *   triggeringEventIds: ["evt_1", "evt_2"],
 *   expiresAt: Date.now() + 24 * 60 * 60 * 1000, // 24h
 * });
 * ```
 */
export const create = mutation({
  args: {
    approvalId: v.string(),
    agentId: v.string(),
    decisionId: v.string(),
    action: v.object({
      type: v.string(),
      payload: v.any(),
    }),
    confidence: v.number(),
    reason: v.string(),
    triggeringEventIds: v.array(v.string()),
    expiresAt: v.number(),
  },
  handler: async (ctx, args) => {
    throw new Error("AgentBCComponentIsolation not yet implemented - roadmap pattern");
  },
});

/**
 * Approve a pending action.
 *
 * Returns the action details so the caller can emit the corresponding command.
 * Returns error status if approval is not in "pending" state or has expired.
 *
 * @example
 * ```typescript
 * const result = await ctx.runMutation(components.agentBC.approvals.approve, {
 *   approvalId: "apr_123_abc",
 *   reviewerId: "user_456",
 *   reviewNote: "Customer is high-value, proceeding with outreach",
 * });
 *
 * if (result.status === "approved") {
 *   // Emit the command via CommandOrchestrator
 *   await emitCommand(result.action, result.agentId, result.triggeringEventIds);
 * }
 * ```
 */
export const approve = mutation({
  args: {
    approvalId: v.string(),
    reviewerId: v.string(),
    reviewNote: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    throw new Error("AgentBCComponentIsolation not yet implemented - roadmap pattern");
  },
});

/**
 * Reject a pending action.
 *
 * Marks the approval as rejected. The associated command will not be emitted.
 *
 * @example
 * ```typescript
 * await ctx.runMutation(components.agentBC.approvals.reject, {
 *   approvalId: "apr_123_abc",
 *   reviewerId: "user_456",
 *   reviewNote: "False positive - customer already contacted",
 * });
 * ```
 */
export const reject = mutation({
  args: {
    approvalId: v.string(),
    reviewerId: v.string(),
    reviewNote: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    throw new Error("AgentBCComponentIsolation not yet implemented - roadmap pattern");
  },
});

/**
 * Expire all pending approvals past their expiration time.
 *
 * Called by a cron job or scheduled mutation to clean up stale approvals.
 * Returns the count of expired approvals.
 *
 * @example
 * ```typescript
 * // From a cron job:
 * const { expiredCount } = await ctx.runMutation(
 *   components.agentBC.approvals.expirePending, {}
 * );
 * ```
 */
export const expirePending = mutation({
  args: {},
  handler: async (ctx) => {
    throw new Error("AgentBCComponentIsolation not yet implemented - roadmap pattern");
  },
});

// ============================================================================
// IMPLEMENTATION NOTE — Cron Migration (Finding F-8)
// ============================================================================
//
// The current approval expiration cron at crons.ts:56 calls:
//   ctx.db.query("pendingApprovals").withIndex("by_expiresAt", ...)
//
// After migration to the agent component, the cron CANNOT access component
// tables directly (Convex component isolation). The cron must call through
// the component API via an app-level wrapper mutation:
//
//   // In convex/crons.ts (app level):
//   crons.interval("expire-pending-approvals", { hours: 1 }, internal.crons.expireApprovals);
//
//   // In convex/crons.ts or convex/infrastructure/agentCrons.ts:
//   export const expireApprovals = internalMutation({
//     handler: async (ctx) => {
//       const { expiredCount } = await ctx.runMutation(
//         components.agentBC.approvals.expirePending, {}
//       );
//       if (expiredCount > 0) {
//         console.log(`Expired ${expiredCount} pending approvals`);
//       }
//     },
//   });
//
// The component's expirePending mutation handles the actual query + patch
// logic internally. The app-level wrapper is a thin delegation layer.

// ============================================================================
// Queries
// ============================================================================

/**
 * Query approvals with optional agent and status filters.
 *
 * @example
 * ```typescript
 * // All pending approvals for an agent
 * const pending = await ctx.runQuery(components.agentBC.approvals.queryApprovals, {
 *   agentId: "churn-risk-agent",
 *   status: "pending",
 *   limit: 50,
 * });
 *
 * // All approvals regardless of agent or status
 * const all = await ctx.runQuery(components.agentBC.approvals.queryApprovals, {});
 * ```
 */
export const queryApprovals = query({
  args: {
    agentId: v.optional(v.string()),
    status: v.optional(approvalStatusValidator),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    throw new Error("AgentBCComponentIsolation not yet implemented - roadmap pattern");
  },
});

/**
 * Get a specific approval by ID.
 *
 * Returns the full approval record for display in admin UI or review workflow.
 *
 * @example
 * ```typescript
 * const approval = await ctx.runQuery(components.agentBC.approvals.getById, {
 *   approvalId: "apr_123_abc",
 * });
 * ```
 */
export const getById = query({
  args: {
    approvalId: v.string(),
  },
  handler: async (ctx, args) => {
    throw new Error("AgentBCComponentIsolation not yet implemented - roadmap pattern");
  },
});
