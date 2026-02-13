/**
 * Agent Lifecycle Command Types
 *
 * Defines the command types, result types, error codes, and Convex validators
 * for agent lifecycle management operations (start, pause, resume, stop, reconfigure).
 *
 * @module agent/lifecycle-commands
 */

import { v } from "convex/values";
import type { AgentLifecycleState } from "./lifecycle-fsm.js";

// ============================================================================
// Config Overrides
// ============================================================================

/**
 * Runtime-configurable settings that can be applied via ReconfigureAgent command.
 *
 * All fields are optional — only provided fields override the base configuration.
 */
export interface AgentConfigOverrides {
  /** Override confidence threshold (0-1) */
  readonly confidenceThreshold?: number;

  /** Override pattern window duration (e.g., "30d", "7d") */
  readonly patternWindowDuration?: string;

  /** Override rate limit settings */
  readonly rateLimits?: {
    /** Maximum LLM API calls per minute */
    readonly maxRequestsPerMinute?: number;

    /** Maximum concurrent LLM calls */
    readonly maxConcurrent?: number;

    /** Maximum queued events before backpressure */
    readonly queueDepth?: number;

    /** Cost budget overrides */
    readonly costBudget?: {
      /** Daily budget in USD */
      readonly daily?: number;

      /** Alert threshold as percentage of budget (0-1) */
      readonly alertThreshold?: number;
    };
  };
}

// ============================================================================
// Command Types
// ============================================================================

/**
 * Base command structure shared by all lifecycle commands.
 */
interface BaseLifecycleCommand {
  /** Discriminator for command type */
  readonly type: string;

  /** Unique command identifier for idempotency */
  readonly commandId: string;

  /** Target agent identifier */
  readonly agentId: string;

  /** Correlation ID for tracing across command/event chains */
  readonly correlationId: string;
}

/**
 * Start an agent that is currently stopped.
 */
export interface StartAgentCommand extends BaseLifecycleCommand {
  readonly type: "StartAgent";
}

/**
 * Pause an active agent (preserves position, can resume).
 */
export interface PauseAgentCommand extends BaseLifecycleCommand {
  readonly type: "PauseAgent";

  /** Optional reason for pausing */
  readonly reason?: string;
}

/**
 * Resume a paused agent.
 */
export interface ResumeAgentCommand extends BaseLifecycleCommand {
  readonly type: "ResumeAgent";
}

/**
 * Stop an agent (can be restarted later).
 */
export interface StopAgentCommand extends BaseLifecycleCommand {
  readonly type: "StopAgent";

  /** Optional reason for stopping */
  readonly reason?: string;
}

/**
 * Reconfigure an agent with new runtime settings.
 */
export interface ReconfigureAgentCommand extends BaseLifecycleCommand {
  readonly type: "ReconfigureAgent";

  /** Configuration overrides to apply */
  readonly configOverrides: AgentConfigOverrides;
}

/**
 * Union of all agent lifecycle commands.
 */
export type AgentLifecycleCommand =
  | StartAgentCommand
  | PauseAgentCommand
  | ResumeAgentCommand
  | StopAgentCommand
  | ReconfigureAgentCommand;

// ============================================================================
// Error Codes
// ============================================================================

/**
 * Error codes for agent lifecycle operations.
 */
export const AGENT_LIFECYCLE_ERROR_CODES = {
  /** Attempted transition is not valid for the current state */
  INVALID_LIFECYCLE_TRANSITION: "INVALID_LIFECYCLE_TRANSITION",

  /** Target agent does not exist */
  AGENT_NOT_FOUND: "AGENT_NOT_FOUND",
} as const;

/**
 * Type of agent lifecycle error code.
 */
export type AgentLifecycleErrorCode =
  (typeof AGENT_LIFECYCLE_ERROR_CODES)[keyof typeof AGENT_LIFECYCLE_ERROR_CODES];

// ============================================================================
// Result Types
// ============================================================================

/**
 * Successful lifecycle command result.
 */
export interface AgentLifecycleSuccess {
  /** Indicates success */
  readonly success: true;

  /** Agent that was affected */
  readonly agentId: string;

  /** State before the command was applied */
  readonly previousState: AgentLifecycleState;

  /** State after the command was applied */
  readonly newState: AgentLifecycleState;
}

/**
 * Failed lifecycle command result.
 */
export interface AgentLifecycleFailure {
  /** Indicates failure */
  readonly success: false;

  /** Agent that was targeted */
  readonly agentId: string;

  /** Error classification */
  readonly code: AgentLifecycleErrorCode;

  /** Human-readable error description */
  readonly message: string;

  /** Current state at the time of failure (if agent exists) */
  readonly currentState?: AgentLifecycleState;
}

/**
 * Result of a lifecycle command execution.
 */
export type AgentLifecycleResult = AgentLifecycleSuccess | AgentLifecycleFailure;

// ============================================================================
// Convex Validators
// ============================================================================

/**
 * Convex validator for agent lifecycle state.
 */
export const lifecycleStateValidator = v.union(
  v.literal("active"),
  v.literal("paused"),
  v.literal("stopped"),
  v.literal("error_recovery")
);

/**
 * Convex validator for cost budget overrides.
 */
export const costBudgetOverridesValidator = v.object({
  daily: v.optional(v.number()),
  alertThreshold: v.optional(v.number()),
});

/**
 * Convex validator for rate limit overrides.
 */
export const rateLimitOverridesValidator = v.object({
  maxRequestsPerMinute: v.optional(v.number()),
  maxConcurrent: v.optional(v.number()),
  queueDepth: v.optional(v.number()),
  costBudget: v.optional(costBudgetOverridesValidator),
});

/**
 * Convex validator for agent configuration overrides.
 */
export const configOverridesValidator = v.object({
  confidenceThreshold: v.optional(v.number()),
  patternWindowDuration: v.optional(v.string()),
  rateLimits: v.optional(rateLimitOverridesValidator),
});

/**
 * Convex validator for StartAgent command arguments.
 */
export const startAgentArgsValidator = v.object({
  commandId: v.string(),
  agentId: v.string(),
  correlationId: v.string(),
});

/**
 * Convex validator for PauseAgent command arguments.
 */
export const pauseAgentArgsValidator = v.object({
  commandId: v.string(),
  agentId: v.string(),
  correlationId: v.string(),
  reason: v.optional(v.string()),
});

/**
 * Convex validator for ResumeAgent command arguments.
 */
export const resumeAgentArgsValidator = v.object({
  commandId: v.string(),
  agentId: v.string(),
  correlationId: v.string(),
});

/**
 * Convex validator for StopAgent command arguments.
 */
export const stopAgentArgsValidator = v.object({
  commandId: v.string(),
  agentId: v.string(),
  correlationId: v.string(),
  reason: v.optional(v.string()),
});

/**
 * Convex validator for ReconfigureAgent command arguments.
 */
export const reconfigureAgentArgsValidator = v.object({
  commandId: v.string(),
  agentId: v.string(),
  correlationId: v.string(),
  configOverrides: configOverridesValidator,
});
