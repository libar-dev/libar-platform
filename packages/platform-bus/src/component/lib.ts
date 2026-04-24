import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import {
  assertBoundaryValuesSize,
  DEFAULT_BOUNDARY_VALUE_MAX_BYTES,
} from "../../../platform-core/src/validation/boundary.js";
import { vUnknown } from "../../../platform-core/src/validation/convexUnknown.js";

// Default TTL: 7 days in milliseconds
const DEFAULT_TTL = 7 * 24 * 60 * 60 * 1000;
const COMMAND_BUS_VALUE_MAX_BYTES = DEFAULT_BOUNDARY_VALUE_MAX_BYTES;
const MAX_CORRELATION_LIMIT = 1000;
const MAX_CLEANUP_BATCH_SIZE = 500;

function buildCorrelationCursor(timestamp: number, commandId: string): string {
  return `${String(timestamp).padStart(16, "0")}:${commandId}`;
}

/**
 * Record a command for idempotency tracking.
 *
 * If a command with the same commandId already exists:
 * - Returns the existing result if already executed
 * - Returns conflict if still pending
 *
 * This allows the caller to:
 * 1. Check if already processed
 * 2. Execute the command handler
 * 3. Update with result using updateCommandResult
 */
export const recordCommand = mutation({
  args: {
    commandId: v.string(),
    commandType: v.string(),
    targetContext: v.string(),
    payload: vUnknown(),
    metadata: v.object({
      userId: v.optional(v.string()),
      correlationId: v.string(),
      timestamp: v.number(),
    }),
    ttl: v.optional(v.number()),
  },
  returns: v.union(
    v.object({
      status: v.literal("new"),
    }),
    v.object({
      status: v.literal("duplicate"),
      commandStatus: v.union(
        v.literal("pending"),
        v.literal("executed"),
        v.literal("rejected"),
        v.literal("failed")
      ),
      result: v.optional(vUnknown()),
    })
  ),
  handler: async (ctx, args) => {
    assertBoundaryValuesSize([
      { fieldName: "recordCommand.payload", value: args.payload, maxBytes: COMMAND_BUS_VALUE_MAX_BYTES },
    ]);

    // Check for existing command with same ID
    const existing = await ctx.db
      .query("commands")
      .withIndex("by_commandId", (q) => q.eq("commandId", args.commandId))
      .first();

    if (existing) {
      return {
        status: "duplicate" as const,
        commandStatus: existing.status,
        result: existing.result,
      };
    }

    // Record new command as pending
    const ttl = args.ttl ?? DEFAULT_TTL;
    const expiresAt = args.metadata.timestamp + ttl;

    // Insert the command.
    // Convex mutations are serializable, so a concurrent write with the same
    // commandId cannot interleave between the existence check above and this
    // insert. The later mutation will observe the committed row and return the
    // duplicate result without needing post-insert dedup cleanup.
    await ctx.db.insert("commands", {
      commandId: args.commandId,
      commandType: args.commandType,
      targetContext: args.targetContext,
      payload: args.payload,
      metadata: args.metadata,
      correlationCursor: buildCorrelationCursor(args.metadata.timestamp, args.commandId),
      status: "pending",
      ttl,
      expiresAt,
    });

    return { status: "new" as const };
  },
});

/**
 * Update command result after execution.
 */
export const updateCommandResult = mutation({
  args: {
    commandId: v.string(),
    status: v.union(v.literal("executed"), v.literal("rejected"), v.literal("failed")),
    result: v.optional(vUnknown()),
  },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    assertBoundaryValuesSize([
      {
        fieldName: "updateCommandResult.result",
        value: args.result,
        maxBytes: COMMAND_BUS_VALUE_MAX_BYTES,
      },
    ]);

    const command = await ctx.db
      .query("commands")
      .withIndex("by_commandId", (q) => q.eq("commandId", args.commandId))
      .first();

    if (!command) {
      return false;
    }

    // Verify command is still pending to prevent race conditions
    if (command.status !== "pending") {
      return false; // Already processed by another handler
    }

    await ctx.db.patch(command._id, {
      status: args.status,
      result: args.result,
      executedAt: Date.now(),
    });

    return true;
  },
});

