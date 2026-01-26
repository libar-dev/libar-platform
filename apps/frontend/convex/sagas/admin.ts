/**
 * Saga Admin Operations.
 *
 * Provides human-in-the-loop capabilities for managing saga states,
 * monitoring, and manual intervention when workflows encounter issues.
 *
 * With Convex's durable workflow infrastructure, sagas should rarely fail.
 * These operations are for edge cases requiring admin attention.
 */
import { mutation, query } from "../_generated/server";
import { v } from "convex/values";
import { workflowManager } from "../infrastructure";
import type { WorkflowId } from "@convex-dev/workflow";

// =============================================================================
// Query Operations (Monitoring)
// =============================================================================

/**
 * Get detailed information about a specific saga.
 * Returns saga record plus workflow status if available.
 */
export const getSagaDetails = query({
  args: {
    sagaType: v.string(),
    sagaId: v.string(),
  },
  returns: v.union(
    v.null(),
    v.object({
      saga: v.object({
        _id: v.id("sagas"),
        _creationTime: v.number(),
        sagaType: v.string(),
        sagaId: v.string(),
        workflowId: v.string(),
        status: v.string(),
        triggerEventId: v.string(),
        triggerGlobalPosition: v.number(),
        createdAt: v.number(),
        updatedAt: v.number(),
        completedAt: v.optional(v.number()),
        error: v.optional(v.string()),
      }),
      /**
       * Workflow status from @convex-dev/workflow.
       * Uses v.any() because WorkflowStatus is a complex discriminated union
       * with nested Step objects that vary based on workflow state.
       * See @convex-dev/workflow WorkflowStatus type for full shape.
       */
      workflowStatus: v.any(),
    })
  ),
  handler: async (ctx, args) => {
    const saga = await ctx.db
      .query("sagas")
      .withIndex("by_sagaId", (q) => q.eq("sagaType", args.sagaType).eq("sagaId", args.sagaId))
      .first();

    if (!saga) {
      return null;
    }

    // Get workflow status if available
    let workflowStatus = null;
    try {
      workflowStatus = await workflowManager.status(ctx, saga.workflowId as WorkflowId);
    } catch {
      // Workflow may not exist or be accessible
    }

    return {
      saga,
      workflowStatus,
    };
  },
});

/**
 * Get sagas that have been running for longer than the threshold.
 * Used for identifying potentially stuck sagas that may need attention.
 */
