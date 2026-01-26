/**
 * Subscription registry for defining event handlers.
 *
 * Provides a fluent builder API for defining subscriptions
 * with filtering, transformation, and partitioning.
 */

import type { FunctionReference, FunctionVisibility } from "convex/server";
import type { EventCategory } from "../events/category.js";
import type { CorrelationChain } from "../correlation/types.js";
import type { WorkpoolOnCompleteArgs } from "../orchestration/types.js";
import {
  DEFAULT_SUBSCRIPTION_PRIORITY,
  type EventSubscription,
  type SubscriptionFilter,
  type PublishedEvent,
  type PartitionKey,
} from "./types.js";
import type { UnknownRecord } from "../types.js";

/**
 * Builder for creating event subscriptions.
 *
 * @template THandlerArgs - The handler function argument type
 */
export class SubscriptionBuilder<THandlerArgs extends UnknownRecord> {
  private _name: string;
  private _filter: SubscriptionFilter = {};
  private _handler: FunctionReference<"mutation", FunctionVisibility, THandlerArgs, unknown>;
  private _onComplete?: FunctionReference<
    "mutation",
    FunctionVisibility,
    WorkpoolOnCompleteArgs,
    unknown
  >;
  private _toHandlerArgs: (event: PublishedEvent, chain: CorrelationChain) => THandlerArgs;
  private _getPartitionKey: (event: PublishedEvent) => PartitionKey;
  private _priority: number = DEFAULT_SUBSCRIPTION_PRIORITY;

  constructor(
    name: string,
    handler: FunctionReference<"mutation", FunctionVisibility, THandlerArgs, unknown>
  ) {
    this._name = name;
    this._handler = handler;
    // Default to passing the event directly if handler expects PublishedEvent shape
    this._toHandlerArgs = (event) => event as unknown as THandlerArgs;
    // Default to partitioning by streamId
    this._getPartitionKey = (event) => ({ name: "streamId", value: event.streamId });
  }

  /**
   * Filter by specific event types.
   */
  forEventTypes(...eventTypes: string[]): this {
    this._filter.eventTypes = eventTypes;
    return this;
  }

  /**
   * Filter by event categories.
   */
  forCategories(...categories: EventCategory[]): this {
    this._filter.categories = categories;
    return this;
  }

  /**
   * Filter by bounded contexts.
   */
  forBoundedContexts(...boundedContexts: string[]): this {
    this._filter.boundedContexts = boundedContexts;
    return this;
  }

  /**
   * Filter by stream types.
   */
  forStreamTypes(...streamTypes: string[]): this {
    this._filter.streamTypes = streamTypes;
    return this;
  }

  /**
   * Set the onComplete handler for dead letter tracking.
   */
  withOnComplete(
    onComplete: FunctionReference<"mutation", FunctionVisibility, WorkpoolOnCompleteArgs, unknown>
  ): this {
    this._onComplete = onComplete;
    return this;
  }

  /**
   * Set the transformer function for converting events to handler args.
   */
  withTransform(fn: (event: PublishedEvent, chain: CorrelationChain) => THandlerArgs): this {
    this._toHandlerArgs = fn;
    return this;
  }

  /**
   * Set the partition key extractor for ordering.
   */
  withPartitionKey(fn: (event: PublishedEvent) => PartitionKey): this {
    this._getPartitionKey = fn;
    return this;
  }

  /**
   * Set the priority (lower runs first).
   * @default 100
   */
  withPriority(priority: number): this {
    this._priority = priority;
    return this;
  }

  /**
   * Build the subscription.
   */
  build(): EventSubscription<THandlerArgs> {
    const subscription: EventSubscription<THandlerArgs> = {
      name: this._name,
      filter: this._filter,
      handler: this._handler,
      toHandlerArgs: this._toHandlerArgs,
      getPartitionKey: this._getPartitionKey,
      priority: this._priority,
    };

    if (this._onComplete !== undefined) {
      subscription.onComplete = this._onComplete;
    }

    return subscription;
  }
}

/**
 * Registry for collecting subscriptions.
 */
export class SubscriptionRegistry {
  private subscriptions: EventSubscription[] = [];

  /**
   * Add a subscription to the registry.
   *
   * @throws Error if a subscription with the same name already exists
   */
  add<THandlerArgs extends UnknownRecord>(subscription: EventSubscription<THandlerArgs>): this {
    const existing = this.subscriptions.find((s) => s.name === subscription.name);
    if (existing) {
      throw new Error(`Duplicate subscription name: "${subscription.name}"`);
    }
    this.subscriptions.push(subscription);
    return this;
  }

