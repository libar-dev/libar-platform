/**
 * @libar-docs
 * @libar-docs-implements DurableEventsIntegration
 * @libar-docs-projection
 *
 * Rebuild Demonstration - Projection rebuild from event stream.
 *
 * Demonstrates the key event sourcing benefit: projections can be
 * rebuilt from the event stream at any time. This is useful for:
 * - Recovering from projection corruption
 * - Applying projection schema changes
 * - Migrating to new projection logic
 *
 * @since Phase 18.5 (DurableEventsIntegration)
 */

import { v } from "convex/values";
import { makeFunctionReference } from "convex/server";
import type { FunctionReference, FunctionVisibility } from "convex/server";
import { internalMutation, internalQuery } from "../_generated/server";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { TableNames } from "../_generated/dataModel";
import { createScopedLogger } from "@libar-dev/platform-core";
import { eventReplayPool, PLATFORM_LOG_LEVEL } from "../infrastructure.js";

// ============================================================================
// TS2589 Prevention - Function References
// ============================================================================

const processChunkRef = makeFunctionReference<"mutation">(
  "admin/projections:processReplayChunk"
) as FunctionReference<"mutation", FunctionVisibility>;

// ============================================================================
// Logger
// ============================================================================

const logger = createScopedLogger("RebuildDemo", PLATFORM_LOG_LEVEL);

/** Max records to count for stats - prevents unbounded memory usage */
const STATS_COUNT_LIMIT = 10000;

// ============================================================================
// Types
// ============================================================================

interface ProjectionStats {
  tableName: string;
  recordCount: number;
  oldestRecord: number | null;
  newestRecord: number | null;
}

/**
 * Map projection name to table name.
 * Uses explicit type to ensure valid table names.
 */
const PROJECTION_TABLE_MAP: Partial<Record<string, TableNames>> = {
  orderSummary: "orderSummaries",
  orderItems: "orderItems",
  productCatalog: "productCatalog",
  stockAvailability: "stockAvailability",
  activeReservations: "activeReservations",
  orderWithInventoryStatus: "orderWithInventoryStatus",
};

// ============================================================================
// Helper: Get Projection Stats
// ============================================================================

/**
 * Get statistics for a projection table.
 *
 * Uses efficient O(1) queries for timestamp bounds and bounded
 * queries for counting. Count is capped at STATS_COUNT_LIMIT.
 *
 * Note: For production monitoring with precise counts at scale,
 * use the convex-aggregate component instead.
 */
async function getProjectionStats(
  ctx: QueryCtx | MutationCtx,
  projectionName: string
): Promise<ProjectionStats> {
  const tableName = PROJECTION_TABLE_MAP[projectionName];

  if (!tableName) {
    return {
      tableName: "unknown",
      recordCount: 0,
      oldestRecord: null,
      newestRecord: null,
    };
  }

  // Query based on known table names with their timestamp fields
  let oldest: number | null = null;
  let newest: number | null = null;
  let count = 0;

  // Each projection has updatedAt - use that for timestamp tracking
  // Note: Each case is explicit due to Convex's strict typing requirements
  // for table names. Generic table queries are not type-safe in Convex.
  switch (tableName) {
    case "orderSummaries": {
      const oldestRecord = await ctx.db.query("orderSummaries").order("asc").first();
      const newestRecord = await ctx.db.query("orderSummaries").order("desc").first();
      oldest = oldestRecord?.createdAt ?? null;
      newest = newestRecord?.createdAt ?? null;
      count = oldestRecord
        ? (await ctx.db.query("orderSummaries").take(STATS_COUNT_LIMIT)).length
        : 0;
      break;
    }
    case "orderItems": {
      const oldestRecord = await ctx.db.query("orderItems").order("asc").first();
      const newestRecord = await ctx.db.query("orderItems").order("desc").first();
      oldest = oldestRecord?.createdAt ?? null;
      newest = newestRecord?.createdAt ?? null;
      count = oldestRecord ? (await ctx.db.query("orderItems").take(STATS_COUNT_LIMIT)).length : 0;
      break;
    }
    case "productCatalog": {
      const oldestRecord = await ctx.db.query("productCatalog").order("asc").first();
      const newestRecord = await ctx.db.query("productCatalog").order("desc").first();
      oldest = oldestRecord?.createdAt ?? null;
      newest = newestRecord?.createdAt ?? null;
      count = oldestRecord
        ? (await ctx.db.query("productCatalog").take(STATS_COUNT_LIMIT)).length
        : 0;
      break;
    }
    case "stockAvailability": {
      const oldestRecord = await ctx.db.query("stockAvailability").order("asc").first();
      const newestRecord = await ctx.db.query("stockAvailability").order("desc").first();
      oldest = oldestRecord?.updatedAt ?? null;
      newest = newestRecord?.updatedAt ?? null;
      count = oldestRecord
        ? (await ctx.db.query("stockAvailability").take(STATS_COUNT_LIMIT)).length
        : 0;
      break;
    }
    case "activeReservations": {
      const oldestRecord = await ctx.db.query("activeReservations").order("asc").first();
      const newestRecord = await ctx.db.query("activeReservations").order("desc").first();
      oldest = oldestRecord?.createdAt ?? null;
      newest = newestRecord?.createdAt ?? null;
      count = oldestRecord
        ? (await ctx.db.query("activeReservations").take(STATS_COUNT_LIMIT)).length
        : 0;
      break;
    }
    case "orderWithInventoryStatus": {
      const oldestRecord = await ctx.db.query("orderWithInventoryStatus").order("asc").first();
      const newestRecord = await ctx.db.query("orderWithInventoryStatus").order("desc").first();
      oldest = oldestRecord?.createdAt ?? null;
      newest = newestRecord?.createdAt ?? null;
      count = oldestRecord
        ? (await ctx.db.query("orderWithInventoryStatus").take(STATS_COUNT_LIMIT)).length
        : 0;
      break;
    }
  }

  return {
    tableName,
    recordCount: count,
    oldestRecord: oldest,
    newestRecord: newest,
  };
}

