/**
 * Command Bridge — DS-4 Stub
 *
 * Bridges agent command recording (onComplete step 2) with command routing
 * through CommandOrchestrator. Uses a scheduled mutation to keep persistence
 * and routing in separate transactions.
 *
 * @target platform-core/src/agent/command-bridge.ts
 *
 * ## Design Decisions
 *
 * - AD-4: Scheduled mutation from onComplete (not inline, not Workpool)
 * - AD-5: AgentCommandRouter maps command types to orchestrator routes
 * - AD-6: patternId flows through AgentActionResult → commands.record → routing context
 *
 * ## Integration Points
 *
 * 1. **onComplete handler (DS-2)** — After recording command, schedules `routeAgentCommand`
 * 2. **Agent Component commands API (DS-1)** — Loads command by decisionId, updates status
 * 3. **AgentCommandRouter (DS-4)** — Looks up route, transforms args
 * 4. **CommandOrchestrator (existing)** — Executes the transformed command
 *
 * @see PDR-012 (Agent Command Routing & Pattern Unification)
 * @see PDR-011 (Agent Action Handler Architecture) — onComplete persistence order
 * @see AgentCommandRouter (command-router.ts)
 * @since DS-4 (Command Routing & Pattern Unification)
 */

// ============================================================================
// Scheduling Args
// ============================================================================

/**
 * Arguments for the scheduled `routeAgentCommand` mutation.
 *
 * These are passed via `ctx.scheduler.runAfter(0, routeAgentCommand, args)`.
 * Minimal set: just enough to load the command and establish routing context.
 *
 * The actual command payload is loaded from the agent component, not passed
 * through the scheduler — keeps scheduling args small and avoids duplication.
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
 * schedule the routing mutation if a command was recorded.
 *
 * IMPLEMENTATION NOTE: Add this block to the createAgentOnCompleteHandler
 * implementation in oncomplete-handler.ts:
 *
 * ```typescript
 * // DS-2 persistence order (steps 1-4):
 * // 1. Record audit event
 * // 2. Record command if decision includes one
 *
 * // DS-4 ADDITION (step 2b): Schedule command routing
 * if (decision.command && commandRecorded) {
 *   try {
 *     await ctx.scheduler.runAfter(0, internal.agent.commandBridge.routeAgentCommand, {
 *       decisionId: result.returnValue.decisionId,
 *       commandType: decision.command,
 *       agentId: context.agentId,
 *       correlationId: context.correlationId,
 *       patternId: result.returnValue.patternId,
 *     });
 *   } catch (scheduleError) {
 *     // NO-THROW ZONE: Log scheduling failure but don't throw.
 *     // Command remains "pending" — can be retried via admin API or cron.
 *     logger.error("Failed to schedule command routing", {
 *       decisionId: result.returnValue.decisionId,
 *       commandType: decision.command,
 *       error: String(scheduleError),
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
 * - `runAfter(0, ...)` — separate transaction, immediate execution
 * - NO-THROW: Scheduling failure doesn't block checkpoint advancement
 * - Command stays "pending" if scheduling fails — recoverable via admin/cron
 * - patternId flows from AgentActionResult.patternId through to routing context
 */

// ============================================================================
// routeAgentCommand Mutation
// ============================================================================

