/**
 * Agent Command Emission - Commands with Explainability Metadata
 *
 * Enables agents to emit commands with full explainability metadata,
 * including the reasoning behind decisions, confidence scores, and
 * triggering events for audit trail purposes.
 *
 * @module agent/commands
 */

import { z } from "zod";
import type { AgentDecision } from "./types.js";
import { generateDecisionId } from "./audit.js";

// ============================================================================
// Error Codes
// ============================================================================

/**
 * Error codes for command emission validation.
 */
export const COMMAND_EMISSION_ERROR_CODES = {
  /** Reason is required for command emission */
  REASON_REQUIRED: "REASON_REQUIRED",
  /** Confidence score is required */
  CONFIDENCE_REQUIRED: "CONFIDENCE_REQUIRED",
  /** At least one triggering event is required */
  EVENTS_REQUIRED: "EVENTS_REQUIRED",
  /** Command type must be a non-empty string */
  INVALID_COMMAND_TYPE: "INVALID_COMMAND_TYPE",
  /** Confidence must be between 0 and 1 */
  INVALID_CONFIDENCE: "INVALID_CONFIDENCE",
} as const;

export type CommandEmissionErrorCode =
  (typeof COMMAND_EMISSION_ERROR_CODES)[keyof typeof COMMAND_EMISSION_ERROR_CODES];

// ============================================================================
// Zod Schemas
// ============================================================================

/**
 * Schema for emitted agent command metadata.
 */
export const EmittedAgentCommandMetadataSchema = z.object({
  /** Agent BC identifier that emitted this command */
  agentId: z.string().min(1),

  /** Unique decision ID for correlation with audit trail */
  decisionId: z.string().min(1),

  /** Pattern ID that triggered this command (optional) */
  patternId: z.string().optional(),

  /** Confidence score for this command (0-1) */
  confidence: z.number().min(0).max(1),

  /** Human-readable explanation of why this command was emitted */
  reason: z.string().min(1),

  /** Event IDs that triggered this decision */
  eventIds: z.array(z.string()).min(1),

  /** Full LLM analysis response for debugging (optional) */
  analysis: z.unknown().optional(),
});

/**
 * Schema for emitted agent command.
 */
export const EmittedAgentCommandSchema = z.object({
  /** Command type (e.g., "SuggestCustomerOutreach") */
  type: z.string().min(1),

  /** Command payload data */
  payload: z.unknown(),

  /** Explainability metadata */
  metadata: EmittedAgentCommandMetadataSchema,
});

// ============================================================================
// TypeScript Types
// ============================================================================

/**
 * Metadata for an emitted agent command.
 *
 * Provides full explainability for audit trail and debugging.
 */
export interface EmittedAgentCommandMetadata {
  /** Agent BC identifier that emitted this command */
  readonly agentId: string;

  /** Unique decision ID for correlation with audit trail */
  readonly decisionId: string;

  /** Pattern ID that triggered this command (optional) */
  readonly patternId?: string;

  /** Confidence score for this command (0-1) */
  readonly confidence: number;

  /** Human-readable explanation of why this command was emitted */
  readonly reason: string;

  /** Event IDs that triggered this decision */
  readonly eventIds: readonly string[];

  /** Full LLM analysis response for debugging (optional) */
  readonly analysis?: unknown;
}

/**
 * Command emitted by an agent with full explainability metadata.
 *
 * Unlike regular commands, agent-emitted commands include metadata
 * that explains why the command was generated, enabling:
 * - Audit trail for compliance
 * - Debugging and investigation
 * - Human review of agent decisions
 */
export interface EmittedAgentCommand {
  /** Command type (e.g., "SuggestCustomerOutreach") */
  readonly type: string;

  /** Command payload data */
  readonly payload: unknown;

  /** Explainability metadata */
  readonly metadata: EmittedAgentCommandMetadata;
}

// ============================================================================
// Validation Types
// ============================================================================

