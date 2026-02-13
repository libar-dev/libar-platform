import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

/**
 * All valid agent audit event types.
 * Local constant — the component cannot import from the parent package
 * due to the Convex codegen boundary.
 */
export const AGENT_AUDIT_EVENT_TYPES = [
  // Base audit types
  "PatternDetected",
  "CommandEmitted",
  "ApprovalRequested",
  "ApprovalGranted",
  "ApprovalRejected",
  "ApprovalExpired",
  "DeadLetterRecorded",
  "CheckpointUpdated",
  // Command routing types
  "AgentCommandRouted",
  "AgentCommandRoutingFailed",
  // Lifecycle types
  "AgentStarted",
  "AgentPaused",
  "AgentResumed",
  "AgentStopped",
  "AgentReconfigured",
  "AgentErrorRecoveryStarted",
] as const;

export default defineSchema({
  /**
   * Agent Checkpoints - position tracking for exactly-once semantics.
   * One checkpoint per (agentId, subscriptionId) pair.
   */
  agentCheckpoints: defineTable({
    agentId: v.string(),
    subscriptionId: v.string(),
    lastProcessedPosition: v.number(),
    lastEventId: v.string(),
    status: v.union(
      v.literal("active"),
      v.literal("paused"),
      v.literal("stopped"),
      v.literal("error_recovery")
    ),
    eventsProcessed: v.number(),
    updatedAt: v.number(),
    // Forward declaration for DS-5 ReconfigureAgent — typed validator deferred
    configOverrides: v.optional(v.any()),
  })
    .index("by_agentId", ["agentId"])
    .index("by_agentId_subscriptionId", ["agentId", "subscriptionId"])
    .index("by_status", ["status", "updatedAt"]),

  /**
   * Agent Audit Events - decision tracking for explainability.
   * Records all agent decisions, approvals, and rejections.
   */
  agentAuditEvents: defineTable({
    eventType: v.union(...AGENT_AUDIT_EVENT_TYPES.map((t) => v.literal(t))) as ReturnType<
      typeof v.union
    >,
    agentId: v.string(),
    decisionId: v.string(),
    timestamp: v.number(),
    payload: v.any(),
  })
    .index("by_agentId_timestamp", ["agentId", "timestamp"])
    .index("by_decisionId", ["decisionId"])
    .index("by_eventType", ["eventType", "timestamp"]),

  /**
   * Agent Dead Letters - failed event processing.
   * Separate from projection dead letters due to different semantics.
   *
   * Status flow: pending -> replayed | ignored
   */
  agentDeadLetters: defineTable({
    agentId: v.string(),
    subscriptionId: v.string(),
    eventId: v.string(),
    globalPosition: v.number(),
    error: v.string(),
    attemptCount: v.number(),
    status: v.union(v.literal("pending"), v.literal("replayed"), v.literal("ignored")),
    failedAt: v.number(),
    workId: v.optional(v.string()),
    context: v.optional(
      v.object({
        correlationId: v.optional(v.string()),
        errorCode: v.optional(v.string()),
        ignoreReason: v.optional(v.string()),
      })
    ),
  })
    .index("by_agentId_status", ["agentId", "status", "failedAt"])
    .index("by_eventId", ["eventId"])
    .index("by_status", ["status", "failedAt"]),

  /**
   * Agent Commands - persisted commands emitted by agents.
   * Tracks command lifecycle from emission through processing.
   */
  agentCommands: defineTable({
    agentId: v.string(),
    type: v.string(),
    payload: v.any(),
    status: v.union(
      v.literal("pending"),
      v.literal("processing"),
      v.literal("completed"),
      v.literal("failed")
    ),
    confidence: v.number(),
    reason: v.string(),
    triggeringEventIds: v.array(v.string()),
    decisionId: v.string(),
    patternId: v.optional(v.string()),
    correlationId: v.optional(v.string()),
    routingAttempts: v.optional(v.number()),
    createdAt: v.number(),
    processedAt: v.optional(v.number()),
    error: v.optional(v.string()),
  })
    .index("by_agentId_status", ["agentId", "status"])
    .index("by_agentId_createdAt", ["agentId", "createdAt"])
    .index("by_status", ["status", "createdAt"])
    .index("by_decisionId", ["decisionId"]),

  /**
   * Pending Approvals - human-in-loop approval workflow.
   *
   * Status flow: pending -> approved | rejected | expired
   */
  pendingApprovals: defineTable({
    approvalId: v.string(),
    agentId: v.string(),
    decisionId: v.string(),
    action: v.object({
      type: v.string(),
      payload: v.any(),
    }),
    confidence: v.number(),
    reason: v.string(),
    status: v.union(
      v.literal("pending"),
      v.literal("approved"),
      v.literal("rejected"),
      v.literal("expired")
    ),
    triggeringEventIds: v.array(v.string()),
    expiresAt: v.number(),
    reviewerId: v.optional(v.string()),
    reviewedAt: v.optional(v.number()),
    reviewNote: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_approvalId", ["approvalId"])
    .index("by_agentId_status", ["agentId", "status"])
    .index("by_status_expiresAt", ["status", "expiresAt"]),
});
