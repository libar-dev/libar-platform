/**
 * Agent Lifecycle Handlers -- Command Handlers for Lifecycle State Transitions
 *
 * Provides handler functions for the 5 lifecycle commands:
 * StartAgent, PauseAgent, ResumeAgent, StopAgent, ReconfigureAgent
 *
 * Each handler delegates to `executeLifecycleTransition`, which encapsulates
 * the shared 5-step pattern:
 * 1. Load checkpoint via AgentComponentAPI
 * 2. Validate FSM transition via lifecycle-fsm
 * 3. (Optional) Run pre-transition hook (e.g. config merge for ReconfigureAgent)
 * 4. Update checkpoint status + record audit event atomically
 * 5. Log and return AgentLifecycleResult
 *
 * Handlers use infrastructure mutations directly (NOT CommandOrchestrator).
 * They bypass the command bus per design -- lifecycle management is
 * a platform concern, not a domain command.
 *
 * @module agent/lifecycle-handlers
 */

import type { Logger } from "../logging/types.js";
import { createPlatformNoOpLogger } from "../logging/scoped.js";
import type { AgentComponentAPI, RunMutationCtx } from "./handler-types.js";
import { getAgentSubscriptionId } from "./handler-types.js";
import type { AgentLifecycleState } from "./lifecycle-fsm.js";
import { transitionAgentState, commandToEvent } from "./lifecycle-fsm.js";
import type { AgentLifecycleResult, AgentConfigOverrides } from "./lifecycle-commands.js";
import { AGENT_LIFECYCLE_ERROR_CODES } from "./lifecycle-commands.js";
import { createLifecycleDecisionId } from "./audit.js";

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
// Generic Lifecycle Transition Helper
// ============================================================================

/**
 * Static configuration for a lifecycle transition -- invariant per command type.
 */
interface LifecycleTransitionConfig {
  /** Command name: "StartAgent", "PauseAgent", etc. */
  readonly commandName: string;
  /** Audit event type: "AgentStarted", "AgentPaused", etc. */
  readonly auditEventType: string;
  /** Past-tense verb for log message: "started", "paused", etc. */
  readonly logVerb: string;
}

/**
 * Common lifecycle transition logic shared by all 5 handlers.
 *
 * Loads checkpoint, validates FSM transition, optionally runs a pre-transition
 * hook, atomically transitions status + records audit, logs, and returns result.
 *
 * @param mutCtx - Convex mutation context
 * @param comp - Agent component API
 * @param logger - Logger instance
 * @param agentId - Agent identifier
 * @param config - Static transition config (command name + audit event type)
 * @param buildAuditPayload - Builds the audit event payload from checkpoint state
 * @param preTransition - Optional hook run after FSM validation but before the atomic transition
 * @returns Lifecycle result (success or failure)
 */