  /**
   * Create a subscription builder and add it when built.
   *
   * @throws Error if a subscription with the same name already exists when build() is called
   */
  subscribe<THandlerArgs extends UnknownRecord>(
    name: string,
    handler: FunctionReference<"mutation", FunctionVisibility, THandlerArgs, unknown>
  ): SubscriptionBuilder<THandlerArgs> {
    const builder = new SubscriptionBuilder<THandlerArgs>(name, handler);
    // Store a reference to add the subscription when retrieved via getSubscriptions
    const originalBuild = builder.build.bind(builder);
    builder.build = () => {
      const subscription = originalBuild();
      this.add(subscription); // Use add() for consistent duplicate detection
      return subscription;
    };
    return builder;
  }

  /**
   * Get all registered subscriptions.
   */
  getSubscriptions(): EventSubscription[] {
    return [...this.subscriptions];
  }
}

/**
 * Define subscriptions using a configuration callback.
 *
 * @param configure - Callback to configure the registry
 * @returns Array of configured subscriptions
 *
 * @example
 * ```typescript
 * const subscriptions = defineSubscriptions((registry) => {
 *   registry
 *     .subscribe("orderSummary.onOrderSubmitted", internal.projections.orders.orderSummary.onOrderSubmitted)
 *     .forEventTypes("OrderSubmitted")
 *     .forCategories("domain")
 *     .withTransform((event, chain) => ({
 *       orderId: event.streamId,
 *       eventId: event.eventId,
 *       globalPosition: event.globalPosition,
 *       payload: event.payload,
 *     }))
 *     .withPartitionKey((event) => ({ name: "orderId", value: event.streamId }))
 *     .build();
 *
 *   registry
 *     .subscribe("inventorySaga.onOrderSubmitted", internal.sagas.router.routeEvent)
 *     .forEventTypes("OrderSubmitted")
 *     .withPriority(200) // Run after projections
 *     .build();
 * });
 * ```
 */
export function defineSubscriptions(
  configure: (registry: SubscriptionRegistry) => void
): EventSubscription[] {
  const registry = new SubscriptionRegistry();
  configure(registry);
  // Note: Duplicate name validation happens in SubscriptionRegistry.add()
  return registry.getSubscriptions();
}

/**
 * Create a subscription builder without a registry.
 *
 * @param name - Subscription name
 * @param handler - Handler function reference
 * @returns SubscriptionBuilder
 *
 * @example
 * ```typescript
 * const subscription = createSubscription(
 *   "orderSummary.onOrderSubmitted",
 *   internal.projections.orders.orderSummary.onOrderSubmitted
 * )
 *   .forEventTypes("OrderSubmitted")
 *   .withTransform((event) => ({ ... }))
 *   .build();
 * ```
 */
export function createSubscription<THandlerArgs extends UnknownRecord>(
  name: string,
  handler: FunctionReference<"mutation", FunctionVisibility, THandlerArgs, unknown>
): SubscriptionBuilder<THandlerArgs> {
  return new SubscriptionBuilder<THandlerArgs>(name, handler);
}

/**
 * Check if a subscription matches a published event.
 *
 * @param subscription - The subscription to check
 * @param event - The event to match against
 * @returns True if the subscription should receive the event
 */
export function matchesEvent(subscription: EventSubscription, event: PublishedEvent): boolean {
  const { filter } = subscription;

  // Empty filter matches everything
  if (!filter.eventTypes && !filter.categories && !filter.boundedContexts && !filter.streamTypes) {
    return true;
  }

  // Check event types (OR logic)
  if (filter.eventTypes && filter.eventTypes.length > 0) {
    if (!filter.eventTypes.includes(event.eventType)) {
      return false;
    }
  }

  // Check categories (OR logic)
  if (filter.categories && filter.categories.length > 0) {
    if (!filter.categories.includes(event.category)) {
      return false;
    }
  }

  // Check bounded contexts (OR logic)
  if (filter.boundedContexts && filter.boundedContexts.length > 0) {
    if (!filter.boundedContexts.includes(event.boundedContext)) {
      return false;
    }
  }

  // Check stream types (OR logic)
  if (filter.streamTypes && filter.streamTypes.length > 0) {
    if (!filter.streamTypes.includes(event.streamType)) {
      return false;
    }
  }

  return true;
}