export const getStuckSagas = query({
  args: {
    sagaType: v.string(),
    thresholdMs: v.optional(v.number()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const threshold = args.thresholdMs ?? 60 * 60 * 1000; // 1 hour default
    const cutoffTime = Date.now() - threshold;

    const runningSagas = await ctx.db
      .query("sagas")
      .withIndex("by_status", (q) => q.eq("sagaType", args.sagaType).eq("status", "running"))
      .order("asc")
      .take(args.limit ?? 100);

    return runningSagas.filter((saga) => saga.updatedAt < cutoffTime);
  },
});

/**
 * Get failed sagas that may need retry or manual intervention.
 */
export const getFailedSagas = query({
  args: {
    sagaType: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("sagas")
      .withIndex("by_status", (q) => q.eq("sagaType", args.sagaType).eq("status", "failed"))
      .order("desc")
      .take(args.limit ?? 100);
  },
});

/**
 * Get saga statistics for a saga type.
 */
export const getSagaStats = query({
  args: {
    sagaType: v.string(),
  },
  returns: v.object({
    pending: v.number(),
    running: v.number(),
    completed: v.number(),
    failed: v.number(),
    compensating: v.number(),
    compensated: v.number(),
  }),
  handler: async (ctx, args) => {
    const statuses = [
      "pending",
      "running",
      "completed",
      "failed",
      "compensating",
      "compensated",
    ] as const;
    const result: Record<(typeof statuses)[number], number> = {
      pending: 0,
      running: 0,
      completed: 0,
      failed: 0,
      compensating: 0,
      compensated: 0,
    };

    for (const status of statuses) {
      const sagas = await ctx.db
        .query("sagas")
        .withIndex("by_status", (q) => q.eq("sagaType", args.sagaType).eq("status", status))
        .take(10000);
      result[status] = sagas.length;
    }

    return result;
  },
});

// =============================================================================
// Admin Mutations (Intervention)
// =============================================================================

/**
 * Valid saga status values.
 */
type SagaStatus = "pending" | "running" | "completed" | "failed" | "compensating" | "compensated";

/**
 * Statuses that can be transitioned to "failed" by admin.
 * Only non-terminal, active states can be marked as failed.
 */
const canMarkAsFailed: SagaStatus[] = ["pending", "running", "compensating"];

/**
 * Manually mark a saga as failed.
 * Use when a saga is stuck in an unexpected state and needs admin attention.
 */
export const markSagaFailed = mutation({
  args: {
    sagaType: v.string(),
    sagaId: v.string(),
    reason: v.string(),
  },
  returns: v.object({
    status: v.string(),
    currentStatus: v.optional(v.string()),
  }),
  handler: async (ctx, args) => {
    const saga = await ctx.db
      .query("sagas")
      .withIndex("by_sagaId", (q) => q.eq("sagaType", args.sagaType).eq("sagaId", args.sagaId))
      .first();

    if (!saga) {
      return { status: "not_found" };
    }

    // Only allow marking non-terminal states as failed
    if (!canMarkAsFailed.includes(saga.status as SagaStatus)) {
      return { status: "invalid_transition", currentStatus: saga.status };
    }

    await ctx.db.patch(saga._id, {
      status: "failed",
      error: args.reason,
      updatedAt: Date.now(),
    });

    return { status: "marked_failed" };
  },
});

/**
 * Manually mark a saga as compensated.
 * Use after manually performing compensation steps for a failed saga.
 */
export const markSagaCompensated = mutation({
  args: {
    sagaType: v.string(),
    sagaId: v.string(),
    notes: v.optional(v.string()),
  },
  returns: v.object({
    status: v.string(),
    currentStatus: v.optional(v.string()),
  }),
  handler: async (ctx, args) => {
    const saga = await ctx.db
      .query("sagas")
      .withIndex("by_sagaId", (q) => q.eq("sagaType", args.sagaType).eq("sagaId", args.sagaId))
      .first();

    if (!saga) {
      return { status: "not_found" };
    }

    if (saga.status !== "failed") {
      return { status: "invalid_transition", currentStatus: saga.status };
    }

    await ctx.db.patch(saga._id, {
      status: "compensated",
      completedAt: Date.now(),
      updatedAt: Date.now(),
    });

    return { status: "marked_compensated" };
  },
});

/**
 * Cancel a stuck running saga.
 * Marks the saga as failed and attempts to cancel the underlying workflow.
 */
export const cancelSaga = mutation({
  args: {
    sagaType: v.string(),
    sagaId: v.string(),
    reason: v.string(),
  },
  returns: v.object({
    status: v.string(),
    currentStatus: v.optional(v.string()),
    workflowCancelled: v.optional(v.boolean()),
  }),
  handler: async (ctx, args) => {
    const saga = await ctx.db
      .query("sagas")
      .withIndex("by_sagaId", (q) => q.eq("sagaType", args.sagaType).eq("sagaId", args.sagaId))
      .first();

    if (!saga) {
      return { status: "not_found" };
    }

    if (saga.status !== "running" && saga.status !== "pending") {
      return { status: "invalid_state", currentStatus: saga.status };
    }

    let workflowCancelled = false;
    try {
      await workflowManager.cancel(ctx, saga.workflowId as WorkflowId);
      workflowCancelled = true;
    } catch {
      // Workflow may already be completed or not exist
    }

    await ctx.db.patch(saga._id, {
      status: "failed",
      error: `Cancelled by admin: ${args.reason}`,
      updatedAt: Date.now(),
    });

    return { status: "cancelled", workflowCancelled };
  },
});

/**
 * Reset a failed saga to pending for manual retry.
 * Note: To fully restart, submit the triggering command again.
 */
export const retrySaga = mutation({
  args: {
    sagaType: v.string(),
    sagaId: v.string(),
  },
  returns: v.object({
    status: v.string(),
    currentStatus: v.optional(v.string()),
    note: v.optional(v.string()),
  }),
  handler: async (ctx, args) => {
    const saga = await ctx.db
      .query("sagas")
      .withIndex("by_sagaId", (q) => q.eq("sagaType", args.sagaType).eq("sagaId", args.sagaId))
      .first();

    if (!saga) {
      return { status: "not_found" };
    }

    if (saga.status !== "failed") {
      return { status: "invalid_state", currentStatus: saga.status };
    }

    await ctx.db.patch(saga._id, {
      status: "pending",
      error: undefined,
      updatedAt: Date.now(),
    });

    return {
      status: "reset_to_pending",
      note: "Saga reset to pending. To fully restart, submit the triggering command again.",
    };
  },
});

/**
 * Get workflow step history for a saga.
 * Useful for debugging and understanding saga execution progress.
 */
export const getSagaSteps = query({
  args: {
    sagaType: v.string(),
    sagaId: v.string(),
  },
  handler: async (ctx, args) => {
    const saga = await ctx.db
      .query("sagas")
      .withIndex("by_sagaId", (q) => q.eq("sagaType", args.sagaType).eq("sagaId", args.sagaId))
      .first();

    if (!saga) {
      return null;
    }

    try {
      const result = await workflowManager.listSteps(ctx, saga.workflowId as WorkflowId, {
        order: "asc",
        paginationOpts: { cursor: null, numItems: 100 },
      });
      return {
        sagaId: saga.sagaId,
        workflowId: saga.workflowId,
        steps: result.page,
      };
    } catch {
      // Workflow may not exist or be already cleaned up
      return {
        sagaId: saga.sagaId,
        workflowId: saga.workflowId,
        steps: [],
      };
    }
  },
});

/**
 * Manually cleanup a completed/failed saga workflow.
 * Frees workflow storage after saga is no longer needed for debugging.
 */
export const cleanupSagaWorkflow = mutation({
  args: {
    sagaType: v.string(),
    sagaId: v.string(),
  },
  returns: v.object({
    status: v.string(),
    cleaned: v.optional(v.boolean()),
    currentStatus: v.optional(v.string()),
  }),
  handler: async (ctx, args) => {
    const saga = await ctx.db
      .query("sagas")
      .withIndex("by_sagaId", (q) => q.eq("sagaType", args.sagaType).eq("sagaId", args.sagaId))
      .first();

    if (!saga) {
      return { status: "not_found" };
    }

    if (saga.status !== "completed" && saga.status !== "failed" && saga.status !== "compensated") {
      return { status: "invalid_state", currentStatus: saga.status };
    }

    try {
      const cleaned = await workflowManager.cleanup(ctx, saga.workflowId as WorkflowId);
      return { status: "cleaned", cleaned };
    } catch {
      return { status: "cleanup_failed", cleaned: false };
    }
  },
});
