/**
 * Agent Audit Trail - Decision Tracking and Explainability
 *
 * Provides comprehensive audit trail for agent decisions and actions.
 * Enables:
 * - Full decision history for explainability
 * - Compliance and regulatory requirements
 * - Performance analysis and optimization
 * - Human review of agent behavior
 *
 * @module agent/audit
 */

import { z } from "zod";
import type { LLMContext } from "./types.js";

// ============================================================================
// Audit Event Types
// ============================================================================

/**
 * All possible agent audit event types.
 */
export const AGENT_AUDIT_EVENT_TYPES = [
  "AgentDecisionMade",
  "AgentActionApproved",
  "AgentActionRejected",
  "AgentActionExpired",
  "AgentAnalysisCompleted",
  "AgentAnalysisFailed",
] as const;

/**
 * Type of agent audit event.
 */
export type AgentAuditEventType = (typeof AGENT_AUDIT_EVENT_TYPES)[number];

// O(1) lookup Set for type guard performance
const AGENT_AUDIT_EVENT_TYPE_SET = new Set<string>(AGENT_AUDIT_EVENT_TYPES);

/**
 * Type guard to check if a value is a valid AgentAuditEventType.
 *
 * @param value - Value to check
 * @returns True if value is a valid AgentAuditEventType
 */
export function isAgentAuditEventType(value: unknown): value is AgentAuditEventType {
  return typeof value === "string" && AGENT_AUDIT_EVENT_TYPE_SET.has(value);
}

// ============================================================================
// Zod Schemas
// ============================================================================

/**
 * Schema for audit event type.
 */
export const AgentAuditEventTypeSchema = z.enum([
  "AgentDecisionMade",
  "AgentActionApproved",
  "AgentActionRejected",
  "AgentActionExpired",
  "AgentAnalysisCompleted",
  "AgentAnalysisFailed",
]);

/**
 * Schema for LLM context in audit events.
 */
export const AuditLLMContextSchema = z.object({
  /** Model used for analysis */
  model: z.string(),
  /** Total tokens used */
  tokens: z.number().int().nonnegative(),
  /** Duration in milliseconds */
  duration: z.number().int().nonnegative(),
});

/**
 * Schema for action details in decision audit.
 */
export const AuditActionSchema = z
  .object({
    /** Action/command type */
    type: z.string().min(1),
    /** Execution mode */
    executionMode: z.enum(["auto-execute", "flag-for-review"]),
  })
  .strict();

/**
 * Schema for AgentDecisionMade payload.
 */
export const AgentDecisionMadePayloadSchema = z.object({
  /** Pattern detected (null if no pattern) */
  patternDetected: z.string().nullable(),
  /** Confidence score (0-1) */
  confidence: z.number().min(0).max(1),
  /** Human-readable reasoning */
  reasoning: z.string(),
  /** Action to take (null if no action) */
  action: AuditActionSchema.nullable(),
  /** Event IDs that triggered this decision */
  triggeringEvents: z.array(z.string()),
  /** LLM call metadata */
  llmContext: AuditLLMContextSchema.optional(),
});

/**
 * Schema for AgentActionApproved payload.
 */
export const AgentActionApprovedPayloadSchema = z.object({
  /** ID of the action being approved */
  actionId: z.string().min(1),
  /** ID of the human reviewer */
  reviewerId: z.string().min(1),
  /** When the review occurred */
  reviewedAt: z.number(),
  /** Optional note from reviewer */
  reviewNote: z.string().optional(),
});

/**
 * Schema for AgentActionRejected payload.
 */
export const AgentActionRejectedPayloadSchema = z.object({
  /** ID of the action being rejected */
  actionId: z.string().min(1),
  /** ID of the human reviewer */
  reviewerId: z.string().min(1),
  /** Reason for rejection */
  rejectionReason: z.string(),
});

/**
 * Schema for AgentActionExpired payload.
 */
export const AgentActionExpiredPayloadSchema = z.object({
  /** ID of the expired action */
  actionId: z.string().min(1),
  /** When the action was originally requested */
  requestedAt: z.number(),
  /** When the action expired */
  expiredAt: z.number(),
});

