import type { Doc } from "./_generated/dataModel";
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

function toApprovalDTO(a: Doc<"pendingApprovals">) {
  return {
    approvalId: a.approvalId,
    agentId: a.agentId,
    decisionId: a.decisionId,
    action: a.action,
    confidence: a.confidence,
    reason: a.reason,
    status: a.status,
    triggeringEventIds: a.triggeringEventIds,
    expiresAt: a.expiresAt,
    createdAt: a.createdAt,
    ...(a.reviewerId !== undefined && { reviewerId: a.reviewerId }),
    ...(a.reviewedAt !== undefined && { reviewedAt: a.reviewedAt }),
    ...(a.reviewNote !== undefined && { reviewNote: a.reviewNote }),
  };
}

// ============================================================================
// Mutations
// ============================================================================

/**
 * Create a pending approval request.
 * Idempotent by approvalId: returns "already_exists" if duplicate.
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
    const { approvalId } = args;

    // Idempotency check
    const existing = await ctx.db
      .query("pendingApprovals")
      .withIndex("by_approvalId", (q) => q.eq("approvalId", approvalId))
      .first();

    if (existing) {
      return { status: "already_exists" as const };
    }

    const now = Date.now();
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

    return { status: "created" as const };
  },
});

/**
 * Approve a pending action.
 * Validates status is "pending" and not expired.
 * Returns full action details so caller can emit the command.
 */
export const approve = mutation({
  args: {
    approvalId: v.string(),
    reviewerId: v.string(),
    reviewNote: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { approvalId, reviewerId, reviewNote } = args;

    const approval = await ctx.db
      .query("pendingApprovals")
      .withIndex("by_approvalId", (q) => q.eq("approvalId", approvalId))
      .first();

    if (!approval) {
      return { status: "error" as const, message: "Approval not found" };
    }

    if (approval.status !== "pending") {
      return {
        status: "error" as const,
        message: `Cannot approve — current status is '${approval.status}'`,
      };
    }

    // Check expiration
    if (Date.now() >= approval.expiresAt) {
      return { status: "error" as const, message: "Approval has expired" };
    }

    const now = Date.now();

    await ctx.db.patch(approval._id, {
      status: "approved" as const,
      reviewerId,
      reviewedAt: now,
      ...(reviewNote !== undefined && { reviewNote }),
    });

    return {
      status: "approved" as const,
      action: approval.action,
      agentId: approval.agentId,
      triggeringEventIds: approval.triggeringEventIds,
      confidence: approval.confidence,
      reason: approval.reason,
      decisionId: approval.decisionId,
    };
  },
});

/**
 * Reject a pending action.
 * Same validation as approve. Marks the approval as rejected.
 */
export const reject = mutation({
  args: {
    approvalId: v.string(),
    reviewerId: v.string(),
    reviewNote: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { approvalId, reviewerId, reviewNote } = args;

    const approval = await ctx.db
      .query("pendingApprovals")
      .withIndex("by_approvalId", (q) => q.eq("approvalId", approvalId))
      .first();

    if (!approval) {
      return { status: "error" as const, message: "Approval not found" };
    }

    if (approval.status !== "pending") {
      return {
        status: "error" as const,
        message: `Cannot reject — current status is '${approval.status}'`,
      };
    }

    // Check expiration
    if (Date.now() >= approval.expiresAt) {
      return { status: "error" as const, message: "Approval has expired" };
    }

    const now = Date.now();

    await ctx.db.patch(approval._id, {
      status: "rejected" as const,
      reviewerId,
      reviewedAt: now,
      ...(reviewNote !== undefined && { reviewNote }),
    });

    return { status: "rejected" as const };
  },
});

/**
 * Expire all pending approvals past their expiration time.
 * Called by a cron job to clean up stale approvals.
 */
export const expirePending = mutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();

    // Query pending approvals that have expired
    const expired = await ctx.db
      .query("pendingApprovals")
      .withIndex("by_status_expiresAt", (q) => q.eq("status", "pending").lt("expiresAt", now))
      .collect();

    for (const approval of expired) {
      await ctx.db.patch(approval._id, { status: "expired" });
    }

    return { expiredCount: expired.length };
  },
});

// ============================================================================
// Queries
// ============================================================================

/**
 * Query approvals with optional agentId and status filters.
 * Chooses the appropriate index based on which filters are present.
 */
export const queryApprovals = query({
  args: {
    agentId: v.optional(v.string()),
    status: v.optional(approvalStatusValidator),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { agentId, status, limit = 100 } = args;

    let results;

    if (agentId && status) {
      // Both filters: use agentId+status compound index
      results = await ctx.db
        .query("pendingApprovals")
        .withIndex("by_agentId_status", (q) => q.eq("agentId", agentId).eq("status", status))
        .take(limit);
    } else if (agentId) {
      // Agent only: use agentId prefix of compound index
      results = await ctx.db
        .query("pendingApprovals")
        .withIndex("by_agentId_status", (q) => q.eq("agentId", agentId))
        .take(limit);
    } else if (status) {
      // Status only: use status+expiresAt index (status prefix)
      results = await ctx.db
        .query("pendingApprovals")
        .withIndex("by_status_expiresAt", (q) => q.eq("status", status))
        .take(limit);
    } else {
      // No filters: scan all
      results = await ctx.db.query("pendingApprovals").take(limit);
    }

    return results.map(toApprovalDTO);
  },
});

/**
 * Get a specific approval by its approvalId.
 */
export const getById = query({
  args: {
    approvalId: v.string(),
  },
  handler: async (ctx, args) => {
    const approval = await ctx.db
      .query("pendingApprovals")
      .withIndex("by_approvalId", (q) => q.eq("approvalId", args.approvalId))
      .first();

    if (!approval) {
      return null;
    }

    return toApprovalDTO(approval);
  },
});
