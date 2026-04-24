import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { AGENT_AUDIT_EVENT_TYPES } from "./schema.js";
import { verificationProofValidator, verifyActor } from "./verification.js";
import {
  assertBoundaryValuesSize,
  DEFAULT_BOUNDARY_VALUE_MAX_BYTES,
} from "../../validation/boundary.js";
import { vUnknown } from "../../validation/convexUnknown.js";

// ============================================================================
// Shared Validators
// ============================================================================

const auditEventTypeValidator = v.union(
  ...AGENT_AUDIT_EVENT_TYPES.map((t) => v.literal(t))
) as ReturnType<typeof v.union>;
const AGENT_AUDIT_VALUE_MAX_BYTES = DEFAULT_BOUNDARY_VALUE_MAX_BYTES;

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
    payload: vUnknown(),
    verificationProof: verificationProofValidator,
  },
  handler: async (ctx, args) => {
    assertBoundaryValuesSize([
      {
        fieldName: "agentAudit.record.payload",
        value: args.payload,
        maxBytes: AGENT_AUDIT_VALUE_MAX_BYTES,
      },
    ]);

    const { eventType, decisionId, timestamp, payload } = args;
    const verifiedActor = await verifyActor({
      proof: args.verificationProof,
      expectedSubjectId: args.agentId,
      expectedSubjectType: "agent",
      expectedBoundedContext: "agent",
    });
    const agentId = verifiedActor.subjectId;

    const existingAudit = await ctx.db
      .query("agentAuditEvents")
      .withIndex("by_decision_eventtype", (q) =>
        q.eq("decisionId", decisionId).eq("eventType", eventType)
      )
      .first();

    if (existingAudit) {
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
