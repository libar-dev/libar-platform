/**
 * @libar-docs
 * @libar-docs-uses AgentAsBoundedContext
 * @libar-docs-arch-role service
 * @libar-docs-arch-context agent
 * @libar-docs-arch-layer application
 *
 * Agent Approval Workflow Tools
 *
 * Provides utilities for managing human-in-loop approval workflow for
 * low-confidence agent decisions.
 *
 * ## Workflow
 *
 * 1. Agent detects pattern with low confidence
 * 2. Creates pending approval via `recordPendingApproval`
 * 3. Human reviews and approves/rejects via `approveAgentAction`/`rejectAgentAction`
 * 4. If approved, command is emitted to the command queue
 * 5. Expired approvals are cleaned up via `expirePendingApprovals` cron
 *
 * @module contexts/agent/tools/approval
 * @since Phase 22.4 (AgentAsBoundedContext - Approval Workflow)
 */

import { internalMutation } from "../../../_generated/server.js";
import { makeFunctionReference } from "convex/server";
import { v } from "convex/values";
import { createPlatformNoOpLogger, type SafeMutationRef } from "@libar-dev/platform-core";

// TS2589 Prevention: Declare function references at module level
const emitAgentCommandRef = makeFunctionReference<"mutation">(
  "contexts/agent/tools/emitCommand:emitAgentCommand"
) as SafeMutationRef;

// ============================================================================
// Record Pending Approval
// ============================================================================

/**
 * Record a pending approval request for an agent action.
 *
 * Called by the event handler when a low-confidence decision requires
 * human review before execution.
 *
 * @example
 * ```typescript
 * await ctx.runMutation(
 *   internal.contexts.agent.tools.approval.recordPendingApproval,
 *   {
 *     approvalId: "apr_123_abc",
 *     agentId: "churn-risk-agent",
 *     decisionId: "dec_456_xyz",
 *     action: { type: "SuggestCustomerOutreach", payload: { customerId: "cust_1" } },
 *     confidence: 0.75,
 *     reason: "Customer cancelled 3 orders in 30 days",
 *     triggeringEventIds: ["evt_1", "evt_2", "evt_3"],
 *     expiresAt: Date.now() + 24 * 60 * 60 * 1000,
 *   }
 * );
 * ```
 */
export const recordPendingApproval = internalMutation({
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
    const logger = createPlatformNoOpLogger();
    const now = Date.now();

    // Check for duplicate approval (idempotency via approvalId)
    const existing = await ctx.db
      .query("pendingApprovals")
      .withIndex("by_approvalId", (q) => q.eq("approvalId", args.approvalId))
      .first();

    if (existing) {
      logger.debug("Pending approval already exists, skipping", {
        approvalId: args.approvalId,
      });
      return { approvalId: args.approvalId, created: false };
    }

    // Insert pending approval
    await ctx.db.insert("pendingApprovals", {
      approvalId: args.approvalId,
      agentId: args.agentId,
      decisionId: args.decisionId,
      action: args.action,
      confidence: args.confidence,
      reason: args.reason,
      status: "pending",
      triggeringEventIds: args.triggeringEventIds,
      expiresAt: args.expiresAt,
      createdAt: now,
    });

    // Record audit event
    await ctx.db.insert("agentAuditEvents", {
      eventType: "AgentDecisionMade",
      agentId: args.agentId,
      decisionId: args.decisionId,
      timestamp: now,
      payload: {
        approvalId: args.approvalId,
        actionType: args.action.type,
        confidence: args.confidence,
        reason: args.reason,
        requiresApproval: true,
        expiresAt: args.expiresAt,
      },
    });

    logger.info("Recorded pending approval", {
      approvalId: args.approvalId,
      agentId: args.agentId,
      actionType: args.action.type,
      confidence: args.confidence,
    });

    return { approvalId: args.approvalId, created: true };
  },
});

// ============================================================================
// Approve Agent Action
// ============================================================================

/**
 * Approve a pending agent action.
 *
 * Transitions the approval from "pending" to "approved" and emits
 * the command to the command queue.
 *
 * @example
 * ```typescript
 * await ctx.runMutation(
 *   internal.contexts.agent.tools.approval.approveAgentAction,
 *   {
 *     approvalId: "apr_123_abc",
 *     reviewerId: "user_789",
 *     reviewNote: "Customer verified as high-value, outreach approved",
 *   }
 * );
 * ```
 */
