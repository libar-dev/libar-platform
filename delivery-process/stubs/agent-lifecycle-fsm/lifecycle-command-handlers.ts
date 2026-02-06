/**
 * @target platform-core/src/agent/lifecycle-handlers.ts
 *
 * Lifecycle Command Handlers
 *
 * Five internalMutation handlers for agent lifecycle transitions. Each handler
 * follows the same pattern: load → validate → mutate → audit → return.
 *
 * These are infrastructure mutations (PDR-013 AD-3) — they bypass CommandOrchestrator
 * and call the agent component API directly.
 *
 * DS-5 Design Session: Agent Lifecycle FSM
 * PDR: pdr-013-agent-lifecycle-fsm (AD-3)
 *
 * @see lifecycle-fsm.ts — FSM transition validation
 * @see lifecycle-command-types.ts — command and result types
 * @see lifecycle-audit-events.ts — audit event types and payloads
 * @see delivery-process/stubs/agent-component-isolation/component/checkpoints.ts — component API
 */

import type { MutationCtx, FunctionReference } from "convex/server";
// L1 fix: Import Logger from local path, not from @libar-dev/platform-core,
// to avoid circular dependency: eventSubscriptions → PM → infrastructure → eventSubscriptions
import type { Logger } from "../logging/types.js";
import type { AgentLifecycleState } from "./lifecycle-fsm.js";
import type { AgentConfigOverrides } from "./checkpoint-status-extension.js";
import type { AgentLifecycleResult } from "./lifecycle-command-types.js";
import {
  createLifecycleDecisionId,
  type AgentStartedPayload,
  type AgentPausedPayload,
  type AgentResumedPayload,
  type AgentStoppedPayload,
  type AgentReconfiguredPayload,
} from "./lifecycle-audit-events.js";

// ============================================================================
// Handler Configuration
// ============================================================================

/**
 * Subset of AgentComponentAPI used by lifecycle handlers.
 *
 * Only needs checkpoints and audit — lifecycle commands don't interact
 * with dead letters, commands, or approvals.
 *
 * H3 fix: Uses FunctionReference-based pattern matching DS-2's oncomplete-handler.
 * Convex components have isolated databases — you CANNOT pass `ctx` across the
 * component boundary. The correct pattern is `ctx.runQuery(ref, args)` or
 * `ctx.runMutation(ref, args)` where `ref` is a FunctionReference.
 *
 * @see stubs/agent-action-handler/oncomplete-handler.ts — DS-2 establishes this pattern
 * @see stubs/agent-component-isolation/component/checkpoints.ts — component API definitions
 */
export interface LifecycleComponentAPI {
  readonly checkpoints: {
    /** FunctionRef for query: load all checkpoints for an agent (by_agentId index) */
    readonly getByAgentId: FunctionReference<"query">;
    /** FunctionRef for mutation: update checkpoint status */
    readonly updateStatus: FunctionReference<"mutation">;
    /** FunctionRef for mutation: patch checkpoint config overrides (ReconfigureAgent) */
    readonly patchConfigOverrides: FunctionReference<"mutation">;
  };

  readonly audit: {
    /** FunctionRef for mutation: record an audit event (idempotent by decisionId) */
    readonly record: FunctionReference<"mutation">;
  };
}

/**
 * Checkpoint document shape from the agent component.
 */
interface AgentCheckpointDoc {
  readonly agentId: string;
  readonly subscriptionId: string;
  readonly lastProcessedPosition: number;
  readonly status: AgentLifecycleState;
  readonly eventsProcessed: number;
  readonly configOverrides?: AgentConfigOverrides;
}

/**
 * Configuration for creating lifecycle command handlers.
 */
export interface LifecycleHandlerConfig {
  /** Agent component API (checkpoints + audit) */
  readonly agentComponent: LifecycleComponentAPI;
  /** Optional logger */
  readonly logger?: Logger;
}

// ============================================================================
// Handler Implementations
// ============================================================================

