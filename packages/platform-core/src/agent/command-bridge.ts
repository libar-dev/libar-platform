/**
 * Agent Command Bridge -- Route Agent Commands to CommandOrchestrator
 *
 * The bridge is a mutation handler factory that:
 * 1. Receives routing args (decisionId, commandType, agentId, correlationId)
 * 2. Looks up the route in the static AgentCommandRouteMap
 * 3. Transforms args via route.toOrchestratorArgs()
 * 4. Resolves the CommandConfig from the CommandRegistry
 * 5. Calls CommandOrchestrator.execute()
 * 6. Records audit events (AgentCommandRouted or AgentCommandRoutingFailed)
 * 7. Optionally updates command status (if updateStatus API is available)
 *
 * The bridge runs as a separate mutation scheduled by ctx.scheduler.runAfter(0)
 * from the onComplete handler. This decouples command routing from checkpoint
 * advancement.
 *
 * @module agent/command-bridge
 */

import type { Logger } from "../logging/types.js";
import { createPlatformNoOpLogger } from "../logging/scoped.js";
import type { AgentComponentAPI, RunMutationCtx } from "./handler-types.js";
import type {
  AgentCommandRouteMap,
  RoutingContext,
  RecordedAgentCommand,
} from "./command-router.js";
import { getRoute, COMMAND_ROUTING_ERROR_CODES } from "./command-router.js";

// ============================================================================
// Bridge Handler Args
// ============================================================================

/**
 * Arguments for the command bridge mutation.
 *
 * These are passed by the onComplete handler when scheduling the bridge
 * via ctx.scheduler.runAfter(0, routeCommandRef, args).
 */
export interface RouteAgentCommandArgs {
  readonly decisionId: string;
  readonly commandType: string;
  readonly agentId: string;
  readonly correlationId: string;
  readonly patternId?: string;
}

// ============================================================================
// Audit Event Types
// ============================================================================

/**
 * Audit event emitted when command routing succeeds.
 */
export interface AgentCommandRoutedEvent {
  readonly eventType: "AgentCommandRouted";
  readonly agentId: string;
  readonly decisionId: string;
  readonly commandType: string;
  readonly boundedContext: string;
  readonly correlationId: string;
  readonly patternId?: string;
  readonly timestamp: number;
}

/**
 * Audit event emitted when command routing fails.
 */
export interface AgentCommandRoutingFailedEvent {
  readonly eventType: "AgentCommandRoutingFailed";
  readonly agentId: string;
  readonly decisionId: string;
  readonly commandType: string;
  readonly correlationId: string;
  readonly error: string;
  readonly timestamp: number;
}

// ============================================================================
// Dependencies
// ============================================================================

/**
 * Minimal interface for command registry lookup.
 *
 * The bridge needs to verify that the target command exists in the registry
 * and retrieve its config for orchestrator execution.
 */
export interface CommandRegistryInterface {
  getConfig(commandType: string): unknown | undefined;
  has(commandType: string): boolean;
}

/**
 * Minimal interface for command orchestrator execution.
 *
 * The bridge delegates actual command execution to the orchestrator,
 * which handles dual-write, event append, and projection triggering.
 */
export interface CommandOrchestratorInterface {
  execute(ctx: unknown, config: unknown, args: Record<string, unknown>): Promise<unknown>;
}

// ============================================================================
// Bridge Configuration
// ============================================================================

/**
 * Configuration for the command bridge factory.
 */