// ============================================================================
// Demonstration Mutations
// ============================================================================

/**
 * Demonstrate projection rebuild.
 *
 * This mutation:
 * 1. Records current projection state (for comparison)
 * 2. Creates a replay checkpoint to trigger rebuild
 * 3. Schedules first chunk via Workpool with partition key
 *
 * Note: This is an ADDITIVE rebuild - existing projection records
 * are updated (not cleared). Projections use entity IDs as keys,
 * so replay safely upserts records. The actual replay is handled
 * by the eventReplayPool which processes events in chunks.
 */
export const demonstrateRebuild = internalMutation({
  args: {
    projectionName: v.string(),
  },
  returns: v.object({
    replayId: v.string(),
    beforeStats: v.object({
      tableName: v.string(),
      recordCount: v.number(),
      oldestRecord: v.union(v.number(), v.null()),
      newestRecord: v.union(v.number(), v.null()),
    }),
    message: v.string(),
  }),
  handler: async (ctx, { projectionName }) => {
    // Step 1: Get current projection state
    const beforeStats = await getProjectionStats(ctx, projectionName);

    // Step 2: Check for active replay
    const activeReplay = await ctx.db
      .query("replayCheckpoints")
      .withIndex("by_projection_status", (q) =>
        q.eq("projection", projectionName).eq("status", "running")
      )
      .first();

    if (activeReplay) {
      return {
        replayId: activeReplay.replayId,
        beforeStats,
        message: `Replay already active: ${activeReplay.replayId}. Use getRebuildStatus to monitor.`,
      };
    }

    // Step 3: Generate replay ID
    const replayId = `replay_${projectionName}_${Date.now().toString(36)}`;
    const now = Date.now();

    // Step 4: Create replay checkpoint (capture ID for workpool scheduling)
    const checkpointId = await ctx.db.insert("replayCheckpoints", {
      replayId,
      projection: projectionName,
      startPosition: 0,
      lastPosition: 0,
      status: "running",
      eventsProcessed: 0,
      chunksCompleted: 0,
      startedAt: now,
      updatedAt: now,
    });

    // Step 5: Schedule first chunk via Workpool with partition key
    // This ensures the "running" checkpoint is actually processed
    await eventReplayPool.enqueueMutation(
      ctx,
      processChunkRef,
      {
        checkpointId,
        projectionName,
        fromPosition: 0,
        chunkSize: 100, // DEFAULT_CHUNK_SIZE
      },
      { key: `replay:${projectionName}` } // Partition key for ordering
    );

    logger.info(`Started rebuild for ${projectionName}`, {
      replayId,
      checkpointId,
      beforeCount: beforeStats.recordCount,
    });

    return {
      replayId,
      beforeStats,
      message: `Rebuild started. Monitor with getRebuildStatus("${replayId}")`,
    };
  },
});

/**
 * Get rebuild status.
 */
export const getRebuildStatus = internalQuery({
  args: {
    replayId: v.string(),
  },
  returns: v.union(
    v.null(),
    v.object({
      replayId: v.string(),
      projection: v.string(),
      status: v.union(
        v.literal("running"),
        v.literal("paused"),
        v.literal("completed"),
        v.literal("failed"),
        v.literal("cancelled")
      ),
      startPosition: v.number(),
      lastPosition: v.number(),
      eventsProcessed: v.number(),
      chunksCompleted: v.number(),
      startedAt: v.number(),
      updatedAt: v.number(),
      completedAt: v.union(v.number(), v.null()),
      error: v.union(v.string(), v.null()),
      durationMs: v.number(),
      eventsPerSecond: v.number(),
    })
  ),
  handler: async (ctx, { replayId }) => {
    const checkpoint = await ctx.db
      .query("replayCheckpoints")
      .withIndex("by_replayId", (q) => q.eq("replayId", replayId))
      .first();

    if (!checkpoint) {
      return null;
    }

    // Calculate derived metrics
    const now = Date.now();
    const durationMs = (checkpoint.completedAt ?? now) - checkpoint.startedAt;
    const eventsPerSecond =
      durationMs > 0 ? Math.round((checkpoint.eventsProcessed / durationMs) * 1000) : 0;

    return {
      replayId: checkpoint.replayId,
      projection: checkpoint.projection,
      status: checkpoint.status,
      startPosition: checkpoint.startPosition,
      lastPosition: checkpoint.lastPosition,
      eventsProcessed: checkpoint.eventsProcessed,
      chunksCompleted: checkpoint.chunksCompleted,
      startedAt: checkpoint.startedAt,
      updatedAt: checkpoint.updatedAt,
      completedAt: checkpoint.completedAt ?? null,
      error: checkpoint.error ?? null,
      durationMs,
      eventsPerSecond,
    };
  },
});

