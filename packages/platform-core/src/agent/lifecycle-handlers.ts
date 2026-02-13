/**
 * Agent Lifecycle Handlers -- Command Handlers for Lifecycle State Transitions
 *
 * Provides handler functions for the 5 lifecycle commands:
 * StartAgent, PauseAgent, ResumeAgent, StopAgent, ReconfigureAgent
 *
 * Each handler:
 * 1. Loads checkpoint via AgentComponentAPI
 * 2. Validates FSM transition via lifecycle-fsm
 * 3. Updates checkpoint status via agent component
 * 4. Records audit event
 * 5. Returns AgentLifecycleResult
 *
 * Handlers use infrastructure mutations directly (NOT CommandOrchestrator).
 * They bypass the command bus per design -- lifecycle management is
 * a platform concern, not a domain command.
 *
 * @module agent/lifecycle-handlers
 */

import type { FunctionReference } from "convex/server";
import type { Logger } from "../logging/types.js";
import { createPlatformNoOpLogger } from "../logging/scoped.js";
import type { AgentComponentAPI } from "./oncomplete-handler.js";
import type { AgentLifecycleState } from "./lifecycle-fsm.js";
import { transitionAgentState, commandToEvent } from "./lifecycle-fsm.js";
import type { AgentLifecycleResult, AgentConfigOverrides } from "./lifecycle-commands.js";
import { AGENT_LIFECYCLE_ERROR_CODES } from "./lifecycle-commands.js";
import { createLifecycleDecisionId } from "./audit.js";

// ============================================================================
// Internal Helper Type
// ============================================================================

/**
 * Minimal interface for ctx.runMutation used via type assertion.
 *
 * The factory is platform-agnostic (TCtx = unknown), so we cast to this
 * interface when calling component mutations. At the app level, the actual
 * Convex MutationCtx satisfies this interface.
 */
interface RunMutationCtx {
  runMutation<T>(ref: FunctionReference<"mutation">, args: Record<string, unknown>): Promise<T>;
}

/**
 * Shape of the checkpoint object returned by loadOrCreate.
 */
interface CheckpointShape {
  readonly status: string;
  readonly lastProcessedPosition: number;
  readonly lastEventId: string;
  readonly eventsProcessed: number;
  readonly configOverrides?: unknown;
}

// ============================================================================
// Handler Configuration
// ============================================================================

/**
 * Configuration for lifecycle handler factories.
 *
 * All handlers share the same component API and logger.
 */
export interface LifecycleHandlerConfig {
  /** Agent component API references for mutations */
  readonly agentComponent: AgentComponentAPI;

  /** Optional logger (defaults to no-op) */
  readonly logger?: Logger;
}

// ============================================================================
// Handler Args Types
// ============================================================================

/** Arguments for StartAgent lifecycle command */
export interface StartAgentArgs {
  readonly agentId: string;
  readonly correlationId: string;
}

/** Arguments for PauseAgent lifecycle command */
export interface PauseAgentArgs {
  readonly agentId: string;
  readonly correlationId: string;
  readonly reason?: string;
}

/** Arguments for ResumeAgent lifecycle command */
export interface ResumeAgentArgs {
  readonly agentId: string;
  readonly correlationId: string;
}

/** Arguments for StopAgent lifecycle command */
export interface StopAgentArgs {
  readonly agentId: string;
  readonly correlationId: string;
  readonly reason?: string;
}

/** Arguments for ReconfigureAgent lifecycle command */
export interface ReconfigureAgentArgs {
  readonly agentId: string;
  readonly correlationId: string;
  readonly configOverrides: AgentConfigOverrides;
}

// ============================================================================
// Factory Return Type
// ============================================================================

/**
 * Collection of all lifecycle handlers returned by createLifecycleHandlers.
 */
export interface LifecycleHandlers<TCtx = unknown> {
  readonly handleStartAgent: (ctx: TCtx, args: StartAgentArgs) => Promise<AgentLifecycleResult>;
  readonly handlePauseAgent: (ctx: TCtx, args: PauseAgentArgs) => Promise<AgentLifecycleResult>;
  readonly handleResumeAgent: (ctx: TCtx, args: ResumeAgentArgs) => Promise<AgentLifecycleResult>;
  readonly handleStopAgent: (ctx: TCtx, args: StopAgentArgs) => Promise<AgentLifecycleResult>;
  readonly handleReconfigureAgent: (
    ctx: TCtx,
    args: ReconfigureAgentArgs
  ) => Promise<AgentLifecycleResult>;
}