/**
 * Get command status and result.
 */
export const getCommandStatus = query({
  args: {
    commandId: v.string(),
  },
  returns: v.union(
    v.null(),
    v.object({
      commandId: v.string(),
      commandType: v.string(),
      targetContext: v.string(),
      status: v.union(
        v.literal("pending"),
        v.literal("executed"),
        v.literal("rejected"),
        v.literal("failed")
      ),
      result: v.optional(vUnknown()),
      executedAt: v.optional(v.number()),
    })
  ),
  handler: async (ctx, args) => {
    const command = await ctx.db
      .query("commands")
      .withIndex("by_commandId", (q) => q.eq("commandId", args.commandId))
      .first();

    if (!command) {
      return null;
    }

    return {
      commandId: command.commandId,
      commandType: command.commandType,
      targetContext: command.targetContext,
      status: command.status,
      ...(command.result !== undefined && { result: command.result }),
      ...(command.executedAt !== undefined && { executedAt: command.executedAt }),
    };
  },
});

/**
 * Get commands by correlation ID (for tracing).
 */
export const getByCorrelation = query({
  args: {
    correlationId: v.string(),
    limit: v.optional(v.number()),
    cursor: v.optional(v.string()),
  },
  returns: v.object({
    commands: v.array(
      v.object({
        commandId: v.string(),
        commandType: v.string(),
        targetContext: v.string(),
        status: v.union(
          v.literal("pending"),
          v.literal("executed"),
          v.literal("rejected"),
          v.literal("failed")
        ),
        executedAt: v.optional(v.number()),
        timestamp: v.number(),
      })
    ),
    nextCursor: v.union(v.string(), v.null()),
    hasMore: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const effectiveLimit = Math.min(args.limit ?? 100, MAX_CORRELATION_LIMIT);
    const commands = await ctx.db
      .query("commands")
      .withIndex("by_correlation_cursor", (q) => {
        const range = q.eq("metadata.correlationId", args.correlationId);
        return args.cursor ? range.gt("correlationCursor", args.cursor) : range;
      })
      .take(effectiveLimit + 1);

    const hasMore = commands.length > effectiveLimit;
    const page = commands.slice(0, effectiveLimit);

    return {
      commands: page.map((c) => ({
        commandId: c.commandId,
        commandType: c.commandType,
        targetContext: c.targetContext,
        status: c.status,
        timestamp: c.metadata.timestamp,
        ...(c.executedAt !== undefined && { executedAt: c.executedAt }),
      })),
      nextCursor: hasMore ? page[page.length - 1]?.correlationCursor ?? null : null,
      hasMore,
    };
  },
});

/**
 * Cleanup expired commands and correlations.
 * Should be called periodically via cron.
 *
 * Uses the by_expiresAt index for efficient querying of expired records.
 * Only deletes non-pending commands that have expired.
 * Always deletes expired correlations (no pending state for correlations).
 */
export const cleanupExpired = mutation({
  args: {
    batchSize: v.optional(v.number()),
  },
  returns: v.object({
    commands: v.number(),
    correlations: v.number(),
    hasMore: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const batchSize = Math.min(args.batchSize ?? 100, MAX_CLEANUP_BATCH_SIZE);
    const now = Date.now();

    // Find expired commands using the by_expiresAt index
    // Only delete commands that are no longer pending and have expired
    const expiredCommands = await ctx.db
      .query("commands")
      .withIndex("by_expiresAt", (q) => q.lt("expiresAt", now))
      .filter((q) => q.neq(q.field("status"), "pending"))
      .take(batchSize + 1);

    const commandBatch = expiredCommands.slice(0, batchSize);

    // Find expired correlations using the by_expiresAt index
    const expiredCorrelations = await ctx.db
      .query("commandEventCorrelations")
      .withIndex("by_expiresAt", (q) => q.lt("expiresAt", now))
      .take(batchSize + 1);

    const correlationBatch = expiredCorrelations.slice(0, batchSize);

    await Promise.all([
      ...commandBatch.map((command) => ctx.db.delete(command._id)),
      ...correlationBatch.map((correlation) => ctx.db.delete(correlation._id)),
    ]);

    return {
      commands: commandBatch.length,
      correlations: correlationBatch.length,
      hasMore: expiredCommands.length > batchSize || expiredCorrelations.length > batchSize,
    };
  },
});

// ============================================================================
// Command-Event Correlation Functions
// ============================================================================

/**
 * Record the correlation between a command and the events it produced.
 *
 * This should be called by the CommandOrchestrator after a command
 * successfully produces events.
 */
export const recordCommandEventCorrelation = mutation({
  args: {
    commandId: v.string(),
    eventIds: v.array(v.string()),
    commandType: v.string(),
    boundedContext: v.string(),
    ttl: v.optional(v.number()),
  },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    // Check if correlation already exists (idempotent)
    const existing = await ctx.db
      .query("commandEventCorrelations")
      .withIndex("by_commandId", (q) => q.eq("commandId", args.commandId))
      .first();

    if (existing) {
      // Already recorded - merge event IDs if there are new ones
      const existingIds = new Set(existing.eventIds);
      const newIds = args.eventIds.filter((id) => !existingIds.has(id));

      if (newIds.length > 0) {
        await ctx.db.patch(existing._id, {
          eventIds: [...existing.eventIds, ...newIds],
        });
      }
      return true;
    }

    // Record new correlation with TTL
    const now = Date.now();
    const ttl = args.ttl ?? DEFAULT_TTL;

    await ctx.db.insert("commandEventCorrelations", {
      commandId: args.commandId,
      eventIds: args.eventIds,
      commandType: args.commandType,
      boundedContext: args.boundedContext,
      createdAt: now,
      ttl,
      expiresAt: now + ttl,
    });

    return true;
  },
});

/**
 * Get the events produced by a specific command.
 */
export const getEventsByCommandId = query({
  args: {
    commandId: v.string(),
  },
  returns: v.union(
    v.null(),
    v.object({
      commandId: v.string(),
      eventIds: v.array(v.string()),
      commandType: v.string(),
      boundedContext: v.string(),
      createdAt: v.number(),
    })
  ),
  handler: async (ctx, args) => {
    const correlation = await ctx.db
      .query("commandEventCorrelations")
      .withIndex("by_commandId", (q) => q.eq("commandId", args.commandId))
      .first();

    if (!correlation) {
      return null;
    }

    return {
      commandId: correlation.commandId,
      eventIds: correlation.eventIds,
      commandType: correlation.commandType,
      boundedContext: correlation.boundedContext,
      createdAt: correlation.createdAt,
    };
  },
});

/**
 * Get all command-event correlations for a bounded context.
 * Useful for audit trail and debugging.
 */
export const getCorrelationsByContext = query({
  args: {
    boundedContext: v.string(),
    limit: v.optional(v.number()),
    afterTimestamp: v.optional(v.number()),
  },
  returns: v.array(
    v.object({
      commandId: v.string(),
      eventIds: v.array(v.string()),
      commandType: v.string(),
      boundedContext: v.string(),
      createdAt: v.number(),
    })
  ),
  handler: async (ctx, args) => {
    const limit = args.limit ?? 100;

    // Query with index and optional timestamp filtering
    const baseQuery = ctx.db
      .query("commandEventCorrelations")
      .withIndex("by_context", (q) => q.eq("boundedContext", args.boundedContext));

    // Apply timestamp filter if provided
    const filteredQuery =
      args.afterTimestamp !== undefined
        ? baseQuery.filter((q) => q.gt(q.field("createdAt"), args.afterTimestamp!))
        : baseQuery;

    const correlations = await filteredQuery.take(limit);

    return correlations.map((c) => ({
      commandId: c.commandId,
      eventIds: c.eventIds,
      commandType: c.commandType,
      boundedContext: c.boundedContext,
      createdAt: c.createdAt,
    }));
  },
});
