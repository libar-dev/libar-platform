/**
 * Command Bridge — DS-4 Stub
 *
 * Bridges agent command recording (onComplete step 2) with command routing
 * through CommandOrchestrator. Uses Workpool to keep persistence and routing
 * in separate transactions with built-in retry and failure handling.
 *
 * @target platform-core/src/agent/command-bridge.ts
 *
 * ## Design Decisions
 *
 * - AD-4: Workpool dispatch from onComplete (CHANGED from scheduler.runAfter — holistic review item 2.2)
 * - AD-5: AgentCommandRouteMap maps command types to orchestrator routes
 * - AD-6: patternId flows through AgentActionResult -> commands.record -> routing context
 *
 * ## Integration Points
 *
 * 1. **onComplete handler (DS-2)** — After recording command, enqueues via Workpool
 * 2. **Agent Component commands API (DS-1)** — Loads command by decisionId, updates status
 * 3. **AgentCommandRouteMap (DS-4)** — Looks up route, transforms args
 * 4. **CommandOrchestrator (existing)** — Executes the transformed command
 *
 * @see PDR-012 (Agent Command Routing & Pattern Unification)
 * @see PDR-011 (Agent Action Handler Architecture) — onComplete persistence order
 * @see AgentCommandRouteMap (command-router.ts)
 * @since DS-4 (Command Routing & Pattern Unification)
 */

import type { AgentComponentAPI } from "../agent-action-handler/oncomplete-handler.js";

// ============================================================================
// Scheduling Args
// ============================================================================

/**
 * Arguments for the `routeAgentCommand` mutation.
 *
 * These are passed via Workpool enqueue.
 * Minimal set: just enough to load the command and establish routing context.
 *
 * The actual command payload is loaded from the agent component, not passed
 * through the Workpool — keeps enqueue args small and avoids duplication.
 */
export interface RouteAgentCommandArgs {
  /** Decision ID to load command by */
  readonly decisionId: string;

  /** Command type for quick route lookup (avoids loading command first) */
  readonly commandType: string;

  /** Agent BC identifier for component API scoping */
  readonly agentId: string;

  /** Correlation ID for tracing through CommandOrchestrator */
  readonly correlationId: string;

  /**
   * Pattern that produced this command (DS-4).
   * Forwarded to routing context for audit trail.
   */
  readonly patternId?: string;
}

/**
 * Convex validator for RouteAgentCommandArgs.
 *
 * IMPLEMENTATION NOTE: Use this as the args validator for the
 * routeAgentCommand internalMutation.
 *
 * ```typescript
 * import { v } from "convex/values";
 *
 * const routeAgentCommandArgsValidator = {
 *   decisionId: v.string(),
 *   commandType: v.string(),
 *   agentId: v.string(),
 *   correlationId: v.string(),
 *   patternId: v.optional(v.string()),
 * };
 * ```
 */

// ============================================================================
// Audit Event Types
// ============================================================================

/**
 * Audit event recorded when command routing fails.
 *
 * Stored via the agent component's audit.record API for observability.
 * Enables monitoring dashboards to surface routing failures.
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

/**
 * Audit event recorded when command routing succeeds.
 *
 * Provides end-to-end tracing from agent decision to domain handler execution.
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

// ============================================================================
// onComplete Integration Point
// ============================================================================

/**
 * Integration point in DS-2 onComplete handler.
 *
 * After step 2 (command recording) and before step 3 (approval creation),
 * enqueue the routing mutation via Workpool if a command was recorded.
 *
 * IMPLEMENTATION NOTE: Add this block to the createAgentOnCompleteHandler
 * implementation in oncomplete-handler.ts:
 *
 * ```typescript
 * // DS-2 persistence order (steps 1-4):
 * // 1. Record audit event
 * // 2. Record command if decision includes one
 *
 * // DS-4 ADDITION (step 2b): Enqueue command routing via Workpool
 * // CHANGED (holistic review): Use Workpool instead of scheduler.runAfter(0).
 * // Workpool provides built-in retry, onComplete for failure handling,
 * // and eliminates the need for manual sweep cron.
 * if (decision.command && commandRecorded) {
 *   try {
 *     await ctx.runMutation(config.agentPool.enqueueMutation, {
 *       fnRef: routeAgentCommandRef,
 *       fnArgs: {
 *         decisionId: result.returnValue.decisionId,
 *         commandType: decision.command,
 *         agentId: context.agentId,
 *         correlationId: context.correlationId,
 *         patternId: result.returnValue.patternId,
 *       },
 *       options: {
 *         onComplete: commandRoutingOnCompleteRef,
 *       },
 *     });
 *   } catch (enqueueError) {
 *     // NO-THROW ZONE: Log enqueue failure but don't throw.
 *     // Command remains "pending" — can be retried via admin API.
 *     logger.error("Failed to enqueue command routing", {
 *       decisionId: result.returnValue.decisionId,
 *       commandType: decision.command,
 *       error: String(enqueueError),
 *     });
 *   }
 * }
 *
 * // 3. Create approval if decision.requiresApproval
 * // 4. Update checkpoint LAST
 * ```
 *
 * Key Design Points:
 *
 * - Workpool enqueue — separate transaction, built-in retry and dead-letter
 * - NO-THROW: Enqueue failure doesn't block checkpoint advancement
 * - Command stays "pending" if enqueue fails — recoverable via admin API
 * - patternId flows from AgentActionResult.patternId through to routing context
 */