// ============================================================================
// Individual Handlers
// ============================================================================

/**
 * Create a StartAgent lifecycle handler.
 *
 * Transitions agent from `stopped` to `active`.
 *
 * @typeParam TCtx - The mutation context type (e.g., Convex MutationCtx)
 * @param config - Handler configuration
 * @returns Handler function for StartAgent command
 */
export function handleStartAgent<TCtx = unknown>(
  config: LifecycleHandlerConfig
): (ctx: TCtx, args: StartAgentArgs) => Promise<AgentLifecycleResult> {
  const logger = config.logger ?? createPlatformNoOpLogger();
  const comp = config.agentComponent;

  return async (ctx: TCtx, args: StartAgentArgs): Promise<AgentLifecycleResult> => {
    const mutCtx = ctx as RunMutationCtx;

    // 1. Load checkpoint
    const result = await mutCtx.runMutation(comp.checkpoints.loadOrCreate, {
      agentId: args.agentId,
      subscriptionId: `sub_${args.agentId}`,
    });
    const checkpoint = (result as { checkpoint: CheckpointShape }).checkpoint;

    // 2. Validate FSM transition
    const currentState = checkpoint.status as AgentLifecycleState;
    const event = commandToEvent("StartAgent");
    if (!event) {
      return {
        success: false,
        agentId: args.agentId,
        code: AGENT_LIFECYCLE_ERROR_CODES.INVALID_LIFECYCLE_TRANSITION,
        message: "Unknown command type: StartAgent",
        currentState,
      };
    }

    const nextState = transitionAgentState(currentState, event);
    if (nextState === null) {
      logger.warn("Invalid lifecycle transition", {
        agentId: args.agentId,
        command: "StartAgent",
        currentState,
      });
      return {
        success: false,
        agentId: args.agentId,
        code: AGENT_LIFECYCLE_ERROR_CODES.INVALID_LIFECYCLE_TRANSITION,
        message: `Cannot START agent from "${currentState}" state`,
        currentState,
      };
    }

    // 3. Update checkpoint status
    await mutCtx.runMutation(comp.checkpoints.update, {
      agentId: args.agentId,
      subscriptionId: `sub_${args.agentId}`,
      status: nextState,
    });

    // 4. Record audit event
    const decisionId = createLifecycleDecisionId(args.agentId);
    await mutCtx.runMutation(comp.audit.record, {
      eventType: "AgentStarted",
      agentId: args.agentId,
      decisionId,
      timestamp: Date.now(),
      payload: {
        previousState: currentState,
        correlationId: args.correlationId,
        resumeFromPosition: checkpoint.lastProcessedPosition + 1,
      },
    });

    logger.info("Agent started", {
      agentId: args.agentId,
      previousState: currentState,
      newState: nextState,
    });

    // 5. Return success
    return {
      success: true,
      agentId: args.agentId,
      previousState: currentState,
      newState: nextState,
    };
  };
}

/**
 * Create a PauseAgent lifecycle handler.
 *
 * Transitions agent from `active` to `paused`.
 *
 * @typeParam TCtx - The mutation context type
 * @param config - Handler configuration
 * @returns Handler function for PauseAgent command
 */
