/**
 * Agent Dead Letter Queue - Failed Event Handling
 *
 * Tracks events that failed during agent processing. Enables:
 * - Investigation of processing failures
 * - Manual replay of failed events
 * - Marking events as ignored when they're obsolete
 *
 * Dead letters are separate from process manager dead letters
 * since agents have different semantics (LLM-based pattern
 * detection vs. command emission).
 *
 * @module agent/dead-letter
 */

import { z } from "zod";

// ============================================================================
// Error Codes
// ============================================================================

/**
 * Error codes for dead letter operations.
 */
export const DEAD_LETTER_ERROR_CODES = {
  /** Dead letter not found */
  DEAD_LETTER_NOT_FOUND: "DEAD_LETTER_NOT_FOUND",
  /** Invalid dead letter status transition */
  INVALID_STATUS_TRANSITION: "INVALID_STATUS_TRANSITION",
  /** Dead letter already processed */
  ALREADY_PROCESSED: "ALREADY_PROCESSED",
} as const;

export type DeadLetterErrorCode =
  (typeof DEAD_LETTER_ERROR_CODES)[keyof typeof DEAD_LETTER_ERROR_CODES];

// ============================================================================
// Status Types
// ============================================================================

/**
 * Dead letter status values.
 */
export const AGENT_DEAD_LETTER_STATUSES = ["pending", "replayed", "ignored"] as const;

/**
 * Status of an agent dead letter entry.
 *
 * - `pending`: Awaiting investigation or replay
 * - `replayed`: Successfully replayed and processed
 * - `ignored`: Manually marked as ignored (e.g., obsolete event)
 */
export type AgentDeadLetterStatus = (typeof AGENT_DEAD_LETTER_STATUSES)[number];

// O(1) lookup Set for type guard performance
const AGENT_DEAD_LETTER_STATUS_SET = new Set<string>(AGENT_DEAD_LETTER_STATUSES);

/**
 * Type guard to check if a value is a valid AgentDeadLetterStatus.
 *
 * @param value - Value to check
 * @returns True if value is a valid AgentDeadLetterStatus
 */
export function isAgentDeadLetterStatus(value: unknown): value is AgentDeadLetterStatus {
  return typeof value === "string" && AGENT_DEAD_LETTER_STATUS_SET.has(value);
}

// ============================================================================
// Zod Schemas
// ============================================================================

/**
 * Schema for dead letter status.
 */
export const AgentDeadLetterStatusSchema = z.enum(["pending", "replayed", "ignored"]);

/**
 * Schema for dead letter context.
 */
export const AgentDeadLetterContextSchema = z
  .object({
    /** Correlation ID for tracing */
    correlationId: z.string().optional(),
    /** Error code if available */
    errorCode: z.string().optional(),
    /** Pattern that was being detected */
    triggeringPattern: z.string().optional(),
  })
  .strict();

/**
 * Schema for agent dead letter.
 */
export const AgentDeadLetterSchema = z.object({
  /** Agent BC identifier */
  agentId: z.string().min(1),

  /** Subscription instance ID */
  subscriptionId: z.string().min(1),

  /** ID of the event that failed processing */
  eventId: z.string().min(1),

  /** Global position of the failed event */
  globalPosition: z.number().int().nonnegative(),

  /** Error message describing the failure */
  error: z.string(),

  /** Number of processing attempts */
  attemptCount: z.number().int().positive(),

  /** Current status of this dead letter */
  status: AgentDeadLetterStatusSchema,

  /** When the failure occurred */
  failedAt: z.number(),

  /** Additional context for debugging */
  context: AgentDeadLetterContextSchema.optional(),
});

// ============================================================================
// TypeScript Types
// ============================================================================

/**
 * Context for an agent dead letter entry.
 */
export interface AgentDeadLetterContext {
  /** Correlation ID for tracing */
  readonly correlationId?: string;
  /** Error code if available */
  readonly errorCode?: string;
  /** Pattern that was being detected */
  readonly triggeringPattern?: string;
}

/**
 * Agent dead letter entry for failed event processing.
 *
 * Records events that failed during agent processing, enabling
 * investigation, replay, or explicit ignoring.
 */
export interface AgentDeadLetter {
  /** Agent BC identifier */
  readonly agentId: string;

  /** Subscription instance ID */
  readonly subscriptionId: string;

  /** ID of the event that failed processing */
  readonly eventId: string;

  /** Global position of the failed event */
  readonly globalPosition: number;

  /** Error message describing the failure */
  readonly error: string;

  /** Number of processing attempts */
  readonly attemptCount: number;

  /** Current status of this dead letter */
  readonly status: AgentDeadLetterStatus;

  /** When the failure occurred */
  readonly failedAt: number;