// REMOVED (holistic review): Sweep cron for stale commands eliminated.
// Workpool handles retry and dead-letter automatically.

// ============================================================================
// routeAgentCommand Mutation
// ============================================================================

/**
 * Route an agent command through CommandOrchestrator.
 *
 * This is an internalMutation enqueued via Workpool by the onComplete handler.
 * It runs in its own transaction, separate from the persistence phase.
 *
 * Flow:
 * 1. Load command from agent component by decisionId
 * 2. Look up route in AgentCommandRouteMap
 * 3. If no route -> update status "failed" + audit event -> return
 * 4. Update status "processing"
 * 5. Transform args via route.toOrchestratorArgs()
 * 6. Call CommandOrchestrator.execute()
 * 7. On success -> update status "completed" + audit event
 * 8. On failure -> update status "failed" with error
 *
 * Error Handling:
 * - Unknown route: status -> "failed", audit -> AgentCommandRoutingFailed
 * - Orchestrator failure: status -> "failed" with error message
 * - Orchestrator duplicate: no-op (command already processed)
 * - Load failure: mutation throws -> Workpool retries automatically
 *
 * IMPLEMENTATION NOTE: This becomes an internalMutation in
 * platform-core/src/agent/command-bridge.ts. The factory pattern
 * follows createAgentOnCompleteHandler's approach.
 *
 * @example
 * ```typescript
 * // Factory for creating the routing mutation:
 * export function createCommandBridgeMutation(config: CommandBridgeConfig) {
 *   return internalMutation({
 *     args: {
 *       decisionId: v.string(),
 *       commandType: v.string(),
 *       agentId: v.string(),
 *       correlationId: v.string(),
 *       patternId: v.optional(v.string()),
 *     },
 *     handler: async (ctx, args) => {
 *       // ... implementation below
 *     },
 *   });
 * }
 * ```
 */