/**
 * Schema for AgentAnalysisCompleted payload.
 */
export const AgentAnalysisCompletedPayloadSchema = z.object({
  /** Number of events analyzed */
  eventsAnalyzed: z.number().int().nonnegative(),
  /** Number of patterns detected */
  patternsDetected: z.number().int().nonnegative(),
  /** Analysis duration in milliseconds */
  durationMs: z.number().int().nonnegative(),
  /** LLM call metadata */
  llmContext: AuditLLMContextSchema.optional(),
});

/**
 * Schema for AgentAnalysisFailed payload.
 */
export const AgentAnalysisFailedPayloadSchema = z.object({
  /** Error message */
  error: z.string(),
  /** Error code if available */
  errorCode: z.string().optional(),
  /** Number of events that were being analyzed */
  eventsCount: z.number().int().nonnegative(),
});

/**
 * Schema for agent audit event.
 */
export const AgentAuditEventSchema = z.object({
  /** Type of audit event */
  eventType: AgentAuditEventTypeSchema,
  /** Agent BC identifier */
  agentId: z.string().min(1),
  /** Unique decision ID for correlation */
  decisionId: z.string().min(1),
  /** When the event occurred */
  timestamp: z.number(),
  /** Event-specific payload */
  payload: z.unknown(),
});

// ============================================================================
// TypeScript Types
// ============================================================================

/**
 * LLM context for audit purposes.
 */
export interface AuditLLMContext {
  /** Model used for analysis */
  readonly model: string;
  /** Total tokens used */
  readonly tokens: number;
  /** Duration in milliseconds */
  readonly duration: number;
}

/**
 * Action details in a decision audit.
 */
export interface AuditAction {
  /** Action/command type */
  readonly type: string;
  /** Execution mode */
  readonly executionMode: "auto-execute" | "flag-for-review";
}

/**
 * Payload for AgentDecisionMade audit event.
 */
export interface AgentDecisionMadePayload {
  /** Pattern detected (null if no pattern) */
  readonly patternDetected: string | null;
  /** Confidence score (0-1) */
  readonly confidence: number;
  /** Human-readable reasoning */
  readonly reasoning: string;
  /** Action to take (null if no action) */
  readonly action: AuditAction | null;
  /** Event IDs that triggered this decision */
  readonly triggeringEvents: readonly string[];
  /** LLM call metadata */
  readonly llmContext?: AuditLLMContext;
}

/**
 * Payload for AgentActionApproved audit event.
 */
export interface AgentActionApprovedPayload {
  /** ID of the action being approved */
  readonly actionId: string;
  /** ID of the human reviewer */
  readonly reviewerId: string;
  /** When the review occurred */
  readonly reviewedAt: number;
  /** Optional note from reviewer */
  readonly reviewNote?: string;
}

/**
 * Payload for AgentActionRejected audit event.
 */
export interface AgentActionRejectedPayload {
  /** ID of the action being rejected */
  readonly actionId: string;
  /** ID of the human reviewer */
  readonly reviewerId: string;
  /** Reason for rejection */
  readonly rejectionReason: string;
}

/**
 * Payload for AgentActionExpired audit event.
 */
export interface AgentActionExpiredPayload {
  /** ID of the expired action */
  readonly actionId: string;
  /** When the action was originally requested */
  readonly requestedAt: number;
  /** When the action expired */
  readonly expiredAt: number;
}

/**
 * Payload for AgentAnalysisCompleted audit event.
 */
export interface AgentAnalysisCompletedPayload {
  /** Number of events analyzed */
  readonly eventsAnalyzed: number;
  /** Number of patterns detected */
  readonly patternsDetected: number;
  /** Analysis duration in milliseconds */
  readonly durationMs: number;
  /** LLM call metadata */
  readonly llmContext?: AuditLLMContext;
}

/**
 * Payload for AgentAnalysisFailed audit event.
 */
export interface AgentAnalysisFailedPayload {
  /** Error message */
  readonly error: string;
  /** Error code if available */
  readonly errorCode?: string;
  /** Number of events that were being analyzed */
  readonly eventsCount: number;
}

