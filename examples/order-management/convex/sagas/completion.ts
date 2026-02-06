/**
 * @libar-docs
 * @libar-docs-pattern SagaCompletionHandler
 * @libar-docs-status completed
 * @libar-docs-saga
 * @libar-docs-arch-role infrastructure
 * @libar-docs-arch-layer infrastructure
 * @libar-docs-uses SagaRegistry
 * @libar-docs-used-by OrderManagementInfrastructure
 *
 * Workflow onComplete callback handler. Updates saga status on completion
 * and cleans up workflow state.
 */
import { internalMutation } from "../_generated/server";
import { v } from "convex/values";
import { vResultValidator } from "@convex-dev/workpool";
import { vWorkflowId, type WorkflowId } from "@convex-dev/workflow";
import { createScopedLogger } from "@libar-dev/platform-core";
import { workflowManager, PLATFORM_LOG_LEVEL } from "../infrastructure";

/**
 * Logger for saga completion operations.
 */
const logger = createScopedLogger("Saga:Completion", PLATFORM_LOG_LEVEL);

/**
 * onComplete handler for saga workflows.
 *
 * Called automatically when any saga workflow completes, fails, or is canceled.
 * Updates the saga registry status and cleans up workflow data on success.
 */
export const onSagaComplete = internalMutation({
  args: {
    workflowId: vWorkflowId,
    result: vResultValidator,
    context: v.object({
      sagaType: v.string(),
      sagaId: v.string(),
    }),
  },
  handler: async (ctx, { workflowId, result, context }) => {
    const { sagaType, sagaId } = context;

    const saga = await ctx.db
      .query("sagas")
      .withIndex("by_sagaId", (q) => q.eq("sagaType", sagaType).eq("sagaId", sagaId))
      .first();

    if (!saga) {
      // Saga not found - may have been cleaned up manually
      logger.debug("Saga not found for completion", { sagaType, sagaId, workflowId });
      return;
    }

    const now = Date.now();

    // Cleanup Strategy:
    // - Success: Clean up workflow data (no longer needed for debugging)
    // - Failed: Preserve workflow state for debugging via getSagaSteps()
    // - Canceled: Clean up (intentional termination, debugging not needed)

    if (result.kind === "success") {
      await ctx.db.patch(saga._id, {
        status: "completed",
        completedAt: now,
        updatedAt: now,
      });
      await workflowManager.cleanup(ctx, workflowId as WorkflowId);
      logger.info("Saga completed successfully", { sagaType, sagaId, workflowId });
    } else if (result.kind === "failed") {
      await ctx.db.patch(saga._id, {
        status: "failed",
        error: result.error,
        updatedAt: now,
      });
      // Preserve workflow state - admin can use getSagaSteps() to debug
      logger.warn("Saga failed", { sagaType, sagaId, workflowId, error: result.error });
    } else if (result.kind === "canceled") {
      await ctx.db.patch(saga._id, {
        status: "failed",
        error: "Canceled",
        updatedAt: now,
      });
      await workflowManager.cleanup(ctx, workflowId as WorkflowId);
      logger.info("Saga canceled", { sagaType, sagaId, workflowId });
    }
  },
});
