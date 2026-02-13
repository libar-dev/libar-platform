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
import { v7 as uuidv7 } from "uuid";
import type { LLMContext } from "./types.js";
import type { AgentLifecycleState } from "./lifecycle-fsm.js";
import type { AgentConfigOverrides } from "./lifecycle-commands.js";

// ============================================================================
// Audit Event Types
// ============================================================================

/**
 * All possible agent audit event types.
 *
 * DS-1 base (8): Core pattern detection and approval workflow events.
 * DS-4 command routing (2): Command routing lifecycle events.
 * DS-5 lifecycle (6): Agent lifecycle management events.
 */
export const AGENT_AUDIT_EVENT_TYPES = [
  // DS-1 base (8)
  "PatternDetected",
  "CommandEmitted",
  "ApprovalRequested",
  "ApprovalGranted",
  "ApprovalRejected",
  "ApprovalExpired",
  "DeadLetterRecorded",
  "CheckpointUpdated",
  // DS-4 command routing (2)
  "AgentCommandRouted",
  "AgentCommandRoutingFailed",
  // DS-5 lifecycle (6)
  "AgentStarted",
  "AgentPaused",
  "AgentResumed",
  "AgentStopped",
  "AgentReconfigured",
  "AgentErrorRecoveryStarted",
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
  // DS-1 base (8)
  "PatternDetected",
  "CommandEmitted",
  "ApprovalRequested",
  "ApprovalGranted",
  "ApprovalRejected",
  "ApprovalExpired",
  "DeadLetterRecorded",
  "CheckpointUpdated",
  // DS-4 command routing (2)
  "AgentCommandRouted",
  "AgentCommandRoutingFailed",
  // DS-5 lifecycle (6)
  "AgentStarted",
  "AgentPaused",
  "AgentResumed",
  "AgentStopped",
  "AgentReconfigured",
  "AgentErrorRecoveryStarted",
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
 * Schema for PatternDetected payload.
 */
export const PatternDetectedPayloadSchema = z.object({
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
 * Schema for ApprovalGranted payload.
 */
export const ApprovalGrantedPayloadSchema = z.object({
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
 * Schema for ApprovalRejected payload.
 */
export const ApprovalRejectedPayloadSchema = z.object({
  /** ID of the action being rejected */
  actionId: z.string().min(1),
  /** ID of the human reviewer */
  reviewerId: z.string().min(1),
  /** Reason for rejection */
  rejectionReason: z.string(),
});

/**
 * Schema for ApprovalExpired payload.
 */
export const ApprovalExpiredPayloadSchema = z.object({
  /** ID of the expired action */
  actionId: z.string().min(1),
  /** When the action was originally requested */
  requestedAt: z.number(),
  /** When the action expired */
  expiredAt: z.number(),
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
 * Payload for PatternDetected audit event.
 */
export interface PatternDetectedPayload {
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
 * Payload for ApprovalGranted audit event.
 */
export interface ApprovalGrantedPayload {
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
 * Payload for ApprovalRejected audit event.
 */
export interface ApprovalRejectedPayload {
  /** ID of the action being rejected */
  readonly actionId: string;
  /** ID of the human reviewer */
  readonly reviewerId: string;
  /** Reason for rejection */
  readonly rejectionReason: string;
}

/**
 * Payload for ApprovalExpired audit event.
 */
export interface ApprovalExpiredPayload {
  /** ID of the expired action */
  readonly actionId: string;
  /** When the action was originally requested */
  readonly requestedAt: number;
  /** When the action expired */
  readonly expiredAt: number;
}

// ============================================================================
// Lifecycle Audit Payloads
// ============================================================================

/**
 * Payload for AgentStarted audit event.
 */
export interface AgentStartedPayload {
  /** State the agent was in before starting (always "stopped") */
  readonly previousState: "stopped";
  /** Correlation ID for tracing */
  readonly correlationId: string;
  /** Position the agent will resume from */
  readonly resumeFromPosition: number;
}

/**
 * Payload for AgentPaused audit event.
 */
export interface AgentPausedPayload {
  /** Optional reason for pausing */
  readonly reason?: string;
  /** Correlation ID for tracing */
  readonly correlationId: string;
  /** Event position at which the agent was paused */
  readonly pausedAtPosition: number;
  /** Total events processed at the time of pause */
  readonly eventsProcessedAtPause: number;
}

/**
 * Payload for AgentResumed audit event.
 */
export interface AgentResumedPayload {
  /** Position the agent will resume from */
  readonly resumeFromPosition: number;
  /** Correlation ID for tracing */
  readonly correlationId: string;
}

/**
 * Payload for AgentStopped audit event.
 */
export interface AgentStoppedPayload {
  /** State the agent was in before being stopped */
  readonly previousState: AgentLifecycleState;
  /** Optional reason for stopping */
  readonly reason?: string;
  /** Correlation ID for tracing */
  readonly correlationId: string;
  /** Event position at which the agent was stopped */
  readonly stoppedAtPosition: number;
}

/**
 * Payload for AgentReconfigured audit event.
 */
export interface AgentReconfiguredPayload {
  /** State the agent was in when reconfigured */
  readonly previousState: AgentLifecycleState;
  /** Previous configuration overrides (if any) */
  readonly previousOverrides?: AgentConfigOverrides;
  /** New configuration overrides being applied */
  readonly newOverrides: AgentConfigOverrides;
  /** Correlation ID for tracing */
  readonly correlationId: string;
}

/**
 * Payload for AgentErrorRecoveryStarted audit event.
 */
export interface AgentErrorRecoveryStartedPayload {
  /** Number of consecutive failures */
  readonly failureCount: number;
  /** Description of the last error */
  readonly lastError: string;
  /** Cooldown period in milliseconds before retry */
  readonly cooldownMs: number;
  /** Correlation ID for tracing */
  readonly correlationId: string;
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
 *
 * Only events with structured payloads have typed variants.
 * Remaining audit event types use the generic payload (z.unknown).
 */
export type AgentAuditEvent =
  | (AgentAuditEventBase & {
      readonly eventType: "PatternDetected";
      readonly payload: PatternDetectedPayload;
    })
  | (AgentAuditEventBase & {
      readonly eventType: "ApprovalGranted";
      readonly payload: ApprovalGrantedPayload;
    })
  | (AgentAuditEventBase & {
      readonly eventType: "ApprovalRejected";
      readonly payload: ApprovalRejectedPayload;
    })
  | (AgentAuditEventBase & {
      readonly eventType: "ApprovalExpired";
      readonly payload: ApprovalExpiredPayload;
    })
  | (AgentAuditEventBase & {
      readonly eventType: Exclude<
        AgentAuditEventType,
        "PatternDetected" | "ApprovalGranted" | "ApprovalRejected" | "ApprovalExpired"
      >;
      readonly payload: unknown;
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
  const random = uuidv7().slice(0, 8);
  return `dec_${timestamp}_${random}`;
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create a PatternDetected audit event.
 *
 * Records a pattern detected by the agent, including the pattern name,
 * confidence, reasoning, and action to take.
 *
 * @param agentId - Agent BC identifier
 * @param decision - Decision details
 * @param llmContext - Optional LLM call metadata
 * @returns PatternDetected audit event
 *
 * @example
 * ```typescript
 * const audit = createPatternDetectedAudit(
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
export function createPatternDetectedAudit(
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
  const payload: PatternDetectedPayload = {
    patternDetected: decision.patternDetected,
    confidence: decision.confidence,
    reasoning: decision.reasoning,
    action: decision.action,
    triggeringEvents: decision.triggeringEvents,
  };

  // Only add llmContext if provided
  if (llmContext !== undefined) {
    return {
      eventType: "PatternDetected",
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
    eventType: "PatternDetected",
    agentId,
    decisionId: generateDecisionId(),
    timestamp: Date.now(),
    payload,
  };
}

/**
 * Create an ApprovalGranted audit event.
 *
 * Records when a human reviewer approves an agent action.
 *
 * @param agentId - Agent BC identifier
 * @param actionId - ID of the approved action
 * @param reviewerId - ID of the human reviewer
 * @param reviewNote - Optional note from reviewer
 * @returns ApprovalGranted audit event
 *
 * @example
 * ```typescript
 * const audit = createApprovalGrantedAudit(
 *   "churn-risk-agent",
 *   "action-123",
 *   "user-456",
 *   "Verified customer is indeed at risk"
 * );
 * ```
 */
export function createApprovalGrantedAudit(
  agentId: string,
  actionId: string,
  reviewerId: string,
  reviewNote?: string
): AgentAuditEvent {
  const now = Date.now();
  const payload: ApprovalGrantedPayload = {
    actionId,
    reviewerId,
    reviewedAt: now,
  };

  if (reviewNote !== undefined) {
    return {
      eventType: "ApprovalGranted",
      agentId,
      decisionId: generateDecisionId(),
      timestamp: now,
      payload: { ...payload, reviewNote },
    };
  }

  return {
    eventType: "ApprovalGranted",
    agentId,
    decisionId: generateDecisionId(),
    timestamp: now,
    payload,
  };
}

/**
 * Create an ApprovalRejected audit event.
 *
 * Records when a human reviewer rejects an agent action.
 *
 * @param agentId - Agent BC identifier
 * @param actionId - ID of the rejected action
 * @param reviewerId - ID of the human reviewer
 * @param rejectionReason - Reason for rejection
 * @returns ApprovalRejected audit event
 *
 * @example
 * ```typescript
 * const audit = createApprovalRejectedAudit(
 *   "churn-risk-agent",
 *   "action-123",
 *   "user-456",
 *   "Customer already contacted by support team"
 * );
 * ```
 */
export function createApprovalRejectedAudit(
  agentId: string,
  actionId: string,
  reviewerId: string,
  rejectionReason: string
): AgentAuditEvent {
  return {
    eventType: "ApprovalRejected",
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
 * Create an ApprovalExpired audit event.
 *
 * Records when an agent action expires without approval/rejection.
 *
 * @param agentId - Agent BC identifier
 * @param actionId - ID of the expired action
 * @param requestedAt - When the action was originally requested
 * @returns ApprovalExpired audit event
 *
 * @example
 * ```typescript
 * const audit = createApprovalExpiredAudit(
 *   "churn-risk-agent",
 *   "action-123",
 *   Date.now() - 86400000 // 24 hours ago
 * );
 * ```
 */
export function createApprovalExpiredAudit(
  agentId: string,
  actionId: string,
  requestedAt: number
): AgentAuditEvent {
  return {
    eventType: "ApprovalExpired",
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
 * Create a generic agent audit event.
 *
 * Used for audit event types that do not have a structured payload schema
 * (e.g., CommandEmitted, DeadLetterRecorded, CheckpointUpdated, lifecycle events).
 *
 * @param agentId - Agent BC identifier
 * @param eventType - The audit event type
 * @param payload - Event-specific payload (untyped)
 * @returns Agent audit event
 */
export function createGenericAuditEvent(
  agentId: string,
  eventType: Exclude<
    AgentAuditEventType,
    "PatternDetected" | "ApprovalGranted" | "ApprovalRejected" | "ApprovalExpired"
  >,
  payload: unknown = {}
): AgentAuditEvent {
  return {
    eventType,
    agentId,
    decisionId: generateDecisionId(),
    timestamp: Date.now(),
    payload,
  };
}

// ============================================================================
// Lifecycle Decision ID Generation
// ============================================================================

/**
 * Generate a unique decision ID for lifecycle audit events.
 *
 * Format: `lifecycle_{agentId}_{timestamp}_{random}`
 *
 * @param agentId - Agent identifier to include in the decision ID
 * @param timestamp - Optional timestamp (defaults to Date.now())
 * @returns Unique lifecycle decision ID
 */
export function createLifecycleDecisionId(agentId: string, timestamp?: number): string {
  const ts = timestamp ?? Date.now();
  const suffix = uuidv7().slice(0, 8);
  return `lifecycle_${agentId}_${ts}_${suffix}`;
}

// ============================================================================
// Lifecycle Audit Factory Functions
// ============================================================================

/**
 * Create an AgentStarted audit event.
 *
 * @param agentId - Agent BC identifier
 * @param payload - Started event payload
 * @returns AgentStarted audit event
 */
export function createAgentStartedAudit(
  agentId: string,
  payload: AgentStartedPayload
): AgentAuditEvent {
  return {
    eventType: "AgentStarted",
    agentId,
    decisionId: createLifecycleDecisionId(agentId),
    timestamp: Date.now(),
    payload,
  };
}

/**
 * Create an AgentPaused audit event.
 *
 * @param agentId - Agent BC identifier
 * @param payload - Paused event payload
 * @returns AgentPaused audit event
 */
export function createAgentPausedAudit(
  agentId: string,
  payload: AgentPausedPayload
): AgentAuditEvent {
  return {
    eventType: "AgentPaused",
    agentId,
    decisionId: createLifecycleDecisionId(agentId),
    timestamp: Date.now(),
    payload,
  };
}

/**
 * Create an AgentResumed audit event.
 *
 * @param agentId - Agent BC identifier
 * @param payload - Resumed event payload
 * @returns AgentResumed audit event
 */
export function createAgentResumedAudit(
  agentId: string,
  payload: AgentResumedPayload
): AgentAuditEvent {
  return {
    eventType: "AgentResumed",
    agentId,
    decisionId: createLifecycleDecisionId(agentId),
    timestamp: Date.now(),
    payload,
  };
}

/**
 * Create an AgentStopped audit event.
 *
 * @param agentId - Agent BC identifier
 * @param payload - Stopped event payload
 * @returns AgentStopped audit event
 */
export function createAgentStoppedAudit(
  agentId: string,
  payload: AgentStoppedPayload
): AgentAuditEvent {
  return {
    eventType: "AgentStopped",
    agentId,
    decisionId: createLifecycleDecisionId(agentId),
    timestamp: Date.now(),
    payload,
  };
}

/**
 * Create an AgentReconfigured audit event.
 *
 * @param agentId - Agent BC identifier
 * @param payload - Reconfigured event payload
 * @returns AgentReconfigured audit event
 */
export function createAgentReconfiguredAudit(
  agentId: string,
  payload: AgentReconfiguredPayload
): AgentAuditEvent {
  return {
    eventType: "AgentReconfigured",
    agentId,
    decisionId: createLifecycleDecisionId(agentId),
    timestamp: Date.now(),
    payload,
  };
}

/**
 * Create an AgentErrorRecoveryStarted audit event.
 *
 * @param agentId - Agent BC identifier
 * @param payload - Error recovery started event payload
 * @returns AgentErrorRecoveryStarted audit event
 */
export function createAgentErrorRecoveryStartedAudit(
  agentId: string,
  payload: AgentErrorRecoveryStartedPayload
): AgentAuditEvent {
  return {
    eventType: "AgentErrorRecoveryStarted",
    agentId,
    decisionId: createLifecycleDecisionId(agentId),
    timestamp: Date.now(),
    payload,
  };
}

// ============================================================================
// Type Guards
// ============================================================================

/**
 * Check if an audit event is a pattern detected event.
 *
 * @param event - Audit event to check
 * @returns true if event is PatternDetected
 */
export function isPatternDetectedEvent(
  event: AgentAuditEvent
): event is AgentAuditEvent & { eventType: "PatternDetected" } {
  return event.eventType === "PatternDetected";
}

/**
 * Check if an audit event is an approval granted event.
 *
 * @param event - Audit event to check
 * @returns true if event is ApprovalGranted
 */
export function isApprovalGrantedEvent(
  event: AgentAuditEvent
): event is AgentAuditEvent & { eventType: "ApprovalGranted" } {
  return event.eventType === "ApprovalGranted";
}

/**
 * Check if an audit event is an approval rejected event.
 *
 * @param event - Audit event to check
 * @returns true if event is ApprovalRejected
 */
export function isApprovalRejectedEvent(
  event: AgentAuditEvent
): event is AgentAuditEvent & { eventType: "ApprovalRejected" } {
  return event.eventType === "ApprovalRejected";
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
 * Type inferred from PatternDetectedPayloadSchema.
 */
export type PatternDetectedPayloadSchemaType = z.infer<typeof PatternDetectedPayloadSchema>;

/**
 * Type inferred from ApprovalGrantedPayloadSchema.
 */
export type ApprovalGrantedPayloadSchemaType = z.infer<typeof ApprovalGrantedPayloadSchema>;

/**
 * Type inferred from ApprovalRejectedPayloadSchema.
 */
export type ApprovalRejectedPayloadSchemaType = z.infer<typeof ApprovalRejectedPayloadSchema>;

/**
 * Type inferred from ApprovalExpiredPayloadSchema.
 */
export type ApprovalExpiredPayloadSchemaType = z.infer<typeof ApprovalExpiredPayloadSchema>;

/**
 * Type inferred from AuditLLMContextSchema.
 */
export type AuditLLMContextSchemaType = z.infer<typeof AuditLLMContextSchema>;

/**
 * Type inferred from AuditActionSchema.
 */
export type AuditActionSchemaType = z.infer<typeof AuditActionSchema>;