/**
 * Base agent audit event structure.
 */
export interface AgentAuditEventBase {
  /** Type of audit event */
  readonly eventType: AgentAuditEventType;
  /** Agent BC identifier */
  readonly agentId: string;
  /** Unique decision ID for correlation */
  readonly decisionId: string;
  /** When the event occurred */
  readonly timestamp: number;
}

/**
 * Agent audit event with typed payload.
 */
export type AgentAuditEvent =
  | (AgentAuditEventBase & {
      readonly eventType: "AgentDecisionMade";
      readonly payload: AgentDecisionMadePayload;
    })
  | (AgentAuditEventBase & {
      readonly eventType: "AgentActionApproved";
      readonly payload: AgentActionApprovedPayload;
    })
  | (AgentAuditEventBase & {
      readonly eventType: "AgentActionRejected";
      readonly payload: AgentActionRejectedPayload;
    })
  | (AgentAuditEventBase & {
      readonly eventType: "AgentActionExpired";
      readonly payload: AgentActionExpiredPayload;
    })
  | (AgentAuditEventBase & {
      readonly eventType: "AgentAnalysisCompleted";
      readonly payload: AgentAnalysisCompletedPayload;
    })
  | (AgentAuditEventBase & {
      readonly eventType: "AgentAnalysisFailed";
      readonly payload: AgentAnalysisFailedPayload;
    });

// ============================================================================
// Decision ID Generation
// ============================================================================

/**
 * Generate a unique decision ID.
 *
 * Uses timestamp + random suffix for uniqueness.
 * Format: `dec_{timestamp}_{random}`
 *
 * @returns Unique decision ID
 *
 * @example
 * ```typescript
 * const decisionId = generateDecisionId();
 * // "dec_1699567890123_a1b2c3"
 * ```
 */
export function generateDecisionId(): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);
  return `dec_${timestamp}_${random}`;
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create an AgentDecisionMade audit event.
 *
 * Records a decision made by the agent, including the pattern detected,
 * confidence, reasoning, and action to take.
 *
 * @param agentId - Agent BC identifier
 * @param decision - Decision details
 * @param llmContext - Optional LLM call metadata
 * @returns AgentDecisionMade audit event
 *
 * @example
 * ```typescript
 * const audit = createAgentDecisionAudit(
 *   "churn-risk-agent",
 *   {
 *     patternDetected: "churn-risk",
 *     confidence: 0.85,
 *     reasoning: "Customer cancelled 3 orders in 30 days",
 *     action: { type: "SuggestOutreach", executionMode: "flag-for-review" },
 *     triggeringEvents: ["evt-1", "evt-2", "evt-3"],
 *   },
 *   { model: "gpt-4", tokens: 1500, duration: 2500 }
 * );
 * ```
 */
export function createAgentDecisionAudit(
  agentId: string,
  decision: {
    patternDetected: string | null;
    confidence: number;
    reasoning: string;
    action: AuditAction | null;
    triggeringEvents: readonly string[];
  },
  llmContext?: LLMContext
): AgentAuditEvent {
  const payload: AgentDecisionMadePayload = {
    patternDetected: decision.patternDetected,
    confidence: decision.confidence,
    reasoning: decision.reasoning,
    action: decision.action,
    triggeringEvents: decision.triggeringEvents,
  };

  // Only add llmContext if provided
  if (llmContext !== undefined) {
    return {
      eventType: "AgentDecisionMade",
      agentId,
      decisionId: generateDecisionId(),
      timestamp: Date.now(),
      payload: {
        ...payload,
        llmContext: {
          model: llmContext.model,
          tokens: llmContext.tokens,
          duration: llmContext.durationMs,
        },
      },
    };
  }

  return {
    eventType: "AgentDecisionMade",
    agentId,
    decisionId: generateDecisionId(),
    timestamp: Date.now(),
    payload,
  };
}