async function executeLifecycleTransition(
  mutCtx: RunMutationCtx,
  comp: AgentComponentAPI,
  logger: Logger,
  agentId: string,
  config: LifecycleTransitionConfig,
  buildAuditPayload: (
    currentState: AgentLifecycleState,
    checkpoint: CheckpointShape
  ) => Record<string, unknown>,
  preTransition?: (checkpoint: CheckpointShape, nextState: AgentLifecycleState) => Promise<void>
): Promise<AgentLifecycleResult> {
  // 1. Load checkpoint
  const result = await mutCtx.runMutation(comp.checkpoints.loadOrCreate, {
    agentId,
    subscriptionId: getAgentSubscriptionId(agentId),
  });
  const checkpoint = (result as { checkpoint?: CheckpointShape })?.checkpoint;
  if (!checkpoint) {
    logger.error("Checkpoint unavailable from loadOrCreate", { agentId });
    return {
      success: false,
      agentId,
      code: AGENT_LIFECYCLE_ERROR_CODES.INVALID_LIFECYCLE_TRANSITION,
      message: "Failed to load or create checkpoint",
      currentState: "stopped" as AgentLifecycleState,
    };
  }

  // 2. Validate FSM transition
  const currentState = checkpoint.status as AgentLifecycleState;
  const event = commandToEvent(config.commandName);
  if (!event) {
    return {
      success: false,
      agentId,
      code: AGENT_LIFECYCLE_ERROR_CODES.INVALID_LIFECYCLE_TRANSITION,
      message: `Unknown command type: ${config.commandName}`,
      currentState,
    };
  }

  const nextState = transitionAgentState(currentState, event);
  if (nextState === null) {
    logger.warn("Invalid lifecycle transition", {
      agentId,
      command: config.commandName,
      currentState,
    });
    return {
      success: false,
      agentId,
      code: AGENT_LIFECYCLE_ERROR_CODES.INVALID_LIFECYCLE_TRANSITION,
      message: `Cannot ${event} agent from "${currentState}" state`,
      currentState,
    };
  }

  // 3. Optional pre-transition hook (e.g. config patch for ReconfigureAgent)
  if (preTransition) {
    await preTransition(checkpoint, nextState);
  }

  // 4. Atomic transition: update status + record audit
  const decisionId = createLifecycleDecisionId(agentId);
  await mutCtx.runMutation(comp.checkpoints.transitionLifecycle, {
    agentId,
    status: nextState,
    auditEvent: {
      eventType: config.auditEventType,
      decisionId,
      timestamp: Date.now(),
      payload: buildAuditPayload(currentState, checkpoint),
    },
  });

  logger.info(`Agent ${config.logVerb}`, {
    agentId,
    previousState: currentState,
    newState: nextState,
  });

  // 5. Return success
  return {
    success: true,
    agentId,
    previousState: currentState,
    newState: nextState,
  };
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
    return executeLifecycleTransition(
      ctx as RunMutationCtx,
      comp,
      logger,
      args.agentId,
      { commandName: "StartAgent", auditEventType: "AgentStarted", logVerb: "started" },
      (currentState, checkpoint) => ({
        previousState: currentState,
        correlationId: args.correlationId,
        resumeFromPosition: checkpoint.lastProcessedPosition + 1,
      })
    );
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
    return executeLifecycleTransition(
      ctx as RunMutationCtx,
      comp,
      logger,
      args.agentId,
      { commandName: "PauseAgent", auditEventType: "AgentPaused", logVerb: "paused" },
      (_currentState, checkpoint) => ({
        reason: args.reason,
        correlationId: args.correlationId,
        pausedAtPosition: checkpoint.lastProcessedPosition,
        eventsProcessedAtPause: checkpoint.eventsProcessed,
      })
    );
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
    return executeLifecycleTransition(
      ctx as RunMutationCtx,
      comp,
      logger,
      args.agentId,
      { commandName: "ResumeAgent", auditEventType: "AgentResumed", logVerb: "resumed" },
      (_currentState, checkpoint) => ({
        resumeFromPosition: checkpoint.lastProcessedPosition + 1,
        correlationId: args.correlationId,
      })
    );
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
    return executeLifecycleTransition(
      ctx as RunMutationCtx,
      comp,
      logger,
      args.agentId,
      { commandName: "StopAgent", auditEventType: "AgentStopped", logVerb: "stopped" },
      (currentState, checkpoint) => ({
        previousState: currentState,
        reason: args.reason,
        correlationId: args.correlationId,
        stoppedAtPosition: checkpoint.lastProcessedPosition,
      })
    );
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

    return executeLifecycleTransition(
      mutCtx,
      comp,
      logger,
      args.agentId,
      {
        commandName: "ReconfigureAgent",
        auditEventType: "AgentReconfigured",
        logVerb: "reconfigured",
      },
      (currentState, checkpoint) => ({
        previousState: currentState,
        previousOverrides: checkpoint.configOverrides as AgentConfigOverrides | undefined,
        newOverrides: args.configOverrides,
        correlationId: args.correlationId,
      }),
      async (checkpoint) => {
        // Merge config overrides before transition
        const previousOverrides = checkpoint.configOverrides as AgentConfigOverrides | undefined;
        const mergedOverrides: AgentConfigOverrides = {
          ...previousOverrides,
          ...args.configOverrides,
        };
        if (comp.checkpoints.patchConfigOverrides) {
          await mutCtx.runMutation(comp.checkpoints.patchConfigOverrides, {
            agentId: args.agentId,
            configOverrides: mergedOverrides,
          });
        }
      }
    );
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