export interface CommandBridgeConfig {
  /** Agent component API for audit recording and command status updates */
  readonly agentComponent: AgentComponentAPI;
  /** Static route map: agent command type -> target command route */
  readonly commandRoutes: AgentCommandRouteMap;
  /** Command registry for config lookup */
  readonly commandRegistry: CommandRegistryInterface;
  /** Command orchestrator for execution */
  readonly commandOrchestrator: CommandOrchestratorInterface;
  /** Optional logger */
  readonly logger?: Logger;
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create the command bridge handler function.
 *
 * Returns a handler that routes agent-emitted commands to the
 * CommandOrchestrator. The handler follows the NO-THROW pattern:
 * all errors are caught, logged, and recorded as audit events.
 *
 * Flow:
 * 1. Look up route in AgentCommandRouteMap
 * 2. No route -> audit AgentCommandRoutingFailed + update status to "failed"
 * 3. Verify command exists in CommandRegistry
 * 4. Transform args via route.toOrchestratorArgs()
 * 5. Execute via CommandOrchestrator
 * 6. Success -> audit AgentCommandRouted + update status to "completed"
 * 7. Failure -> audit AgentCommandRoutingFailed + update status to "failed"
 *
 * @typeParam TCtx - The mutation context type (e.g., Convex MutationCtx)
 * @param config - Bridge configuration
 * @returns Handler function to wrap in internalMutation
 */
export function createCommandBridgeHandler<TCtx = unknown>(
  config: CommandBridgeConfig
): (ctx: TCtx, args: RouteAgentCommandArgs) => Promise<void> {
  const logger = config.logger ?? createPlatformNoOpLogger();
  const comp = config.agentComponent;

  return async (ctx: TCtx, args: RouteAgentCommandArgs): Promise<void> => {
    const mutCtx = ctx as RunMutationCtx;
    const { decisionId, commandType, agentId, correlationId, patternId } = args;

    // ----------------------------------------------------------------
    // 1. Look up route
    // ----------------------------------------------------------------
    const route = getRoute(config.commandRoutes, commandType);
    if (!route) {
      logger.warn("No route found for agent command", {
        commandType,
        agentId,
        decisionId,
      });
      await recordRoutingFailure(mutCtx, comp, logger, {
        agentId,
        decisionId,
        commandType,
        correlationId,
        error: `No route configured for command type '${commandType}'`,
        code: COMMAND_ROUTING_ERROR_CODES.UNKNOWN_ROUTE,
      });
      return;
    }

    // ----------------------------------------------------------------
    // 2. Verify command exists in CommandRegistry
    // ----------------------------------------------------------------
    if (!config.commandRegistry.has(route.commandType)) {
      logger.warn("Command not registered in CommandRegistry", {
        commandType: route.commandType,
        agentId,
        decisionId,
      });
      await recordRoutingFailure(mutCtx, comp, logger, {
        agentId,
        decisionId,
        commandType: route.commandType,
        correlationId,
        error: `Command '${route.commandType}' not registered in CommandRegistry`,
        code: COMMAND_ROUTING_ERROR_CODES.COMMAND_NOT_REGISTERED,
      });
      return;
    }

    // ----------------------------------------------------------------
    // 3. Transform args
    // ----------------------------------------------------------------
    const routingContext: RoutingContext = { agentId, correlationId };

    // Build a minimal RecordedAgentCommand from the scheduling args.
    // The bridge receives all needed metadata in its args -- it does not
    // need to load the full command from the component DB.
    const recordedCommand: RecordedAgentCommand = {
      agentId,
      type: commandType,
      payload: {},
      status: "pending",
      confidence: 0,
      reason: "",
      triggeringEventIds: [],
      decisionId,
      correlationId,
      ...(patternId ? { patternId } : {}),
    };

    let orchestratorArgs: Record<string, unknown>;
    try {
      orchestratorArgs = route.toOrchestratorArgs(recordedCommand, routingContext);
    } catch (transformErr) {
      const errorMsg = transformErr instanceof Error ? transformErr.message : String(transformErr);
      logger.error("Failed to transform agent command args", {
        commandType,
        agentId,
        decisionId,
        error: errorMsg,
      });
      await recordRoutingFailure(mutCtx, comp, logger, {
        agentId,
        decisionId,
        commandType: route.commandType,
        correlationId,
        error: `Transform failed: ${errorMsg}`,
        code: COMMAND_ROUTING_ERROR_CODES.INVALID_TRANSFORM,
      });
      return;
    }

    // ----------------------------------------------------------------
    // 4. Execute via CommandOrchestrator
    // ----------------------------------------------------------------
    const commandConfig = config.commandRegistry.getConfig(route.commandType);
    try {
      await config.commandOrchestrator.execute(mutCtx, commandConfig, orchestratorArgs);

      // ---- Success audit ----
      try {
        await mutCtx.runMutation(comp.audit.record, {
          eventType: "AgentCommandRouted",
          agentId,
          decisionId,
          timestamp: Date.now(),
          payload: {
            commandType: route.commandType,
            boundedContext: route.boundedContext,
            correlationId,
            ...(patternId ? { patternId } : {}),
          },
        });
      } catch (auditErr) {
        // NO-THROW: audit failure does not block command completion
        logger.error("Failed to record AgentCommandRouted audit", {
          agentId,
          decisionId,
          error: auditErr instanceof Error ? auditErr.message : String(auditErr),
        });
      }

      // ---- Update command status to completed ----
      if (comp.commands.updateStatus) {
        try {
          await mutCtx.runMutation(comp.commands.updateStatus, {
            decisionId,
            status: "completed",
          });
        } catch {
          // NO-THROW: status update failure is non-critical
        }
      }
    } catch (execErr) {
      // ---- Execution failure ----
      const errorMsg = execErr instanceof Error ? execErr.message : String(execErr);
      logger.error("Command execution failed in bridge", {
        commandType: route.commandType,
        agentId,
        decisionId,
        error: errorMsg,
      });

      // Record failure audit
      try {
        await mutCtx.runMutation(comp.audit.record, {
          eventType: "AgentCommandRoutingFailed",
          agentId,
          decisionId,
          timestamp: Date.now(),
          payload: {
            commandType: route.commandType,
            correlationId,
            error: errorMsg,
          },
        });
      } catch {
        // NO-THROW
      }

      // Update command status to failed
      if (comp.commands.updateStatus) {
        try {
          await mutCtx.runMutation(comp.commands.updateStatus, {
            decisionId,
            status: "failed",
            error: errorMsg,
          });
        } catch {
          // NO-THROW
        }
      }
    }
  };
}

// ============================================================================
// Internal Helpers
// ============================================================================

/**
 * Record a routing failure: audit event + optional status update.
 *
 * Extracted to reduce duplication across failure paths.
 */
async function recordRoutingFailure(
  mutCtx: RunMutationCtx,
  comp: AgentComponentAPI,
  logger: Logger,
  details: {
    agentId: string;
    decisionId: string;
    commandType: string;
    correlationId: string;
    error: string;
    code: string;
  }
): Promise<void> {
  try {
    await mutCtx.runMutation(comp.audit.record, {
      eventType: "AgentCommandRoutingFailed",
      agentId: details.agentId,
      decisionId: details.decisionId,
      timestamp: Date.now(),
      payload: {
        commandType: details.commandType,
        correlationId: details.correlationId,
        error: details.error,
        code: details.code,
      },
    });
  } catch (auditErr) {
    logger.error("Failed to record routing failure audit", {
      agentId: details.agentId,
      decisionId: details.decisionId,
      error: auditErr instanceof Error ? auditErr.message : String(auditErr),
    });
  }

  if (comp.commands.updateStatus) {
    try {
      await mutCtx.runMutation(comp.commands.updateStatus, {
        decisionId: details.decisionId,
        status: "failed",
        error: details.error,
      });
    } catch {
      // NO-THROW
    }
  }
}
