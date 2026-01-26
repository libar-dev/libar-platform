/**
 * @libar-docs
 * @libar-docs-implements DurableEventsIntegration
 * @libar-docs-infra
 *
 * Poison Event Admin Functions - CRUD operations for poisonEvents table.
 *
 * Provides dependencies for platform-core's withPoisonEventHandling wrapper.
 *
 * @since Phase 18.5 (DurableEventsIntegration)
 */

import { v } from "convex/values";
import { internalMutation, internalQuery } from "../_generated/server";
import type { Doc } from "../_generated/dataModel";
import { createScopedLogger } from "@libar-dev/platform-core";
import { PLATFORM_LOG_LEVEL } from "../infrastructure.js";

// ============================================================================
// Logger
// ============================================================================
const logger = createScopedLogger("PoisonEvent", PLATFORM_LOG_LEVEL);

// ============================================================================
// Core CRUD Functions (Dependencies for withPoisonEventHandling)
// ============================================================================

/**
 * Get poison record by eventId and projectionName.
 */
export const getPoisonRecord = internalQuery({
  args: {
    eventId: v.string(),
    projectionName: v.string(),
  },
  returns: v.union(
    v.null(),
    v.object({
      _id: v.id("poisonEvents"),
      eventId: v.string(),
      eventType: v.string(),
      projectionName: v.string(),
      status: v.union(
        v.literal("pending"),
        v.literal("quarantined"),
        v.literal("replayed"),
        v.literal("ignored")
      ),
      attemptCount: v.number(),
      error: v.optional(v.string()),
      errorStack: v.optional(v.string()),
      eventPayload: v.optional(v.any()),
      quarantinedAt: v.optional(v.number()),
      updatedAt: v.number(),
    })
  ),
  handler: async (ctx, { eventId, projectionName }) => {
    const record = await ctx.db
      .query("poisonEvents")
      .withIndex("by_eventId_projection", (q) =>
        q.eq("eventId", eventId).eq("projectionName", projectionName)
      )
      .first();

    if (!record) return null;

    // Build result object, only including optional fields when defined
    // to satisfy exactOptionalPropertyTypes
    const result: {
      _id: typeof record._id;
      eventId: string;
      eventType: string;
      projectionName: string;
      status: typeof record.status;
      attemptCount: number;
      error?: string;
      errorStack?: string;
      eventPayload?: unknown;
      quarantinedAt?: number;
      updatedAt: number;
    } = {
      _id: record._id,
      eventId: record.eventId,
      eventType: record.eventType,
      projectionName: record.projectionName,
      status: record.status,
      attemptCount: record.attemptCount,
      updatedAt: record.updatedAt,
    };

    if (record.error !== undefined) {
      result.error = record.error;
    }
    if (record.errorStack !== undefined) {
      result.errorStack = record.errorStack;
    }
    if (record.eventPayload !== undefined) {
      result.eventPayload = record.eventPayload;
    }
    if (record.quarantinedAt !== undefined) {
      result.quarantinedAt = record.quarantinedAt;
    }

    return result;
  },
});

/**
 * Upsert poison record (create or update).
 */
export const upsertPoisonRecord = internalMutation({
  args: {
    eventId: v.string(),
    eventType: v.string(),
    projectionName: v.string(),
    status: v.union(
      v.literal("pending"),
      v.literal("quarantined"),
      v.literal("replayed"),
      v.literal("ignored")
    ),
    attemptCount: v.number(),
    error: v.optional(v.string()),
    errorStack: v.optional(v.string()),
    eventPayload: v.optional(v.any()),
    quarantinedAt: v.optional(v.number()),
    updatedAt: v.optional(v.number()),
    resolvedBy: v.optional(v.string()),
  },
  returns: v.id("poisonEvents"),
  handler: async (ctx, args) => {
    const now = args.updatedAt ?? Date.now();

    // Check for existing record
    const existing = await ctx.db
      .query("poisonEvents")
      .withIndex("by_eventId_projection", (q) =>
        q.eq("eventId", args.eventId).eq("projectionName", args.projectionName)
      )
      .first();

    if (existing) {
      // Update existing record
      const update: Partial<Doc<"poisonEvents">> = {
        status: args.status,
        attemptCount: args.attemptCount,
        updatedAt: now,
      };

      if (args.error !== undefined) {
        update.error = args.error;
      }
      if (args.errorStack !== undefined) {
        update.errorStack = args.errorStack;
      }
      if (args.eventPayload !== undefined) {
        update.eventPayload = args.eventPayload;
      }
      if (args.quarantinedAt !== undefined) {
        update.quarantinedAt = args.quarantinedAt;
      }
      if (args.resolvedBy !== undefined) {
        update.resolvedBy = args.resolvedBy;
      }

      await ctx.db.patch(existing._id, update);
      return existing._id;
    }

    // Create new record - build with only defined optional fields
    // Use explicit type to work with exactOptionalPropertyTypes
    type InsertData = {
      eventId: string;
      eventType: string;
      projectionName: string;
      status: "pending" | "quarantined" | "replayed" | "ignored";
      attemptCount: number;
      createdAt: number;
      updatedAt: number;
      error?: string;
      errorStack?: string;
      eventPayload?: unknown;
      quarantinedAt?: number;
      resolvedBy?: string;
    };

    const insertData: InsertData = {
      eventId: args.eventId,
      eventType: args.eventType,
      projectionName: args.projectionName,
      status: args.status,
      attemptCount: args.attemptCount,
      createdAt: now,
      updatedAt: now,
    };

    if (args.error !== undefined) {
      insertData.error = args.error;
    }
    if (args.errorStack !== undefined) {
      insertData.errorStack = args.errorStack;
    }
    if (args.eventPayload !== undefined) {
      insertData.eventPayload = args.eventPayload;
    }
    if (args.quarantinedAt !== undefined) {
      insertData.quarantinedAt = args.quarantinedAt;
    }
    if (args.resolvedBy !== undefined) {
      insertData.resolvedBy = args.resolvedBy;
    }

    return await ctx.db.insert("poisonEvents", insertData);
  },
});