export function handlePauseAgent<TCtx = unknown>(
  config: LifecycleHandlerConfig
): (ctx: TCtx, args: PauseAgentArgs) => Promise<AgentLifecycleResult> {
  const logger = config.logger ?? createPlatformNoOpLogger();
  const comp = config.agentComponent;

  return async (ctx: TCtx, args: PauseAgentArgs): Promise<AgentLifecycleResult> => {
    const mutCtx = ctx as RunMutationCtx;

    // 1. Load checkpoint
    const result = await mutCtx.runMutation(comp.checkpoints.loadOrCreate, {
      agentId: args.agentId,
      subscriptionId: `sub_${args.agentId}`,
    });
    const checkpoint = (result as { checkpoint: CheckpointShape }).checkpoint;

    // 2. Validate FSM transition
    const currentState = checkpoint.status as AgentLifecycleState;
    const event = commandToEvent("PauseAgent");
    if (!event) {
      return {
        success: false,
        agentId: args.agentId,
        code: AGENT_LIFECYCLE_ERROR_CODES.INVALID_LIFECYCLE_TRANSITION,
        message: "Unknown command type: PauseAgent",
        currentState,
      };
    }

    const nextState = transitionAgentState(currentState, event);
    if (nextState === null) {
      logger.warn("Invalid lifecycle transition", {
        agentId: args.agentId,
        command: "PauseAgent",
        currentState,
      });
      return {
        success: false,
        agentId: args.agentId,
        code: AGENT_LIFECYCLE_ERROR_CODES.INVALID_LIFECYCLE_TRANSITION,
        message: `Cannot PAUSE agent from "${currentState}" state`,
        currentState,
      };
    }

    // 3. Update checkpoint status
    await mutCtx.runMutation(comp.checkpoints.update, {
      agentId: args.agentId,
      subscriptionId: `sub_${args.agentId}`,
      status: nextState,
    });

    // 4. Record audit event
    const decisionId = createLifecycleDecisionId(args.agentId);
    await mutCtx.runMutation(comp.audit.record, {
      eventType: "AgentPaused",
      agentId: args.agentId,
      decisionId,
      timestamp: Date.now(),
      payload: {
        reason: args.reason,
        correlationId: args.correlationId,
        pausedAtPosition: checkpoint.lastProcessedPosition,
        eventsProcessedAtPause: checkpoint.eventsProcessed,
      },
    });

    logger.info("Agent paused", {
      agentId: args.agentId,
      reason: args.reason,
      previousState: currentState,
      newState: nextState,
    });

    // 5. Return success
    return {
      success: true,
      agentId: args.agentId,
      previousState: currentState,
      newState: nextState,
    };
  };
}

/**
 * Create a ResumeAgent lifecycle handler.
 *
 * Transitions agent from `paused` to `active`.
 *
 * @typeParam TCtx - The mutation context type
 * @param config - Handler configuration
 * @returns Handler function for ResumeAgent command
 */
export function handleResumeAgent<TCtx = unknown>(
  config: LifecycleHandlerConfig
): (ctx: TCtx, args: ResumeAgentArgs) => Promise<AgentLifecycleResult> {
  const logger = config.logger ?? createPlatformNoOpLogger();
  const comp = config.agentComponent;

  return async (ctx: TCtx, args: ResumeAgentArgs): Promise<AgentLifecycleResult> => {
    const mutCtx = ctx as RunMutationCtx;

    // 1. Load checkpoint
    const result = await mutCtx.runMutation(comp.checkpoints.loadOrCreate, {
      agentId: args.agentId,
      subscriptionId: `sub_${args.agentId}`,
    });
    const checkpoint = (result as { checkpoint: CheckpointShape }).checkpoint;

    // 2. Validate FSM transition
    const currentState = checkpoint.status as AgentLifecycleState;
    const event = commandToEvent("ResumeAgent");
    if (!event) {
      return {
        success: false,
        agentId: args.agentId,
        code: AGENT_LIFECYCLE_ERROR_CODES.INVALID_LIFECYCLE_TRANSITION,
        message: "Unknown command type: ResumeAgent",
        currentState,
      };
    }

    const nextState = transitionAgentState(currentState, event);
    if (nextState === null) {
      logger.warn("Invalid lifecycle transition", {
        agentId: args.agentId,
        command: "ResumeAgent",
        currentState,
      });
      return {
        success: false,
        agentId: args.agentId,
        code: AGENT_LIFECYCLE_ERROR_CODES.INVALID_LIFECYCLE_TRANSITION,
        message: `Cannot RESUME agent from "${currentState}" state`,
        currentState,
      };
    }

    // 3. Update checkpoint status
    await mutCtx.runMutation(comp.checkpoints.update, {
      agentId: args.agentId,
      subscriptionId: `sub_${args.agentId}`,
      status: nextState,
    });

    // 4. Record audit event
    const decisionId = createLifecycleDecisionId(args.agentId);
    await mutCtx.runMutation(comp.audit.record, {
      eventType: "AgentResumed",
      agentId: args.agentId,
      decisionId,
      timestamp: Date.now(),
      payload: {
        resumeFromPosition: checkpoint.lastProcessedPosition + 1,
        correlationId: args.correlationId,
      },
    });

    logger.info("Agent resumed", {
      agentId: args.agentId,
      previousState: currentState,
      newState: nextState,
    });

    // 5. Return success
    return {
      success: true,
      agentId: args.agentId,
      previousState: currentState,
      newState: nextState,
    };
  };
}

