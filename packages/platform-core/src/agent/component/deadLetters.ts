import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

// ============================================================================
// Shared Validators
// ============================================================================

const deadLetterStatusValidator = v.union(
  v.literal("pending"),
  v.literal("replayed"),
  v.literal("ignored")
);

const contextValidator = v.optional(
  v.object({
    correlationId: v.optional(v.string()),
    errorCode: v.optional(v.string()),
    ignoreReason: v.optional(v.string()),
  })
);

// ============================================================================
// Mutations
// ============================================================================

/**
 * Record a dead letter for failed event processing.
 * Uses UPSERT semantics (Finding F-11): updates existing pending records,
 * inserts new records, and is a no-op for terminal (replayed/ignored) records.
 */
export const record = mutation({
  args: {
    agentId: v.string(),
    subscriptionId: v.string(),
    eventId: v.string(),
    globalPosition: v.number(),
    error: v.string(),
    attemptCount: v.number(),
    workId: v.optional(v.string()),
    context: contextValidator,
  },
  handler: async (ctx, args) => {
    const { agentId, subscriptionId, eventId, globalPosition, error, attemptCount } = args;

    // Check for existing dead letter by eventId
    const existing = await ctx.db
      .query("agentDeadLetters")
      .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
      .first();

    if (existing) {
      // Only update pending records; terminal records are immutable
      if (existing.status === "pending") {
        await ctx.db.patch(existing._id, {
          error,
          attemptCount: existing.attemptCount + 1,
          failedAt: Date.now(),
          ...(args.workId !== undefined && { workId: args.workId }),
          ...(args.context !== undefined && { context: args.context }),
        });
      }
      // No-op for terminal statuses
      return { created: false };
    }

    // Insert new dead letter
    await ctx.db.insert("agentDeadLetters", {
      agentId,
      subscriptionId,
      eventId,
      globalPosition,
      error,
      attemptCount,
      status: "pending" as const,
      failedAt: Date.now(),
      ...(args.workId !== undefined && { workId: args.workId }),
      ...(args.context !== undefined && { context: args.context }),
    });

    return { created: true };
  },
});

/**
 * Update dead letter status (replay or ignore).
 * Only pending records can transition. Terminal records are immutable.
 */
export const updateStatus = mutation({
  args: {
    eventId: v.string(),
    newStatus: deadLetterStatusValidator,
    ignoreReason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { eventId, newStatus, ignoreReason } = args;

    const deadLetter = await ctx.db
      .query("agentDeadLetters")
      .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
      .first();

    if (!deadLetter) {
      return { status: "error" as const, message: "Dead letter not found" };
    }

    if (deadLetter.status !== "pending") {
      return {
        status: "error" as const,
        message: `Cannot transition from '${deadLetter.status}' — only 'pending' records can transition`,
      };
    }

    // Merge ignoreReason into context when ignoring
    if (newStatus === "ignored" && ignoreReason) {
      const existingContext = deadLetter.context ?? {};
      await ctx.db.patch(deadLetter._id, {
        status: newStatus,
        context: {
          ...existingContext,
          ignoreReason,
        },
      });
    } else {
      await ctx.db.patch(deadLetter._id, {
        status: newStatus,
      });
    }

    return { status: "success" as const };
  },
});

// ============================================================================
// Queries
// ============================================================================

/**
 * Query dead letters by agent with optional status filter.
 */
export const queryByAgent = query({
  args: {
    agentId: v.string(),
    status: v.optional(deadLetterStatusValidator),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { agentId, status, limit = 100 } = args;

    let results;

    if (status) {
      results = await ctx.db
        .query("agentDeadLetters")
        .withIndex("by_agentId_status", (q) => q.eq("agentId", agentId).eq("status", status))
        .take(limit);
    } else {
      results = await ctx.db
        .query("agentDeadLetters")
        .withIndex("by_agentId_status", (q) => q.eq("agentId", agentId))
        .take(limit);
    }

    return results.map((dl) => ({
      agentId: dl.agentId,
      subscriptionId: dl.subscriptionId,
      eventId: dl.eventId,
      globalPosition: dl.globalPosition,
      error: dl.error,
      attemptCount: dl.attemptCount,
      status: dl.status,
      failedAt: dl.failedAt,
      ...(dl.workId !== undefined && { workId: dl.workId }),
      ...(dl.context !== undefined && { context: dl.context }),
    }));
  },
});

/**
 * Get dead letter statistics: pending counts grouped by agentId.
 * Used by monitoring dashboards to surface agent health issues.
 */
export const getStats = query({
  args: {},
  handler: async (ctx) => {
    const pendingLetters = await ctx.db
      .query("agentDeadLetters")
      .withIndex("by_status", (q) => q.eq("status", "pending"))
      .collect();

    // Group by agentId
    const countsByAgent = new Map<string, number>();
    for (const dl of pendingLetters) {
      const current = countsByAgent.get(dl.agentId) ?? 0;
      countsByAgent.set(dl.agentId, current + 1);
    }

    return Array.from(countsByAgent.entries()).map(([agentId, pendingCount]) => ({
      agentId,
      pendingCount,
    }));
  },
});