/**
 * Create an AgentActionApproved audit event.
 *
 * Records when a human reviewer approves an agent action.
 *
 * @param agentId - Agent BC identifier
 * @param actionId - ID of the approved action
 * @param reviewerId - ID of the human reviewer
 * @param reviewNote - Optional note from reviewer
 * @returns AgentActionApproved audit event
 *
 * @example
 * ```typescript
 * const audit = createAgentActionApprovedAudit(
 *   "churn-risk-agent",
 *   "action-123",
 *   "user-456",
 *   "Verified customer is indeed at risk"
 * );
 * ```
 */
export function createAgentActionApprovedAudit(
  agentId: string,
  actionId: string,
  reviewerId: string,
  reviewNote?: string
): AgentAuditEvent {
  const now = Date.now();
  const payload: AgentActionApprovedPayload = {
    actionId,
    reviewerId,
    reviewedAt: now,
  };

  if (reviewNote !== undefined) {
    return {
      eventType: "AgentActionApproved",
      agentId,
      decisionId: generateDecisionId(),
      timestamp: now,
      payload: { ...payload, reviewNote },
    };
  }

  return {
    eventType: "AgentActionApproved",
    agentId,
    decisionId: generateDecisionId(),
    timestamp: now,
    payload,
  };
}

/**
 * Create an AgentActionRejected audit event.
 *
 * Records when a human reviewer rejects an agent action.
 *
 * @param agentId - Agent BC identifier
 * @param actionId - ID of the rejected action
 * @param reviewerId - ID of the human reviewer
 * @param rejectionReason - Reason for rejection
 * @returns AgentActionRejected audit event
 *
 * @example
 * ```typescript
 * const audit = createAgentActionRejectedAudit(
 *   "churn-risk-agent",
 *   "action-123",
 *   "user-456",
 *   "Customer already contacted by support team"
 * );
 * ```
 */
export function createAgentActionRejectedAudit(
  agentId: string,
  actionId: string,
  reviewerId: string,
  rejectionReason: string
): AgentAuditEvent {
  return {
    eventType: "AgentActionRejected",
    agentId,
    decisionId: generateDecisionId(),
    timestamp: Date.now(),
    payload: {
      actionId,
      reviewerId,
      rejectionReason,
    },
  };
}

/**
 * Create an AgentActionExpired audit event.
 *
 * Records when an agent action expires without approval/rejection.
 *
 * @param agentId - Agent BC identifier
 * @param actionId - ID of the expired action
 * @param requestedAt - When the action was originally requested
 * @returns AgentActionExpired audit event
 *
 * @example
 * ```typescript
 * const audit = createAgentActionExpiredAudit(
 *   "churn-risk-agent",
 *   "action-123",
 *   Date.now() - 86400000 // 24 hours ago
 * );
 * ```
 */
export function createAgentActionExpiredAudit(
  agentId: string,
  actionId: string,
  requestedAt: number
): AgentAuditEvent {
  return {
    eventType: "AgentActionExpired",
    agentId,
    decisionId: generateDecisionId(),
    timestamp: Date.now(),
    payload: {
      actionId,
      requestedAt,
      expiredAt: Date.now(),
    },
  };
}

/**
 * Create an AgentAnalysisCompleted audit event.
 *
 * Records successful completion of event analysis.
 *
 * @param agentId - Agent BC identifier
 * @param analysis - Analysis details
 * @param llmContext - Optional LLM call metadata
 * @returns AgentAnalysisCompleted audit event
 */
export function createAgentAnalysisCompletedAudit(
  agentId: string,
  analysis: {
    eventsAnalyzed: number;
    patternsDetected: number;
    durationMs: number;
  },
  llmContext?: LLMContext
): AgentAuditEvent {
  const payload: AgentAnalysisCompletedPayload = {
    eventsAnalyzed: analysis.eventsAnalyzed,
    patternsDetected: analysis.patternsDetected,
    durationMs: analysis.durationMs,
  };

  if (llmContext !== undefined) {
    return {
      eventType: "AgentAnalysisCompleted",
      agentId,
      decisionId: generateDecisionId(),
      timestamp: Date.now(),
      payload: {
        ...payload,
        llmContext: {
          model: llmContext.model,
          tokens: llmContext.tokens,
          duration: llmContext.durationMs,
        },
      },
    };
  }

  return {
    eventType: "AgentAnalysisCompleted",
    agentId,
    decisionId: generateDecisionId(),
    timestamp: Date.now(),
    payload,
  };
}

