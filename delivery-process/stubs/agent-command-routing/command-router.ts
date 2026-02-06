/**
 * Agent Command Router — DS-4 Stub
 *
 * Maps agent command types to their orchestrator routes. When an agent emits
 * a command (e.g., SuggestCustomerOutreach), the router determines which
 * CommandConfig to use and how to transform agent command payload to
 * orchestrator args format.
 *
 * @target platform-core/src/agent/command-router.ts
 *
 * ## Design Decisions
 *
 * - AD-5: Router maps agent command types to orchestrator routes with transform
 * - Agent commands carry metadata (confidence, reason, patternId) that regular
 *   commands do not. The toOrchestratorArgs transform bridges this gap.
 *
 * @see PDR-012 (Agent Command Routing & Pattern Unification)
 * @see CommandRegistry (platform-core/src/registry/CommandRegistry.ts)
 * @see CommandOrchestrator (platform-core/src/orchestration/CommandOrchestrator.ts)
 * @since DS-4 (Command Routing & Pattern Unification)
 */

// ============================================================================
// Error Codes
// ============================================================================

/**
 * Error codes for command routing operations.
 */
export const COMMAND_ROUTING_ERROR_CODES = {
  /** No route registered for this command type */
  UNKNOWN_ROUTE: "UNKNOWN_ROUTE",
  /** Route already registered for this command type */
  DUPLICATE_ROUTE: "DUPLICATE_ROUTE",
  /** Route references a command type not in CommandRegistry */
  COMMAND_NOT_REGISTERED: "COMMAND_NOT_REGISTERED",
  /** Route's args transform produced invalid output */
  INVALID_TRANSFORM: "INVALID_TRANSFORM",
} as const;

export type CommandRoutingErrorCode =
  (typeof COMMAND_ROUTING_ERROR_CODES)[keyof typeof COMMAND_ROUTING_ERROR_CODES];

// ============================================================================
// Route Types
// ============================================================================

/**
 * Recorded agent command as stored in the agent component.
 *
 * This is what the command bridge loads from the agent component
 * before routing through the orchestrator.
 */
export interface RecordedAgentCommand {
  /** Agent BC identifier */
  readonly agentId: string;
  /** Command type (e.g., "SuggestCustomerOutreach") */
  readonly type: string;
  /** Command payload data */
  readonly payload: unknown;
  /** Command status */
  readonly status: "pending" | "processing" | "completed" | "failed";
  /** Confidence score (0-1) */
  readonly confidence: number;
  /** Human-readable reason */
  readonly reason: string;
  /** Event IDs that triggered this decision */
  readonly triggeringEventIds: readonly string[];
  /** Decision ID for correlation */
  readonly decisionId: string;
  /** Pattern that detected this (DS-4) */
  readonly patternId?: string;
  /** Correlation ID for tracing */
  readonly correlationId?: string;
  /** Number of routing attempts (incremented by routeAgentCommand, checked by sweep) */
  readonly routingAttempts?: number;
}

/**
 * Context available during command routing.
 *
 * Subset of AgentWorkpoolContext relevant to routing decisions.
 */
export interface RoutingContext {
  /** Agent BC identifier */
  readonly agentId: string;
  /** Correlation ID for tracing */
  readonly correlationId: string;
  /** Original event ID that triggered the agent */
  readonly eventId?: string;
  /** Stream ID for the triggering entity */
  readonly streamId?: string;
}

/**
 * Definition of a route from agent command type to CommandOrchestrator.
 *
 * Each route specifies:
 * - Which command type it handles
 * - Which bounded context owns the handler
 * - How to transform agent command payload to orchestrator args
 *
 * @example
 * ```typescript
 * const suggestOutreachRoute: AgentCommandRoute = {
 *   commandType: "SuggestCustomerOutreach",
 *   boundedContext: "customer-outreach",
 *   toOrchestratorArgs: (command, context) => ({
 *     customerId: (command.payload as SuggestOutreachPayload).customerId,
 *     riskLevel: (command.payload as SuggestOutreachPayload).riskLevel,
 *     cancellationCount: (command.payload as SuggestOutreachPayload).cancellationCount,
 *     agentDecisionId: command.decisionId,
 *     agentConfidence: command.confidence,
 *     correlationId: context.correlationId,
 *   }),
 * };
 * ```
 */
export interface AgentCommandRoute {
  /** Agent command type this route handles (e.g., "SuggestCustomerOutreach") */
  readonly commandType: string;

  /** Bounded context that owns the target command handler */
  readonly boundedContext: string;

