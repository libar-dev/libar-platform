/**
 * Projection monitoring queries for operations visibility.
 *
 * Provides lag monitoring to detect projections falling behind.
 */
import { query } from "../_generated/server";
import { v } from "convex/values";
import { components } from "../_generated/api";

/**
 * Get lag for a specific projection.
 *
 * Lag is calculated as: currentGlobalPosition - checkpointPosition
 * A lag > 0 means the projection has events to process.
 */
export const getProjectionLag = query({
  args: {
    projectionName: v.string(),
    partitionKey: v.optional(v.string()),
  },
  handler: async (ctx, { projectionName, partitionKey }) => {
    // Get current global position from event store
    const globalPosition = await ctx.runQuery(components.eventStore.lib.getGlobalPosition, {});

    // Get checkpoint for this projection
    const checkpoint = await ctx.db
      .query("projectionCheckpoints")
      .withIndex("by_projection_partition", (q) =>
        q.eq("projectionName", projectionName).eq("partitionKey", partitionKey ?? "global")
      )
      .first();

    const lastPosition = checkpoint?.lastGlobalPosition ?? 0;
    const lag = globalPosition - lastPosition;

    return {
      projectionName,
      partitionKey: partitionKey ?? "global",
      currentGlobalPosition: globalPosition,
      lastProcessedPosition: lastPosition,
      lag,
      lastUpdatedAt: checkpoint?.updatedAt,
      status: lag === 0 ? "caught_up" : lag < 100 ? "healthy" : "behind",
    };
  },
});

/**
 * Get health status for all projections.
 *
 * Returns all checkpoints with calculated lag for operations dashboard.
 */
export const getProjectionHealth = query({
  args: {},
  handler: async (ctx) => {
    // Get current global position
    const globalPosition = await ctx.runQuery(components.eventStore.lib.getGlobalPosition, {});

    // Get all checkpoints
    const checkpoints = await ctx.db.query("projectionCheckpoints").collect();

    return {
      currentGlobalPosition: globalPosition,
      projections: checkpoints.map((cp) => {
        const lag = globalPosition - cp.lastGlobalPosition;
        return {
          projectionName: cp.projectionName,
          partitionKey: cp.partitionKey,
          lastProcessedPosition: cp.lastGlobalPosition,
          lag,
          lastUpdatedAt: cp.updatedAt,
          status: lag === 0 ? "caught_up" : lag < 100 ? "healthy" : "behind",
        };
      }),
      summary: {
        total: checkpoints.length,
        caughtUp: checkpoints.filter((cp) => globalPosition - cp.lastGlobalPosition === 0).length,
        behind: checkpoints.filter((cp) => globalPosition - cp.lastGlobalPosition >= 100).length,
      },
    };
  },
});