/**
 * All handlers follow this pattern:
 *
 * 1. Load checkpoint(s) by agentId
 * 2. Validate: agent exists, FSM transition is valid
 * 3. Update checkpoint status (all checkpoints for this agent)
 * 4. Record lifecycle audit event
 * 5. Return AgentLifecycleResult
 *
 * Multi-checkpoint: An agent may have multiple checkpoints (one per subscription).
 * Lifecycle commands affect ALL checkpoints. The FSM state is validated against the
 * FIRST checkpoint (all checkpoints for an agent should have the same status).
 *
 * Concurrency: Two concurrent lifecycle mutations are resolved by Convex OCC.
 * One succeeds (reads current state, writes new state), the other retries
 * (reads new state, validates against it).
 */

// --- handleStartAgent ---

/**
 * Start a stopped agent.
 *
 * Transition: stopped → active (via START event)
 *
 * Flow:
 * 1. Load checkpoint(s) for agentId
 * 2. Assert current state is "stopped"
 * 3. Update all checkpoint statuses to "active"
 * 4. Record AgentStarted audit event
 * 5. Return success with previousState="stopped", newState="active"
 *
 * @param ctx - Convex mutation context
 * @param args - { agentId, correlationId }
 * @param config - Handler configuration
 * @returns AgentLifecycleResult
 *
 * @example
 * ```typescript
 * // In convex/agent/lifecycle.ts:
 * export const start = internalMutation({
 *   args: startAgentArgsValidator,
 *   handler: async (ctx, args) => {
 *     return handleStartAgent(ctx, args, lifecycleConfig);
 *   },
 * });
 * ```
 */
export async function handleStartAgent(
  ctx: MutationCtx,
  args: { agentId: string; correlationId: string },
  config: LifecycleHandlerConfig
): Promise<AgentLifecycleResult> {
  const { agentComponent, logger } = config;

  // 1. Load checkpoints
  const checkpoints = await ctx.runQuery(agentComponent.checkpoints.getByAgentId, {
    agentId: args.agentId,
  });

  if (checkpoints.length === 0) {
    return {
      success: false,
      agentId: args.agentId,
      code: "AGENT_NOT_FOUND",
      message: `No checkpoints found for agent "${args.agentId}"`,
    };
  }

  // 2. Validate FSM transition (check first checkpoint — all should be same status)
  const currentState = checkpoints[0]!.status;
  // assertValidAgentTransition(currentState, "START", args.agentId);
  // If invalid, return rejection instead of throwing:
  if (currentState !== "stopped") {
    return {
      success: false,
      agentId: args.agentId,
      code: "INVALID_LIFECYCLE_TRANSITION",
      message: `Cannot START agent "${args.agentId}": current state is "${currentState}", expected "stopped"`,
      currentState,
    };
  }

  // 3. Update all checkpoint statuses
  await ctx.runMutation(agentComponent.checkpoints.updateStatus, {
    agentId: args.agentId,
    status: "active",
  });

  // 4. Record audit event
  const payload: AgentStartedPayload = {
    previousState: "stopped",
    correlationId: args.correlationId,
    resumeFromPosition: checkpoints[0]!.lastProcessedPosition,
  };

  await ctx.runMutation(agentComponent.audit.record, {
    eventType: "AgentStarted",
    agentId: args.agentId,
    decisionId: createLifecycleDecisionId(args.agentId),
    timestamp: Date.now(),
    payload,
  });

  logger?.info("Agent started", {
    agentId: args.agentId,
    resumeFromPosition: checkpoints[0]!.lastProcessedPosition,
  });

  // 5. Return result
  return {
    success: true,
    agentId: args.agentId,
    previousState: "stopped",
    newState: "active",
  };
}

// --- handlePauseAgent ---

