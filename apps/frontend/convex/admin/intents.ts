/**
 * @libar-docs
 * @libar-docs-implements DurableEventsIntegration
 * @libar-docs-infra
 *
 * Intent Admin Functions - CRUD operations for commandIntents table.
 *
 * Provides dependencies for platform-core's recordIntent, recordCompletion,
 * and queryOrphanedIntents functions.
 *
 * @since Phase 18.5 (DurableEventsIntegration)
 */

// Type declaration for Node.js global that exists at runtime in Convex
declare const console: { log: (...args: unknown[]) => void };

import { v } from "convex/values";
import { internalMutation, internalQuery } from "../_generated/server";
import type { Doc } from "../_generated/dataModel";

// ============================================================================
// Intent Record Types
// ============================================================================

/** Status values for command intent lifecycle tracking */
export type IntentStatus = "pending" | "completed" | "failed" | "abandoned";

// ============================================================================
// Core CRUD Functions (Dependencies for platform-core)
// ============================================================================

/**
 * Get intent by intentKey.
 * Used by platform-core's recordIntent for idempotency check.
 */
export const getByIntentKey = internalQuery({
  args: { intentKey: v.string() },
  returns: v.union(
    v.null(),
    v.object({
      _id: v.id("commandIntents"),
      intentKey: v.string(),
      operationType: v.string(),
      streamType: v.string(),
      streamId: v.string(),
      boundedContext: v.string(),
      status: v.union(
        v.literal("pending"),
        v.literal("completed"),
        v.literal("failed"),
        v.literal("abandoned")
      ),
      timeoutMs: v.number(),
      metadata: v.optional(v.any()),
      correlationId: v.optional(v.string()),
      completedAt: v.optional(v.number()),
      completionEventId: v.optional(v.string()),
      error: v.optional(v.string()),
      createdAt: v.number(),
      updatedAt: v.number(),
    })
  ),
  handler: async (ctx, { intentKey }) => {
    const record = await ctx.db
      .query("commandIntents")
      .withIndex("by_intentKey", (q) => q.eq("intentKey", intentKey))
      .first();
    return record;
  },
});

/**
 * Insert new intent record.
 * Used by platform-core's recordIntent.
 */
export const insertIntent = internalMutation({
  args: {
    intentKey: v.string(),
    operationType: v.string(),
    streamType: v.string(),
    streamId: v.string(),
    boundedContext: v.string(),
    timeoutMs: v.number(),
    metadata: v.optional(v.any()),
    correlationId: v.optional(v.string()),
  },
  returns: v.id("commandIntents"),
  handler: async (ctx, args) => {
    const now = Date.now();
    return await ctx.db.insert("commandIntents", {
      ...args,
      status: "pending",
      createdAt: now,
      updatedAt: now,
    });
  },
});

/**
 * Update intent status (for completion recording).
 * Used by platform-core's recordCompletion.
 */
export const updateIntentStatus = internalMutation({
  args: {
    intentKey: v.string(),
    status: v.union(v.literal("completed"), v.literal("failed"), v.literal("abandoned")),
    completionEventId: v.optional(v.string()),
    error: v.optional(v.string()),
  },
  returns: v.boolean(),
  handler: async (ctx, { intentKey, status, completionEventId, error }) => {
    const record = await ctx.db
      .query("commandIntents")
      .withIndex("by_intentKey", (q) => q.eq("intentKey", intentKey))
      .first();

    if (!record) {
      return false;
    }

    const now = Date.now();
    const update: Partial<Doc<"commandIntents">> = {
      status,
      completedAt: now,
      updatedAt: now,
    };

    if (completionEventId !== undefined) {
      update.completionEventId = completionEventId;
    }
    if (error !== undefined) {
      update.error = error;
    }

    await ctx.db.patch(record._id, update);
    return true;
  },
});

// ============================================================================
// Orphan Detection
// ============================================================================

/**
 * Query pending intents that have exceeded their timeout.
 * Used by detectOrphans cron job.
 */
