/**
 * Shared helpers for app-level projection handlers.
 *
 * Provides checkpoint management utilities for idempotent event processing.
 */
import type { GenericMutationCtx } from "convex/server";
import type { DataModel, Doc } from "../_generated/dataModel";
import { createScopedLogger, type Logger } from "@libar-dev/platform-core";
import { PLATFORM_LOG_LEVEL } from "../infrastructure.js";

/**
 * Default logger for projection checkpoint operations.
 * Uses the platform-wide log level for consistent observability.
 */
const defaultProjectionLogger = createScopedLogger("Projection", PLATFORM_LOG_LEVEL);

/**
 * Properly typed mutation context for app-level mutations.
 */
export type MutationCtx = GenericMutationCtx<DataModel>;

/**
 * Projection result type.
 */
export type ProjectionResult = { status: "skipped" } | { status: "processed" };

/**
 * Base args required for all projection handlers.
 */
export interface BaseProjectionArgs {
  eventId: string;
  globalPosition: number;
}

/**
 * Get checkpoint for a projection partition.
 */
export async function getCheckpoint(
  ctx: MutationCtx,
  projectionName: string,
  partitionKey: string
): Promise<Doc<"projectionCheckpoints"> | null> {
  return await ctx.db
    .query("projectionCheckpoints")
    .withIndex("by_projection_partition", (q) =>
      q.eq("projectionName", projectionName).eq("partitionKey", partitionKey)
    )
    .first();
}

/**
 * Update checkpoint after successful processing.
 */
export async function updateCheckpoint(
  ctx: MutationCtx,
  checkpoint: Doc<"projectionCheckpoints"> | null,
  projectionName: string,
  partitionKey: string,
  eventId: string,
  globalPosition: number
): Promise<void> {
  const now = Date.now();
  if (checkpoint) {
    await ctx.db.patch(checkpoint._id, {
      lastGlobalPosition: globalPosition,
      lastEventId: eventId,
      updatedAt: now,
    });
  } else {
    await ctx.db.insert("projectionCheckpoints", {
      projectionName,
      partitionKey,
      lastGlobalPosition: globalPosition,
      lastEventId: eventId,
      updatedAt: now,
    });
  }
}

/**
 * Check if event should be processed based on checkpoint.
 * Returns true if the event should be processed, false if already processed.
 */
export async function shouldProcess(
  ctx: MutationCtx,
  projectionName: string,
  partitionKey: string,
  globalPosition: number
): Promise<{ shouldProcess: boolean; checkpoint: Doc<"projectionCheckpoints"> | null }> {
  const checkpoint = await getCheckpoint(ctx, projectionName, partitionKey);
  const shouldProcess = !checkpoint || globalPosition > checkpoint.lastGlobalPosition;
  return { shouldProcess, checkpoint };
}

/**
 * Generic projection wrapper that handles checkpoint logic.
 *
 * Provides idempotent event processing with built-in logging:
 * - INFO: Processing started, processing completed
 * - DEBUG: Skipped (already processed)
 *
 * @param ctx - Mutation context
 * @param projectionName - Name of the projection (e.g., "orderSummary")
 * @param partitionKey - Partition key (e.g., orderId)
 * @param args - Event args with eventId and globalPosition
 * @param handler - The actual projection logic
 * @param logger - Logger for observability (defaults to platform logger)
 */
export async function withCheckpoint(
  ctx: MutationCtx,
  projectionName: string,
  partitionKey: string,
  args: BaseProjectionArgs,
  handler: () => Promise<void>,
  logger: Logger = defaultProjectionLogger
): Promise<ProjectionResult> {
  const { eventId, globalPosition } = args;

  // Check checkpoint for idempotency
  const { shouldProcess: process, checkpoint } = await shouldProcess(
    ctx,
    projectionName,
    partitionKey,
    globalPosition
  );

  if (!process) {
    logger.debug("Skipped: already processed", {
      projectionName,
      partitionKey,
      eventId,
      globalPosition,
      lastPosition: checkpoint?.lastGlobalPosition,
    });
    return { status: "skipped" };
  }

  logger.info("Processing started", {
    projectionName,
    partitionKey,
    eventId,
    globalPosition,
  });

  // Execute handler logic
  await handler();

  // Update checkpoint
  await updateCheckpoint(ctx, checkpoint, projectionName, partitionKey, eventId, globalPosition);

  logger.info("Processing completed", {
    projectionName,
    partitionKey,
    eventId,
    globalPosition,
  });

  return { status: "processed" };
}
