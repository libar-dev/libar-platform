/**
 * @target platform-core/src/agent/component/schema.ts
 *
 * Agent Component Schema
 *
 * Isolated database for all agent-specific state. These tables are
 * private to the component and accessible only through public API handlers.
 *
 * Tables match the current app-level definitions (schema.ts:610-858).
 * During implementation, agent tables move from the shared app schema
 * to this isolated component schema.
 *
 * @libar-docs
 * @libar-docs-status roadmap
 * @libar-docs-infra
 * @libar-docs-used-by AgentCheckpoint, AgentAuditEvent, AgentDeadLetter, AgentCommand, PendingApproval
 *
 * @see DESIGN-2026-005 AD-5 (Schema Strategy, historical)
 */
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

/**
 * All valid agent audit event types across design sessions.
 * DS-1: 8 base types, DS-4: 2 routing types, DS-5: 6 lifecycle types.
 */
export const AGENT_AUDIT_EVENT_TYPES = [
  // DS-1 base
  "PatternDetected",
  "CommandEmitted",
  "ApprovalRequested",
  "ApprovalGranted",
  "ApprovalRejected",
  "ApprovalExpired",
  "DeadLetterRecorded",
  "CheckpointUpdated",
  // DS-4 command routing
  "AgentCommandRouted",
  "AgentCommandRoutingFailed",
  // DS-5 lifecycle
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
   *
   * @since Phase 22 (AgentAsBoundedContext)
   */
  agentCheckpoints: defineTable({
    /** Agent BC identifier (e.g., "churn-risk-agent") */
    agentId: v.string(),

    /** Subscription instance ID */
    subscriptionId: v.string(),

    /** Last processed global position (-1 = none processed) */
    lastProcessedPosition: v.number(),

    /** Last processed event ID */
    lastEventId: v.string(),

    // Status includes "error_recovery" (4th state). See checkpoint-status-extension.ts (DS-5).
    // Production checkpoint.ts AGENT_CHECKPOINT_STATUSES must be updated from 3→4 states at DS-1 implementation.
    /** Checkpoint status: active, paused, stopped, error_recovery (DS-5 FSM) */
    status: v.union(
      v.literal("active"),
      v.literal("paused"),
      v.literal("stopped"),
      v.literal("error_recovery")
    ),

    /** Total events processed by this agent */
    eventsProcessed: v.number(),

    /** Last checkpoint update timestamp */
    updatedAt: v.number(),

    /**
     * Runtime config overrides (DS-5, PDR-013 AD-5).
     * Forward-declared here to avoid schema migration when DS-5 is implemented.
     * Stores partial AgentBCConfig overrides applied via ReconfigureAgent command.
     * Merged with base AgentBCConfig at handler invocation time.
     */
    configOverrides: v.optional(v.any()),
  })
    .index("by_agentId", ["agentId"])
    // NEW: Added for O(1) checkpoint lookup by (agentId, subscriptionId) pair.
    // Current app schema only has by_agentId which requires post-query filtering.
    .index("by_agentId_subscriptionId", ["agentId", "subscriptionId"])
    .index("by_status", ["status", "updatedAt"]),

  /**
   * Agent Audit Events - decision tracking for explainability.
   * Records all agent decisions, approvals, and rejections.
   *
   * @since Phase 22 (AgentAsBoundedContext)
   */
  agentAuditEvents: defineTable({
    /**
     * Audit event type — all types declared from day one to avoid schema migration.
     * Uses AGENT_AUDIT_EVENT_TYPES constant for single source of truth.
     */
    eventType: v.union(...AGENT_AUDIT_EVENT_TYPES.map((t) => v.literal(t))) as ReturnType<
      typeof v.union
    >,

    /** Agent BC identifier */
    agentId: v.string(),

    /** Unique decision ID for correlation */
    decisionId: v.string(),

    /** When the event occurred */
    timestamp: v.number(),

    /** Event-specific payload (varies by eventType) */
    payload: v.any(),
  })
    .index("by_agentId_timestamp", ["agentId", "timestamp"])
    .index("by_decisionId", ["decisionId"])
    .index("by_eventType", ["eventType", "timestamp"]),

  /**
   * Agent Dead Letters - failed event processing.
   * Separate from projection dead letters due to different semantics.
   *
   * Status flow:
   * - pending: Initial state after failure
   * - replayed: Successfully re-processed
   * - ignored: Manually marked as not requiring replay
   *
   * @since Phase 22 (AgentAsBoundedContext)
   */
  agentDeadLetters: defineTable({
    /** Agent BC identifier */
    agentId: v.string(),

    /** Subscription instance ID */
    subscriptionId: v.string(),

    /** ID of the event that failed processing */
    eventId: v.string(),

    /** Global position of the failed event */
    globalPosition: v.number(),

    /** Sanitized error message */
    error: v.string(),

    /** Number of processing attempts */
    attemptCount: v.number(),

    /** Dead letter status */
    status: v.union(v.literal("pending"), v.literal("replayed"), v.literal("ignored")),

    /** When the failure occurred */
    failedAt: v.number(),

    /** Workpool work ID for debugging */
    workId: v.optional(v.string()),

    /** Optional context for debugging */
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
   *
   * @since Phase 22 (AgentAsBoundedContext)
   */
  agentCommands: defineTable({
    /** Agent BC identifier */
    agentId: v.string(),

    /** Command type (e.g., "SuggestCustomerOutreach") */
    type: v.string(),

    /** Command payload data */
    payload: v.any(),

    /** Command processing status */
    status: v.union(
      v.literal("pending"),
      v.literal("processing"),
      v.literal("completed"),
      v.literal("failed")
    ),

    /** Confidence score (0-1) */
    confidence: v.number(),

    /** Human-readable explanation */
    reason: v.string(),

    /** Event IDs that triggered this command */
    triggeringEventIds: v.array(v.string()),

    /** Unique decision ID for correlation */
    decisionId: v.string(),

    /** Optional pattern ID that detected this */
    patternId: v.optional(v.string()),

    /** Optional correlation ID for tracing */
    correlationId: v.optional(v.string()),

    /** Number of routing attempts (DS-4 sweep recovery) */
    routingAttempts: v.optional(v.number()),

    /** When the command was created */
    createdAt: v.number(),

    /** When the command was processed (if processed) */
    processedAt: v.optional(v.number()),

    /** Error message if command failed */
    error: v.optional(v.string()),
  })
    .index("by_agentId_status", ["agentId", "status"])
    .index("by_agentId_createdAt", ["agentId", "createdAt"])
    .index("by_status", ["status", "createdAt"])
    .index("by_decisionId", ["decisionId"]),

  /**
   * Pending Approvals - human-in-loop approval workflow.
   *
   * Status flow:
   * - pending: Awaiting human review
   * - approved: Human approved, command will be emitted
   * - rejected: Human rejected, action will not be taken
   * - expired: Approval window expired without decision
   *
   * @since Phase 22.4 (AgentAsBoundedContext - Approval Workflow)
   */
  pendingApprovals: defineTable({
    /** Unique approval request ID */
    approvalId: v.string(),

    /** Agent BC identifier */
    agentId: v.string(),

    /** Decision ID for correlation with audit events */
    decisionId: v.string(),

    /** Action awaiting approval */
    action: v.object({
      /** Action/command type */
      type: v.string(),
      /** Action payload */
      payload: v.any(),
    }),

    /** Confidence score that triggered the review (0-1) */
    confidence: v.number(),

    /** Reason for the action */
    reason: v.string(),

    /** Current approval status */
    status: v.union(
      v.literal("pending"),
      v.literal("approved"),
      v.literal("rejected"),
      v.literal("expired")
    ),

    /** Event IDs that triggered this approval request */
    triggeringEventIds: v.array(v.string()),

    /** When the approval expires */
    expiresAt: v.number(),

    /** ID of the reviewer (if reviewed) */
    reviewerId: v.optional(v.string()),

    /** When the review occurred (if reviewed) */
    reviewedAt: v.optional(v.number()),

    /** Note from reviewer (if any) */
    reviewNote: v.optional(v.string()),

    /** When the approval was created */
    createdAt: v.number(),
  })
    .index("by_approvalId", ["approvalId"])
    .index("by_agentId_status", ["agentId", "status"])
    .index("by_status_expiresAt", ["status", "expiresAt"]),
});