  /** Additional context for debugging */
  readonly context?: AgentDeadLetterContext;
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create a new agent dead letter entry.
 *
 * @param agentId - Agent BC identifier
 * @param subscriptionId - Subscription instance ID
 * @param eventId - ID of the failed event
 * @param globalPosition - Global position of the failed event
 * @param error - Error message describing the failure
 * @param context - Optional additional context
 * @returns New dead letter entry with pending status
 *
 * @example
 * ```typescript
 * const deadLetter = createAgentDeadLetter(
 *   "churn-risk-agent",
 *   "sub-001",
 *   "evt-123",
 *   1000,
 *   "LLM timeout during analysis"
 * );
 * ```
 */
export function createAgentDeadLetter(
  agentId: string,
  subscriptionId: string,
  eventId: string,
  globalPosition: number,
  error: string,
  context?: AgentDeadLetterContext
): AgentDeadLetter {
  const base: AgentDeadLetter = {
    agentId,
    subscriptionId,
    eventId,
    globalPosition,
    error,
    attemptCount: 1,
    status: "pending",
    failedAt: Date.now(),
  };

  if (context !== undefined) {
    return { ...base, context };
  }

  return base;
}

/**
 * Increment the attempt count on a dead letter.
 *
 * Used when retrying a failed event. Updates the error message
 * and increments the attempt count.
 *
 * @param deadLetter - Dead letter to update
 * @param newError - Updated error message
 * @returns Updated dead letter with incremented attempt count
 */
export function incrementDeadLetterAttempt(
  deadLetter: AgentDeadLetter,
  newError: string
): AgentDeadLetter {
  return {
    ...deadLetter,
    error: newError,
    attemptCount: deadLetter.attemptCount + 1,
    failedAt: Date.now(),
  };
}

// ============================================================================
// Status Transition Functions
// ============================================================================

/**
 * Mark a dead letter as successfully replayed.
 *
 * Can only transition from "pending" status.
 *
 * @param deadLetter - Dead letter to update
 * @returns Updated dead letter with "replayed" status
 * @throws Error if dead letter is not in pending status
 *
 * @example
 * ```typescript
 * const replayedLetter = markDeadLetterReplayed(pendingLetter);
 * console.log(replayedLetter.status); // "replayed"
 * ```
 */
export function markDeadLetterReplayed(deadLetter: AgentDeadLetter): AgentDeadLetter {
  if (deadLetter.status !== "pending") {
    throw new Error(
      `Cannot mark dead letter as replayed: current status is "${deadLetter.status}", expected "pending"`
    );
  }
  return {
    ...deadLetter,
    status: "replayed",
  };
}

/**
 * Mark a dead letter as ignored.
 *
 * Use when an event is obsolete or should not be replayed.
 * Can only transition from "pending" status.
 *
 * @param deadLetter - Dead letter to update
 * @returns Updated dead letter with "ignored" status
 * @throws Error if dead letter is not in pending status
 *
 * @example
 * ```typescript
 * const ignoredLetter = markDeadLetterIgnored(pendingLetter);
 * console.log(ignoredLetter.status); // "ignored"
 * ```
 */
export function markDeadLetterIgnored(deadLetter: AgentDeadLetter): AgentDeadLetter {
  if (deadLetter.status !== "pending") {
    throw new Error(
      `Cannot mark dead letter as ignored: current status is "${deadLetter.status}", expected "pending"`
    );
  }
  return {
    ...deadLetter,
    status: "ignored",
  };
}

// ============================================================================
// Type Guards
// ============================================================================

/**
 * Check if a dead letter is pending.
 *
 * @param deadLetter - Dead letter to check
 * @returns true if status is "pending"
 */
export function isDeadLetterPending(deadLetter: AgentDeadLetter): boolean {
  return deadLetter.status === "pending";
}

/**
 * Check if a dead letter has been replayed.
 *
 * @param deadLetter - Dead letter to check
 * @returns true if status is "replayed"
 */
export function isDeadLetterReplayed(deadLetter: AgentDeadLetter): boolean {
  return deadLetter.status === "replayed";
}

/**
 * Check if a dead letter has been ignored.
 *
 * @param deadLetter - Dead letter to check
 * @returns true if status is "ignored"
 */
export function isDeadLetterIgnored(deadLetter: AgentDeadLetter): boolean {
  return deadLetter.status === "ignored";
}

// ============================================================================
// Validation
// ============================================================================

/**
 * Validate an agent dead letter object.
 *
 * @param deadLetter - Object to validate
 * @returns true if valid, false otherwise
 */
export function validateAgentDeadLetter(deadLetter: unknown): deadLetter is AgentDeadLetter {
  const result = AgentDeadLetterSchema.safeParse(deadLetter);
  return result.success;
}

// ============================================================================
// Type Inference Helpers
// ============================================================================

/**
 * Type inferred from AgentDeadLetterSchema.
 */
export type AgentDeadLetterSchemaType = z.infer<typeof AgentDeadLetterSchema>;

/**
 * Type inferred from AgentDeadLetterStatusSchema.
 */
export type AgentDeadLetterStatusSchemaType = z.infer<typeof AgentDeadLetterStatusSchema>;

/**
 * Type inferred from AgentDeadLetterContextSchema.
 */
export type AgentDeadLetterContextSchemaType = z.infer<typeof AgentDeadLetterContextSchema>;
