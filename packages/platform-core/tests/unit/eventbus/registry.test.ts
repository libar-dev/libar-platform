/**
 * Unit Tests for EventBus Registry
 *
 * Tests the subscription registry and matching logic:
 * - SubscriptionBuilder fluent API
 * - SubscriptionRegistry collection
 * - defineSubscriptions helper
 * - matchesEvent filter logic
 */
import { describe, it, expect, vi } from "vitest";
import {
  SubscriptionBuilder,
  SubscriptionRegistry,
  defineSubscriptions,
  createSubscription,
  matchesEvent,
} from "../../../src/eventbus/registry";
import type { PublishedEvent, EventSubscription } from "../../../src/eventbus/types";
import type { FunctionReference, FunctionVisibility } from "convex/server";
import type { CorrelationChain } from "../../../src/correlation/types";
import type { WorkpoolOnCompleteArgs } from "../../../src/orchestration/types";

// Mock handler for testing
const mockHandler = { name: "mockHandler" } as FunctionReference<
  "mutation",
  FunctionVisibility,
  Record<string, unknown>,
  unknown
>;
const mockOnComplete = { name: "mockOnComplete" } as FunctionReference<
  "mutation",
  FunctionVisibility,
  WorkpoolOnCompleteArgs,
  unknown
>;

// Helper to create a test event
function createTestEvent(overrides: Partial<PublishedEvent> = {}): PublishedEvent {
  return {
    eventId: "evt_test_123",
    eventType: "OrderSubmitted",
    streamType: "Order",
    streamId: "order_456",
    category: "domain",
    schemaVersion: 1,
    boundedContext: "orders",
    globalPosition: 1000,
    timestamp: Date.now(),
    payload: { orderId: "order_456" },
    correlation: {
      correlationId: "corr_789",
      causationId: "cmd_abc",
    },
    ...overrides,
  };
}

// Helper to create a test correlation chain
function createTestChain(): CorrelationChain {
  return {
    commandId: "cmd_abc",
    correlationId: "corr_789",
    causationId: "cmd_abc",
    initiatedAt: Date.now(),
  };
}

describe("SubscriptionBuilder", () => {
  describe("basic construction", () => {
    it("creates subscription with name and handler", () => {
      const subscription = new SubscriptionBuilder("test.handler", mockHandler).build();

      expect(subscription.name).toBe("test.handler");
      expect(subscription.handler).toBe(mockHandler);
    });

    it("defaults to empty filter", () => {
      const subscription = new SubscriptionBuilder("test.handler", mockHandler).build();

      expect(subscription.filter).toEqual({});
    });

    it("defaults to priority 100", () => {
      const subscription = new SubscriptionBuilder("test.handler", mockHandler).build();

      expect(subscription.priority).toBe(100);
    });

    it("defaults partition key to streamId", () => {
      const subscription = new SubscriptionBuilder("test.handler", mockHandler).build();
      const event = createTestEvent();

      expect(subscription.getPartitionKey(event)).toEqual({
        name: "streamId",
        value: "order_456",
      });
    });
  });

  describe("filter configuration", () => {
    it("forEventTypes sets event type filter", () => {
      const subscription = new SubscriptionBuilder("test.handler", mockHandler)
        .forEventTypes("OrderSubmitted", "OrderCancelled")
        .build();

      expect(subscription.filter.eventTypes).toEqual(["OrderSubmitted", "OrderCancelled"]);
    });

    it("forCategories sets category filter", () => {
      const subscription = new SubscriptionBuilder("test.handler", mockHandler)
        .forCategories("domain", "integration")
        .build();

      expect(subscription.filter.categories).toEqual(["domain", "integration"]);
    });

    it("forBoundedContexts sets bounded context filter", () => {
      const subscription = new SubscriptionBuilder("test.handler", mockHandler)
        .forBoundedContexts("orders", "inventory")
        .build();

      expect(subscription.filter.boundedContexts).toEqual(["orders", "inventory"]);
    });

    it("forStreamTypes sets stream type filter", () => {
      const subscription = new SubscriptionBuilder("test.handler", mockHandler)
        .forStreamTypes("Order", "Product")
        .build();

      expect(subscription.filter.streamTypes).toEqual(["Order", "Product"]);
    });

    it("supports chaining multiple filters", () => {
      const subscription = new SubscriptionBuilder("test.handler", mockHandler)
        .forEventTypes("OrderSubmitted")
        .forCategories("domain")
        .forBoundedContexts("orders")
        .build();

      expect(subscription.filter).toEqual({
        eventTypes: ["OrderSubmitted"],
        categories: ["domain"],
        boundedContexts: ["orders"],
      });
    });
  });

  describe("handler configuration", () => {
    it("withOnComplete sets onComplete handler", () => {
      const subscription = new SubscriptionBuilder("test.handler", mockHandler)
        .withOnComplete(mockOnComplete)
        .build();

      expect(subscription.onComplete).toBe(mockOnComplete);
    });

    it("withPriority sets priority", () => {
      const subscription = new SubscriptionBuilder("test.handler", mockHandler)
        .withPriority(50)
        .build();

      expect(subscription.priority).toBe(50);
    });

    it("withTransform sets custom transformer", () => {
      const transformer = vi.fn((event: PublishedEvent) => ({
        orderId: event.streamId,
        eventType: event.eventType,
      }));

      const subscription = new SubscriptionBuilder<{ orderId: string; eventType: string }>(
        "test.handler",
        mockHandler
      )
        .withTransform(transformer)
        .build();

      const event = createTestEvent();
      const chain = createTestChain();
      const args = subscription.toHandlerArgs(event, chain);

      expect(args).toEqual({
        orderId: "order_456",
        eventType: "OrderSubmitted",
      });
    });

    it("withPartitionKey sets custom partition key extractor", () => {
      const subscription = new SubscriptionBuilder("test.handler", mockHandler)
        .withPartitionKey((event) => ({
          name: "customerId",
          value: event.payload.customerId as string,
        }))
        .build();

      const event = createTestEvent({ payload: { orderId: "o_1", customerId: "cust_123" } });
      expect(subscription.getPartitionKey(event)).toEqual({
        name: "customerId",
        value: "cust_123",
      });
    });
  });
});

