/**
 * @libar-docs
 * @libar-docs-pattern EventBusAbstraction
 * @libar-docs-status completed
 * @libar-docs-phase 09
 * @libar-docs-event-sourcing
 * @libar-docs-used-by ProcessManagerLifecycle, SagaOrchestration
 *
 * ## EventBus - Pub/Sub for Domain Events
 *
 * Durable event pub/sub using Workpool for parallelism, retries, and dead letter handling.
 * Publishes domain events to matching subscriptions with priority-based ordering.
 *
 * ### When to Use
 *
 * - Publishing domain events to multiple subscribers via Workpool
 * - Priority-based subscription ordering for event handlers
 * - Building projections, process managers, or sagas that react to events
 */

import type { CorrelationChain } from "../correlation/types.js";
import type { WorkpoolClient, MutationCtx } from "../orchestration/types.js";
import {
  DEFAULT_SUBSCRIPTION_PRIORITY,
  type EventBus,
  type EventSubscription,
  type SubscriptionFilter,
  type PublishedEvent,
  type PublishResult,
  type EventBusConfig,
} from "./types.js";
import { matchesEvent } from "./registry.js";
import type { Logger } from "../logging/types.js";
import { createPlatformNoOpLogger } from "../logging/scoped.js";

/**
 * Index for fast subscription lookup by event type.
 */
interface SubscriptionIndex {
  /** Subscriptions indexed by event type */
  byEventType: Map<string, EventSubscription[]>;

  /** Subscriptions indexed by category */
  byCategory: Map<string, EventSubscription[]>;

  /** Subscriptions that match all events (no filter) */
  wildcards: EventSubscription[];

  /** All subscriptions sorted by priority */
  all: EventSubscription[];
}

/**
 * Build an index for fast subscription lookup.
 */
function buildIndex(subscriptions: EventSubscription[]): SubscriptionIndex {
  const byEventType = new Map<string, EventSubscription[]>();
  const byCategory = new Map<string, EventSubscription[]>();
  const wildcards: EventSubscription[] = [];

  // Sort by priority (lower first)
  const sorted = [...subscriptions].sort(
    (a, b) =>
      (a.priority ?? DEFAULT_SUBSCRIPTION_PRIORITY) - (b.priority ?? DEFAULT_SUBSCRIPTION_PRIORITY)
  );

  for (const sub of sorted) {
    const { filter } = sub;

    // Index by event types
    if (filter.eventTypes && filter.eventTypes.length > 0) {
      for (const eventType of filter.eventTypes) {
        const existing = byEventType.get(eventType) ?? [];
        existing.push(sub);
        byEventType.set(eventType, existing);
      }
    }

    // Index by categories
    if (filter.categories && filter.categories.length > 0) {
      for (const category of filter.categories) {
        const existing = byCategory.get(category) ?? [];
        existing.push(sub);
        byCategory.set(category, existing);
      }
    }

    // Track wildcards (no specific event type or category filter)
    if (
      (!filter.eventTypes || filter.eventTypes.length === 0) &&
      (!filter.categories || filter.categories.length === 0)
    ) {
      wildcards.push(sub);
    }
  }

  return { byEventType, byCategory, wildcards, all: sorted };
}

/**
 * ConvexEventBus - Workpool-based event publishing.
 *
 * @example
 * ```typescript
 * import { Workpool } from "@convex-dev/workpool";
 *
 * const projectionPool = new Workpool(components.workpool);
 * const subscriptions = defineSubscriptions((registry) => {
 *   // ... define subscriptions
 * });
 *
 * const eventBus = new ConvexEventBus(projectionPool, subscriptions, {
 *   defaultOnComplete: internal.projections.deadLetters.onProjectionComplete,
 * });
 *
 * // In orchestrator:
 * await eventBus.publish(ctx, publishedEvent, correlationChain);
 * ```
 */
export class ConvexEventBus implements EventBus {
  private readonly workpool: WorkpoolClient;
  private readonly index: SubscriptionIndex;
  private readonly config: EventBusConfig;
  private readonly logger: Logger;

  constructor(
    workpool: WorkpoolClient,
    subscriptions: EventSubscription[],
    config: EventBusConfig = {}
  ) {
    this.workpool = workpool;
    this.index = buildIndex(subscriptions);
    this.config = config;
    this.logger = config.logger ?? createPlatformNoOpLogger();
  }

