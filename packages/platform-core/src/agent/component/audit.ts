import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { AGENT_AUDIT_EVENT_TYPES } from "./schema.js";

// ============================================================================
// Shared Validators
// ============================================================================

const auditEventTypeValidator = v.union(
  ...AGENT_AUDIT_EVENT_TYPES.map((t) => v.literal(t))
) as ReturnType<typeof v.union>;

// ============================================================================
// Mutations
// ============================================================================

/**
 * Record an audit event.
 * Idempotent by (decisionId, eventType) — duplicate calls are no-ops.
 */
export const record = mutation({
  args: {
    eventType: auditEventTypeValidator,
    agentId: v.string(),
    decisionId: v.string(),
    timestamp: v.number(),
    payload: v.any(),
  },
  handler: async (ctx, args) => {
    const { eventType, agentId, decisionId, timestamp, payload } = args;

    const existingAudits = await ctx.db
      .query("agentAuditEvents")
      .withIndex("by_decisionId", (q) => q.eq("decisionId", decisionId))
      .collect();

    if (existingAudits.some((a) => a.eventType === eventType)) {
      return null;
    }

    await ctx.db.insert("agentAuditEvents", {
      eventType,
      agentId,
      decisionId,
      timestamp,
      payload,
    });

    return { eventType, agentId, decisionId, timestamp, payload };
  },
});

// ============================================================================
// Queries
// ============================================================================

/**
 * Query audit events by agent with optional eventType filter.
 * Returns results ordered by timestamp descending.
 */
export const queryByAgent = query({
  args: {
    agentId: v.string(),
    eventType: v.optional(auditEventTypeValidator),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { agentId, eventType, limit = 100 } = args;

    const events = await ctx.db
      .query("agentAuditEvents")
      .withIndex("by_agentId_timestamp", (q) => q.eq("agentId", agentId))
      .order("desc")
      .take(eventType ? limit * 3 : limit);

    let filtered = eventType ? events.filter((e) => e.eventType === eventType) : events;

    if (eventType && filtered.length > limit) {
      filtered = filtered.slice(0, limit);
    }

    return filtered.map((e) => ({
      eventType: e.eventType,
      agentId: e.agentId,
      decisionId: e.decisionId,
      timestamp: e.timestamp,
      payload: e.payload,
    }));
  },
});

/**
 * Get audit event by decision ID.
 * Correlates audit events with commands and approvals.
 */
export const getByDecisionId = query({
  args: {
    decisionId: v.string(),
  },
  handler: async (ctx, args) => {
    const event = await ctx.db
      .query("agentAuditEvents")
      .withIndex("by_decisionId", (q) => q.eq("decisionId", args.decisionId))
      .first();

    if (!event) {
      return null;
    }

    return {
      eventType: event.eventType,
      agentId: event.agentId,
      decisionId: event.decisionId,
      timestamp: event.timestamp,
      payload: event.payload,
    };
  },
});