/**
 * Pause an active agent.
 *
 * Transition: active → paused (via PAUSE event)
 *
 * Events continue to arrive via EventBus but are seen-but-skipped. The action
 * handler's isAgentActive(checkpoint) gate returns false, so no LLM calls are
 * made. Checkpoint position advances (events are consumed, not queued).
 *
 * @param ctx - Convex mutation context
 * @param args - { agentId, correlationId, reason? }
 * @param config - Handler configuration
 * @returns AgentLifecycleResult
 */
export async function handlePauseAgent(
  ctx: MutationCtx,
  args: { agentId: string; correlationId: string; reason?: string },
  config: LifecycleHandlerConfig
): Promise<AgentLifecycleResult> {
  const { agentComponent, logger } = config;

  const checkpoints = await ctx.runQuery(agentComponent.checkpoints.getByAgentId, {
    agentId: args.agentId,
  });

  if (checkpoints.length === 0) {
    return {
      success: false,
      agentId: args.agentId,
      code: "AGENT_NOT_FOUND",
      message: `No checkpoints found for agent "${args.agentId}"`,
    };
  }

  const currentState = checkpoints[0]!.status;
  if (currentState !== "active") {
    return {
      success: false,
      agentId: args.agentId,
      code: "INVALID_LIFECYCLE_TRANSITION",
      message: `Cannot PAUSE agent "${args.agentId}": current state is "${currentState}", expected "active"`,
      currentState,
    };
  }

  await ctx.runMutation(agentComponent.checkpoints.updateStatus, {
    agentId: args.agentId,
    status: "paused",
  });

  const payload: AgentPausedPayload = {
    reason: args.reason,
    correlationId: args.correlationId,
    pausedAtPosition: checkpoints[0]!.lastProcessedPosition,
    eventsProcessedAtPause: checkpoints[0]!.eventsProcessed,
  };

  await ctx.runMutation(agentComponent.audit.record, {
    eventType: "AgentPaused",
    agentId: args.agentId,
    decisionId: createLifecycleDecisionId(args.agentId),
    timestamp: Date.now(),
    payload,
  });

  logger?.info("Agent paused", {
    agentId: args.agentId,
    reason: args.reason,
    pausedAtPosition: checkpoints[0]!.lastProcessedPosition,
  });

  return {
    success: true,
    agentId: args.agentId,
    previousState: "active",
    newState: "paused",
  };
}

// --- handleResumeAgent ---

/**
 * Resume a paused agent.
 *
 * Transition: paused → active (via RESUME event)
 *
 * Processing continues from the current checkpoint position. Note: the position
 * may have advanced during pause (seen-but-skipped events, per PDR-013 AD-4).
 *
 * @param ctx - Convex mutation context
 * @param args - { agentId, correlationId }
 * @param config - Handler configuration
 * @returns AgentLifecycleResult
 */
export async function handleResumeAgent(
  ctx: MutationCtx,
  args: { agentId: string; correlationId: string },
  config: LifecycleHandlerConfig
): Promise<AgentLifecycleResult> {
  const { agentComponent, logger } = config;

  const checkpoints = await ctx.runQuery(agentComponent.checkpoints.getByAgentId, {
    agentId: args.agentId,
  });

  if (checkpoints.length === 0) {
    return {
      success: false,
      agentId: args.agentId,
      code: "AGENT_NOT_FOUND",
      message: `No checkpoints found for agent "${args.agentId}"`,
    };
  }

  const currentState = checkpoints[0]!.status;
  if (currentState !== "paused") {
    return {
      success: false,
      agentId: args.agentId,
      code: "INVALID_LIFECYCLE_TRANSITION",
      message: `Cannot RESUME agent "${args.agentId}": current state is "${currentState}", expected "paused"`,
      currentState,
    };
  }

  await ctx.runMutation(agentComponent.checkpoints.updateStatus, {
    agentId: args.agentId,
    status: "active",
  });

  const payload: AgentResumedPayload = {
    resumeFromPosition: checkpoints[0]!.lastProcessedPosition,
    correlationId: args.correlationId,
  };

  await ctx.runMutation(agentComponent.audit.record, {
    eventType: "AgentResumed",
    agentId: args.agentId,
    decisionId: createLifecycleDecisionId(args.agentId),
    timestamp: Date.now(),
    payload,
  });

  logger?.info("Agent resumed", {
    agentId: args.agentId,
    resumeFromPosition: checkpoints[0]!.lastProcessedPosition,
  });

  return {
    success: true,
    agentId: args.agentId,
    previousState: "paused",
    newState: "active",
  };
}