/**
 * Create a StopAgent lifecycle handler.
 *
 * Transitions agent from `active`, `paused`, or `error_recovery` to `stopped`.
 * Stop is a universal escape hatch from any running state.
 *
 * @typeParam TCtx - The mutation context type
 * @param config - Handler configuration
 * @returns Handler function for StopAgent command
 */
export function handleStopAgent<TCtx = unknown>(
  config: LifecycleHandlerConfig
): (ctx: TCtx, args: StopAgentArgs) => Promise<AgentLifecycleResult> {
  const logger = config.logger ?? createPlatformNoOpLogger();
  const comp = config.agentComponent;

  return async (ctx: TCtx, args: StopAgentArgs): Promise<AgentLifecycleResult> => {
    const mutCtx = ctx as RunMutationCtx;

    // 1. Load checkpoint
    const result = await mutCtx.runMutation(comp.checkpoints.loadOrCreate, {
      agentId: args.agentId,
      subscriptionId: `sub_${args.agentId}`,
    });
    const checkpoint = (result as { checkpoint: CheckpointShape }).checkpoint;

    // 2. Validate FSM transition
    const currentState = checkpoint.status as AgentLifecycleState;
    const event = commandToEvent("StopAgent");
    if (!event) {
      return {
        success: false,
        agentId: args.agentId,
        code: AGENT_LIFECYCLE_ERROR_CODES.INVALID_LIFECYCLE_TRANSITION,
        message: "Unknown command type: StopAgent",
        currentState,
      };
    }

    const nextState = transitionAgentState(currentState, event);
    if (nextState === null) {
      logger.warn("Invalid lifecycle transition", {
        agentId: args.agentId,
        command: "StopAgent",
        currentState,
      });
      return {
        success: false,
        agentId: args.agentId,
        code: AGENT_LIFECYCLE_ERROR_CODES.INVALID_LIFECYCLE_TRANSITION,
        message: `Cannot STOP agent from "${currentState}" state`,
        currentState,
      };
    }

    // 3. Update checkpoint status
    await mutCtx.runMutation(comp.checkpoints.update, {
      agentId: args.agentId,
      subscriptionId: `sub_${args.agentId}`,
      status: nextState,
    });

    // 4. Record audit event
    const decisionId = createLifecycleDecisionId(args.agentId);
    await mutCtx.runMutation(comp.audit.record, {
      eventType: "AgentStopped",
      agentId: args.agentId,
      decisionId,
      timestamp: Date.now(),
      payload: {
        previousState: currentState,
        reason: args.reason,
        correlationId: args.correlationId,
        stoppedAtPosition: checkpoint.lastProcessedPosition,
      },
    });

    logger.info("Agent stopped", {
      agentId: args.agentId,
      reason: args.reason,
      previousState: currentState,
      newState: nextState,
    });

    // 5. Return success
    return {
      success: true,
      agentId: args.agentId,
      previousState: currentState,
      newState: nextState,
    };
  };
}

/**
 * Create a ReconfigureAgent lifecycle handler.
 *
 * Transitions agent to `active` state (from `active` or `paused`)
 * and applies configuration overrides by merging them with existing overrides.
 *
 * @typeParam TCtx - The mutation context type
 * @param config - Handler configuration
 * @returns Handler function for ReconfigureAgent command
 */