/**
 * Result of validating command emission args.
 */
export type CommandEmissionValidationResult =
  | { readonly valid: true }
  | {
      readonly valid: false;
      readonly code: CommandEmissionErrorCode;
      readonly message: string;
    };

/**
 * Arguments for command emission validation.
 */
export interface ValidateCommandArgs {
  /** Command type */
  readonly type?: string;
  /** Confidence score */
  readonly confidence?: number;
  /** Reason for the command */
  readonly reason?: string;
  /** Triggering event IDs */
  readonly eventIds?: readonly string[];
}

// ============================================================================
// Validation Functions
// ============================================================================

/**
 * Validate command emission arguments.
 *
 * Checks:
 * - Command type is a non-empty string
 * - Confidence is between 0 and 1
 * - Reason is provided
 * - At least one triggering event ID is provided
 *
 * @param args - Arguments to validate
 * @returns Validation result with error details if invalid
 *
 * @example
 * ```typescript
 * const validation = validateAgentCommand({
 *   type: "SuggestOutreach",
 *   confidence: 0.85,
 *   reason: "Customer cancelled 3 orders in 30 days",
 *   eventIds: ["evt-1", "evt-2", "evt-3"],
 * });
 * if (!validation.valid) {
 *   console.error(validation.message);
 * }
 * ```
 */
