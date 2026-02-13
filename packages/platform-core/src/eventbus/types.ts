/**
 * EventBus types for publish/subscribe patterns.
 *
 * The EventBus provides a unified abstraction for publishing domain events
 * to subscribers (projections, sagas, integration event publishers).
 */

import type { FunctionReference, FunctionVisibility } from "convex/server";
import type { EventCategory } from "../events/category.js";
import type { CorrelationChain } from "../correlation/types.js";
import type {
  MutationCtx,
  WorkpoolClient,
  WorkpoolOnCompleteArgs,
} from "../orchestration/types.js";
import type { UnknownRecord } from "../types.js";
import type { Logger } from "../logging/types.js";

/**
 * Default priority for subscriptions when not explicitly set.
 * Lower values run first. Projections typically use 100 (default),
 * sagas use 200+ to run after projections are updated.
 */
export const DEFAULT_SUBSCRIPTION_PRIORITY = 100;

/**
 * A published event with all metadata required for routing and processing.
 */
export interface PublishedEvent<TPayload = unknown> {
  /** Unique event identifier */
  eventId: string;

  /** Event type for routing (e.g., "OrderSubmitted") */
  eventType: string;

  /** Stream/aggregate type (e.g., "Order") */
  streamType: string;

  /** Stream/aggregate instance ID */
  streamId: string;

  /** Event category for filtering */
  category: EventCategory;

  /** Schema version for upcasting */
  schemaVersion: number;

  /** Bounded context that emitted the event */
  boundedContext: string;

  /** Global position in the event store */
  globalPosition: number;

  /** Timestamp when the event was created */
  timestamp: number;

  /** Event payload */
  payload: TPayload;

  /** Correlation metadata for tracing */
  correlation: {
    correlationId: string;
    causationId: string;
    userId?: string;
  };
}

/**
 * Filter criteria for subscription matching.
 */
export interface SubscriptionFilter {
  /** Match specific event types (OR logic) */
  eventTypes?: string[];

  /** Match specific categories (OR logic) */
  categories?: EventCategory[];

  /** Match specific bounded contexts (OR logic) */
  boundedContexts?: string[];

  /** Match specific stream types (OR logic) */
  streamTypes?: string[];
}

/**
 * Partition key for subscription ordering.
 * Events with the same partition key value are processed in order.
 */
export interface PartitionKey {
  /** Name of the partition key (e.g., "orderId", "customerId") */
  name: string;

  /** Value of the partition key */
  value: string;
}

/**
 * Common fields for all subscription variants.
 *
 * @template THandlerArgs - The handler function argument type
 */
interface BaseSubscription<THandlerArgs extends UnknownRecord = UnknownRecord> {
  /** Unique name for this subscription (e.g., "orderSummary.onOrderSubmitted") */
  name: string;

  /** Filter to determine which events this subscription receives */
  filter: SubscriptionFilter;

  /** Transform a published event into handler arguments */
  toHandlerArgs: (event: PublishedEvent, chain: CorrelationChain) => THandlerArgs;

  /** Extract the partition key for ordering */
  getPartitionKey: (event: PublishedEvent) => PartitionKey;

  /**
   * Priority for ordering subscriptions (lower runs first).
   * Useful for ensuring projections update before sagas react.
   * @default 100
   */
  priority?: number;
}

/**
 * Subscription that dispatches events to a Convex mutation.
 * This is the existing behavior for projections, process managers, and sagas.
 *
 * @template THandlerArgs - The handler function argument type
 */
export interface MutationSubscription<
  THandlerArgs extends UnknownRecord = UnknownRecord,
> extends BaseSubscription<THandlerArgs> {
  /** Discriminant. Optional for backward compatibility — missing means "mutation". */
  readonly handlerType?: "mutation";

  /** Reference to the handler mutation */
  handler: FunctionReference<"mutation", FunctionVisibility, THandlerArgs, unknown>;

  /** Optional onComplete handler for dead letter tracking */
  onComplete?: FunctionReference<"mutation", FunctionVisibility, WorkpoolOnCompleteArgs, unknown>;

  /** Dedicated Workpool for this subscription type. Falls back to EventBus default. */
  pool?: WorkpoolClient;
}

/**
 * Subscription that dispatches events to a Convex action.
 * Used by agent handlers that need to call external APIs (LLM).
 *
 * onComplete is REQUIRED because actions cannot persist state directly.
 *
 * @template THandlerArgs - The handler function argument type
 * @since Phase 22b (AgentLLMIntegration)
 */