/**
 * Create an AgentAnalysisFailed audit event.
 *
 * Records when event analysis fails.
 *
 * @param agentId - Agent BC identifier
 * @param error - Error message
 * @param eventsCount - Number of events that were being analyzed
 * @param errorCode - Optional error code
 * @returns AgentAnalysisFailed audit event
 */
export function createAgentAnalysisFailedAudit(
  agentId: string,
  error: string,
  eventsCount: number,
  errorCode?: string
): AgentAuditEvent {
  const payload: AgentAnalysisFailedPayload = {
    error,
    eventsCount,
  };

  if (errorCode !== undefined) {
    return {
      eventType: "AgentAnalysisFailed",
      agentId,
      decisionId: generateDecisionId(),
      timestamp: Date.now(),
      payload: { ...payload, errorCode },
    };
  }

  return {
    eventType: "AgentAnalysisFailed",
    agentId,
    decisionId: generateDecisionId(),
    timestamp: Date.now(),
    payload,
  };
}

// ============================================================================
// Type Guards
// ============================================================================

/**
 * Check if an audit event is a decision event.
 *
 * @param event - Audit event to check
 * @returns true if event is AgentDecisionMade
 */
export function isDecisionAuditEvent(
  event: AgentAuditEvent
): event is AgentAuditEvent & { eventType: "AgentDecisionMade" } {
  return event.eventType === "AgentDecisionMade";
}

/**
 * Check if an audit event is an approval event.
 *
 * @param event - Audit event to check
 * @returns true if event is AgentActionApproved
 */
export function isApprovalAuditEvent(
  event: AgentAuditEvent
): event is AgentAuditEvent & { eventType: "AgentActionApproved" } {
  return event.eventType === "AgentActionApproved";
}

/**
 * Check if an audit event is a rejection event.
 *
 * @param event - Audit event to check
 * @returns true if event is AgentActionRejected
 */
export function isRejectionAuditEvent(
  event: AgentAuditEvent
): event is AgentAuditEvent & { eventType: "AgentActionRejected" } {
  return event.eventType === "AgentActionRejected";
}

// ============================================================================
// Validation
// ============================================================================

/**
 * Validate an agent audit event.
 *
 * @param event - Event to validate
 * @returns true if valid
 */
export function validateAgentAuditEvent(event: unknown): boolean {
  const result = AgentAuditEventSchema.safeParse(event);
  return result.success;
}

// ============================================================================
// Type Inference Helpers
// ============================================================================

/**
 * Type inferred from AgentAuditEventTypeSchema.
 */
export type AgentAuditEventTypeSchemaType = z.infer<typeof AgentAuditEventTypeSchema>;

/**
 * Type inferred from AgentDecisionMadePayloadSchema.
 */
export type AgentDecisionMadePayloadSchemaType = z.infer<typeof AgentDecisionMadePayloadSchema>;

/**
 * Type inferred from AgentActionApprovedPayloadSchema.
 */
export type AgentActionApprovedPayloadSchemaType = z.infer<typeof AgentActionApprovedPayloadSchema>;

/**
 * Type inferred from AgentActionRejectedPayloadSchema.
 */
export type AgentActionRejectedPayloadSchemaType = z.infer<typeof AgentActionRejectedPayloadSchema>;

/**
 * Type inferred from AgentActionExpiredPayloadSchema.
 */
export type AgentActionExpiredPayloadSchemaType = z.infer<typeof AgentActionExpiredPayloadSchema>;

/**
 * Type inferred from AuditLLMContextSchema.
 */
export type AuditLLMContextSchemaType = z.infer<typeof AuditLLMContextSchema>;

/**
 * Type inferred from AuditActionSchema.
 */
export type AuditActionSchemaType = z.infer<typeof AuditActionSchema>;
