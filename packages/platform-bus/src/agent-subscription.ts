/**
 * Agent BC EventBus Subscription Helper
 *
 * Creates EventBus subscriptions from Agent BC definitions,
 * bridging AI agents to the EventBus infrastructure.
 *
 * This allows agents to be registered with the EventBus and receive
 * events automatically based on their subscriptions.
 *
 * @example
 * ```typescript
 * import { createAgentSubscription } from "@libar-dev/platform-bus/agent-subscription";
 *
 * const churnRiskAgent = {
 *   id: "churn-risk-agent",
 *   subscriptions: ["OrderCancelled", "OrderRefunded"],
 *   context: "orders",
 * };
 *
 * // Create EventBus subscription for the agent
 * const subscription = createAgentSubscription(churnRiskAgent, {
 *   handler: internal.agents.churnRisk.handleEvent,
 *   priority: 250, // Run after projections and PMs
 * });
 *
 * // Register with EventBus
 * registry.add(subscription);
 * ```
 */

import type { FunctionReference, FunctionVisibility } from "convex/server";
import type {
  Logger,
  EventSubscription,
  PublishedEvent,
  PartitionKey,
  CorrelationChain,
  UnknownRecord,
} from "@libar-dev/platform-core";

// ============================================================================
// Constants
// ============================================================================

/**
 * Default agent subscription priority.
 * Agents run after projections (100) and process managers (200),
 * but before sagas (300).
 */
export const DEFAULT_AGENT_SUBSCRIPTION_PRIORITY = 250;

// ============================================================================
// Types
// ============================================================================

/**
 * Minimal agent definition interface for subscription creation.
 * Compatible with both full AgentBCConfig and simplified definitions.
 */
export interface AgentDefinitionForSubscription {
  /** Agent BC identifier */
  readonly id: string;

  /** Event types this agent subscribes to */
  readonly subscriptions: readonly string[];

  /** Bounded context (optional) */
  readonly context?: string;
}

/**
 * Handler args for agent event handler mutations.
 * Includes index signature for UnknownRecord compatibility.
 */
export interface AgentEventHandlerArgs {
  /** Event ID */
  eventId: string;

  /** Event type */
  eventType: string;

  /** Global position for idempotency */
  globalPosition: number;

  /** Correlation ID */
  correlationId: string;

  /** Stream type */
  streamType: string;

  /** Stream ID */
  streamId: string;

  /** Event payload */
  payload: Record<string, unknown>;

  /** Event timestamp */
  timestamp: number;

  /** Event category */
  category: string;

  /** Bounded context */
  boundedContext: string;

  /**
   * Agent ID for routing.
   * Used to identify which agent should handle this event.
   */
  agentId: string;

  /** Index signature for UnknownRecord compatibility */
  [key: string]: unknown;
}

/**
 * Options for creating an agent subscription.
 */
export interface CreateAgentSubscriptionOptions<THandlerArgs extends UnknownRecord> {
  /**
   * Handler function reference.
   * This mutation will be called for each matching event.
   */
  handler: FunctionReference<"mutation", FunctionVisibility, THandlerArgs, unknown>;

  /**
   * Priority for ordering subscriptions (lower runs first).
   * @default 250 (after projections at 100 and PMs at 200)
   */
  priority?: number;

  /**
   * Custom transformer for handler args.
   * If not provided, uses default AgentEventHandlerArgs transformer.
   */
  toHandlerArgs?: (
    event: PublishedEvent,
    chain: CorrelationChain,
    agentId: string
  ) => THandlerArgs;

  /**
   * Custom partition key extractor.
   * If not provided, partitions by streamId.
   */
  getPartitionKey?: (event: PublishedEvent, agentId: string) => PartitionKey;

  /**
   * Optional logger for subscription-level logging.
   */
  logger?: Logger;
}

// ============================================================================
// Transformer Functions
// ============================================================================

/**
 * Default transformer for agent event handler args.
 *
 * Transforms a PublishedEvent and CorrelationChain into AgentEventHandlerArgs.
 *
 * @param event - Published event
 * @param chain - Correlation chain
 * @param agentId - Agent BC identifier
 * @returns Agent event handler arguments
 */
/**
 * Type guard to check if a value is a valid record payload.
 *
 * @param value - Value to check
 * @returns True if value is a non-null object (not array)
 */
