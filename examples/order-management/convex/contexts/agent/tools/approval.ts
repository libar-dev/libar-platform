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
import { components } from "../../../_generated/api.js";
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

    // Create approval via component (idempotent by approvalId)
    const result = await ctx.runMutation(components.agentBC.approvals.create, {
      approvalId: args.approvalId,
      agentId: args.agentId,
      decisionId: args.decisionId,
      action: args.action,
      confidence: args.confidence,
      reason: args.reason,
      triggeringEventIds: args.triggeringEventIds,
      expiresAt: args.expiresAt,
    });

    if (result.status === "already_exists") {
      logger.debug("Pending approval already exists, skipping", {
        approvalId: args.approvalId,
      });
      return { approvalId: args.approvalId, created: false };
    }

    // Record audit event via component
    await ctx.runMutation(components.agentBC.audit.record, {
      eventType: "ApprovalRequested",
      agentId: args.agentId,
      decisionId: args.decisionId,
      timestamp: Date.now(),
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

    // Approve via component - returns action details or error
    const result = await ctx.runMutation(components.agentBC.approvals.approve, {
      approvalId: args.approvalId,
      reviewerId: args.reviewerId,
      ...(args.reviewNote !== undefined && { reviewNote: args.reviewNote }),
    });

    if (result.status === "error") {
      logger.warn("Cannot approve", {
        approvalId: args.approvalId,
        error: result.message,
      });
      return { success: false, error: result.message };
    }

    // Component returned action details with status "approved"
    const approved = result as {
      status: "approved";
      action: { type: string; payload: unknown };
      agentId: string;
      triggeringEventIds: string[];
      confidence: number;
      reason: string;
      decisionId: string;
    };

    // Emit the command
    await ctx.runMutation(emitAgentCommandRef, {
      commandType: approved.action.type,
      payload: approved.action.payload,
      confidence: approved.confidence,
      reason: approved.reason,
      triggeringEventIds: approved.triggeringEventIds,
      agentId: approved.agentId,
    });

    // Record audit event via component
    await ctx.runMutation(components.agentBC.audit.record, {
      eventType: "ApprovalGranted",
      agentId: approved.agentId,
      decisionId: approved.decisionId,
      timestamp: Date.now(),
      payload: {
        approvalId: args.approvalId,
        reviewerId: args.reviewerId,
        reviewNote: args.reviewNote,
        actionType: approved.action.type,
      },
    });

    logger.info("Approved agent action", {
      approvalId: args.approvalId,
      agentId: approved.agentId,
      actionType: approved.action.type,
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

    // Reject via component
    const result = await ctx.runMutation(components.agentBC.approvals.reject, {
      approvalId: args.approvalId,
      reviewerId: args.reviewerId,
      ...(args.reviewNote !== undefined && { reviewNote: args.reviewNote }),
    });

    if (result.status === "error") {
      logger.warn("Cannot reject", {
        approvalId: args.approvalId,
        error: result.message,
      });
      return { success: false, error: result.message };
    }

    // Query approval details for audit event
    const approval = await ctx.runQuery(components.agentBC.approvals.getById, {
      approvalId: args.approvalId,
    });

    if (approval) {
      // Record audit event via component
      await ctx.runMutation(components.agentBC.audit.record, {
        eventType: "ApprovalRejected",
        agentId: approval.agentId,
        decisionId: approval.decisionId,
        timestamp: Date.now(),
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
    }

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

    // Component handles iteration and patching internally
    const result = await ctx.runMutation(components.agentBC.approvals.expirePending, {});

    if (result.expiredCount > 0) {
      logger.info("Expired pending approvals", {
        count: result.expiredCount,
      });
    } else {
      logger.debug("No expired approvals to process");
    }

    return { expiredCount: result.expiredCount };
  },
});
