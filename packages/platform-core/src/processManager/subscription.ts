/**
 * Process Manager EventBus Subscription Helper
 *
 * Creates EventBus subscriptions from Process Manager definitions,
 * bridging the PM executor to the EventBus infrastructure.
 *
 * This allows PMs to be registered with the EventBus and receive
 * events automatically based on their subscriptions.
 *
 * @example
 * ```typescript
 * import { createPMSubscription } from "@libar-dev/platform-core/processManager";
 *
 * const orderNotificationPM = defineProcessManager({
 *   processManagerName: "orderNotification",
 *   eventSubscriptions: ["OrderConfirmed"] as const,
 *   ...
 * });
 *
 * // Create EventBus subscription for the PM
 * const subscription = createPMSubscription(orderNotificationPM, {
 *   handler: internal.processManagers.orderNotification.handleEvent,
 *   priority: 200, // Run after projections
 * });
 *
 * // Register with EventBus
 * registry.add(subscription);
 * ```
 */

import type { FunctionReference, FunctionVisibility } from "convex/server";
import type { Logger } from "../logging/types.js";
import { createPlatformNoOpLogger } from "../logging/scoped.js";
import type { EventSubscription, PublishedEvent, PartitionKey } from "../eventbus/types.js";
import type { CorrelationChain } from "../correlation/types.js";
import type { UnknownRecord } from "../types.js";

/**
 * Minimal PM definition interface for subscription creation.
 * Compatible with both @libar-dev/platform-bc and @libar-dev/platform-core definitions.
 */
export interface PMDefinitionForSubscription {
  /** Process manager name */
  readonly processManagerName: string;

  /** Event types this PM subscribes to */
  readonly eventSubscriptions: readonly string[];

  /** Bounded context (optional) */
  readonly context?: string;

  /** Correlation strategy (optional) */
  readonly correlationStrategy?: {
    readonly correlationProperty: string;
  };
}

/**
 * Handler args for PM event handler mutations.
 * Includes index signature for UnknownRecord compatibility.
 */
export interface PMEventHandlerArgs {
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
   * PM instance ID (computed from correlation strategy or default).
   * Used to identify which PM instance should handle this event.
   */
  instanceId: string;

  /** Index signature for UnknownRecord compatibility */
  [key: string]: unknown;
}

/**
 * Options for creating a PM subscription.
 */
export interface CreatePMSubscriptionOptions<THandlerArgs extends UnknownRecord> {
  /**
   * Handler function reference.
   * This mutation will be called for each matching event.
   */
  handler: FunctionReference<"mutation", FunctionVisibility, THandlerArgs, unknown>;

  /**
   * Priority for ordering subscriptions (lower runs first).
   * @default 200 (after projections at 100)
   */
  priority?: number;

  /**
   * Custom transformer for handler args.
   * If not provided, uses default PMEventHandlerArgs transformer.
   */
  toHandlerArgs?: (
    event: PublishedEvent,
    chain: CorrelationChain,
    instanceId: string
  ) => THandlerArgs;

  /**
   * Custom partition key extractor.
   * If not provided, partitions by instanceId.
   */
  getPartitionKey?: (event: PublishedEvent, instanceId: string) => PartitionKey;

  /**
   * Optional logger for subscription-level logging.
   * If not provided, logging is disabled.
   *
   * Logs WARN when correlation property is not found in event payload.
   */
  logger?: Logger;
}

/**
 * Default PM subscription priority.
 * PMs run after projections (100) but before sagas (300).
 */
export const DEFAULT_PM_SUBSCRIPTION_PRIORITY = 200;

/**
 * Compute PM instance ID from event using correlation strategy.
 *
 * @param event - Published event
 * @param correlationStrategy - Optional correlation strategy
 * @param logger - Optional logger for warnings
 * @returns Instance ID for the PM
 */
export function computePMInstanceId(
  event: PublishedEvent,
  correlationStrategy?: PMDefinitionForSubscription["correlationStrategy"],
  logger?: Logger
): string {
  if (correlationStrategy?.correlationProperty) {
    const payload = event.payload as Record<string, unknown>;
    const value = payload[correlationStrategy.correlationProperty];
    if (typeof value === "string") {
      return value;
    }
    // Correlation property not found or not a string - log warning and fall back.
    // This is intentional fallback behavior, but warrants a warning because it
    // could cause unexpected PM instance collisions if the correlation property
    // is misconfigured.
    //
    // If you're seeing this warning, verify that:
    // 1. The correlationProperty exists in your event payload
    // 2. Its value is a string (not undefined, number, or object)
    //
    // Example: If correlationProperty is "orderId", the event payload must contain
    // { orderId: "some-string-value" } for correct correlation.
    const log = logger ?? createPlatformNoOpLogger();
    log.warn("Correlation property not found or not a string, falling back to streamId", {
      correlationProperty: correlationStrategy.correlationProperty,
      eventId: event.eventId,
      eventType: event.eventType,
      fallbackStreamId: event.streamId,
    });
  }

  // Default: use streamId as instance ID
  return event.streamId;
}