function isRecordPayload(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function defaultAgentTransform(
  event: PublishedEvent,
  chain: CorrelationChain,
  agentId: string
): AgentEventHandlerArgs {
  // Validate payload is a proper record object
  const payload = isRecordPayload(event.payload)
    ? event.payload
    : { _raw: event.payload };

  return {
    eventId: event.eventId,
    eventType: event.eventType,
    globalPosition: event.globalPosition,
    correlationId: chain.correlationId,
    streamType: event.streamType,
    streamId: event.streamId,
    payload,
    timestamp: event.timestamp,
    category: event.category,
    boundedContext: event.boundedContext,
    agentId,
  };
}

// ============================================================================
// Subscription Factory
// ============================================================================

/**
 * Create an EventBus subscription from an agent definition.
 *
 * This bridges agent definitions to the EventBus infrastructure,
 * allowing agents to receive events automatically.
 *
 * @param definition - Agent definition with id and subscriptions
 * @param options - Subscription options
 * @returns EventSubscription for the EventBus
 *
 * @example
 * ```typescript
 * const subscription = createAgentSubscription(churnRiskAgent, {
 *   handler: internal.agents.churnRisk.handleEvent,
 * });
 *
 * // Use in defineSubscriptions
 * const subscriptions = defineSubscriptions((registry) => {
 *   registry.add(subscription);
 * });
 * ```
 */
export function createAgentSubscription<THandlerArgs extends UnknownRecord = AgentEventHandlerArgs>(
  definition: AgentDefinitionForSubscription,
  options: CreateAgentSubscriptionOptions<THandlerArgs>
): EventSubscription<THandlerArgs> {
  const {
    handler,
    priority = DEFAULT_AGENT_SUBSCRIPTION_PRIORITY,
    toHandlerArgs,
    getPartitionKey,
  } = options;

  // Build subscription name: agent:<context>:<agentId> or agent:<agentId>
  const subscriptionName = definition.context
    ? `agent:${definition.context}:${definition.id}`
    : `agent:${definition.id}`;

  // Memoize agentId extraction per event to avoid duplicate calls
  // in toHandlerArgs and getPartitionKey (Phase 13.2 optimization)
  const agentIdCache = new WeakMap<PublishedEvent, string>();
  const getAgentId = (event: PublishedEvent): string => {
    let agentId = agentIdCache.get(event);
    if (agentId === undefined) {
      // For agents, the agentId is always the definition id
      // (unlike PMs which compute instanceId from correlation)
      agentId = definition.id;
      agentIdCache.set(event, agentId);
    }
    return agentId;
  };

  return {
    name: subscriptionName,
    filter: {
      eventTypes: [...definition.subscriptions],
    },
    handler,
    toHandlerArgs: (event: PublishedEvent, chain: CorrelationChain) => {
      const agentId = getAgentId(event);
      if (toHandlerArgs) {
        return toHandlerArgs(event, chain, agentId);
      }
      // Cast through unknown for default transformer
      return defaultAgentTransform(event, chain, agentId) as unknown as THandlerArgs;
    },
    getPartitionKey: (event: PublishedEvent) => {
      const agentId = getAgentId(event);
      if (getPartitionKey) {
        return getPartitionKey(event, agentId);
      }
      // Default: partition by streamId for entity-ordered processing
      return { name: "streamId", value: event.streamId };
    },
    priority,
  };
}

// ============================================================================
// Batch Factory
// ============================================================================

/**
 * Create multiple agent subscriptions from an array of definitions.
 *
 * @param definitions - Array of agent definitions
 * @param handlerMap - Map of agent IDs to handler function references
 * @param options - Common options for all subscriptions
 * @returns Array of EventSubscriptions
 *
 * @example
 * ```typescript
 * const subscriptions = createAgentSubscriptions(
 *   [churnRiskAgent, fraudDetectionAgent],
 *   {
 *     "churn-risk-agent": internal.agents.churnRisk.handleEvent,
 *     "fraud-detection-agent": internal.agents.fraudDetection.handleEvent,
 *   }
 * );
 * ```
 */
export function createAgentSubscriptions<THandlerArgs extends UnknownRecord = AgentEventHandlerArgs>(
  definitions: readonly AgentDefinitionForSubscription[],
  handlerMap: Record<
    string,
    FunctionReference<"mutation", FunctionVisibility, THandlerArgs, unknown>
  >,
  options?: Omit<CreateAgentSubscriptionOptions<THandlerArgs>, "handler">
): EventSubscription<THandlerArgs>[] {
  return definitions.map((definition) => {
    const handler = handlerMap[definition.id];
    if (!handler) {
      throw new Error(`Missing handler for agent "${definition.id}" in handlerMap`);
    }
    return createAgentSubscription(definition, { ...options, handler });
  });
}