/**
 * Route an agent command through CommandOrchestrator.
 *
 * This is an internalMutation scheduled by the onComplete handler.
 * It runs in its own transaction, separate from the persistence phase.
 *
 * Flow:
 * 1. Load command from agent component by decisionId
 * 2. Look up route in AgentCommandRouter
 * 3. If no route → update status "failed" + audit event → return
 * 4. Update status "processing"
 * 5. Transform args via route.toOrchestratorArgs()
 * 6. Call CommandOrchestrator.execute()
 * 7. On success → update status "completed" + audit event
 * 8. On failure → update status "failed" with error
 *
 * Error Handling:
 * - Unknown route: status → "failed", audit → AgentCommandRoutingFailed
 * - Orchestrator failure: status → "failed" with error message
 * - Orchestrator duplicate: no-op (command already processed)
 * - Load failure: mutation throws → Convex retries automatically
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
  // 2. Look up route in AgentCommandRouter:
  //    const route = config.commandRouter.getRoute(args.commandType);
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
  // 3. Update status to "processing" and increment routing attempts:
  //    await ctx.runMutation(config.agentComponent.commands.updateStatus, {
  //      decisionId: args.decisionId,
  //      status: "processing",
  //      incrementRoutingAttempts: true,
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
  //      const orchestratorArgs = route.toOrchestratorArgs(command, routingContext);
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
  //      await config.commandOrchestrator.execute(ctx, commandConfig, {
  //        ...orchestratorArgs,
  //        // Inject agent metadata for tracing
  //        _agentDecisionId: args.decisionId,
  //        _agentCorrelationId: args.correlationId,
  //        _agentPatternId: args.patternId,
  //      });
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
 * - Command router for route lookup
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
 *   commandRouter: globalAgentCommandRouter,
 *   commandRegistry: CommandRegistry.getInstance(),
 *   commandOrchestrator: orchestratorInstance,
 *   logger: createLogger("command-bridge", "INFO"),
 * });
 * ```
 */
export interface CommandBridgeConfig {
  /**
   * Agent component API references (subset needed for routing).
   */
  readonly agentComponent: {
    readonly commands: {
      /**
       * Load command by decisionId.
       *
       * Maps to: `components.agentBC.commands.getByDecisionId`
       * @see agent-component-isolation/component/commands.ts
       */
      readonly getByDecisionId: FunctionRef;
      /** Update command status (pending → processing → completed/failed) */
      readonly updateStatus: FunctionRef;
    };
    readonly audit: {
      /** Record audit event */
      readonly record: FunctionRef;
    };
  };

  /**
   * Agent command router for route lookup.
   * Typically: `globalAgentCommandRouter`
   */
  readonly commandRouter: AgentCommandRouter;

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
   * Record → Middleware → Handler → Rejection → Event → Projection → Status
   */
  readonly commandOrchestrator: CommandOrchestratorInterface;

  /**
   * Optional logger.
   */
  readonly logger?: Logger;
}

// ============================================================================
// Recovery: Pending Command Sweep
// ============================================================================

/**
 * Sweep for pending commands that were never routed.
 *
 * If the scheduler call in onComplete fails, commands remain "pending"
 * indefinitely. This sweep function finds and re-routes them.
 *
 * Intended to be called by:
 * - A cron job (e.g., every 5 minutes)
 * - An admin action (manual trigger)
 *
 * IMPLEMENTATION NOTE: This is a safety net, not the primary routing path.
 * In normal operation, onComplete's `ctx.scheduler.runAfter(0, ...)` handles
 * all routing. The sweep only catches edge cases where scheduling failed.
 *
 * @example
 * ```typescript
 * // As a cron job:
 * export const sweepPendingCommands = internalMutation({
 *   args: { limit: v.optional(v.number()) },
 *   handler: async (ctx, args) => {
 *     const pending = await ctx.runQuery(
 *       components.agentBC.commands.getPending,
 *       { limit: args.limit ?? 50 }
 *     );
 *
 *     for (const command of pending) {
 *       // Check if command has exceeded max routing attempts
 *       if ((command.routingAttempts ?? 0) >= MAX_ROUTING_ATTEMPTS) {
 *         await ctx.runMutation(
 *           components.agentBC.commands.updateStatus,
 *           {
 *             decisionId: command.decisionId,
 *             status: "failed",
 *             error: `Max routing attempts exceeded (${MAX_ROUTING_ATTEMPTS})`,
 *           }
 *         );
 *         continue;
 *       }
 *
 *       // Check if command has been pending for > staleness threshold
 *       const age = Date.now() - command._creationTime;
 *       if (age > STALE_COMMAND_THRESHOLD_MS) {
 *         // NOTE: If routeAgentCommand is concurrently processing this command,
 *         // duplicate scheduling may occur. This is harmless: the status check
 *         // in routeAgentCommand (step 1) skips commands not in "pending" state.
 *         await ctx.scheduler.runAfter(0, routeAgentCommandRef, {
 *           decisionId: command.decisionId,
 *           commandType: command.type,
 *           agentId: command.agentId,
 *           correlationId: command.correlationId ?? `sweep_${Date.now()}`,
 *           patternId: command.patternId,
 *         });
 *       }
 *     }
 *   },
 * });
 * ```
 *
 * Staleness Threshold:
 * - Normal routing happens within milliseconds (runAfter(0))
 * - A command "pending" for > 30 seconds is likely stuck
 * - Default threshold: 30_000ms (30 seconds)
 */
