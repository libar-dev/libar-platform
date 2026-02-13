import type { Doc } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { AGENT_AUDIT_EVENT_TYPES } from "./schema.js";

// ============================================================================
// Shared Validators
// ============================================================================

const checkpointStatusValidator = v.union(
  v.literal("active"),
  v.literal("paused"),
  v.literal("stopped"),
  v.literal("error_recovery")
);

const auditEventTypeValidator = v.union(
  ...AGENT_AUDIT_EVENT_TYPES.map((t) => v.literal(t))
) as ReturnType<typeof v.union>;

function toCheckpointDTO(cp: Doc<"agentCheckpoints">) {
  return {
    agentId: cp.agentId,
    subscriptionId: cp.subscriptionId,
    lastProcessedPosition: cp.lastProcessedPosition,
    lastEventId: cp.lastEventId,
    status: cp.status,
    eventsProcessed: cp.eventsProcessed,
    updatedAt: cp.updatedAt,
    ...(cp.configOverrides !== undefined && { configOverrides: cp.configOverrides }),
  };
}

// ============================================================================
// Mutations
// ============================================================================

/**
 * Load or create a checkpoint for an agent+subscription pair.
 * Idempotent: returns existing checkpoint or creates with defaults.
 */
export const loadOrCreate = mutation({
  args: {
    agentId: v.string(),
    subscriptionId: v.string(),
  },
  handler: async (ctx, args) => {
    const { agentId, subscriptionId } = args;

    const existing = await ctx.db
      .query("agentCheckpoints")
      .withIndex("by_agentId_subscriptionId", (q) =>
        q.eq("agentId", agentId).eq("subscriptionId", subscriptionId)
      )
      .first();

    if (existing) {
      return {
        checkpoint: toCheckpointDTO(existing),
        isNew: false,
      };
    }

    const now = Date.now();
    const checkpoint = {
      agentId,
      subscriptionId,
      lastProcessedPosition: -1,
      lastEventId: "",
      status: "active" as const,
      eventsProcessed: 0,
      updatedAt: now,
    };

    await ctx.db.insert("agentCheckpoints", checkpoint);

    return {
      checkpoint,
      isNew: true,
    };
  },
});

/**
 * Update checkpoint after successful event processing.
 * Advances position and optionally increments the events processed counter.
 */
export const update = mutation({
  args: {
    agentId: v.string(),
    subscriptionId: v.string(),
    lastProcessedPosition: v.number(),
    lastEventId: v.string(),
    incrementEventsProcessed: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const {
      agentId,
      subscriptionId,
      lastProcessedPosition,
      lastEventId,
      incrementEventsProcessed,
    } = args;

    const existing = await ctx.db
      .query("agentCheckpoints")
      .withIndex("by_agentId_subscriptionId", (q) =>
        q.eq("agentId", agentId).eq("subscriptionId", subscriptionId)
      )
      .first();

    if (!existing) {
      throw new Error(`Checkpoint not found for agent=${agentId}, subscription=${subscriptionId}`);
    }

    const now = Date.now();

    if (incrementEventsProcessed) {
      await ctx.db.patch(existing._id, {
        lastProcessedPosition,
        lastEventId,
        updatedAt: now,
        eventsProcessed: existing.eventsProcessed + 1,
      });
    } else {
      await ctx.db.patch(existing._id, {
        lastProcessedPosition,
        lastEventId,
        updatedAt: now,
      });
    }
  },
});

/**
 * Update checkpoint status for all checkpoints of an agent.
 * Used by lifecycle management to pause/resume/stop event processing.
 */
export const updateStatus = mutation({
  args: {
    agentId: v.string(),
    status: checkpointStatusValidator,
  },
  handler: async (ctx, args) => {
    const { agentId, status } = args;
    const now = Date.now();

    const checkpoints = await ctx.db
      .query("agentCheckpoints")
      .withIndex("by_agentId", (q) => q.eq("agentId", agentId))
      .collect();

    for (const checkpoint of checkpoints) {
      await ctx.db.patch(checkpoint._id, { status, updatedAt: now });
    }

    return { updatedCount: checkpoints.length };
  },
});