export function createCommandBridgeMutation(
  _config: CommandBridgeConfig
): void /* RegisteredMutation<"internal", RouteAgentCommandArgs, void> */ {
  // Stub: implementation deferred to coding session
  //
  // Internal flow:
  //
  // 1. Load command from agent component:
  //    const command = await ctx.runQuery(
  //      config.agentComponent.commands.getByDecisionId,
  //      { decisionId: args.decisionId }
  //    );
  //    if (!command) {
  //      logger.warn("Command not found for routing", { decisionId: args.decisionId });
  //      return; // Already processed or never recorded
  //    }
  //    if (command.status !== "pending") {
  //      logger.info("Command already processing/completed", {
  //        decisionId: args.decisionId, status: command.status
  //      });
  //      return; // Idempotent: skip if already routed
  //    }
  //
  // 2. Look up route in AgentCommandRouteMap:
  //    const route = getRoute(config.commandRoutes, args.commandType);
  //    if (!route) {
  //      // No route registered — fail the command
  //      await ctx.runMutation(config.agentComponent.commands.updateStatus, {
  //        decisionId: args.decisionId,
  //        status: "failed",
  //        error: `No route registered for command type: ${args.commandType}`,
  //      });
  //      await ctx.runMutation(config.agentComponent.audit.record, {
  //        agentId: args.agentId,
  //        eventType: "AgentCommandRoutingFailed",
  //        decisionId: args.decisionId,
  //        commandType: args.commandType,
  //        correlationId: args.correlationId,
  //        error: `No route registered for command type: ${args.commandType}`,
  //      });
  //      return;
  //    }
  //
  // 3. Update status to "processing":
  //    await ctx.runMutation(config.agentComponent.commands.updateStatus, {
  //      decisionId: args.decisionId,
  //      status: "processing",
  //    });
  //
  // 4. Transform args and execute through orchestrator:
  //    try {
  //      const routingContext: RoutingContext = {
  //        agentId: args.agentId,
  //        correlationId: args.correlationId,
  //        eventId: undefined, // Not available in routing phase
  //        streamId: undefined,
  //      };
  //
  //      // Use CommandOrchestrator's standard metadata field for agent context:
  //      const orchestratorArgs = route.toOrchestratorArgs(command, routingContext);
  //      orchestratorArgs.correlationId = args.correlationId; // Standard field
  //      orchestratorArgs.metadata = {
  //        agentDecisionId: command.decisionId,
  //        agentPatternId: command.patternId,
  //      };
  //
  //      // Look up CommandConfig from CommandRegistry
  //      const commandConfig = config.commandRegistry.getConfig(args.commandType);
  //      if (!commandConfig) {
  //        throw new Error(
  //          `CommandConfig not found for "${args.commandType}" — ` +
  //          `route exists but CommandRegistry entry missing`
  //        );
  //      }
  //
  //      await config.commandOrchestrator.execute(ctx, commandConfig, orchestratorArgs);
  //
  //      // Success: update status
  //      await ctx.runMutation(config.agentComponent.commands.updateStatus, {
  //        decisionId: args.decisionId,
  //        status: "completed",
  //      });
  //
  //      // Record successful routing audit event
  //      await ctx.runMutation(config.agentComponent.audit.record, {
  //        agentId: args.agentId,
  //        eventType: "AgentCommandRouted",
  //        decisionId: args.decisionId,
  //        commandType: args.commandType,
  //        boundedContext: route.boundedContext,
  //        correlationId: args.correlationId,
  //        patternId: args.patternId,
  //      });
  //
  //    } catch (error) {
  //      // Routing or orchestration failed
  //      await ctx.runMutation(config.agentComponent.commands.updateStatus, {
  //        decisionId: args.decisionId,
  //        status: "failed",
  //        error: String(error),
  //      });
  //
  //      await ctx.runMutation(config.agentComponent.audit.record, {
  //        agentId: args.agentId,
  //        eventType: "AgentCommandRoutingFailed",
  //        decisionId: args.decisionId,
  //        commandType: args.commandType,
  //        correlationId: args.correlationId,
  //        error: String(error),
  //      });
  //    }
}

// ============================================================================
// Factory Configuration
// ============================================================================

/**
 * Configuration for the command bridge factory.
 *
 * Provides all external dependencies needed by routeAgentCommand:
 * - Agent component API for loading/updating commands
 * - Command route map for route lookup
 * - Command registry for CommandConfig lookup
 * - Command orchestrator for execution
 *
 * @example
 * ```typescript
 * export const routeAgentCommand = createCommandBridgeMutation({
 *   agentComponent: {
 *     commands: {
 *       getByDecisionId: components.agentBC.commands.getByDecisionId,
 *       updateStatus: components.agentBC.commands.updateStatus,
 *     },
 *     audit: {
 *       record: components.agentBC.audit.record,
 *     },
 *   },
 *   commandRoutes: agentCommandRoutes,
 *   commandRegistry: CommandRegistry.getInstance(),
 *   commandOrchestrator: orchestratorInstance,
 *   logger: createLogger("command-bridge", "INFO"),
 * });
 * ```
 */
export interface CommandBridgeConfig {
  /**
   * Agent component API (command bridge uses commands + audit subset).
   */
  readonly agentComponent: AgentComponentAPI;

  /**
   * Agent command route map for route lookup.
   * CHANGED (holistic review): Was `commandRouter: AgentCommandRouter` (singleton).
   * Now accepts a plain config map.
   */
  readonly commandRoutes: AgentCommandRouteMap;

  /**
   * Command registry for CommandConfig lookup.
   * Typically: `CommandRegistry.getInstance()`
   *
   * Used to resolve the CommandConfig that the orchestrator needs.
   */
  readonly commandRegistry: CommandRegistryInterface;

  /**
   * Command orchestrator for executing the routed command.
   *
   * Calls the full 7-step pipeline:
   * Record -> Middleware -> Handler -> Rejection -> Event -> Projection -> Status
   */
  readonly commandOrchestrator: CommandOrchestratorInterface;

