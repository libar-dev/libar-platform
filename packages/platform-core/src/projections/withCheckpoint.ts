/**
 * @libar-docs
 * @libar-docs-pattern ProjectionCheckpointing
 * @libar-docs-status completed
 * @libar-docs-phase 04
 * @libar-docs-projection
 * @libar-docs-uses EventStoreFoundation
 *
 * ## Projection Checkpointing - Idempotent Processing
 *
 * Projection checkpoint helper for idempotent event processing.
 * Provides a wrapper function that handles the checkpoint pattern
 * automatically, reducing boilerplate in projection handlers.
 *
 * ### When to Use
 *
 * - Implementing projection handlers that must be idempotent
 * - Position-based checkpoint tracking for event processing
 * - Building reusable projection infrastructure with consistent patterns
 */
import type { ProjectionCheckpoint } from "./types.js";
import type { Logger } from "../logging/types.js";
import { createPlatformNoOpLogger } from "../logging/scoped.js";

/**
 * Result of processing a projection event with checkpoint.
 */
export type CheckpointProcessResult = { status: "processed" } | { status: "skipped" };

/**
 * Configuration for checkpoint-based projection processing.
 */
export interface WithCheckpointConfig<TCtx> {
  /** Name of the projection */
  projectionName: string;

  /** Partition key (typically streamId for per-entity projections) */
  partitionKey: string;

  /** Global position of the event being processed */
  globalPosition: number;

  /** Event ID for checkpoint tracking */
  eventId: string;

  /**
   * Function to retrieve the current checkpoint.
   * Should return null if no checkpoint exists.
   */
  getCheckpoint: (ctx: TCtx, partitionKey: string) => Promise<ProjectionCheckpoint | null>;

  /**
   * Function to update the checkpoint after processing.
   * Should upsert the checkpoint (create if not exists, update if exists).
   */
  updateCheckpoint: (
    ctx: TCtx,
    partitionKey: string,
    checkpoint: {
      projectionName: string;
      partitionKey: string;
      lastGlobalPosition: number;
      lastEventId: string;
      updatedAt: number;
    }
  ) => Promise<void>;

  /**
   * The projection processing logic.
   * Only called if the event hasn't been processed yet.
   */
  process: () => Promise<void>;

  /**
   * Optional logger for projection checkpoint operations.
   * If not provided, logging is disabled (no-op logger used).
   *
   * Logging points:
   * - DEBUG: Skipped (already processed)
   * - INFO: Processing started, processing completed
   */
  logger?: Logger;
}

/**
 * Wraps projection handler with checkpoint-based idempotency.
 *
 * This helper implements the standard checkpoint pattern:
 * 1. Check if event was already processed (compare globalPosition)
 * 2. If already processed, return { status: "skipped" }
 * 3. Execute projection logic
 * 4. Update checkpoint atomically
 * 5. Return { status: "processed" }
 *
 * @param ctx - The mutation context
 * @param config - Checkpoint configuration
 * @returns Result indicating whether event was processed or skipped
 *
 * @example
 * ```typescript
 * export const onOrderCreated = mutation({
 *   args: {
 *     orderId: v.string(),
 *     customerId: v.string(),
 *     eventId: v.string(),
 *     globalPosition: v.number(),
 *   },
 *   handler: async (ctx, args) => {
 *     return withCheckpoint(ctx, {
 *       projectionName: "orderSummary",
 *       partitionKey: args.orderId,
 *       globalPosition: args.globalPosition,
 *       eventId: args.eventId,
 *       getCheckpoint: async (ctx, key) => {
 *         return ctx.db.query("orderCheckpoints")
 *           .withIndex("by_partitionKey", q => q.eq("partitionKey", key))
 *           .first();
 *       },
 *       updateCheckpoint: async (ctx, key, checkpoint) => {
 *         const existing = await ctx.db.query("orderCheckpoints")
 *           .withIndex("by_partitionKey", q => q.eq("partitionKey", key))
 *           .first();
 *         if (existing) {
 *           await ctx.db.patch(existing._id, checkpoint);
 *         } else {
 *           await ctx.db.insert("orderCheckpoints", checkpoint);
 *         }
 *       },
 *       process: async () => {
 *         await ctx.db.insert("orderSummaries", {
 *           orderId: args.orderId,
 *           customerId: args.customerId,
 *           status: "draft",
 *           createdAt: Date.now(),
 *         });
 *       },
 *     });
 *   },
 * });
 * ```
 */