export function validateAgentCommand(args: ValidateCommandArgs): CommandEmissionValidationResult {
  // Check command type
  if (!args.type || args.type.trim() === "") {
    return {
      valid: false,
      code: COMMAND_EMISSION_ERROR_CODES.INVALID_COMMAND_TYPE,
      message: "Command type must be a non-empty string",
    };
  }

  // Check confidence
  if (args.confidence === undefined) {
    return {
      valid: false,
      code: COMMAND_EMISSION_ERROR_CODES.CONFIDENCE_REQUIRED,
      message: "Confidence score is required",
    };
  }

  if (args.confidence < 0 || args.confidence > 1) {
    return {
      valid: false,
      code: COMMAND_EMISSION_ERROR_CODES.INVALID_CONFIDENCE,
      message: "Confidence must be between 0 and 1",
    };
  }

  // Check reason
  if (!args.reason || args.reason.trim() === "") {
    return {
      valid: false,
      code: COMMAND_EMISSION_ERROR_CODES.REASON_REQUIRED,
      message: "Reason is required for command emission",
    };
  }

  // Check event IDs
  if (!args.eventIds || args.eventIds.length === 0) {
    return {
      valid: false,
      code: COMMAND_EMISSION_ERROR_CODES.EVENTS_REQUIRED,
      message: "At least one triggering event ID is required",
    };
  }

  return { valid: true };
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Options for creating an emitted agent command.
 */
export interface CreateEmittedAgentCommandOptions {
  /** Pattern ID that triggered this command */
  readonly patternId?: string;
  /** Full LLM analysis response */
  readonly analysis?: unknown;
}

/**
 * Create an emitted agent command with full metadata.
 *
 * @param agentId - Agent BC identifier
 * @param type - Command type
 * @param payload - Command payload
 * @param confidence - Confidence score (0-1)
 * @param reason - Human-readable reason
 * @param eventIds - Triggering event IDs
 * @param options - Additional options
 * @returns EmittedAgentCommand with generated decision ID
 * @throws Error if validation fails
 *
 * @example
 * ```typescript
 * const command = createEmittedAgentCommand(
 *   "churn-risk-agent",
 *   "SuggestCustomerOutreach",
 *   { customerId: "cust-123", risk: 0.85 },
 *   0.85,
 *   "Customer cancelled 3 orders in 30 days",
 *   ["evt-1", "evt-2", "evt-3"]
 * );
 * ```
 */
export function createEmittedAgentCommand(
  agentId: string,
  type: string,
  payload: unknown,
  confidence: number,
  reason: string,
  eventIds: readonly string[],
  options?: CreateEmittedAgentCommandOptions
): EmittedAgentCommand {
  // Validate inputs
  const validation = validateAgentCommand({
    type,
    confidence,
    reason,
    eventIds,
  });

  if (!validation.valid) {
    throw new Error(`Invalid command: ${validation.message} (${validation.code})`);
  }

  const metadata: EmittedAgentCommandMetadata = {
    agentId,
    decisionId: generateDecisionId(),
    confidence,
    reason,
    eventIds: [...eventIds],
  };

  // Add optional fields
  if (options?.patternId !== undefined) {
    const metadataWithPattern: EmittedAgentCommandMetadata = {
      ...metadata,
      patternId: options.patternId,
    };
    if (options?.analysis !== undefined) {
      return {
        type,
        payload,
        metadata: { ...metadataWithPattern, analysis: options.analysis },
      };
    }
    return { type, payload, metadata: metadataWithPattern };
  }

  if (options?.analysis !== undefined) {
    return {
      type,
      payload,
      metadata: { ...metadata, analysis: options.analysis },
    };
  }

  return { type, payload, metadata };
}

/**
 * Options for converting an AgentDecision to EmittedAgentCommand.
 */
export interface CreateCommandFromDecisionOptions {
  /** Pattern ID that triggered this decision */
  readonly patternId?: string;
  /** Full LLM analysis response */
  readonly analysis?: unknown;
}

/**
 * Convert an AgentDecision to an EmittedAgentCommand.
 *
 * Useful when the agent's pattern execution returns a decision that
 * should be emitted as a command.
 *
 * @param agentId - Agent BC identifier
 * @param decision - Decision from agent analysis
 * @param options - Additional options
 * @returns EmittedAgentCommand or null if decision has no command
 * @throws Error if decision has invalid command data
 *
 * @example
 * ```typescript
 * const result = await executePatterns(config.patterns, events, ctx);
 * if (result.decision?.command) {
 *   const command = createCommandFromDecision("churn-risk-agent", result.decision);
 *   // ... emit command through command bus
 * }
 * ```
 */
export function createCommandFromDecision(
  agentId: string,
  decision: AgentDecision,
  options?: CreateCommandFromDecisionOptions
): EmittedAgentCommand | null {
  // If no command in decision, return null
  if (decision.command === null) {
    return null;
  }

  return createEmittedAgentCommand(
    agentId,
    decision.command,
    decision.payload,
    decision.confidence,
    decision.reason,
    decision.triggeringEvents,
    options
  );
}

// ============================================================================
// Type Guards
// ============================================================================

/**
 * Check if a value is a valid EmittedAgentCommand.
 *
 * @param value - Value to check
 * @returns true if value is a valid EmittedAgentCommand
 */
export function isEmittedAgentCommand(value: unknown): value is EmittedAgentCommand {
  const result = EmittedAgentCommandSchema.safeParse(value);
  return result.success;
}

/**
 * Check if an emitted command has a pattern ID.
 *
 * @param command - Command to check
 * @returns true if command has pattern ID
 */
export function hasPatternId(command: EmittedAgentCommand): boolean {
  return command.metadata.patternId !== undefined;
}

/**
 * Check if an emitted command has analysis data.
 *
 * @param command - Command to check
 * @returns true if command has analysis data
 */
export function hasAnalysisData(command: EmittedAgentCommand): boolean {
  return command.metadata.analysis !== undefined;
}

// ============================================================================
// Type Inference Helpers
// ============================================================================

/**
 * Type inferred from EmittedAgentCommandMetadataSchema.
 */
export type EmittedAgentCommandMetadataSchemaType = z.infer<
  typeof EmittedAgentCommandMetadataSchema
>;

/**
 * Type inferred from EmittedAgentCommandSchema.
 */
export type EmittedAgentCommandSchemaType = z.infer<typeof EmittedAgentCommandSchema>;