export const approveAgentAction = internalMutation({
  args: {
    approvalId: v.string(),
    reviewerId: v.string(),
    reviewNote: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const logger = createPlatformNoOpLogger();
    const now = Date.now();

    // Load the approval
    const approval = await ctx.db
      .query("pendingApprovals")
      .withIndex("by_approvalId", (q) => q.eq("approvalId", args.approvalId))
      .first();

    if (!approval) {
      logger.warn("Approval not found", { approvalId: args.approvalId });
      return { success: false, error: "APPROVAL_NOT_FOUND" };
    }

    // Check status
    if (approval.status !== "pending") {
      logger.warn("Cannot approve: invalid status", {
        approvalId: args.approvalId,
        currentStatus: approval.status,
      });
      return { success: false, error: "INVALID_STATUS_TRANSITION" };
    }

    // Check expiration
    if (now >= approval.expiresAt) {
      logger.warn("Cannot approve: approval expired", {
        approvalId: args.approvalId,
        expiresAt: approval.expiresAt,
      });
      return { success: false, error: "APPROVAL_EXPIRED" };
    }

    // Update approval status
    await ctx.db.patch(approval._id, {
      status: "approved",
      reviewerId: args.reviewerId,
      reviewedAt: now,
      reviewNote: args.reviewNote,
    });

    // Emit the command
    await ctx.runMutation(emitAgentCommandRef, {
      commandType: approval.action.type,
      payload: approval.action.payload,
      confidence: approval.confidence,
      reason: approval.reason,
      triggeringEventIds: approval.triggeringEventIds,
      agentId: approval.agentId,
    });

    // Record audit event
    await ctx.db.insert("agentAuditEvents", {
      eventType: "AgentActionApproved",
      agentId: approval.agentId,
      decisionId: approval.decisionId,
      timestamp: now,
      payload: {
        approvalId: args.approvalId,
        reviewerId: args.reviewerId,
        reviewNote: args.reviewNote,
        actionType: approval.action.type,
      },
    });

    logger.info("Approved agent action", {
      approvalId: args.approvalId,
      agentId: approval.agentId,
      actionType: approval.action.type,
      reviewerId: args.reviewerId,
    });

    return { success: true, approvalId: args.approvalId };
  },
});

// ============================================================================
// Reject Agent Action
// ============================================================================

/**
 * Reject a pending agent action.
 *
 * Transitions the approval from "pending" to "rejected".
 * No command is emitted.
 *
 * @example
 * ```typescript
 * await ctx.runMutation(
 *   internal.contexts.agent.tools.approval.rejectAgentAction,
 *   {
 *     approvalId: "apr_123_abc",
 *     reviewerId: "user_789",
 *     reviewNote: "Customer already contacted by support team",
 *   }
 * );
 * ```
 */
export const rejectAgentAction = internalMutation({
  args: {
    approvalId: v.string(),
    reviewerId: v.string(),
    reviewNote: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const logger = createPlatformNoOpLogger();
    const now = Date.now();

    // Load the approval
    const approval = await ctx.db
      .query("pendingApprovals")
      .withIndex("by_approvalId", (q) => q.eq("approvalId", args.approvalId))
      .first();

    if (!approval) {
      logger.warn("Approval not found", { approvalId: args.approvalId });
      return { success: false, error: "APPROVAL_NOT_FOUND" };
    }

    // Check status
    if (approval.status !== "pending") {
      logger.warn("Cannot reject: invalid status", {
        approvalId: args.approvalId,
        currentStatus: approval.status,
      });
      return { success: false, error: "INVALID_STATUS_TRANSITION" };
    }

    // Check expiration
    if (now >= approval.expiresAt) {
      logger.warn("Cannot reject: approval expired", {
        approvalId: args.approvalId,
        expiresAt: approval.expiresAt,
      });
      return { success: false, error: "APPROVAL_EXPIRED" };
    }

    // Update approval status
    await ctx.db.patch(approval._id, {
      status: "rejected",
      reviewerId: args.reviewerId,
      reviewedAt: now,
      reviewNote: args.reviewNote,
    });

    // Record audit event
    await ctx.db.insert("agentAuditEvents", {
      eventType: "AgentActionRejected",
      agentId: approval.agentId,
      decisionId: approval.decisionId,
      timestamp: now,
      payload: {
        approvalId: args.approvalId,
        reviewerId: args.reviewerId,
        reviewNote: args.reviewNote,
        actionType: approval.action.type,
      },
    });

    logger.info("Rejected agent action", {
      approvalId: args.approvalId,
      agentId: approval.agentId,
      actionType: approval.action.type,
      reviewerId: args.reviewerId,
    });

    return { success: true, approvalId: args.approvalId };
  },
});

// ============================================================================
// Expire Pending Approvals (Cron)
// ============================================================================

/**
 * Expire pending approvals that have passed their expiration time.
 *
 * Called by the cron job to clean up stale approvals.
 * Transitions from "pending" to "expired" and records audit events.
 *
 * @example
 * ```typescript
 * // Called by cron every hour
 * crons.hourly("expire-pending-approvals", internal.contexts.agent.tools.approval.expirePendingApprovals);
 * ```
 */
export const expirePendingApprovals = internalMutation({
  args: {},
  handler: async (ctx) => {
    const logger = createPlatformNoOpLogger();
    const now = Date.now();

    // Find all pending approvals that have expired
    // Use the index on status and expiresAt for efficient lookup
    const expiredApprovals = await ctx.db
      .query("pendingApprovals")
      .withIndex("by_status_expiresAt", (q) => q.eq("status", "pending").lt("expiresAt", now))
      .collect();

    if (expiredApprovals.length === 0) {
      logger.debug("No expired approvals to process");
      return { expiredCount: 0 };
    }

    logger.info("Processing expired approvals", {
      count: expiredApprovals.length,
    });

    // Expire each approval
    for (const approval of expiredApprovals) {
      // Update status to expired
      await ctx.db.patch(approval._id, {
        status: "expired",
      });

      // Record audit event
      await ctx.db.insert("agentAuditEvents", {
        eventType: "AgentActionExpired",
        agentId: approval.agentId,
        decisionId: approval.decisionId,
        timestamp: now,
        payload: {
          approvalId: approval.approvalId,
          actionType: approval.action.type,
          expiresAt: approval.expiresAt,
          confidence: approval.confidence,
        },
      });

      logger.info("Expired approval", {
        approvalId: approval.approvalId,
        agentId: approval.agentId,
        actionType: approval.action.type,
      });
    }

    return { expiredCount: expiredApprovals.length };
  },
});