/**
 * Verify rebuild completed correctly.
 *
 * Compares current projection state with expected state.
 */
export const verifyRebuild = internalQuery({
  args: {
    projectionName: v.string(),
    replayId: v.string(),
  },
  returns: v.object({
    replayId: v.string(),
    status: v.union(
      v.literal("running"),
      v.literal("completed"),
      v.literal("failed"),
      v.literal("cancelled"),
      v.literal("not_found")
    ),
    currentStats: v.object({
      tableName: v.string(),
      recordCount: v.number(),
      oldestRecord: v.union(v.number(), v.null()),
      newestRecord: v.union(v.number(), v.null()),
    }),
    eventsProcessed: v.union(v.number(), v.null()),
    durationMs: v.union(v.number(), v.null()),
  }),
  handler: async (ctx, { projectionName, replayId }) => {
    // Get checkpoint status
    const checkpoint = await ctx.db
      .query("replayCheckpoints")
      .withIndex("by_replayId", (q) => q.eq("replayId", replayId))
      .first();

    // Get current projection state
    const currentStats = await getProjectionStats(ctx, projectionName);

    if (!checkpoint) {
      return {
        replayId,
        status: "not_found" as const,
        currentStats,
        eventsProcessed: null,
        durationMs: null,
      };
    }

    const durationMs = checkpoint.completedAt
      ? checkpoint.completedAt - checkpoint.startedAt
      : null;

    const status =
      checkpoint.status === "completed"
        ? ("completed" as const)
        : checkpoint.status === "running"
          ? ("running" as const)
          : checkpoint.status === "cancelled"
            ? ("cancelled" as const)
            : ("failed" as const);

    return {
      replayId,
      status,
      currentStats,
      eventsProcessed: checkpoint.eventsProcessed,
      durationMs,
    };
  },
});

/**
 * Cancel an active rebuild.
 */
export const cancelRebuild = internalMutation({
  args: {
    replayId: v.string(),
  },
  returns: v.object({
    status: v.union(v.literal("cancelled"), v.literal("not_found"), v.literal("not_running")),
    eventsProcessedBeforeCancel: v.union(v.number(), v.null()),
  }),
  handler: async (ctx, { replayId }) => {
    const checkpoint = await ctx.db
      .query("replayCheckpoints")
      .withIndex("by_replayId", (q) => q.eq("replayId", replayId))
      .first();

    if (!checkpoint) {
      return { status: "not_found" as const, eventsProcessedBeforeCancel: null };
    }

    if (checkpoint.status !== "running") {
      return { status: "not_running" as const, eventsProcessedBeforeCancel: null };
    }

    await ctx.db.patch(checkpoint._id, {
      status: "cancelled",
      completedAt: Date.now(),
      updatedAt: Date.now(),
    });

    logger.info(`Cancelled rebuild: ${replayId}`, {
      eventsProcessed: checkpoint.eventsProcessed,
    });

    return {
      status: "cancelled" as const,
      eventsProcessedBeforeCancel: checkpoint.eventsProcessed,
    };
  },
});

/**
 * List all rebuild checkpoints.
 */
export const listRebuilds = internalQuery({
  args: {
    projectionName: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  returns: v.array(
    v.object({
      replayId: v.string(),
      projection: v.string(),
      status: v.string(),
      eventsProcessed: v.number(),
      startedAt: v.number(),
      completedAt: v.union(v.number(), v.null()),
    })
  ),
  handler: async (ctx, { projectionName, limit = 20 }) => {
    // Use index for filtering BEFORE pagination to ensure correct limit behavior
    const records = projectionName
      ? await ctx.db
          .query("replayCheckpoints")
          .withIndex("by_projection_status", (q) => q.eq("projection", projectionName))
          .order("desc")
          .take(limit)
      : await ctx.db.query("replayCheckpoints").order("desc").take(limit);

    return records.map((r) => ({
      replayId: r.replayId,
      projection: r.projection,
      status: r.status,
      eventsProcessed: r.eventsProcessed,
      startedAt: r.startedAt,
      completedAt: r.completedAt ?? null,
    }));
  },
});
