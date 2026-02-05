/**
 * App-level public API for Agent BC.
 *
 * Provides public mutations for the human-in-loop approval workflow.
 * These wrap the internal mutations in contexts/agent/tools/approval.ts
 * to expose them to the frontend.
 *
 * @module agent
 * @since Phase 22 (AgentAsBoundedContext)
 */
import { mutation } from "./_generated/server";
import { makeFunctionReference } from "convex/server";
import { v } from "convex/values";
import type { SafeMutationRef } from "@libar-dev/platform-core";

// TS2589 Prevention: Declare function references at module level
const approveAgentActionInternalRef = makeFunctionReference<"mutation">(
  "contexts/agent/tools/approval:approveAgentAction"
) as SafeMutationRef;

const rejectAgentActionInternalRef = makeFunctionReference<"mutation">(
  "contexts/agent/tools/approval:rejectAgentAction"
) as SafeMutationRef;

// ============================================================================
// Public Mutations for Approval Workflow
// ============================================================================

/**
 * Approve a pending agent action.
 *
 * Transitions the approval from "pending" to "approved" and emits
 * the command to the command queue.
 *
 * @example
 * ```typescript
 * // Frontend usage
 * const { mutate } = useMutation(api.agent.approveAgentAction);
 * await mutate({
 *   approvalId: "apr_123_abc",
 *   reviewerId: "user_789",
 *   reviewNote: "Customer verified as high-value, outreach approved",
 * });
 * ```
 */
export const approveAgentAction = mutation({
  args: {
    approvalId: v.string(),
    reviewerId: v.string(),
    reviewNote: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    return await ctx.runMutation(approveAgentActionInternalRef, {
      approvalId: args.approvalId,
      reviewerId: args.reviewerId,
      reviewNote: args.reviewNote,
    });
  },
});

/**
 * Reject a pending agent action.
 *
 * Transitions the approval from "pending" to "rejected".
 * No command is emitted.
 *
 * @example
 * ```typescript
 * // Frontend usage
 * const { mutate } = useMutation(api.agent.rejectAgentAction);
 * await mutate({
 *   approvalId: "apr_123_abc",
 *   reviewerId: "user_789",
 *   reviewNote: "Customer already contacted by support team",
 * });
 * ```
 */
export const rejectAgentAction = mutation({
  args: {
    approvalId: v.string(),
    reviewerId: v.string(),
    reviewNote: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    return await ctx.runMutation(rejectAgentActionInternalRef, {
      approvalId: args.approvalId,
      reviewerId: args.reviewerId,
      reviewNote: args.reviewNote,
    });
  },
});