/**
 * List quarantined records for admin review.
 */
export const listQuarantined = internalQuery({
  args: {
    projectionName: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  returns: v.array(
    v.object({
      _id: v.id("poisonEvents"),
      eventId: v.string(),
      eventType: v.string(),
      projectionName: v.string(),
      attemptCount: v.number(),
      error: v.optional(v.string()),
      quarantinedAt: v.optional(v.number()),
    })
  ),
  handler: async (ctx, { projectionName, limit = 100 }) => {
    // Use compound index when projectionName is provided for efficient filtering
    const query = projectionName
      ? ctx.db
          .query("poisonEvents")
          .withIndex("by_status_projection", (q) =>
            q.eq("status", "quarantined").eq("projectionName", projectionName)
          )
      : ctx.db.query("poisonEvents").withIndex("by_status", (q) => q.eq("status", "quarantined"));

    const records = await query.take(limit);
    const filtered = records; // No in-memory filtering needed with compound index

    return filtered.map((r) => {
      // Build result with only defined optional fields for exactOptionalPropertyTypes
      const item: {
        _id: typeof r._id;
        eventId: string;
        eventType: string;
        projectionName: string;
        attemptCount: number;
        error?: string;
        quarantinedAt?: number;
      } = {
        _id: r._id,
        eventId: r.eventId,
        eventType: r.eventType,
        projectionName: r.projectionName,
        attemptCount: r.attemptCount,
      };

      if (r.error !== undefined) {
        item.error = r.error;
      }
      if (r.quarantinedAt !== undefined) {
        item.quarantinedAt = r.quarantinedAt;
      }

      return item;
    });
  },
});

/**
 * Get poison event statistics.
 */
export const getStats = internalQuery({
  args: {
    projectionName: v.optional(v.string()),
  },
  returns: v.object({
    pending: v.number(),
    quarantined: v.number(),
    replayed: v.number(),
    ignored: v.number(),
    total: v.number(),
  }),
  handler: async (ctx, { projectionName }) => {
    let records = await ctx.db.query("poisonEvents").collect();

    if (projectionName) {
      records = records.filter((r) => r.projectionName === projectionName);
    }

    const stats = {
      pending: 0,
      quarantined: 0,
      replayed: 0,
      ignored: 0,
      total: records.length,
    };

    for (const record of records) {
      stats[record.status]++;
    }

    return stats;
  },
});

// ============================================================================
// Admin Actions
// ============================================================================

/**
 * Replay a quarantined event (reset for retry).
 */
export const replayEvent = internalMutation({
  args: {
    eventId: v.string(),
    projectionName: v.string(),
  },
  returns: v.object({
    status: v.union(
      v.literal("ready_for_replay"),
      v.literal("not_found"),
      v.literal("not_quarantined")
    ),
  }),
  handler: async (ctx, { eventId, projectionName }) => {
    const record = await ctx.db
      .query("poisonEvents")
      .withIndex("by_eventId_projection", (q) =>
        q.eq("eventId", eventId).eq("projectionName", projectionName)
      )
      .first();

    if (!record) {
      return { status: "not_found" as const };
    }

    if (record.status !== "quarantined") {
      return { status: "not_quarantined" as const };
    }

    // Reset for replay
    await ctx.db.patch(record._id, {
      status: "replayed",
      attemptCount: 0,
      updatedAt: Date.now(),
    });

    logger.info("Event ready for replay", { eventId, projectionName });

    return { status: "ready_for_replay" as const };
  },
});

/**
 * Ignore a quarantined event (mark as not requiring replay).
 */
export const ignoreEvent = internalMutation({
  args: {
    eventId: v.string(),
    projectionName: v.string(),
    reason: v.string(),
    resolvedBy: v.optional(v.string()),
  },
  returns: v.object({
    status: v.union(v.literal("ignored"), v.literal("not_found"), v.literal("not_quarantined")),
  }),
  handler: async (ctx, { eventId, projectionName, reason, resolvedBy }) => {
    const record = await ctx.db
      .query("poisonEvents")
      .withIndex("by_eventId_projection", (q) =>
        q.eq("eventId", eventId).eq("projectionName", projectionName)
      )
      .first();

    if (!record) {
      return { status: "not_found" as const };
    }

    if (record.status !== "quarantined") {
      return { status: "not_quarantined" as const };
    }

    await ctx.db.patch(record._id, {
      status: "ignored",
      reviewNotes: reason,
      resolvedBy: resolvedBy ?? "admin",
      updatedAt: Date.now(),
    });

    logger.info("Event ignored", { eventId, projectionName, reason, resolvedBy });

    return { status: "ignored" as const };
  },
});