const STALE_COMMAND_THRESHOLD_MS = 30_000;

/**
 * Maximum number of routing attempts before marking a command as permanently failed.
 * Prevents infinite retry loops when a command consistently fails to route.
 */
const MAX_ROUTING_ATTEMPTS = 3;

// ============================================================================
// Sequence Diagram: Full Command Routing Flow
// ============================================================================

/**
 * Complete flow from agent decision to domain handler execution:
 *
 * ```
 * ┌──────────────┐     ┌──────────────┐     ┌──────────────┐     ┌──────────────┐
 * │  Workpool     │     │  onComplete   │     │  Scheduler   │     │  Command     │
 * │  (action)     │     │  (mutation)   │     │  (runAfter)  │     │  Bridge      │
 * └──────┬───────┘     └──────┬───────┘     └──────┬───────┘     └──────┬───────┘
 *        │                     │                     │                     │
 *        │  AgentActionResult  │                     │                     │
 *        │  (with patternId)   │                     │                     │
 *        │────────────────────>│                     │                     │
 *        │                     │                     │                     │
 *        │                     │ 1. Record audit     │                     │
 *        │                     │ 2. Record command   │                     │
 *        │                     │ 2b. Schedule routing │                     │
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
 * - Sweep cron can retry failed/stuck commands
 */

// ============================================================================
// Type Aliases (referenced but defined elsewhere)
// ============================================================================

// From command-router.ts:
type AgentCommandRouter = import("./command-router.js").AgentCommandRouter;
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
// routeAgentCommand runs via ctx.scheduler.runAfter(0, ...) — a plain Convex
// scheduled mutation. Unlike Workpool-managed functions, it has NO automatic
// retry, monitoring, or dead letter handling.
//
// If routeAgentCommand fails, the command remains in "pending" status forever.
//
// Recovery strategy (layered):
//
// 1. PRIMARY — Convex auto-retry on OCC:
//    routeAgentCommand is a mutation. If it fails due to OCC conflict (another
//    mutation modified the same command concurrently), Convex automatically retries.
//    This handles the most common failure mode.
//
// 2. SECONDARY — Failure recording:
//    Non-OCC failures (e.g., CommandOrchestrator.execute throws) are caught
//    within routeAgentCommand. The handler updates command status to "failed"
//    and records an AgentCommandRoutingFailed audit event. The command is NOT
//    stuck in "pending" — it moves to a visible "failed" state.
//
// 3. TERTIARY — Admin UI manual re-routing (DS-7):
//    Admin panel provides commands.getByStatus("failed") query + re-schedule action.
//    Operator can inspect the failure, fix the underlying issue, and re-trigger.
//
// 4. FUTURE — Cron-based stale command detector:
//    A scheduled cron (e.g., every 5 minutes) queries commands stuck in "pending"
//    beyond a threshold (e.g., 30 seconds). These are commands where the
//    ctx.scheduler.runAfter itself failed (extremely rare — Convex scheduler is durable).
//    The cron either re-schedules or moves to "failed" with a timeout reason.
//
// IMPORTANT: The audit event + command status update in step 2 happen atomically
// within the same mutation transaction. If the mutation itself fails to commit,
// the command stays in "pending" and falls into the cron detector (step 4).

// Placeholders:
type FunctionRef = unknown;
type MutationCtx = unknown;
type Logger = unknown;