  /**
   * Optional logger.
   */
  readonly logger?: Logger;
}

// ============================================================================
// Sequence Diagram: Full Command Routing Flow
// ============================================================================

/**
 * Complete flow from agent decision to domain handler execution:
 *
 * ```
 * ┌──────────────┐     ┌──────────────┐     ┌──────────────┐     ┌──────────────┐
 * │  Workpool     │     │  onComplete   │     │  Workpool    │     │  Command     │
 * │  (action)     │     │  (mutation)   │     │  (enqueue)   │     │  Bridge      │
 * └──────┬───────┘     └──────┬───────┘     └──────┬───────┘     └──────┬───────┘
 *        │                     │                     │                     │
 *        │  AgentActionResult  │                     │                     │
 *        │  (with patternId)   │                     │                     │
 *        │────────────────────>│                     │                     │
 *        │                     │                     │                     │
 *        │                     │ 1. Record audit     │                     │
 *        │                     │ 2. Record command   │                     │
 *        │                     │ 2b. Enqueue routing │                     │
 *        │                     │────────────────────>│                     │
 *        │                     │                     │                     │
 *        │                     │ 3. Create approval  │                     │
 *        │                     │ 4. Update checkpoint│                     │
 *        │                     │ (transaction ends)  │                     │
 *        │                     │                     │                     │
 *        │                     │                     │ routeAgentCommand   │
 *        │                     │                     │────────────────────>│
 *        │                     │                     │                     │
 *        │                     │                     │              ┌──────┴───────┐
 *        │                     │                     │              │ 1. Load cmd  │
 *        │                     │                     │              │ 2. Get route │
 *        │                     │                     │              │ 3. Transform │
 *        │                     │                     │              │ 4. Execute   │
 *        │                     │                     │              │ 5. Update    │
 *        │                     │                     │              │    status    │
 *        │                     │                     │              └──────┬───────┘
 *        │                     │                     │                     │
 *        │                     │                     │                     │
 *        │                     │                     │              ┌──────┴───────┐
 *        │                     │                     │              │ Command      │
 *        │                     │                     │              │ Orchestrator │
 *        │                     │                     │              │ (7 steps)    │
 *        │                     │                     │              └──────────────┘
 * ```
 *
 * Transaction Boundaries:
 * - Transaction 1 (onComplete): audit + command + approval + checkpoint
 * - Transaction 2 (routeAgentCommand): load + route + transform + execute + status
 *
 * Failure Isolation:
 * - If Transaction 2 fails, Transaction 1 is unaffected
 * - Command remains recorded, checkpoint is advanced
 * - Command status reflects the routing outcome
 * - Workpool handles retry and dead-letter automatically
 */

// ============================================================================
// Type Aliases (referenced but defined elsewhere)
// ============================================================================

// From command-router.ts:
type AgentCommandRouteMap = import("./command-router.js").AgentCommandRouteMap;
type RoutingContext = import("./command-router.js").RoutingContext;

// Interfaces for external dependencies (minimal surface):
interface CommandRegistryInterface {
  getConfig(commandType: string): unknown | undefined;
  has(commandType: string): boolean;
}

interface CommandOrchestratorInterface {
  execute(ctx: MutationCtx, config: unknown, args: Record<string, unknown>): Promise<void>;
}

// ============================================================================
// FAILURE RECOVERY — routeAgentCommand Error Handling
// ============================================================================
//
// CHANGED (holistic review): routeAgentCommand is now enqueued via Workpool,
// which provides built-in retry with backoff and onComplete for failure handling.
// This eliminates the need for a manual sweep cron.
//
// Recovery strategy (layered):
//
// 1. PRIMARY — Workpool automatic retry:
//    Workpool retries failed mutations with exponential backoff.
//    This handles transient failures (OCC, network, etc.) automatically.
//
// 2. SECONDARY — Workpool onComplete callback:
//    On permanent failure, the onComplete callback records the failure
//    (updates command status to "failed" and records audit event).
//    The command moves to a visible "failed" state.
//
// 3. TERTIARY — Admin UI manual re-routing (DS-7):
//    Admin panel provides commands.getByStatus("failed") query + re-enqueue action.
//    Operator can inspect the failure, fix the underlying issue, and re-trigger.
//
// IMPORTANT: The audit event + command status update in the onComplete callback
// happen atomically within the same mutation transaction.

// Placeholders:
type MutationCtx = unknown;
type Logger = unknown;
