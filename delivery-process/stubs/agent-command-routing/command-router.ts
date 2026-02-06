/**
 * @libar-docs
 * @libar-docs-status roadmap
 * @libar-docs-infra
 * @libar-docs-implements AgentCommandInfrastructure
 *
 * Agent Command Router — DS-4 Stub
 *
 * Maps agent command types to their orchestrator routes. When an agent emits
 * a command (e.g., SuggestCustomerOutreach), the router determines which
 * CommandConfig to use and how to transform agent command payload to
 * orchestrator args format.
 *
 * Target: platform-core/src/agent/command-router.ts
 *
 * ## Design Decisions
 *
 * - AD-5: Router maps agent command types to orchestrator routes with transform
 * - Agent commands carry metadata (confidence, reason, patternId) that regular
 *   commands do not. The toOrchestratorArgs transform bridges this gap.
 *
 * SIMPLIFICATION (holistic review, item 2.1): Replaced singleton class with
 * plain config map type and utility functions. Routes are passed as a config
 * map to the command bridge factory, not registered in a global singleton.
 * Add registry back when multi-agent support requires dynamic route discovery.
 *
 * See: PDR-012 (Agent Command Routing & Pattern Unification)
 * See: CommandRegistry (platform-core/src/registry/CommandRegistry.ts)
 * See: CommandOrchestrator (platform-core/src/orchestration/CommandOrchestrator.ts)
 * Since: DS-4 (Command Routing & Pattern Unification)
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
 *     correlationId: context.correlationId,
 *     metadata: { agentDecisionId: command.decisionId, agentPatternId: command.patternId },
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
// Route Map & Utilities
// ============================================================================

/**
 * Agent command route configuration.
 *
 * Routes are passed as a config map to the command bridge factory,
 * NOT registered in a global singleton. This eliminates singleton scaffolding
 * for the single-agent case.
 *
 * SIMPLIFICATION (holistic review): Replaced singleton class with plain type.
 * Add registry back when multi-agent support requires dynamic route discovery.
 *
 * @example
 * ```typescript
 * const routes: AgentCommandRouteMap = {
 *   SuggestCustomerOutreach: {
 *     commandType: "SuggestCustomerOutreach",
 *     boundedContext: "customer-outreach",
 *     toOrchestratorArgs: (command, context) => ({
 *       customerId: command.payload.customerId,
 *       correlationId: context.correlationId,
 *       metadata: { agentDecisionId: command.decisionId },
 *     }),
 *   },
 * };
 * ```
 */
export type AgentCommandRouteMap = Readonly<Record<string, AgentCommandRoute>>;

/**
 * Look up a route from the route map.
 */
export function getRoute(
  routes: AgentCommandRouteMap,
  commandType: string
): AgentCommandRoute | undefined {
  return routes[commandType];
}

/**
 * Validate route map at initialization time.
 * Ensures all routes point to valid CommandRegistry entries.
 */
export function validateRoutes(
  routes: AgentCommandRouteMap
  // commandRegistry: CommandRegistry — injected for validation
): RouteResult[] {
  const results: RouteResult[] = [];
  for (const [commandType, _route] of Object.entries(routes)) {
    // IMPLEMENTATION NOTE: Check CommandRegistry.getInstance().has(commandType)
    results.push({ success: true, commandType });
  }
  return results;
}