  /**
   * Transform agent command to CommandOrchestrator args.
   *
   * The transform extracts relevant fields from the agent command payload
   * and metadata, producing the args expected by the CommandConfig handler.
   *
   * @param command - Recorded agent command from the agent component
   * @param context - Routing context with tracing information
   * @returns Args for CommandOrchestrator.execute()
   */
  readonly toOrchestratorArgs: (
    command: RecordedAgentCommand,
    context: RoutingContext
  ) => Record<string, unknown>;
}

/**
 * Result of a routing operation.
 */
export type RouteResult =
  | { readonly success: true; readonly commandType: string }
  | {
      readonly success: false;
      readonly code: CommandRoutingErrorCode;
      readonly message: string;
    };

// ============================================================================
// Router Implementation
// ============================================================================

/**
 * Agent command router.
 *
 * Maps agent command types to their orchestrator routes. Used by the
 * command bridge (routeAgentCommand mutation) to look up how to
 * process recorded agent commands.
 *
 * Routes are registered at app startup, typically alongside CommandRegistry
 * registrations. Each route must reference a command type that exists in
 * the CommandRegistry.
 *
 * @example
 * ```typescript
 * // In app startup / command registration module:
 * import { globalAgentCommandRouter } from "@libar-dev/platform-core/agent";
 *
 * globalAgentCommandRouter.register({
 *   commandType: "SuggestCustomerOutreach",
 *   boundedContext: "customer-outreach",
 *   toOrchestratorArgs: (command, context) => ({
 *     customerId: command.payload.customerId,
 *     agentDecisionId: command.decisionId,
 *     correlationId: context.correlationId,
 *   }),
 * });
 *
 * // In command bridge mutation:
 * const route = globalAgentCommandRouter.getRoute("SuggestCustomerOutreach");
 * if (!route) { /* handle unknown route * / }
 * const args = route.toOrchestratorArgs(command, context);
 * await orchestrator.execute(ctx, commandConfig, args);
 * ```
 */
export class AgentCommandRouter {
  private static instance: AgentCommandRouter | null = null;
  private routes: Map<string, AgentCommandRoute> = new Map();

  private constructor() {}

  /**
   * Get the singleton instance.
   *
   * Follows the same pattern as CommandRegistry.getInstance() and
   * PatternRegistry.getInstance() for consistency (AD-1).
   */
  static getInstance(): AgentCommandRouter {
    if (!AgentCommandRouter.instance) {
      AgentCommandRouter.instance = new AgentCommandRouter();
    }
    return AgentCommandRouter.instance;
  }

  /**
   * Reset singleton for testing.
   * Clears instance so next getInstance() creates fresh router.
   */
  static resetForTesting(): void {
    AgentCommandRouter.instance = null;
  }

  /**
   * Register a command route.
   *
   * @param route - Route definition
   * @throws Error if route for this command type already exists
   *
   * IMPLEMENTATION NOTE: At registration time, also validate that
   * CommandRegistry.getInstance().has(route.commandType) is true.
   * This ensures the route points to a valid command handler.
   */
  register(route: AgentCommandRoute): void {
    if (this.routes.has(route.commandType)) {
      throw new Error(
        `Duplicate route registration: "${route.commandType}" is already registered ` +
          `for bounded context "${this.routes.get(route.commandType)!.boundedContext}"`
      );
    }

    // IMPLEMENTATION NOTE: Validate CommandRegistry has this command type.
    // Commented out in stub because CommandRegistry is in a different module:
    //
    // if (!CommandRegistry.getInstance().has(route.commandType)) {
    //   throw new Error(
    //     `Cannot register route for "${route.commandType}": ` +
    //     `no CommandConfig found in CommandRegistry`
    //   );
    // }

    this.routes.set(route.commandType, route);
  }

  /**
   * Get route for a command type.
   *
   * @returns AgentCommandRoute or undefined if no route registered
   */
  getRoute(commandType: string): AgentCommandRoute | undefined {
    return this.routes.get(commandType);
  }

  /**
   * Check if a route is registered for a command type.
   */
  hasRoute(commandType: string): boolean {
    return this.routes.has(commandType);
  }

  /**
   * List all registered routes (for introspection).
   */
  listRoutes(): ReadonlyArray<{ commandType: string; boundedContext: string }> {
    return Array.from(this.routes.values()).map((route) => ({
      commandType: route.commandType,
      boundedContext: route.boundedContext,
    }));
  }

  /**
   * Get count of registered routes.
   */
  size(): number {
    return this.routes.size;
  }

  /**
   * Clear all routes (for testing only).
   */
  clear(): void {
    this.routes.clear();
  }
}

/**
 * Global router instance for app-wide route registration.
 *
 * Convenience export — equivalent to `AgentCommandRouter.getInstance()`.
 */
export const globalAgentCommandRouter = AgentCommandRouter.getInstance();