// --- handleStopAgent ---

/**
 * Stop an agent from any non-stopped state. Universal escape hatch.
 *
 * Transition: active/paused/error_recovery → stopped (via STOP event)
 *
 * Checkpoint is preserved at current position. Agent can be restarted
 * later via StartAgent.
 *
 * @param ctx - Convex mutation context
 * @param args - { agentId, correlationId, reason? }
 * @param config - Handler configuration
 * @returns AgentLifecycleResult
 */
export async function handleStopAgent(
  ctx: MutationCtx,
  args: { agentId: string; correlationId: string; reason?: string },
  config: LifecycleHandlerConfig
): Promise<AgentLifecycleResult> {
  const { agentComponent, logger } = config;

  const checkpoints = await ctx.runQuery(agentComponent.checkpoints.getByAgentId, {
    agentId: args.agentId,
  });

  if (checkpoints.length === 0) {
    return {
      success: false,
      agentId: args.agentId,
      code: "AGENT_NOT_FOUND",
      message: `No checkpoints found for agent "${args.agentId}"`,
    };
  }

  const currentState = checkpoints[0]!.status;
  // StopAgent valid from: active, paused, error_recovery
  if (currentState === "stopped") {
    return {
      success: false,
      agentId: args.agentId,
      code: "INVALID_LIFECYCLE_TRANSITION",
      message: `Cannot STOP agent "${args.agentId}": already in "stopped" state`,
      currentState,
    };
  }

  await ctx.runMutation(agentComponent.checkpoints.updateStatus, {
    agentId: args.agentId,
    status: "stopped",
  });

  const payload: AgentStoppedPayload = {
    previousState: currentState,
    reason: args.reason,
    correlationId: args.correlationId,
    stoppedAtPosition: checkpoints[0]!.lastProcessedPosition,
  };

  await ctx.runMutation(agentComponent.audit.record, {
    eventType: "AgentStopped",
    agentId: args.agentId,
    decisionId: createLifecycleDecisionId(args.agentId),
    timestamp: Date.now(),
    payload,
  });

  logger?.info("Agent stopped", {
    agentId: args.agentId,
    previousState: currentState,
    reason: args.reason,
  });

  return {
    success: true,
    agentId: args.agentId,
    previousState: currentState,
    newState: "stopped",
  };
}

// --- handleReconfigureAgent ---

/**
 * Reconfigure an agent with new runtime settings.
 *
 * Transition:
 * - From active → active (config-only update, no state change)
 * - From paused → active (implicit resume + config update)
 *
 * Config overrides are stored on the checkpoint table and merged with
 * base AgentBCConfig at handler execution time.
 *
 * @param ctx - Convex mutation context
 * @param args - { agentId, correlationId, configOverrides }
 * @param config - Handler configuration
 * @returns AgentLifecycleResult
 */