  /**
   * Publish an event to all matching subscriptions.
   */
  async publish(
    ctx: MutationCtx,
    event: PublishedEvent,
    chain: CorrelationChain
  ): Promise<PublishResult> {
    // Find matching subscriptions
    const matching = this.findMatchingSubscriptions(event);

    this.logger.debug("Subscriptions matched", {
      eventType: event.eventType,
      eventId: event.eventId,
      matchedCount: matching.length,
    });

    if (matching.length === 0) {
      return {
        matchedSubscriptions: 0,
        triggeredSubscriptions: [],
        success: true,
      };
    }

    const triggeredSubscriptions: string[] = [];

    // Enqueue handlers via Workpool (in priority order)
    for (const subscription of matching) {
      const handlerArgs = subscription.toHandlerArgs(event, chain);
      const partitionKey = subscription.getPartitionKey(event);

      // Determine onComplete handler
      const onComplete = subscription.onComplete ?? this.config.defaultOnComplete;

      this.logger.debug("Enqueuing handler", {
        subscriptionName: subscription.name,
        eventType: event.eventType,
        eventId: event.eventId,
        partitionKey: partitionKey.value,
      });

      // Note: partitionKey is extracted for context/debugging but key-based ordering
      // is not yet supported by Workpool. Events for the same entity may process
      // out of order under concurrent load. This is acceptable for most projections
      // which are idempotent via globalPosition checkpointing.
      // TODO: Add key: partitionKey.value when Workpool adds key-based ordering support.
      try {
        await this.workpool.enqueueMutation(ctx, subscription.handler, handlerArgs, {
          // Only include onComplete if defined (exactOptionalPropertyTypes compliance)
          ...(onComplete ? { onComplete } : {}),
          context: {
            subscriptionName: subscription.name,
            eventId: event.eventId,
            eventType: event.eventType,
            globalPosition: event.globalPosition,
            // Partition key wrapped in structured field (Convex validators reject dynamic keys)
            partition: partitionKey,
            correlationId: chain.correlationId,
            causationId: chain.causationId,
          },
        });
      } catch (error) {
        this.logger.error("Failed to enqueue subscription", {
          subscriptionName: subscription.name,
          eventType: event.eventType,
          eventId: event.eventId,
          error:
            error instanceof Error ? { message: error.message, stack: error.stack } : String(error),
        });
        throw error; // Re-throw to propagate the failure
      }

      triggeredSubscriptions.push(subscription.name);
    }

    this.logger.info("Event published", {
      eventType: event.eventType,
      eventId: event.eventId,
      correlationId: chain.correlationId,
      matchedSubscriptions: matching.length,
      triggeredSubscriptions,
    });

    return {
      matchedSubscriptions: matching.length,
      triggeredSubscriptions,
      success: true,
    };
  }

  /**
   * Get subscriptions matching a filter.
   *
   * Note: When filter contains multiple values (e.g., multiple eventTypes),
   * only the first value is used for matching. For comprehensive matching,
   * iterate over filter values or use findMatchingSubscriptions with actual events.
   */
  getMatchingSubscriptions(filter: SubscriptionFilter): EventSubscription[] {
    // Create a synthetic event to match against
    const syntheticEvent: PublishedEvent = {
      eventId: "",
      eventType: filter.eventTypes?.[0] ?? "",
      streamType: filter.streamTypes?.[0] ?? "",
      streamId: "",
      category: filter.categories?.[0] ?? "domain",
      schemaVersion: 1,
      boundedContext: filter.boundedContexts?.[0] ?? "",
      globalPosition: 0,
      timestamp: 0,
      payload: {},
      correlation: { correlationId: "", causationId: "" },
    };

    return this.index.all.filter((sub) => matchesEvent(sub, syntheticEvent));
  }

  /**
   * Get all registered subscriptions.
   */
  getAllSubscriptions(): EventSubscription[] {
    return [...this.index.all];
  }

  /**
   * Check if any subscriptions match an event type.
   */
  hasSubscribersFor(eventType: string): boolean {
    // Check indexed subscriptions
    if (this.index.byEventType.has(eventType)) {
      return true;
    }

    // Check wildcards
    return this.index.wildcards.length > 0;
  }

  /**
   * Find all subscriptions that match a specific event.
   */
  private findMatchingSubscriptions(event: PublishedEvent): EventSubscription[] {
    const candidates = new Set<EventSubscription>();

    // Add subscriptions that match by event type
    const byType = this.index.byEventType.get(event.eventType);
    if (byType) {
      for (const sub of byType) {
        candidates.add(sub);
      }
    }

    // Add subscriptions that match by category
    const byCategory = this.index.byCategory.get(event.category);
    if (byCategory) {
      for (const sub of byCategory) {
        candidates.add(sub);
      }
    }

    // Add wildcard subscriptions
    for (const sub of this.index.wildcards) {
      candidates.add(sub);
    }

    // Filter candidates by full match (including bounded context, stream type)
    // and sort by priority
    return Array.from(candidates)
      .filter((sub) => matchesEvent(sub, event))
      .sort(
        (a, b) =>
          (a.priority ?? DEFAULT_SUBSCRIPTION_PRIORITY) -
          (b.priority ?? DEFAULT_SUBSCRIPTION_PRIORITY)
      );
  }
}

/**
 * Create an EventBus instance.
 *
 * @param workpool - Workpool client for enqueuing handlers
 * @param subscriptions - Array of event subscriptions
 * @param config - Optional configuration
 * @returns EventBus instance
 *
 * @example
 * ```typescript
 * const eventBus = createEventBus(
 *   projectionPool,
 *   defineSubscriptions((registry) => {
 *     registry.subscribe("myHandler", internal.projections.handler)
 *       .forEventTypes("MyEvent")
 *       .build();
 *   }),
 *   { defaultOnComplete: internal.deadLetters.handler }
 * );
 * ```
 */
export function createEventBus(
  workpool: WorkpoolClient,
  subscriptions: EventSubscription[],
  config?: EventBusConfig
): EventBus {
  return new ConvexEventBus(workpool, subscriptions, config);
}
