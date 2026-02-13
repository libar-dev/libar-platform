import type { Doc } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

// ============================================================================
// Shared Validators
// ============================================================================

const commandStatusValidator = v.union(
  v.literal("pending"),
  v.literal("processing"),
  v.literal("completed"),
  v.literal("failed")
);

function toCommandDTO(cmd: Doc<"agentCommands">) {
  return {
    agentId: cmd.agentId,
    type: cmd.type,
    payload: cmd.payload,
    status: cmd.status,
    confidence: cmd.confidence,
    reason: cmd.reason,
    triggeringEventIds: cmd.triggeringEventIds,
    decisionId: cmd.decisionId,
    createdAt: cmd.createdAt,
    ...(cmd.patternId !== undefined && { patternId: cmd.patternId }),
    ...(cmd.correlationId !== undefined && { correlationId: cmd.correlationId }),
    ...(cmd.routingAttempts !== undefined && { routingAttempts: cmd.routingAttempts }),
    ...(cmd.processedAt !== undefined && { processedAt: cmd.processedAt }),
    ...(cmd.error !== undefined && { error: cmd.error }),
  };
}

// ============================================================================
// Mutations
// ============================================================================

/**
 * Record a command emitted by an agent.
 * The command enters "pending" status awaiting routing.
 */
export const record = mutation({
  args: {
    agentId: v.string(),
    type: v.string(),
    payload: v.any(),
    confidence: v.number(),
    reason: v.string(),
    triggeringEventIds: v.array(v.string()),
    decisionId: v.string(),
    patternId: v.optional(v.string()),
    correlationId: v.optional(v.string()),
    routingAttempts: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("agentCommands")
      .withIndex("by_decisionId", (q) => q.eq("decisionId", args.decisionId))
      .first();
    if (existing) return;

    const now = Date.now();

    await ctx.db.insert("agentCommands", {
      agentId: args.agentId,
      type: args.type,
      payload: args.payload,
      status: "pending" as const,
      confidence: args.confidence,
      reason: args.reason,
      triggeringEventIds: args.triggeringEventIds,
      decisionId: args.decisionId,
      createdAt: now,
      ...(args.patternId !== undefined && { patternId: args.patternId }),
      ...(args.correlationId !== undefined && { correlationId: args.correlationId }),
      ...(args.routingAttempts !== undefined && { routingAttempts: args.routingAttempts }),
    });
  },
});

/**
 * Update command processing status.
 * Called by CommandOrchestrator during command lifecycle.
 * Throws if command not found by decisionId.
 */
export const updateStatus = mutation({
  args: {
    decisionId: v.string(),
    status: commandStatusValidator,
    error: v.optional(v.string()),
    incrementRoutingAttempts: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const { decisionId, status, error, incrementRoutingAttempts } = args;

    const command = await ctx.db
      .query("agentCommands")
      .withIndex("by_decisionId", (q) => q.eq("decisionId", decisionId))
      .first();

    if (!command) {
      throw new Error(`Command not found for decisionId=${decisionId}`);
    }

    await ctx.db.patch(command._id, {
      status,
      ...(error !== undefined && { error }),
      ...(status === "completed" && { processedAt: Date.now() }),
      ...(incrementRoutingAttempts && {
        routingAttempts: (command.routingAttempts ?? 0) + 1,
      }),
    });
  },
});

// ============================================================================
// Queries
// ============================================================================

/**
 * Query commands by agent with optional status filter.
 * Without status: returns in descending createdAt order.
 * With status: filters by the agentId+status compound index.
 */
export const queryByAgent = query({
  args: {
    agentId: v.string(),
    status: v.optional(commandStatusValidator),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { agentId, status, limit = 100 } = args;

    let results;

    if (status) {
      results = await ctx.db
        .query("agentCommands")
        .withIndex("by_agentId_status", (q) => q.eq("agentId", agentId).eq("status", status))
        .take(limit);
    } else {
      results = await ctx.db
        .query("agentCommands")
        .withIndex("by_agentId_createdAt", (q) => q.eq("agentId", agentId))
        .order("desc")
        .take(limit);
    }

    return results.map(toCommandDTO);
  },
});

/**
 * Get a command by its decision ID.
 * Used by command bridge to load full command before routing.
 */
export const getByDecisionId = query({
  args: {
    decisionId: v.string(),
  },
  handler: async (ctx, args) => {
    const command = await ctx.db
      .query("agentCommands")
      .withIndex("by_decisionId", (q) => q.eq("decisionId", args.decisionId))
      .first();

    if (!command) {
      return null;
    }

    return toCommandDTO(command);
  },
});

/**
 * Get all pending commands across agents.
 * Used by CommandOrchestrator to discover commands needing routing.
 */
export const getPending = query({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { limit = 100 } = args;

    const results = await ctx.db
      .query("agentCommands")
      .withIndex("by_status", (q) => q.eq("status", "pending"))
      .take(limit);

    return results.map(toCommandDTO);
  },
});