describe("SubscriptionRegistry", () => {
  describe("add", () => {
    it("adds subscriptions", () => {
      const registry = new SubscriptionRegistry();
      const subscription = new SubscriptionBuilder("test.handler", mockHandler).build();

      registry.add(subscription);

      expect(registry.getSubscriptions()).toHaveLength(1);
      expect(registry.getSubscriptions()[0]).toBe(subscription);
    });

    it("supports chaining", () => {
      const registry = new SubscriptionRegistry();
      const sub1 = new SubscriptionBuilder("handler1", mockHandler).build();
      const sub2 = new SubscriptionBuilder("handler2", mockHandler).build();

      registry.add(sub1).add(sub2);

      expect(registry.getSubscriptions()).toHaveLength(2);
    });

    it("throws on duplicate subscription name", () => {
      const registry = new SubscriptionRegistry();
      const sub1 = new SubscriptionBuilder("duplicate.name", mockHandler).build();
      const sub2 = new SubscriptionBuilder("duplicate.name", mockHandler).build();

      registry.add(sub1);

      expect(() => registry.add(sub2)).toThrow('Duplicate subscription name: "duplicate.name"');
    });
  });

  describe("subscribe", () => {
    it("returns builder that adds to registry on build", () => {
      const registry = new SubscriptionRegistry();

      registry.subscribe("test.handler", mockHandler).forEventTypes("OrderSubmitted").build();

      expect(registry.getSubscriptions()).toHaveLength(1);
      expect(registry.getSubscriptions()[0].name).toBe("test.handler");
    });
  });
});

describe("defineSubscriptions", () => {
  it("returns array of configured subscriptions", () => {
    const subscriptions = defineSubscriptions((registry) => {
      registry.subscribe("handler1", mockHandler).forEventTypes("OrderSubmitted").build();

      registry.subscribe("handler2", mockHandler).forEventTypes("OrderCancelled").build();
    });

    expect(subscriptions).toHaveLength(2);
    expect(subscriptions[0].name).toBe("handler1");
    expect(subscriptions[1].name).toBe("handler2");
  });

  it("throws on duplicate subscription names via subscribe().build()", () => {
    expect(() =>
      defineSubscriptions((registry) => {
        registry.subscribe("duplicate.handler", mockHandler).forEventTypes("Event1").build();
        registry.subscribe("duplicate.handler", mockHandler).forEventTypes("Event2").build();
      })
    ).toThrow('Duplicate subscription name: "duplicate.handler"');
  });

  it("throws on duplicate subscription names via add()", () => {
    expect(() =>
      defineSubscriptions((registry) => {
        const sub1 = new SubscriptionBuilder("duplicate.name", mockHandler).build();
        const sub2 = new SubscriptionBuilder("duplicate.name", mockHandler).build();
        registry.add(sub1);
        registry.add(sub2);
      })
    ).toThrow('Duplicate subscription name: "duplicate.name"');
  });
});

describe("createSubscription", () => {
  it("creates standalone builder", () => {
    const subscription = createSubscription("standalone", mockHandler)
      .forEventTypes("TestEvent")
      .build();

    expect(subscription.name).toBe("standalone");
    expect(subscription.filter.eventTypes).toEqual(["TestEvent"]);
  });
});

