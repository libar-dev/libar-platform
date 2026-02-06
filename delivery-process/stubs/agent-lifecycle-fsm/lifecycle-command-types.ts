/**
 * @target platform-core/src/agent/lifecycle-commands.ts
 *
 * Lifecycle Command Type Definitions
 *
 * Five lifecycle commands with their argument types, result types, and Convex validators.
 * These commands are infrastructure mutations (PDR-013 AD-3) — they do NOT route through
 * CommandOrchestrator.
 *
 * DS-5 Design Session: Agent Lifecycle FSM
 * PDR: pdr-013-agent-lifecycle-fsm (AD-3)
 *
 * @see lifecycle-fsm.ts — FSM that validates transitions
 * @see lifecycle-command-handlers.ts — handlers that execute these commands
 */

import { v } from "convex/values";
import type { AgentLifecycleState } from "./lifecycle-fsm.js";
import type { AgentConfigOverrides } from "./checkpoint-status-extension.js";

// ============================================================================
// Command Types (Discriminated Union)
// ============================================================================

/**
 * Base fields shared by all lifecycle commands.
 */
interface BaseLifecycleCommand {
  /** Lifecycle command type discriminant */
  readonly type: string;
  /** Target agent ID */
  readonly agentId: string;
  /** Correlation ID for tracing */
  readonly correlationId: string;
}

/**
 * Start a stopped agent. Resumes event processing from the checkpoint position.
 *
 * Transition: stopped → active
 */
export interface StartAgentCommand extends BaseLifecycleCommand {
  readonly type: "StartAgent";
}

/**
 * Pause an active agent. Events continue to arrive but are seen-but-skipped.
 * Checkpoint position advances during pause (no replay storm on resume).
 *
 * Transition: active → paused
 */
export interface PauseAgentCommand extends BaseLifecycleCommand {
  readonly type: "PauseAgent";
  /** Optional operator-provided reason for pausing */
  readonly reason?: string;
}

/**
 * Resume a paused agent. Processing continues from the current checkpoint
 * position (which may have advanced during pause).
 *
 * Transition: paused → active
 */
export interface ResumeAgentCommand extends BaseLifecycleCommand {
  readonly type: "ResumeAgent";
}

/**
 * Stop an agent from any state. Universal escape hatch.
 * Checkpoint is preserved — agent can be restarted later.
 *
 * Transition: active/paused/error_recovery → stopped
 */
export interface StopAgentCommand extends BaseLifecycleCommand {
  readonly type: "StopAgent";
  /** Optional operator-provided reason for stopping */
  readonly reason?: string;
}

/**
 * Reconfigure an agent with new runtime settings.
 * From active: stays active (config-only update).
 * From paused: transitions to active (implicit resume + config update).
 *
 * Transition: active → active, paused → active
 */
export interface ReconfigureAgentCommand extends BaseLifecycleCommand {
  readonly type: "ReconfigureAgent";
  /** Config fields to override at runtime */
  readonly configOverrides: AgentConfigOverrides;
}

/**
 * Discriminated union of all lifecycle commands.
 *
 * @example
 * ```typescript
 * function handleLifecycleCommand(command: AgentLifecycleCommand) {
 *   switch (command.type) {
 *     case "StartAgent": return handleStart(command);
 *     case "PauseAgent": return handlePause(command);
 *     case "ResumeAgent": return handleResume(command);
 *     case "StopAgent": return handleStop(command);
 *     case "ReconfigureAgent": return handleReconfigure(command);
 *   }
 * }
 * ```
 */
export type AgentLifecycleCommand =
  | StartAgentCommand
  | PauseAgentCommand
  | ResumeAgentCommand
  | StopAgentCommand
  | ReconfigureAgentCommand;

// ============================================================================
// Result Types
// ============================================================================

/**
 * Successful lifecycle command result.
 */
export interface AgentLifecycleSuccess {
  readonly success: true;
  readonly agentId: string;
  readonly previousState: AgentLifecycleState;
  readonly newState: AgentLifecycleState;
}

/**
 * Error codes for lifecycle command failures.
 *
 * Uses const object + derived union pattern (matching platform convention).
 */
export const AGENT_LIFECYCLE_ERROR_CODES = {
  INVALID_LIFECYCLE_TRANSITION: "INVALID_LIFECYCLE_TRANSITION",
  AGENT_NOT_FOUND: "AGENT_NOT_FOUND",
} as const;

export type AgentLifecycleErrorCode =
  (typeof AGENT_LIFECYCLE_ERROR_CODES)[keyof typeof AGENT_LIFECYCLE_ERROR_CODES];

/**
 * Failed lifecycle command result.
 */
export interface AgentLifecycleFailure {
  readonly success: false;
  readonly agentId: string;
  readonly code: AgentLifecycleErrorCode;
  readonly message: string;
  /** Current state (undefined if agent not found) */
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
 * Convex validator for config overrides (used in ReconfigureAgent args).
 *
 * Field names align with AgentRateLimitConfig in platform-core/src/agent/types.ts:120-148.
 * @see checkpoint-status-extension.ts — AgentConfigOverrides TypeScript type
 */
export const configOverridesValidator = v.object({
  confidenceThreshold: v.optional(v.number()),
  patternWindowDuration: v.optional(v.string()),
  rateLimits: v.optional(
    v.object({
      maxRequestsPerMinute: v.optional(v.number()),
      maxConcurrent: v.optional(v.number()),
      queueDepth: v.optional(v.number()),
      costBudget: v.optional(
        v.object({
          daily: v.optional(v.number()),
          alertThreshold: v.optional(v.number()),
        })
      ),
    })
  ),
});

/**
 * Convex validator for StartAgent args.
 */
export const startAgentArgsValidator = v.object({
  agentId: v.string(),
  correlationId: v.string(),
});

/**
 * Convex validator for PauseAgent args.
 */
export const pauseAgentArgsValidator = v.object({
  agentId: v.string(),
  correlationId: v.string(),
  reason: v.optional(v.string()),
});

/**
 * Convex validator for ResumeAgent args.
 */
export const resumeAgentArgsValidator = v.object({
  agentId: v.string(),
  correlationId: v.string(),
});

/**
 * Convex validator for StopAgent args.
 */
export const stopAgentArgsValidator = v.object({
  agentId: v.string(),
  correlationId: v.string(),
  reason: v.optional(v.string()),
});

/**
 * Convex validator for ReconfigureAgent args.
 */
export const reconfigureAgentArgsValidator = v.object({
  agentId: v.string(),
  correlationId: v.string(),
  configOverrides: configOverridesValidator,
});

/**
 * Convex validator for lifecycle result (for return types).
 */
/**
 * L2 fix: Use explicit state literal unions instead of loose v.string().
 * This ensures Convex validates that state values are actual lifecycle states,
 * matching the AgentLifecycleState type from lifecycle-fsm.ts.
 */
const lifecycleStateValidator = v.union(
  v.literal("active"),
  v.literal("paused"),
  v.literal("stopped"),
  v.literal("error_recovery")
);

export const lifecycleResultValidator = v.union(
  v.object({
    success: v.literal(true),
    agentId: v.string(),
    previousState: lifecycleStateValidator,
    newState: lifecycleStateValidator,
  }),
  v.object({
    success: v.literal(false),
    agentId: v.string(),
    code: v.union(v.literal("INVALID_LIFECYCLE_TRANSITION"), v.literal("AGENT_NOT_FOUND")),
    message: v.string(),
    currentState: v.optional(lifecycleStateValidator),
  })
);