/**
 * Patch config overrides for all checkpoints of an agent.
 * Called by ReconfigureAgent lifecycle command.
 */
export const patchConfigOverrides = mutation({
  args: {
    agentId: v.string(),
    configOverrides: v.any(),
  },
  handler: async (ctx, args) => {
    const { agentId, configOverrides } = args;
    const now = Date.now();

    const checkpoints = await ctx.db
      .query("agentCheckpoints")
      .withIndex("by_agentId", (q) => q.eq("agentId", agentId))
      .collect();

    for (const checkpoint of checkpoints) {
      await ctx.db.patch(checkpoint._id, {
        configOverrides,
        updatedAt: now,
      });
    }

    return { patchedCount: checkpoints.length };
  },
});

/**
 * Transition agent lifecycle: update all checkpoint statuses and record
 * an audit event in a single component mutation.
 *
 * Idempotent: if a lifecycle transition with the given decisionId and
 * eventType has already been applied, returns early.
 */
export const transitionLifecycle = mutation({
  args: {
    agentId: v.string(),
    status: checkpointStatusValidator,
    auditEvent: v.object({
      eventType: auditEventTypeValidator,
      decisionId: v.string(),
      timestamp: v.number(),
      payload: v.any(),
    }),
  },
  handler: async (ctx, args) => {
    const { agentId, status, auditEvent } = args;
    const now = Date.now();

    const existingAudits = await ctx.db
      .query("agentAuditEvents")
      .withIndex("by_decisionId", (q) => q.eq("decisionId", auditEvent.decisionId))
      .collect();

    if (existingAudits.some((a) => a.eventType === auditEvent.eventType)) {
      return { updatedCount: 0 };
    }

    // Update all checkpoint statuses for the agent
    const checkpoints = await ctx.db
      .query("agentCheckpoints")
      .withIndex("by_agentId", (q) => q.eq("agentId", agentId))
      .collect();

    for (const checkpoint of checkpoints) {
      await ctx.db.patch(checkpoint._id, { status, updatedAt: now });
    }

    // Insert audit event in the same transaction
    await ctx.db.insert("agentAuditEvents", {
      eventType: auditEvent.eventType,
      agentId,
      decisionId: auditEvent.decisionId,
      timestamp: auditEvent.timestamp,
      payload: auditEvent.payload,
    });

    return { updatedCount: checkpoints.length };
  },
});

// ============================================================================
// Queries
// ============================================================================

/**
 * Get checkpoint by (agentId, subscriptionId) pair.
 * Primary lookup for onComplete handlers.
 */
export const getByAgentAndSubscription = query({
  args: {
    agentId: v.string(),
    subscriptionId: v.string(),
  },
  handler: async (ctx, args) => {
    const { agentId, subscriptionId } = args;

    const checkpoint = await ctx.db
      .query("agentCheckpoints")
      .withIndex("by_agentId_subscriptionId", (q) =>
        q.eq("agentId", agentId).eq("subscriptionId", subscriptionId)
      )
      .first();

    if (!checkpoint) {
      return null;
    }

    return toCheckpointDTO(checkpoint);
  },
});

/**
 * Get a single checkpoint by agentId.
 * Returns the first checkpoint found — an agent may have multiple checkpoints
 * (one per subscription). Use getByAgentAndSubscription for precise lookup.
 */
export const getByAgentId = query({
  args: {
    agentId: v.string(),
  },
  handler: async (ctx, args) => {
    const checkpoint = await ctx.db
      .query("agentCheckpoints")
      .withIndex("by_agentId", (q) => q.eq("agentId", args.agentId))
      .first();

    if (!checkpoint) {
      return null;
    }

    return toCheckpointDTO(checkpoint);
  },
});

/**
 * List all active checkpoints.
 * Used by monitoring dashboards.
 */
export const listActive = query({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { limit = 100 } = args;

    const checkpoints = await ctx.db
      .query("agentCheckpoints")
      .withIndex("by_status", (q) => q.eq("status", "active"))
      .take(limit);

    return checkpoints.map(toCheckpointDTO);
  },
});
