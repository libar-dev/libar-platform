/**
 * Intent Test Mutations
 *
 * Test mutations for validating durable command intent/completion bracketing
 * with real database. These test the commandIntents table and orphan detection.
 *
 * @since Phase 18.5 - DurableEventsIntegration
 */
import { mutation, query } from "../_generated/server";
import { v } from "convex/values";
import { ensureTestEnvironment } from "@libar-dev/platform-core";
import { makeFunctionReference } from "convex/server";
import type { SafeMutationRef } from "@libar-dev/platform-core";

// =============================================================================
// Function References (TS2589 Prevention)
// =============================================================================

const insertIntentRef = makeFunctionReference<"mutation">(
  "admin/intents:insertIntent"
) as SafeMutationRef;

const updateIntentStatusRef = makeFunctionReference<"mutation">(
  "admin/intents:updateIntentStatus"
) as SafeMutationRef;

const handleTimeoutRef = makeFunctionReference<"mutation">(
  "admin/intents:handleTimeout"
) as SafeMutationRef;

const detectOrphansRef = makeFunctionReference<"mutation">(
  "admin/intents:detectOrphans"
) as SafeMutationRef;

// =============================================================================
// Intent Record Type
// =============================================================================

export interface IntentRecord {
  _id: unknown;
  intentKey: string;
  operationType: string;
  streamType: string;
  streamId: string;
  boundedContext: string;
  status: "pending" | "completed" | "failed" | "abandoned";
  timeoutMs: number;
  metadata?: unknown;
  correlationId?: string;
  completedAt?: number;
  completionEventId?: string;
  error?: string;
  createdAt: number;
  updatedAt: number;
}

// =============================================================================
// Test Mutations for Intent Bracketing
// =============================================================================

/**
 * Create a test intent record directly for test setup.
 */
export const createTestIntent = mutation({
  args: {
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
    completionEventId: v.optional(v.string()),
    error: v.optional(v.string()),
    createdAtOverride: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    ensureTestEnvironment();

    const now = args.createdAtOverride ?? Date.now();

    const id = await ctx.db.insert("commandIntents", {
      intentKey: args.intentKey,
      operationType: args.operationType,
      streamType: args.streamType,
      streamId: args.streamId,
      boundedContext: args.boundedContext,
      status: args.status,
      timeoutMs: args.timeoutMs,
      createdAt: now,
      updatedAt: now,
      ...(args.metadata !== undefined && { metadata: args.metadata }),
      ...(args.correlationId !== undefined && { correlationId: args.correlationId }),
      ...(args.completionEventId !== undefined && { completionEventId: args.completionEventId }),
      ...(args.error !== undefined && { error: args.error }),
      ...(args.status !== "pending" && { completedAt: now }),
    });

    return { id, intentKey: args.intentKey };
  },
});

/**
 * Get intent by intentKey.
 */
export const getIntentByKey = query({
  args: {
    intentKey: v.string(),
  },
  handler: async (ctx, args) => {
    ensureTestEnvironment();

    const record = await ctx.db
      .query("commandIntents")
      .withIndex("by_intentKey", (q) => q.eq("intentKey", args.intentKey))
      .first();

    return record;
  },
});

/**
 * Get intent stats.
 */
export const getIntentStats = query({
  args: {},
  handler: async (ctx) => {
    ensureTestEnvironment();

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

/**
 * List abandoned intents.
 */
export const listAbandonedIntents = query({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    ensureTestEnvironment();

    const limit = args.limit ?? 100;

    const abandoned = await ctx.db
      .query("commandIntents")
      .withIndex("by_status_createdAt", (q) => q.eq("status", "abandoned"))
      .order("desc")
      .take(limit);

    return abandoned;
  },
});

/**
 * Run the orphan detection mutation directly.
 */
export const runOrphanDetection = mutation({
  args: {},
  handler: async (ctx) => {
    ensureTestEnvironment();

    const result = await ctx.runMutation(detectOrphansRef, {});
    return result;
  },
});

/**
 * Trigger the timeout handler for a specific intent.
 */
export const triggerTimeoutHandler = mutation({
  args: {
    intentKey: v.string(),
  },
  handler: async (ctx, args) => {
    ensureTestEnvironment();

    const result = await ctx.runMutation(handleTimeoutRef, {
      intentKey: args.intentKey,
    });

    return result;
  },
});

/**
 * Record an intent via the admin/intents module.
 */
export const recordTestIntent = mutation({
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
  handler: async (ctx, args) => {
    ensureTestEnvironment();

    const id = await ctx.runMutation(insertIntentRef, {
      intentKey: args.intentKey,
      operationType: args.operationType,
      streamType: args.streamType,
      streamId: args.streamId,
      boundedContext: args.boundedContext,
      timeoutMs: args.timeoutMs,
      ...(args.metadata !== undefined && { metadata: args.metadata }),
      ...(args.correlationId !== undefined && { correlationId: args.correlationId }),
    });

    return { id, intentKey: args.intentKey };
  },
});

/**
 * Update intent status via the admin/intents module.
 */
export const updateTestIntentStatus = mutation({
  args: {
    intentKey: v.string(),
    status: v.union(v.literal("completed"), v.literal("failed"), v.literal("abandoned")),
    completionEventId: v.optional(v.string()),
    error: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    ensureTestEnvironment();

    const result = await ctx.runMutation(updateIntentStatusRef, {
      intentKey: args.intentKey,
      status: args.status,
      ...(args.completionEventId !== undefined && { completionEventId: args.completionEventId }),
      ...(args.error !== undefined && { error: args.error }),
    });

    return { success: result };
  },
});
