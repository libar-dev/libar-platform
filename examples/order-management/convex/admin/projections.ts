/**
 * Admin mutations for projection replay and rebuilding.
 *
 * @libar-docs
 * @libar-docs-implements EventReplayInfrastructure
 * @libar-docs-status active
 * @libar-docs-event-sourcing
 * @libar-docs-projection
 * @libar-docs-infra
 *
 * All admin operations use internal mutations for security.
 * No public API exposure for admin operations.
 */

import { v } from "convex/values";
import { internalMutation, internalQuery } from "../_generated/server";
import { makeFunctionReference } from "convex/server";
import type { FunctionReference, FunctionVisibility } from "convex/server";
import { eventReplayPool, eventStore } from "../infrastructure.js";
import { replayHandlerRegistry } from "../projections/definitions.js";
import {
  calculateProgress,
  calculatePercentComplete,
  type StoredEventForReplay,
  type ReplayCheckpoint,
  type ReplayProgress,
  type ReplayStatus,
} from "@libar-dev/platform-core";

// TS2589 Prevention: Pre-declare function references at module level
const processChunkRef = makeFunctionReference<"mutation">(
  "admin/projections:processReplayChunk"
) as FunctionReference<"mutation", FunctionVisibility>;

/**
 * Default chunk sizes based on projection complexity.
 */
const DEFAULT_CHUNK_SIZE = 100;

/**
 * Generate a unique replay ID.
 */