export const queryOrphanedIntents = internalQuery({
  args: {},
  returns: v.array(
    v.object({
      _id: v.id("commandIntents"),
      intentKey: v.string(),
      operationType: v.string(),
      streamType: v.string(),
      streamId: v.string(),
      boundedContext: v.string(),
      timeoutMs: v.number(),
      createdAt: v.number(),
      correlationId: v.optional(v.string()),
      timeSinceIntent: v.number(),
    })
  ),
  handler: async (ctx) => {
    const now = Date.now();

    // Get all pending intents
    const pendingIntents = await ctx.db
      .query("commandIntents")
      .withIndex("by_status_createdAt", (q) => q.eq("status", "pending"))
      .collect();

    // Filter to those that have exceeded their timeout
    const orphaned = pendingIntents
      .filter((intent) => {
        const timeSinceIntent = now - intent.createdAt;
        return timeSinceIntent > intent.timeoutMs;
      })
      .map((intent) => {
        const result: {
          _id: typeof intent._id;
          intentKey: string;
          operationType: string;
          streamType: string;
          streamId: string;
          boundedContext: string;
          timeoutMs: number;
          createdAt: number;
          correlationId?: string;
          timeSinceIntent: number;
        } = {
          _id: intent._id,
          intentKey: intent.intentKey,
          operationType: intent.operationType,
          streamType: intent.streamType,
          streamId: intent.streamId,
          boundedContext: intent.boundedContext,
          timeoutMs: intent.timeoutMs,
          createdAt: intent.createdAt,
          timeSinceIntent: now - intent.createdAt,
        };
        // Only add correlationId if defined (exactOptionalPropertyTypes)
        if (intent.correlationId !== undefined) {
          result.correlationId = intent.correlationId;
        }
        return result;
      });

    return orphaned;
  },
});

/**
 * Detect and flag orphaned intents.
 * Called by cron job every 5 minutes.
 */
