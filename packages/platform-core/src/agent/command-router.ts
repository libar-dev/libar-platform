/**
 * Agent Command Router -- Route Map and Types
 *
 * Maps agent-emitted command types to target bounded context handlers.
 * Routes are static config -- a plain object map, not a singleton registry.
 *
 * The route map is defined at the app level and passed to the command bridge.
 * Each route specifies:
 * - Which CommandRegistry command type to invoke
 * - Which bounded context owns the target command
 * - A transform function to convert the recorded agent command into
 *   CommandOrchestrator-compatible args
 *
 * @module agent/command-router
 */

// ============================================================================
// Error Codes
// ============================================================================

export const COMMAND_ROUTING_ERROR_CODES = {
  UNKNOWN_ROUTE: "UNKNOWN_ROUTE",
  DUPLICATE_ROUTE: "DUPLICATE_ROUTE",
  COMMAND_NOT_REGISTERED: "COMMAND_NOT_REGISTERED",
  INVALID_TRANSFORM: "INVALID_TRANSFORM",
} as const;

export type CommandRoutingErrorCode =
  (typeof COMMAND_ROUTING_ERROR_CODES)[keyof typeof COMMAND_ROUTING_ERROR_CODES];

// ============================================================================
// Recorded Agent Command
// ============================================================================

/**
 * Shape of a recorded agent command (matches agentCommands table).
 *
 * This is the data available to route transform functions.
 * Fields are populated from the onComplete handler's args
 * when the bridge mutation is scheduled.
 */
export interface RecordedAgentCommand {
  readonly agentId: string;
  readonly type: string;
  readonly payload: unknown;
  readonly status: "pending" | "processing" | "completed" | "failed";
  readonly confidence: number;
  readonly reason: string;
  readonly triggeringEventIds: readonly string[];
  readonly decisionId: string;
  readonly patternId?: string;
  readonly correlationId?: string;
  readonly routingAttempts?: number;
}

// ============================================================================
// Routing Context
// ============================================================================

/**
 * Context passed to route transform functions.
 *
 * Provides correlation metadata for the command orchestrator.
 */
export interface RoutingContext {
  readonly agentId: string;
  readonly correlationId: string;
  readonly eventId?: string;
  readonly streamId?: string;
}

// ============================================================================
// Route Definition
// ============================================================================

/**
 * A single command route definition.
 *
 * Maps an agent-emitted command type to a target in the CommandRegistry.
 */
export interface AgentCommandRoute {
  /** Target command type in the CommandRegistry (e.g., "CancelOrder") */
  readonly commandType: string;
  /** Target bounded context (e.g., "orders") */
  readonly boundedContext: string;
  /**
   * Transform a recorded agent command into CommandOrchestrator args.
   *
   * The returned object is passed directly to the orchestrator's execute method.
   * Must match the target command's expected args shape.
   */
  readonly toOrchestratorArgs: (
    command: RecordedAgentCommand,
    context: RoutingContext
  ) => Record<string, unknown>;
}

/** Static route map -- command type string to route definition. */
export type AgentCommandRouteMap = Readonly<Record<string, AgentCommandRoute>>;

// ============================================================================
// Route Result
// ============================================================================

export type RouteResult =
  | { readonly success: true; readonly commandType: string }
  | {
      readonly success: false;
      readonly code: CommandRoutingErrorCode;
      readonly message: string;
    };

// ============================================================================
// Route Lookup
// ============================================================================

/**
 * Look up a route by agent command type.
 *
 * @param routes - The static route map
 * @param commandType - The agent-emitted command type to look up
 * @returns The route definition, or undefined if no route exists
 */
export function getRoute(
  routes: AgentCommandRouteMap,
  commandType: string
): AgentCommandRoute | undefined {
  return routes[commandType];
}

// ============================================================================
// Route Validation
// ============================================================================

/**
 * Validate all routes in a route map.
 *
 * Checks that each route has:
 * - A non-empty commandType
 * - A non-empty boundedContext
 * - A toOrchestratorArgs function
 *
 * @param routes - The route map to validate
 * @returns Array of validation results (one per route)
 */
export function validateRoutes(routes: AgentCommandRouteMap): RouteResult[] {
  return Object.entries(routes).map(([key, route]) => {
    if (!route.commandType) {
      return {
        success: false as const,
        code: COMMAND_ROUTING_ERROR_CODES.COMMAND_NOT_REGISTERED,
        message: `Route '${key}' missing commandType`,
      };
    }
    if (!route.boundedContext) {
      return {
        success: false as const,
        code: COMMAND_ROUTING_ERROR_CODES.UNKNOWN_ROUTE,
        message: `Route '${key}' missing boundedContext`,
      };
    }
    if (typeof route.toOrchestratorArgs !== "function") {
      return {
        success: false as const,
        code: COMMAND_ROUTING_ERROR_CODES.INVALID_TRANSFORM,
        message: `Route '${key}' missing toOrchestratorArgs function`,
      };
    }
    return { success: true as const, commandType: route.commandType };
  });
}