function generateReplayId(): string {
  return `replay_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Valid replay status values for type narrowing.
 */
const VALID_REPLAY_STATUSES = ["running", "paused", "completed", "failed", "cancelled"] as const;

/**
 * Type guard to validate replay status.
 */
function isValidReplayStatus(status: string): status is ReplayStatus {
  return VALID_REPLAY_STATUSES.includes(status as ReplayStatus);
}

/**
 * Convert a database checkpoint record to a ReplayCheckpoint.
 * Handles the _id type difference (Convex Id vs string).
 */
function toReplayCheckpoint(dbRecord: {
  _id: unknown;
  replayId: string;
  projection: string;
  startPosition: number;
  lastPosition: number;
  targetPosition?: number;
  status: string;
  eventsProcessed: number;
  chunksCompleted: number;
  error?: string;
  startedAt: number;
  updatedAt: number;
  completedAt?: number;
}): ReplayCheckpoint {
  const status = isValidReplayStatus(dbRecord.status) ? dbRecord.status : "failed";

  const checkpoint: ReplayCheckpoint = {
    _id: String(dbRecord._id),
    replayId: dbRecord.replayId,
    projection: dbRecord.projection,
    startPosition: dbRecord.startPosition,
    lastPosition: dbRecord.lastPosition,
    status,
    eventsProcessed: dbRecord.eventsProcessed,
    chunksCompleted: dbRecord.chunksCompleted,
    startedAt: dbRecord.startedAt,
    updatedAt: dbRecord.updatedAt,
  };

  // Only add optional properties when defined (exactOptionalPropertyTypes)
  if (dbRecord.targetPosition !== undefined) {
    checkpoint.targetPosition = dbRecord.targetPosition;
  }
  if (dbRecord.error !== undefined) {
    checkpoint.error = dbRecord.error;
  }
  if (dbRecord.completedAt !== undefined) {
    checkpoint.completedAt = dbRecord.completedAt;
  }

  return checkpoint;
}

// =============================================================================
// TRIGGER REBUILD
// =============================================================================

/**
 * Trigger a projection rebuild from a given position.
 *
 * Creates a checkpoint and schedules the first processing chunk.
 * Returns error if a rebuild is already active for the projection.
 */
export const triggerRebuild = internalMutation({
  args: {
    projectionName: v.string(),
    fromGlobalPosition: v.optional(v.number()),
    chunkSize: v.optional(v.number()),
  },
  returns: v.union(
    v.object({
      success: v.literal(true),
      replayId: v.string(),
      totalEvents: v.number(),
    }),
    v.object({
      success: v.literal(false),
      error: v.literal("REPLAY_ALREADY_ACTIVE"),
      existingReplayId: v.optional(v.string()),
    })
  ),
  handler: async (ctx, args) => {
    const { projectionName, fromGlobalPosition = 0, chunkSize = DEFAULT_CHUNK_SIZE } = args;

    // Check no active replay exists for this projection
    const existing = await ctx.db
      .query("replayCheckpoints")
      .withIndex("by_projection_status", (q) =>
        q.eq("projection", projectionName).eq("status", "running")
      )
      .first();

    if (existing) {
      return {
        success: false as const,
        error: "REPLAY_ALREADY_ACTIVE" as const,
        existingReplayId: existing.replayId,
      };
    }

    // Get max global position for progress calculation
    const maxPosition = await eventStore.getGlobalPosition(ctx);

    // Validate and clamp inputs to prevent negative totals in status queries
    const safeFromPosition = Math.max(0, Math.min(fromGlobalPosition, maxPosition));
    const safeChunkSize = Math.max(1, chunkSize);
    const totalEvents = Math.max(0, maxPosition - safeFromPosition);

    // Handle empty event range
    if (totalEvents === 0) {
      const replayId = generateReplayId();
      await ctx.db.insert("replayCheckpoints", {
        replayId,
        projection: projectionName,
        startPosition: safeFromPosition,
        lastPosition: safeFromPosition,
        targetPosition: maxPosition,
        status: "completed",
        eventsProcessed: 0,
        chunksCompleted: 0,
        startedAt: Date.now(),
        updatedAt: Date.now(),
        completedAt: Date.now(),
      });
      return { success: true as const, replayId, totalEvents: 0 };
    }

    // Create checkpoint
    const replayId = generateReplayId();
    const checkpointId = await ctx.db.insert("replayCheckpoints", {
      replayId,
      projection: projectionName,
      startPosition: safeFromPosition,
      lastPosition: safeFromPosition,
      targetPosition: maxPosition,
      status: "running",
      eventsProcessed: 0,
      chunksCompleted: 0,
      startedAt: Date.now(),
      updatedAt: Date.now(),
    });

    // Schedule first chunk via Workpool with partition key
    await eventReplayPool.enqueueMutation(
      ctx,
      processChunkRef,
      {
        checkpointId,
        projectionName,
        fromPosition: safeFromPosition,
        chunkSize: safeChunkSize,
      },
      { key: `replay:${projectionName}` } // Partition key for ordering
    );

    return { success: true as const, replayId, totalEvents };
  },
});

// =============================================================================
// CANCEL REBUILD
// =============================================================================

/**
 * Cancel a running projection rebuild.
 *
 * Sets status to "cancelled". In-flight chunks will complete but no new
 * chunks will be scheduled because status check happens at chunk start.
 */
export const cancelRebuild = internalMutation({
  args: {
    replayId: v.string(),
  },
  returns: v.union(
    v.object({
      success: v.literal(true),
      eventsProcessedBeforeCancel: v.number(),
    }),
    v.object({
      success: v.literal(false),
      error: v.union(v.literal("REPLAY_NOT_FOUND"), v.literal("REPLAY_NOT_RUNNING")),
      currentStatus: v.optional(v.string()),
    })
  ),
  handler: async (ctx, { replayId }) => {
    const checkpoint = await ctx.db
      .query("replayCheckpoints")
      .withIndex("by_replayId", (q) => q.eq("replayId", replayId))
      .first();

    if (!checkpoint) {
      return { success: false as const, error: "REPLAY_NOT_FOUND" as const };
    }

    if (checkpoint.status !== "running") {
      return {
        success: false as const,
        error: "REPLAY_NOT_RUNNING" as const,
        currentStatus: checkpoint.status,
      };
    }

    await ctx.db.patch(checkpoint._id, {
      status: "cancelled",
      updatedAt: Date.now(),
    });

    return {
      success: true as const,
      eventsProcessedBeforeCancel: checkpoint.eventsProcessed,
    };
  },
});

// =============================================================================
// GET REBUILD STATUS
// =============================================================================

/**
 * Query the status of a specific replay operation.
 */
export const getRebuildStatus = internalQuery({
  args: {
    replayId: v.string(),
  },
  returns: v.union(
    v.object({
      success: v.literal(true),
      progress: v.object({
        replayId: v.string(),
        projectionName: v.string(),
        status: v.string(),
        eventsProcessed: v.number(),
        totalEvents: v.number(),
        percentComplete: v.number(),
        chunksCompleted: v.number(),
        startedAt: v.number(),
        updatedAt: v.number(),
        completedAt: v.optional(v.number()),
        estimatedRemainingMs: v.optional(v.number()),
        error: v.optional(v.string()),
      }),
    }),
    v.object({
      success: v.literal(false),
      error: v.literal("REPLAY_NOT_FOUND"),
    })
  ),
  handler: async (ctx, { replayId }) => {
    const checkpoint = await ctx.db
      .query("replayCheckpoints")
      .withIndex("by_replayId", (q) => q.eq("replayId", replayId))
      .first();

    if (!checkpoint) {
      return { success: false as const, error: "REPLAY_NOT_FOUND" as const };
    }

    // Calculate total events using stored startPosition
    const totalEvents =
      checkpoint.targetPosition !== undefined
        ? checkpoint.targetPosition - checkpoint.startPosition
        : checkpoint.eventsProcessed;

    // Convert to ReplayCheckpoint and calculate progress using platform-core
    const replayCheckpoint = toReplayCheckpoint(checkpoint);
    const progress: ReplayProgress = calculateProgress(replayCheckpoint, totalEvents);

    return { success: true as const, progress };
  },
});

// =============================================================================
// LIST ACTIVE REBUILDS
// =============================================================================

/**
 * List all active (running or paused) replay operations.
 */
export const listActiveRebuilds = internalQuery({
  args: {},
  returns: v.array(
    v.object({
      replayId: v.string(),
      projectionName: v.string(),
      status: v.string(),
      eventsProcessed: v.number(),
      percentComplete: v.number(),
      startedAt: v.number(),
    })
  ),
  handler: async (ctx) => {
    const runningCheckpoints = await ctx.db
      .query("replayCheckpoints")
      .withIndex("by_status", (q) => q.eq("status", "running"))
      .collect();

    const pausedCheckpoints = await ctx.db
      .query("replayCheckpoints")
      .withIndex("by_status", (q) => q.eq("status", "paused"))
      .collect();

    const allActive = [...runningCheckpoints, ...pausedCheckpoints];

    return allActive.map((cp) => {
      // Calculate total events using stored startPosition
      const totalEvents =
        cp.targetPosition !== undefined ? cp.targetPosition - cp.startPosition : cp.eventsProcessed;

      // Use platform-core calculatePercentComplete for consistency
      const percentComplete = calculatePercentComplete(cp.eventsProcessed, totalEvents);

      return {
        replayId: cp.replayId,
        projectionName: cp.projection,
        status: cp.status,
        eventsProcessed: cp.eventsProcessed,
        percentComplete,
        startedAt: cp.startedAt,
      };
    });
  },
});

// =============================================================================
// PROCESS REPLAY CHUNK
// =============================================================================

/**
 * Process a chunk of events for replay.
 *
 * This is an internal mutation called by Workpool. It:
 * 1. Fetches events from the Event Store
 * 2. Applies projection logic to each event
 * 3. Updates the checkpoint
 * 4. Schedules the next chunk if more events exist
 */
export const processReplayChunk = internalMutation({
  args: {
    checkpointId: v.id("replayCheckpoints"),
    projectionName: v.string(),
    fromPosition: v.number(),
    chunkSize: v.number(),
  },
  returns: v.object({
    status: v.union(v.literal("processing"), v.literal("completed"), v.literal("cancelled")),
    eventsProcessed: v.number(),
  }),
  handler: async (ctx, args) => {
    const { checkpointId, projectionName, fromPosition, chunkSize } = args;

    // Get current checkpoint to check status
    const checkpoint = await ctx.db.get(checkpointId);
    if (!checkpoint) {
      return { status: "cancelled" as const, eventsProcessed: 0 };
    }

    // Only process while running - stop for cancelled, paused, or failed replays
    if (checkpoint.status !== "running") {
      return { status: "cancelled" as const, eventsProcessed: 0 };
    }

    // Fetch events from Event Store
    const events = await eventStore.readFromPosition(ctx, {
      fromPosition: fromPosition,
      limit: chunkSize,
    });

    if (events.length === 0) {
      // Replay complete
      await ctx.db.patch(checkpointId, {
        status: "completed",
        completedAt: Date.now(),
        updatedAt: Date.now(),
      });
      return { status: "completed" as const, eventsProcessed: 0 };
    }

    // Apply projection logic to each event via replay handler registry
    for (const event of events) {
      const handlerEntry = replayHandlerRegistry.get(projectionName, event.eventType);

      if (handlerEntry) {
        // Transform stored event to handler args
        const storedEvent: StoredEventForReplay = {
          eventId: event.eventId,
          eventType: event.eventType,
          payload: event.payload as Record<string, unknown>,
          streamType: event.streamType,
          streamId: event.streamId,
          globalPosition: event.globalPosition,
          version: event.version,
          timestamp: event.timestamp,
          correlationId: event.correlationId,
          causationId: event.causationId,
        };
        const handlerArgs = handlerEntry.toArgsFromEvent(storedEvent);

        // Invoke the handler mutation
        // Note: handlers use withCheckpoint for idempotency, so re-processing is safe
        await ctx.runMutation(
          handlerEntry.handler as FunctionReference<"mutation", FunctionVisibility>,
          handlerArgs
        );
      }
      // Events without handlers are skipped (projection may not subscribe to that event type)
    }

    // Update checkpoint
    // Note: events.length > 0 is guaranteed by guard above
    const lastEvent = events[events.length - 1]!;
    await ctx.db.patch(checkpointId, {
      lastPosition: lastEvent.globalPosition,
      eventsProcessed: checkpoint.eventsProcessed + events.length,
      chunksCompleted: checkpoint.chunksCompleted + 1,
      updatedAt: Date.now(),
    });

    // Schedule next chunk if more events might exist
    if (events.length === chunkSize) {
      await eventReplayPool.enqueueMutation(
        ctx,
        processChunkRef,
        {
          checkpointId,
          projectionName,
          fromPosition: lastEvent.globalPosition + 1,
          chunkSize,
        },
        { key: `replay:${projectionName}` }
      );
      return { status: "processing" as const, eventsProcessed: events.length };
    } else {
      // No more events
      await ctx.db.patch(checkpointId, {
        status: "completed",
        completedAt: Date.now(),
      });
      return { status: "completed" as const, eventsProcessed: events.length };
    }
  },
});