export const detectOrphans = internalMutation({
  args: {},
  returns: v.object({
    orphanCount: v.number(),
    byOperationType: v.any(),
    abandoned: v.array(v.string()),
  }),
  handler: async (ctx) => {
    const now = Date.now();
    // Limit orphans processed per run to prevent mutation timeout
    const MAX_ORPHANS_PER_RUN = 100;

    // Get all pending intents that have exceeded their timeout
    const pendingIntents = await ctx.db
      .query("commandIntents")
      .withIndex("by_status_createdAt", (q) => q.eq("status", "pending"))
      .collect();

    const allOrphaned = pendingIntents.filter((intent) => {
      const timeSinceIntent = now - intent.createdAt;
      return timeSinceIntent > intent.timeoutMs;
    });

    // Limit to prevent timeout with large orphan counts
    const orphaned = allOrphaned.slice(0, MAX_ORPHANS_PER_RUN);
    const hasMoreOrphans = allOrphaned.length > MAX_ORPHANS_PER_RUN;

    if (orphaned.length === 0) {
      console.log("[ORPHAN_DETECTION] No orphans found");
      return { orphanCount: 0, byOperationType: {}, abandoned: [] };
    }

    if (hasMoreOrphans) {
      console.log(
        `[ORPHAN_DETECTION] Warning: ${allOrphaned.length} total orphans, processing first ${MAX_ORPHANS_PER_RUN}`
      );
    }

    // Transition each orphan to abandoned
    const abandoned: string[] = [];
    for (const orphan of orphaned) {
      await ctx.db.patch(orphan._id, {
        status: "abandoned",
        completedAt: now,
        updatedAt: now,
        error: `Timeout exceeded (${orphan.timeoutMs}ms). Time since intent: ${now - orphan.createdAt}ms`,
      });
      abandoned.push(orphan.intentKey);
    }

    // Report metrics by operation type
    const byOperationType = orphaned.reduce(
      (acc, o) => {
        acc[o.operationType] = (acc[o.operationType] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>
    );

    console.log(
      `[ORPHAN_DETECTION] Found ${orphaned.length} orphans`,
      JSON.stringify({ orphanCount: orphaned.length, byOperationType })
    );

    return {
      orphanCount: orphaned.length,
      byOperationType,
      abandoned,
    };
  },
});

/**
 * Handle intent timeout (scheduler callback).
 * Called when a specific intent's timeout expires.
 */
export const handleTimeout = internalMutation({
  args: {
    intentKey: v.string(),
  },
  returns: v.object({
    status: v.union(v.literal("abandoned"), v.literal("already_completed"), v.literal("not_found")),
  }),
  handler: async (ctx, { intentKey }) => {
    const record = await ctx.db
      .query("commandIntents")
      .withIndex("by_intentKey", (q) => q.eq("intentKey", intentKey))
      .first();

    if (!record) {
      return { status: "not_found" as const };
    }

    // If already completed/failed/abandoned, no action needed
    if (record.status !== "pending") {
      return { status: "already_completed" as const };
    }

    // Mark as abandoned
    const now = Date.now();
    await ctx.db.patch(record._id, {
      status: "abandoned",
      completedAt: now,
      updatedAt: now,
      error: `Timeout exceeded (${record.timeoutMs}ms)`,
    });

    console.log(
      `[INTENT_TIMEOUT] Intent abandoned: ${intentKey}`,
      JSON.stringify({ operationType: record.operationType, streamId: record.streamId })
    );

    return { status: "abandoned" as const };
  },
});

// ============================================================================
// Admin Queries
// ============================================================================

/**
 * List orphaned/abandoned intents for admin review.
 */
export const listAbandonedIntents = internalQuery({
  args: { limit: v.optional(v.number()) },
  returns: v.array(
    v.object({
      _id: v.id("commandIntents"),
      intentKey: v.string(),
      operationType: v.string(),
      streamType: v.string(),
      streamId: v.string(),
      boundedContext: v.string(),
      status: v.string(),
      timeoutMs: v.number(),
      error: v.optional(v.string()),
      correlationId: v.optional(v.string()),
      createdAt: v.number(),
      completedAt: v.optional(v.number()),
    })
  ),
  handler: async (ctx, { limit = 100 }) => {
    const abandoned = await ctx.db
      .query("commandIntents")
      .withIndex("by_status_createdAt", (q) => q.eq("status", "abandoned"))
      .order("desc")
      .take(limit);

    return abandoned.map((intent) => {
      const result: {
        _id: typeof intent._id;
        intentKey: string;
        operationType: string;
        streamType: string;
        streamId: string;
        boundedContext: string;
        status: string;
        timeoutMs: number;
        error?: string;
        correlationId?: string;
        createdAt: number;
        completedAt?: number;
      } = {
        _id: intent._id,
        intentKey: intent.intentKey,
        operationType: intent.operationType,
        streamType: intent.streamType,
        streamId: intent.streamId,
        boundedContext: intent.boundedContext,
        status: intent.status,
        timeoutMs: intent.timeoutMs,
        createdAt: intent.createdAt,
      };
      // Only add optional fields if defined (exactOptionalPropertyTypes)
      if (intent.error !== undefined) {
        result.error = intent.error;
      }
      if (intent.correlationId !== undefined) {
        result.correlationId = intent.correlationId;
      }
      if (intent.completedAt !== undefined) {
        result.completedAt = intent.completedAt;
      }
      return result;
    });
  },
});

/**
 * Get intent statistics for monitoring.
 */
export const getIntentStats = internalQuery({
  args: {},
  returns: v.object({
    pending: v.number(),
    completed: v.number(),
    failed: v.number(),
    abandoned: v.number(),
    total: v.number(),
  }),
  handler: async (ctx) => {
    const all = await ctx.db.query("commandIntents").collect();

    const stats = {
      pending: 0,
      completed: 0,
      failed: 0,
      abandoned: 0,
      total: all.length,
    };

    for (const intent of all) {
      stats[intent.status]++;
    }

    return stats;
  },
});