export function handleReconfigureAgent<TCtx = unknown>(
  config: LifecycleHandlerConfig
): (ctx: TCtx, args: ReconfigureAgentArgs) => Promise<AgentLifecycleResult> {
  const logger = config.logger ?? createPlatformNoOpLogger();
  const comp = config.agentComponent;

  return async (ctx: TCtx, args: ReconfigureAgentArgs): Promise<AgentLifecycleResult> => {
    const mutCtx = ctx as RunMutationCtx;

    // 1. Load checkpoint
    const result = await mutCtx.runMutation(comp.checkpoints.loadOrCreate, {
      agentId: args.agentId,
      subscriptionId: `sub_${args.agentId}`,
    });
    const checkpoint = (result as { checkpoint: CheckpointShape }).checkpoint;

    // 2. Validate FSM transition
    const currentState = checkpoint.status as AgentLifecycleState;
    const event = commandToEvent("ReconfigureAgent");
    if (!event) {
      return {
        success: false,
        agentId: args.agentId,
        code: AGENT_LIFECYCLE_ERROR_CODES.INVALID_LIFECYCLE_TRANSITION,
        message: "Unknown command type: ReconfigureAgent",
        currentState,
      };
    }

    const nextState = transitionAgentState(currentState, event);
    if (nextState === null) {
      logger.warn("Invalid lifecycle transition", {
        agentId: args.agentId,
        command: "ReconfigureAgent",
        currentState,
      });
      return {
        success: false,
        agentId: args.agentId,
        code: AGENT_LIFECYCLE_ERROR_CODES.INVALID_LIFECYCLE_TRANSITION,
        message: `Cannot RECONFIGURE agent from "${currentState}" state`,
        currentState,
      };
    }

    // 3. Merge config overrides
    const previousOverrides = checkpoint.configOverrides as AgentConfigOverrides | undefined;
    const mergedOverrides: AgentConfigOverrides = {
      ...previousOverrides,
      ...args.configOverrides,
    };

    // 4. Update checkpoint status + config overrides
    await mutCtx.runMutation(comp.checkpoints.update, {
      agentId: args.agentId,
      subscriptionId: `sub_${args.agentId}`,
      status: nextState,
      configOverrides: mergedOverrides,
    });

    // 5. Record audit event
    const decisionId = createLifecycleDecisionId(args.agentId);
    await mutCtx.runMutation(comp.audit.record, {
      eventType: "AgentReconfigured",
      agentId: args.agentId,
      decisionId,
      timestamp: Date.now(),
      payload: {
        previousState: currentState,
        previousOverrides,
        newOverrides: args.configOverrides,
        correlationId: args.correlationId,
      },
    });

    logger.info("Agent reconfigured", {
      agentId: args.agentId,
      previousState: currentState,
      newState: nextState,
    });

    // 6. Return success
    return {
      success: true,
      agentId: args.agentId,
      previousState: currentState,
      newState: nextState,
    };
  };
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create all lifecycle handlers from a single configuration.
 *
 * Returns an object containing all 5 lifecycle command handlers,
 * each pre-configured with the agent component API and logger.
 *
 * @typeParam TCtx - The mutation context type (e.g., Convex MutationCtx)
 * @param config - Handler configuration shared by all handlers
 * @returns Object with all 5 lifecycle handler functions
 *
 * @example
 * ```typescript
 * const handlers = createLifecycleHandlers({
 *   agentComponent: {
 *     checkpoints: {
 *       loadOrCreate: components.agentBC.checkpoints.loadOrCreate,
 *       update: components.agentBC.checkpoints.update,
 *     },
 *     audit: { record: components.agentBC.audit.record },
 *     commands: { record: components.agentBC.commands.record },
 *     approvals: { create: components.agentBC.approvals.create },
 *     deadLetters: { record: components.agentBC.deadLetters.record },
 *   },
 *   logger: createScopedLogger("LifecycleHandlers", "INFO"),
 * });
 *
 * // Use individual handlers in mutation definitions:
 * const result = await handlers.handleStartAgent(ctx, {
 *   agentId: "churn-risk-agent",
 *   correlationId: "corr_123",
 * });
 * ```
 */
export function createLifecycleHandlers<TCtx = unknown>(
  config: LifecycleHandlerConfig
): LifecycleHandlers<TCtx> {
  return {
    handleStartAgent: handleStartAgent<TCtx>(config),
    handlePauseAgent: handlePauseAgent<TCtx>(config),
    handleResumeAgent: handleResumeAgent<TCtx>(config),
    handleStopAgent: handleStopAgent<TCtx>(config),
    handleReconfigureAgent: handleReconfigureAgent<TCtx>(config),
  };
}