export interface ActionSubscription<
  THandlerArgs extends UnknownRecord = UnknownRecord,
> extends BaseSubscription<THandlerArgs> {
  /** Discriminant: this is an action-based subscription */
  readonly handlerType: "action";

  /** Reference to the handler action */
  handler: FunctionReference<"action", FunctionVisibility, THandlerArgs, unknown>;

  /** onComplete handler — REQUIRED for actions (they can't persist state) */
  onComplete: FunctionReference<"mutation", FunctionVisibility, WorkpoolOnCompleteArgs, unknown>;

  /** Retry configuration for the action.
   * - `true`: Use Workpool default retry behavior
   * - `false`: No retries
   * - Object: Custom retry behavior (all fields required per Workpool contract)
   */
  retry?: boolean | { maxAttempts: number; initialBackoffMs: number; base: number };

  /** Dedicated Workpool for this subscription type */
  pool?: WorkpoolClient;

  /** Build Workpool context for onComplete handler */
  toWorkpoolContext: (
    event: PublishedEvent,
    chain: CorrelationChain,
    subscriptionName: string
  ) => Record<string, unknown>;
}

/**
 * An event subscription — discriminated union with handlerType.
 *
 * - "mutation" (or absent): Handler is a Convex mutation (existing behavior)
 * - "action": Handler is a Convex action (new for agents/LLM)
 *
 * @template THandlerArgs - The handler function argument type
 */
export type EventSubscription<THandlerArgs extends UnknownRecord = UnknownRecord> =
  | MutationSubscription<THandlerArgs>
  | ActionSubscription<THandlerArgs>;

/**
 * Type guard: check if a subscription is action-based.
 */
export function isActionSubscription<T extends UnknownRecord>(
  sub: EventSubscription<T>
): sub is ActionSubscription<T> {
  return "handlerType" in sub && sub.handlerType === "action";
}

/**
 * Type guard: check if a subscription is mutation-based.
 */
export function isMutationSubscription<T extends UnknownRecord>(
  sub: EventSubscription<T>
): sub is MutationSubscription<T> {
  return !("handlerType" in sub) || sub.handlerType === "mutation" || sub.handlerType === undefined;
}

/**
 * Result of publishing an event through the EventBus.
 */
export interface PublishResult {
  /** Number of subscriptions that matched the event */
  matchedSubscriptions: number;

  /** Names of subscriptions that were triggered */
  triggeredSubscriptions: string[];

  /** Whether all subscriptions were successfully enqueued */
  success: boolean;
}

/**
 * The EventBus interface for publishing domain events.
 *
 * Implementations use Workpool for durable, parallelized delivery
 * to matching subscriptions.
 */
export interface EventBus {
  /**
   * Publish an event to all matching subscriptions.
   *
   * @param ctx - Mutation context for enqueuing
   * @param event - The event to publish
   * @param chain - Correlation chain for tracing
   * @returns Publish result with matched subscriptions
   */
  publish(ctx: MutationCtx, event: PublishedEvent, chain: CorrelationChain): Promise<PublishResult>;

  /**
   * Get subscriptions that match a filter.
   *
   * @param filter - Filter criteria
   * @returns Matching subscriptions
   */
  getMatchingSubscriptions(filter: SubscriptionFilter): EventSubscription[];

  /**
   * Get all registered subscriptions.
   */
  getAllSubscriptions(): EventSubscription[];

  /**
   * Check if any subscriptions match an event type.
   *
   * @param eventType - Event type to check
   */
  hasSubscribersFor(eventType: string): boolean;
}

/**
 * Configuration for the ConvexEventBus.
 */
export interface EventBusConfig {
  /**
   * Default onComplete handler for subscriptions that don't specify one.
   */
  defaultOnComplete?: FunctionReference<
    "mutation",
    FunctionVisibility,
    WorkpoolOnCompleteArgs,
    unknown
  >;

  /**
   * Optional logger for EventBus operations.
   * If not provided, logging is disabled.
   *
   * Logging points:
   * - DEBUG: Subscriptions matched (count, eventType)
   * - DEBUG: Enqueuing handler (subscription name)
   * - INFO: Event published (eventId, matched count)
   */
  logger?: Logger;
}
