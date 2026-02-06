/**
 * @target platform-core/src/agent/component/checkpoints.ts
 *
 * Agent Component - Checkpoint Public API
 *
 * Provides checkpoint operations for exactly-once event processing semantics.
 * Each agent+subscription pair maintains a checkpoint tracking the last
 * processed global position.
 *
 * @libar-docs
 * @libar-docs-status roadmap
 * @libar-docs-infra
 * @libar-docs-uses AgentCheckpoint
 * @libar-docs-used-by EventHandler, AdminUI
 *
 * ## Checkpoint API - Position Tracking
 *
 * Access via: `components.agentBC.checkpoints.*`
 *
 * @see DESIGN-2026-005 AD-4 (API Granularity, historical)
 */

/* eslint-disable @typescript-eslint/no-unused-vars */

import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

// ============================================================================
// Shared Validators
// ============================================================================

const checkpointStatusValidator = v.union(
  v.literal("active"),
  v.literal("paused"),
  v.literal("stopped"),
  v.literal("error_recovery")
);

// ============================================================================
// Mutations
// ============================================================================

/**
 * Load or create a checkpoint for an agent.
 *
 * Idempotent: if checkpoint exists, returns it; otherwise creates with defaults.
 * Returns `{ checkpoint, isNew }` to indicate whether creation occurred.
 *
 * @example
 * ```typescript
 * const { checkpoint, isNew } = await ctx.runMutation(
 *   components.agentBC.checkpoints.loadOrCreate,
 *   { agentId: "churn-risk-agent", subscriptionId: "sub_churn_001" }
 * );
 * ```
 */
export const loadOrCreate = mutation({
  args: {
    agentId: v.string(),
    subscriptionId: v.string(),
  },
  handler: async (ctx, args) => {
    throw new Error("AgentBCComponentIsolation not yet implemented - roadmap pattern");
  },
});

/**
 * Update checkpoint after successful event processing.
 *
 * Called after each event is processed to advance the checkpoint position.
 * Optionally increments the events processed counter.
 *
 * @example
 * ```typescript
 * await ctx.runMutation(components.agentBC.checkpoints.update, {
 *   agentId: "churn-risk-agent",
 *   subscriptionId: "sub_churn_001",
 *   lastProcessedPosition: event.globalPosition,
 *   lastEventId: event.eventId,
 *   incrementEventsProcessed: true,
 * });
 * ```
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
    throw new Error("AgentBCComponentIsolation not yet implemented - roadmap pattern");
  },
});

/**
 * Update checkpoint status (pause/resume/stop).
 *
 * Used by agent lifecycle management to control event processing.
 *
 * @example
 * ```typescript
 * await ctx.runMutation(components.agentBC.checkpoints.updateStatus, {
 *   agentId: "churn-risk-agent",
 *   status: "paused",
 * });
 * ```
 */
export const updateStatus = mutation({
  args: {
    agentId: v.string(),
    status: checkpointStatusValidator,
  },
  handler: async (ctx, args) => {
    throw new Error("AgentBCComponentIsolation not yet implemented - roadmap pattern");
  },
});

/**
 * Patch config overrides for all checkpoints of an agent (DS-5, PDR-013 AD-5).
 *
 * Called by ReconfigureAgent lifecycle command. Updates the configOverrides
 * field on ALL checkpoints for the given agentId in a single atomic mutation.
 *
 * Pattern matches updateStatus (above) which also operates on all checkpoints by agentId.
 *
 * @example
 * ```typescript
 * await ctx.runMutation(components.agentBC.checkpoints.patchConfigOverrides, {
 *   agentId: "churn-risk-agent",
 *   configOverrides: { confidenceThreshold: 0.9 },
 * });
 * ```
 */
export const patchConfigOverrides = mutation({
  args: {
    agentId: v.string(),
    configOverrides: v.any(),
  },
  handler: async (ctx, args) => {
    // IMPLEMENTATION NOTE: Iterate all checkpoints by agentId and patch configOverrides.
    // This relies on the by_agentId index for efficient lookup.
    // Atomic: all patches commit or none do (Convex mutation guarantee).
    //
    //   const checkpoints = await ctx.db
    //     .query("agentCheckpoints")
    //     .withIndex("by_agentId", q => q.eq("agentId", args.agentId))
    //     .collect();
    //   for (const checkpoint of checkpoints) {
    //     await ctx.db.patch(checkpoint._id, {
    //       configOverrides: args.configOverrides,
    //       updatedAt: Date.now(),
    //     });
    //   }
    //   return { patchedCount: checkpoints.length };
    //
    throw new Error("AgentBCComponentIsolation not yet implemented - roadmap pattern");
  },
});

// ============================================================================
// Queries
// ============================================================================

/**
 * Get checkpoint by (agentId, subscriptionId) pair.
 *
 * Primary lookup for onComplete handlers. An agent may have multiple
 * subscriptions (e.g., one per event type group), so `getByAgentId` alone
 * is insufficient — it returns the wrong checkpoint if multiple exist.
 *
 * Uses the `by_agentId_subscriptionId` compound index for O(1) lookup.
 *
 * @example
 * ```typescript
 * const checkpoint = await ctx.runQuery(
 *   components.agentBC.checkpoints.getByAgentAndSubscription,
 *   { agentId: "churn-risk-agent", subscriptionId: "sub_churn_001" }
 * );
 * ```
 */
export const getByAgentAndSubscription = query({
  args: {
    agentId: v.string(),
    subscriptionId: v.string(),
  },
  handler: async (ctx, args) => {
    throw new Error("AgentBCComponentIsolation not yet implemented - roadmap pattern");
  },
});

/**
 * Get checkpoint by agent ID.
 *
 * Returns the current checkpoint state for monitoring and debugging.
 * For onComplete handlers, prefer `getByAgentAndSubscription` which
 * uses the compound index for exact lookup.
 *
 * @example
 * ```typescript
 * const checkpoint = await ctx.runQuery(
 *   components.agentBC.checkpoints.getByAgentId,
 *   { agentId: "churn-risk-agent" }
 * );
 * ```
 */
export const getByAgentId = query({
  args: {
    agentId: v.string(),
  },
  handler: async (ctx, args) => {
    throw new Error("AgentBCComponentIsolation not yet implemented - roadmap pattern");
  },
});

/**
 * List all active checkpoints.
 *
 * Returns all checkpoints with "active" status for monitoring dashboards.
 *
 * @example
 * ```typescript
 * const activeAgents = await ctx.runQuery(
 *   components.agentBC.checkpoints.listActive, {}
 * );
 * ```
 */
export const listActive = query({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx) => {
    throw new Error("AgentBCComponentIsolation not yet implemented - roadmap pattern");
  },
});