describe("matchesEvent", () => {
  describe("with empty filter", () => {
    it("matches any event", () => {
      const subscription: EventSubscription = {
        name: "wildcard",
        filter: {},
        handler: mockHandler,
        toHandlerArgs: (e) => e as Record<string, unknown>,
        getPartitionKey: (e) => ({ name: "streamId", value: e.streamId }),
      };

      expect(matchesEvent(subscription, createTestEvent())).toBe(true);
      expect(matchesEvent(subscription, createTestEvent({ eventType: "DifferentEvent" }))).toBe(
        true
      );
    });
  });

  describe("with eventTypes filter", () => {
    it("matches when event type is in list", () => {
      const subscription: EventSubscription = {
        name: "test",
        filter: { eventTypes: ["OrderSubmitted", "OrderCancelled"] },
        handler: mockHandler,
        toHandlerArgs: (e) => e as Record<string, unknown>,
        getPartitionKey: (e) => ({ name: "streamId", value: e.streamId }),
      };

      expect(matchesEvent(subscription, createTestEvent({ eventType: "OrderSubmitted" }))).toBe(
        true
      );
      expect(matchesEvent(subscription, createTestEvent({ eventType: "OrderCancelled" }))).toBe(
        true
      );
    });

    it("does not match when event type is not in list", () => {
      const subscription: EventSubscription = {
        name: "test",
        filter: { eventTypes: ["OrderSubmitted"] },
        handler: mockHandler,
        toHandlerArgs: (e) => e as Record<string, unknown>,
        getPartitionKey: (e) => ({ name: "streamId", value: e.streamId }),
      };

      expect(matchesEvent(subscription, createTestEvent({ eventType: "DifferentEvent" }))).toBe(
        false
      );
    });
  });

  describe("with categories filter", () => {
    it("matches when category is in list", () => {
      const subscription: EventSubscription = {
        name: "test",
        filter: { categories: ["domain", "integration"] },
        handler: mockHandler,
        toHandlerArgs: (e) => e as Record<string, unknown>,
        getPartitionKey: (e) => ({ name: "streamId", value: e.streamId }),
      };

      expect(matchesEvent(subscription, createTestEvent({ category: "domain" }))).toBe(true);
      expect(matchesEvent(subscription, createTestEvent({ category: "integration" }))).toBe(true);
    });

    it("does not match when category is not in list", () => {
      const subscription: EventSubscription = {
        name: "test",
        filter: { categories: ["domain"] },
        handler: mockHandler,
        toHandlerArgs: (e) => e as Record<string, unknown>,
        getPartitionKey: (e) => ({ name: "streamId", value: e.streamId }),
      };

      expect(matchesEvent(subscription, createTestEvent({ category: "trigger" }))).toBe(false);
    });
  });

  describe("with boundedContexts filter", () => {
    it("matches when bounded context is in list", () => {
      const subscription: EventSubscription = {
        name: "test",
        filter: { boundedContexts: ["orders", "inventory"] },
        handler: mockHandler,
        toHandlerArgs: (e) => e as Record<string, unknown>,
        getPartitionKey: (e) => ({ name: "streamId", value: e.streamId }),
      };

      expect(matchesEvent(subscription, createTestEvent({ boundedContext: "orders" }))).toBe(true);
    });

    it("does not match when bounded context is not in list", () => {
      const subscription: EventSubscription = {
        name: "test",
        filter: { boundedContexts: ["payments"] },
        handler: mockHandler,
        toHandlerArgs: (e) => e as Record<string, unknown>,
        getPartitionKey: (e) => ({ name: "streamId", value: e.streamId }),
      };

      expect(matchesEvent(subscription, createTestEvent({ boundedContext: "orders" }))).toBe(false);
    });
  });

  describe("with streamTypes filter", () => {
    it("matches when stream type is in list", () => {
      const subscription: EventSubscription = {
        name: "test",
        filter: { streamTypes: ["Order", "Product"] },
        handler: mockHandler,
        toHandlerArgs: (e) => e as Record<string, unknown>,
        getPartitionKey: (e) => ({ name: "streamId", value: e.streamId }),
      };

      expect(matchesEvent(subscription, createTestEvent({ streamType: "Order" }))).toBe(true);
    });

    it("does not match when stream type is not in list", () => {
      const subscription: EventSubscription = {
        name: "test",
        filter: { streamTypes: ["Customer"] },
        handler: mockHandler,
        toHandlerArgs: (e) => e as Record<string, unknown>,
        getPartitionKey: (e) => ({ name: "streamId", value: e.streamId }),
      };

      expect(matchesEvent(subscription, createTestEvent({ streamType: "Order" }))).toBe(false);
    });
  });

  describe("with combined filters", () => {
    it("requires all filters to match (AND logic between filter types)", () => {
      const subscription: EventSubscription = {
        name: "test",
        filter: {
          eventTypes: ["OrderSubmitted"],
          categories: ["domain"],
          boundedContexts: ["orders"],
        },
        handler: mockHandler,
        toHandlerArgs: (e) => e as Record<string, unknown>,
        getPartitionKey: (e) => ({ name: "streamId", value: e.streamId }),
      };

      // All match
      expect(
        matchesEvent(
          subscription,
          createTestEvent({
            eventType: "OrderSubmitted",
            category: "domain",
            boundedContext: "orders",
          })
        )
      ).toBe(true);

      // Event type doesn't match
      expect(
        matchesEvent(
          subscription,
          createTestEvent({
            eventType: "OrderCancelled",
            category: "domain",
            boundedContext: "orders",
          })
        )
      ).toBe(false);

      // Category doesn't match
      expect(
        matchesEvent(
          subscription,
          createTestEvent({
            eventType: "OrderSubmitted",
            category: "trigger",
            boundedContext: "orders",
          })
        )
      ).toBe(false);
    });
  });
});