export async function handleReconfigureAgent(
  ctx: MutationCtx,
  args: {
    agentId: string;
    correlationId: string;
    configOverrides: AgentConfigOverrides;
  },
  config: LifecycleHandlerConfig
): Promise<AgentLifecycleResult> {
  const { agentComponent, logger } = config;

  const checkpoints = await ctx.runQuery(agentComponent.checkpoints.getByAgentId, {
    agentId: args.agentId,
  });

  if (checkpoints.length === 0) {
    return {
      success: false,
      agentId: args.agentId,
      code: "AGENT_NOT_FOUND",
      message: `No checkpoints found for agent "${args.agentId}"`,
    };
  }

  const currentState = checkpoints[0]!.status;
  // RECONFIGURE valid from: active, paused
  if (currentState !== "active" && currentState !== "paused") {
    return {
      success: false,
      agentId: args.agentId,
      code: "INVALID_LIFECYCLE_TRANSITION",
      message: `Cannot RECONFIGURE agent "${args.agentId}": current state is "${currentState}", expected "active" or "paused"`,
      currentState,
    };
  }

  // Apply config overrides to checkpoint
  await ctx.runMutation(agentComponent.checkpoints.patchConfigOverrides, {
    agentId: args.agentId,
    configOverrides: args.configOverrides,
  });

  // If paused, implicitly resume to active
  if (currentState === "paused") {
    await ctx.runMutation(agentComponent.checkpoints.updateStatus, {
      agentId: args.agentId,
      status: "active",
    });
  }

  const payload: AgentReconfiguredPayload = {
    previousState: currentState,
    previousOverrides: checkpoints[0]!.configOverrides,
    newOverrides: args.configOverrides,
    correlationId: args.correlationId,
  };

  await ctx.runMutation(agentComponent.audit.record, {
    eventType: "AgentReconfigured",
    agentId: args.agentId,
    decisionId: createLifecycleDecisionId(args.agentId),
    timestamp: Date.now(),
    payload,
  });

  logger?.info("Agent reconfigured", {
    agentId: args.agentId,
    previousState: currentState,
    newState: "active",
    configOverrides: args.configOverrides,
  });

  return {
    success: true,
    agentId: args.agentId,
    previousState: currentState,
    newState: "active",
  };
}

// ============================================================================
// Handler Factory (Optional Convenience)
// ============================================================================

/**
 * Create all lifecycle command handlers with shared configuration.
 *
 * Convenience factory that binds the agent component API and logger to
 * all five handlers. Returns handler functions ready to be used in
 * Convex mutation definitions.
 *
 * @param config - Shared handler configuration
 * @returns Object with all five lifecycle handlers
 *
 * @example
 * ```typescript
 * // In convex/agent/lifecycle.ts:
 * const handlers = createLifecycleHandlers({
 *   agentComponent: {
 *     checkpoints: {
 *       getByAgentId: components.agentBC.checkpoints.getByAgentId,
 *       updateStatus: components.agentBC.checkpoints.updateStatus,
 *       patchConfigOverrides: components.agentBC.checkpoints.patchConfigOverrides,
 *     },
 *     audit: {
 *       record: components.agentBC.audit.record,
 *     },
 *   },
 *   logger: createLogger("agent-lifecycle"),
 * });
 *
 * export const start = internalMutation({
 *   args: startAgentArgsValidator,
 *   handler: (ctx, args) => handlers.start(ctx, args),
 * });
 *
 * export const pause = internalMutation({
 *   args: pauseAgentArgsValidator,
 *   handler: (ctx, args) => handlers.pause(ctx, args),
 * });
 * ```
 */
export function createLifecycleHandlers(config: LifecycleHandlerConfig) {
  return {
    start: (ctx: MutationCtx, args: { agentId: string; correlationId: string }) =>
      handleStartAgent(ctx, args, config),

    pause: (ctx: MutationCtx, args: { agentId: string; correlationId: string; reason?: string }) =>
      handlePauseAgent(ctx, args, config),

    resume: (ctx: MutationCtx, args: { agentId: string; correlationId: string }) =>
      handleResumeAgent(ctx, args, config),

    stop: (ctx: MutationCtx, args: { agentId: string; correlationId: string; reason?: string }) =>
      handleStopAgent(ctx, args, config),

    reconfigure: (
      ctx: MutationCtx,
      args: {
        agentId: string;
        correlationId: string;
        configOverrides: AgentConfigOverrides;
      }
    ) => handleReconfigureAgent(ctx, args, config),
  };
}