/**
 * Default transformer for PM event handler args.
 */
function defaultPMTransform(
  event: PublishedEvent,
  chain: CorrelationChain,
  instanceId: string
): PMEventHandlerArgs {
  return {
    eventId: event.eventId,
    eventType: event.eventType,
    globalPosition: event.globalPosition,
    correlationId: chain.correlationId,
    streamType: event.streamType,
    streamId: event.streamId,
    payload: event.payload as Record<string, unknown>,
    timestamp: event.timestamp,
    category: event.category,
    boundedContext: event.boundedContext,
    instanceId,
  };
}

/**
 * Create an EventBus subscription from a PM definition.
 *
 * This bridges PM definitions to the EventBus infrastructure,
 * allowing PMs to receive events automatically.
 *
 * @param definition - PM definition
 * @param options - Subscription options
 * @returns EventSubscription for the EventBus
 *
 * @example
 * ```typescript
 * const subscription = createPMSubscription(orderNotificationPM, {
 *   handler: internal.processManagers.orderNotification.handleEvent,
 * });
 *
 * // Use in defineSubscriptions
 * const subscriptions = defineSubscriptions((registry) => {
 *   registry.add(subscription);
 * });
 * ```
 */
export function createPMSubscription<THandlerArgs extends UnknownRecord = PMEventHandlerArgs>(
  definition: PMDefinitionForSubscription,
  options: CreatePMSubscriptionOptions<THandlerArgs>
): EventSubscription<THandlerArgs> {
  const {
    handler,
    priority = DEFAULT_PM_SUBSCRIPTION_PRIORITY,
    toHandlerArgs,
    getPartitionKey,
    logger,
  } = options;

  // Build subscription name: pm:<context>:<pmName> or pm:<pmName>
  const subscriptionName = definition.context
    ? `pm:${definition.context}:${definition.processManagerName}`
    : `pm:${definition.processManagerName}`;

  // Memoize instanceId computation per event to avoid duplicate calls
  // in toHandlerArgs and getPartitionKey (Phase 13.2 optimization)
  const instanceIdCache = new WeakMap<PublishedEvent, string>();
  const getInstanceId = (event: PublishedEvent): string => {
    let instanceId = instanceIdCache.get(event);
    if (instanceId === undefined) {
      instanceId = computePMInstanceId(event, definition.correlationStrategy, logger);
      instanceIdCache.set(event, instanceId);
    }
    return instanceId;
  };

  return {
    handlerType: "mutation" as const,
    name: subscriptionName,
    filter: {
      eventTypes: [...definition.eventSubscriptions],
    },
    handler,
    toHandlerArgs: (event: PublishedEvent, chain: CorrelationChain) => {
      const instanceId = getInstanceId(event);
      if (toHandlerArgs) {
        return toHandlerArgs(event, chain, instanceId);
      }
      // Cast through unknown for default transformer
      return defaultPMTransform(event, chain, instanceId) as unknown as THandlerArgs;
    },
    getPartitionKey: (event: PublishedEvent) => {
      const instanceId = getInstanceId(event);
      if (getPartitionKey) {
        return getPartitionKey(event, instanceId);
      }
      // Default: partition by instanceId for ordering
      return { name: "instanceId", value: instanceId };
    },
    priority,
  };
}

/**
 * Create multiple PM subscriptions from an array of definitions.
 *
 * @param definitions - Array of PM definitions
 * @param handlerMap - Map of PM names to handler function references
 * @param options - Common options for all subscriptions
 * @returns Array of EventSubscriptions
 *
 * @example
 * ```typescript
 * const subscriptions = createPMSubscriptions(
 *   [orderNotificationPM, reservationExpirationPM],
 *   {
 *     orderNotification: internal.processManagers.orderNotification.handleEvent,
 *     reservationExpiration: internal.processManagers.reservationExpiration.handleEvent,
 *   }
 * );
 * ```
 */
export function createPMSubscriptions<THandlerArgs extends UnknownRecord = PMEventHandlerArgs>(
  definitions: readonly PMDefinitionForSubscription[],
  handlerMap: Record<
    string,
    FunctionReference<"mutation", FunctionVisibility, THandlerArgs, unknown>
  >,
  options?: Omit<CreatePMSubscriptionOptions<THandlerArgs>, "handler">
): EventSubscription<THandlerArgs>[] {
  return definitions.map((definition) => {
    const handler = handlerMap[definition.processManagerName];
    if (!handler) {
      throw new Error(
        `Missing handler for process manager "${definition.processManagerName}" in handlerMap`
      );
    }
    return createPMSubscription(definition, { ...options, handler });
  });
}
