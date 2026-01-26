/**
 * Event Replay Test Mutations
 *
 * Test mutations for validating event replay checkpoint management
 * with real database. These test the replayCheckpoints table and
 * the concurrent replay prevention logic.
 *
 * @since Phase 18b-1 - EventReplayInfrastructure
 */
import { mutation, query } from "../_generated/server";
import { v } from "convex/values";
import { ensureTestEnvironment } from "@libar-dev/platform-core";

// =============================================================================
// Checkpoint Management Test Mutations
// =============================================================================

/**
 * Create a checkpoint directly for test setup.
 */
export const createTestCheckpoint = mutation({
  args: {
    replayId: v.string(),
    projection: v.string(),
    status: v.union(
      v.literal("running"),
      v.literal("paused"),
      v.literal("completed"),
      v.literal("failed"),
      v.literal("cancelled")
    ),
    eventsProcessed: v.optional(v.number()),
    startPosition: v.optional(v.number()),
    lastPosition: v.optional(v.number()),
    targetPosition: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    ensureTestEnvironment();

    const now = Date.now();

    const id = await ctx.db.insert("replayCheckpoints", {
      replayId: args.replayId,
      projection: args.projection,
      startPosition: args.startPosition ?? 0,
      lastPosition: args.lastPosition ?? 0,
      targetPosition: args.targetPosition ?? 1000,
      status: args.status,
      eventsProcessed: args.eventsProcessed ?? 0,
      chunksCompleted: 0,
      startedAt: now,
      updatedAt: now,
      ...(args.status === "completed" && { completedAt: now }),
    });

    return { id, replayId: args.replayId };
  },
});

/**
 * Get checkpoint by replayId.
 */
export const getCheckpointByReplayId = query({
  args: {
    replayId: v.string(),
  },
  handler: async (ctx, args) => {
    ensureTestEnvironment();

    const checkpoint = await ctx.db
      .query("replayCheckpoints")
      .withIndex("by_replayId", (q) => q.eq("replayId", args.replayId))
      .first();

    return checkpoint;
  },
});

/**
 * Update checkpoint progress.
 */
export const updateCheckpointProgress = mutation({
  args: {
    replayId: v.string(),
    eventsProcessed: v.number(),
    lastPosition: v.optional(v.number()),
    chunksCompleted: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    ensureTestEnvironment();

    const checkpoint = await ctx.db
      .query("replayCheckpoints")
      .withIndex("by_replayId", (q) => q.eq("replayId", args.replayId))
      .first();

    if (!checkpoint) {
      return { status: "not_found" as const };
    }

    const now = Date.now();

    await ctx.db.patch(checkpoint._id, {
      eventsProcessed: args.eventsProcessed,
      updatedAt: now,
      ...(args.lastPosition !== undefined && { lastPosition: args.lastPosition }),
      ...(args.chunksCompleted !== undefined && { chunksCompleted: args.chunksCompleted }),
    });

    return { status: "updated" as const, updatedAt: now };
  },
});

/**
 * Check if replay is already active for a projection.
 */
export const checkActiveReplay = query({
  args: {
    projection: v.string(),
  },
  handler: async (ctx, args) => {
    ensureTestEnvironment();

    const existing = await ctx.db
      .query("replayCheckpoints")
      .withIndex("by_projection_status", (q) =>
        q.eq("projection", args.projection).eq("status", "running")
      )
      .first();

    if (existing) {
      return {
        active: true as const,
        existingReplayId: existing.replayId,
      };
    }

    return { active: false as const };
  },
});

/**
 * List checkpoints by status.
 */
export const listCheckpointsByStatus = query({
  args: {
    status: v.union(
      v.literal("running"),
      v.literal("paused"),
      v.literal("completed"),
      v.literal("failed"),
      v.literal("cancelled")
    ),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    ensureTestEnvironment();

    const limit = args.limit ?? 100;

    const checkpoints = await ctx.db
      .query("replayCheckpoints")
      .withIndex("by_status", (q) => q.eq("status", args.status))
      .take(limit);

    return checkpoints;
  },
});

/**
 * Get checkpoint stats.
 */
export const getCheckpointStats = query({
  args: {},
  handler: async (ctx) => {
    ensureTestEnvironment();

    const running = await ctx.db
      .query("replayCheckpoints")
      .withIndex("by_status", (q) => q.eq("status", "running"))
      .collect();

    const completed = await ctx.db
      .query("replayCheckpoints")
      .withIndex("by_status", (q) => q.eq("status", "completed"))
      .collect();

    const failed = await ctx.db
      .query("replayCheckpoints")
      .withIndex("by_status", (q) => q.eq("status", "failed"))
      .collect();

    return {
      running: running.length,
      completed: completed.length,
      failed: failed.length,
      total: running.length + completed.length + failed.length,
    };
  },
});

/**
 * Simulate start replay with conflict detection.
 *
 * This tests the REPLAY_ALREADY_ACTIVE logic without actually
 * triggering the full replay infrastructure.
 */
export const simulateStartReplay = mutation({
  args: {
    projection: v.string(),
    replayId: v.string(),
  },
  handler: async (ctx, args) => {
    ensureTestEnvironment();

    // Check for existing running replay (same logic as triggerRebuild)
    const existing = await ctx.db
      .query("replayCheckpoints")
      .withIndex("by_projection_status", (q) =>
        q.eq("projection", args.projection).eq("status", "running")
      )
      .first();

    if (existing) {
      return {
        success: false as const,
        error: "REPLAY_ALREADY_ACTIVE" as const,
        existingReplayId: existing.replayId,
      };
    }

    // Create new checkpoint
    const now = Date.now();
    const id = await ctx.db.insert("replayCheckpoints", {
      replayId: args.replayId,
      projection: args.projection,
      startPosition: 0,
      lastPosition: 0,
      targetPosition: 1000,
      status: "running",
      eventsProcessed: 0,
      chunksCompleted: 0,
      startedAt: now,
      updatedAt: now,
    });

    return {
      success: true as const,
      checkpointId: id,
      replayId: args.replayId,
    };
  },
});
