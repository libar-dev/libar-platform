/**
 * EventBus module for publish/subscribe patterns.
 *
 * Provides a unified abstraction for publishing domain events
 * to subscribers (projections, sagas, integration event publishers).
 */

// Constants
export { DEFAULT_SUBSCRIPTION_PRIORITY } from "./types.js";

// Types
export type {
  PublishedEvent,
  SubscriptionFilter,
  PartitionKey,
  EventSubscription,
  PublishResult,
  EventBus,
  EventBusConfig,
} from "./types.js";

// Registry
export {
  SubscriptionBuilder,
  SubscriptionRegistry,
  defineSubscriptions,
  createSubscription,
  matchesEvent,
} from "./registry.js";

// Implementation
export { ConvexEventBus, createEventBus } from "./ConvexEventBus.js";