export async function withCheckpoint<TCtx>(
  ctx: TCtx,
  config: WithCheckpointConfig<TCtx>
): Promise<CheckpointProcessResult> {
  const {
    projectionName,
    partitionKey,
    globalPosition,
    eventId,
    getCheckpoint,
    updateCheckpoint,
    process,
    logger: configLogger,
  } = config;

  // Use provided logger or fall back to no-op
  const logger = configLogger ?? createPlatformNoOpLogger();

  // 1. Check checkpoint - skip if already processed
  const checkpoint = await getCheckpoint(ctx, partitionKey);

  if (checkpoint && globalPosition <= checkpoint.lastGlobalPosition) {
    logger.debug("Skipped: already processed", {
      projectionName,
      partitionKey,
      globalPosition,
      lastGlobalPosition: checkpoint.lastGlobalPosition,
    });
    return { status: "skipped" };
  }

  logger.info("Processing started", {
    projectionName,
    partitionKey,
    globalPosition,
    eventId,
  });

  // 2. Execute projection logic
  await process();

  // 3. Update checkpoint atomically
  await updateCheckpoint(ctx, partitionKey, {
    projectionName,
    partitionKey,
    lastGlobalPosition: globalPosition,
    lastEventId: eventId,
    updatedAt: Date.now(),
  });

  logger.info("Processing completed", {
    projectionName,
    partitionKey,
    globalPosition,
  });

  return { status: "processed" };
}

/**
 * Creates a reusable checkpoint helper bound to specific get/update functions.
 *
 * Use this when you want to configure checkpoint functions once and reuse
 * across multiple projection handlers.
 *
 * @param getCheckpoint - Function to retrieve checkpoints
 * @param updateCheckpoint - Function to update checkpoints
 * @param logger - Optional logger for checkpoint operations
 * @returns A configured withCheckpoint function
 *
 * @example
 * ```typescript
 * // Create a configured checkpoint helper for your context
 * const withOrderCheckpoint = createCheckpointHelper(
 *   async (ctx, key) => getOrderCheckpoint(ctx, key),
 *   async (ctx, key, cp) => updateOrderCheckpoint(ctx, key, cp),
 *   createScopedLogger("Projection", "INFO")
 * );
 *
 * // Use in handlers
 * export const onOrderCreated = mutation({
 *   handler: async (ctx, args) => {
 *     return withOrderCheckpoint(ctx, {
 *       projectionName: "orderSummary",
 *       partitionKey: args.orderId,
 *       globalPosition: args.globalPosition,
 *       eventId: args.eventId,
 *       process: async () => {
 *         // projection logic
 *       },
 *     });
 *   },
 * });
 * ```
 */
export function createCheckpointHelper<TCtx>(
  getCheckpoint: WithCheckpointConfig<TCtx>["getCheckpoint"],
  updateCheckpoint: WithCheckpointConfig<TCtx>["updateCheckpoint"],
  logger?: Logger
) {
  return async function withConfiguredCheckpoint(
    ctx: TCtx,
    config: Omit<WithCheckpointConfig<TCtx>, "getCheckpoint" | "updateCheckpoint" | "logger">
  ): Promise<CheckpointProcessResult> {
    return withCheckpoint(ctx, {
      ...config,
      getCheckpoint,
      updateCheckpoint,
      ...(logger !== undefined && { logger }),
    });
  };
}
