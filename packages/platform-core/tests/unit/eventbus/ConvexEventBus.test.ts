/**
 * Unit Tests for ConvexEventBus
 *
 * Tests the EventBus implementation:
 * - publish() - subscription matching, workpool enqueue, partition keys
 * - getMatchingSubscriptions() - filter logic
 * - hasSubscribersFor() - event type + wildcard checking
 * - getAllSubscriptions() - retrieval
 * - buildIndex() - priority sorting
 */
import { describe, it, expect, beforeEach } from "vitest";
import { ConvexEventBus, createEventBus } from "../../../src/eventbus/ConvexEventBus";
import { defineSubscriptions } from "../../../src/eventbus/registry";
import type { PublishedEvent } from "../../../src/eventbus/types";
import type { WorkpoolClient, MutationCtx } from "../../../src/orchestration/types";
import type { CorrelationChain } from "../../../src/correlation/types";
import type { FunctionReference, FunctionVisibility } from "convex/server";
import type { WorkpoolOnCompleteArgs } from "../../../src/orchestration/types";

// Mock workpool client
function createMockWorkpool(): WorkpoolClient & { calls: unknown[][] } {
  const calls: unknown[][] = [];
  return {
    calls,
    async enqueueMutation(ctx, handler, args, options) {
      calls.push([ctx, handler, args, options]);
      return null;
    },
  };
}

// Mock mutation context
function createMockCtx(): MutationCtx {
  return {} as MutationCtx;
}

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

describe("ConvexEventBus", () => {
  let mockWorkpool: WorkpoolClient & { calls: unknown[][] };
  let mockCtx: MutationCtx;

  beforeEach(() => {
    mockWorkpool = createMockWorkpool();
    mockCtx = createMockCtx();
  });

  describe("constructor", () => {
    it("creates bus with empty subscriptions", () => {
      const bus = new ConvexEventBus(mockWorkpool, []);

      expect(bus.getAllSubscriptions()).toHaveLength(0);
    });

    it("creates bus with subscriptions sorted by priority", () => {
      const subscriptions = defineSubscriptions((registry) => {
        registry.subscribe("low.priority", mockHandler).withPriority(200).build();
        registry.subscribe("high.priority", mockHandler).withPriority(50).build();
        registry.subscribe("default.priority", mockHandler).build(); // 100
      });

      const bus = new ConvexEventBus(mockWorkpool, subscriptions);
      const all = bus.getAllSubscriptions();

      expect(all).toHaveLength(3);
      expect(all[0].name).toBe("high.priority");
      expect(all[1].name).toBe("default.priority");
      expect(all[2].name).toBe("low.priority");
    });
  });

  describe("publish", () => {
    it("returns empty result when no subscriptions match", async () => {
      const subscriptions = defineSubscriptions((registry) => {
        registry
          .subscribe("order.handler", mockHandler)
          .forEventTypes("OrderCancelled") // Different event type
          .build();
      });

      const bus = new ConvexEventBus(mockWorkpool, subscriptions);
      const event = createTestEvent({ eventType: "OrderSubmitted" });
      const chain = createTestChain();

      const result = await bus.publish(mockCtx, event, chain);

      expect(result.matchedSubscriptions).toBe(0);
      expect(result.triggeredSubscriptions).toHaveLength(0);
      expect(result.success).toBe(true);
      expect(mockWorkpool.calls).toHaveLength(0);
    });

    it("enqueues matching subscriptions via workpool", async () => {
      const subscriptions = defineSubscriptions((registry) => {
        registry.subscribe("order.handler", mockHandler).forEventTypes("OrderSubmitted").build();
      });

      const bus = new ConvexEventBus(mockWorkpool, subscriptions);
      const event = createTestEvent();
      const chain = createTestChain();

      const result = await bus.publish(mockCtx, event, chain);

      expect(result.matchedSubscriptions).toBe(1);
      expect(result.triggeredSubscriptions).toEqual(["order.handler"]);
      expect(result.success).toBe(true);
      expect(mockWorkpool.calls).toHaveLength(1);
    });

    it("enqueues multiple matching subscriptions", async () => {
      const subscriptions = defineSubscriptions((registry) => {
        registry
          .subscribe("projection.handler", mockHandler)
          .forEventTypes("OrderSubmitted")
          .withPriority(100)
          .build();

        registry
          .subscribe("saga.handler", mockHandler)
          .forEventTypes("OrderSubmitted")
          .withPriority(200)
          .build();
      });

      const bus = new ConvexEventBus(mockWorkpool, subscriptions);
      const event = createTestEvent();
      const chain = createTestChain();

      const result = await bus.publish(mockCtx, event, chain);

      expect(result.matchedSubscriptions).toBe(2);
      expect(result.triggeredSubscriptions).toEqual(["projection.handler", "saga.handler"]);
      expect(mockWorkpool.calls).toHaveLength(2);
    });

    it("passes transformed args to workpool", async () => {
      const subscriptions = defineSubscriptions((registry) => {
        registry
          .subscribe("order.handler", mockHandler)
          .forEventTypes("OrderSubmitted")
          .withTransform((event) => ({
            orderId: event.streamId,
            eventType: event.eventType,
          }))
          .build();
      });

      const bus = new ConvexEventBus(mockWorkpool, subscriptions);
      const event = createTestEvent();
      const chain = createTestChain();

      await bus.publish(mockCtx, event, chain);

      const [, , args] = mockWorkpool.calls[0];
      expect(args).toEqual({
        orderId: "order_456",
        eventType: "OrderSubmitted",
      });
    });

    it("includes partition key in workpool context", async () => {
      const subscriptions = defineSubscriptions((registry) => {
        registry
          .subscribe("order.handler", mockHandler)
          .forEventTypes("OrderSubmitted")
          .withPartitionKey((event) => ({
            name: "orderId",
            value: event.streamId,
          }))
          .build();
      });

      const bus = new ConvexEventBus(mockWorkpool, subscriptions);
      const event = createTestEvent();
      const chain = createTestChain();

      await bus.publish(mockCtx, event, chain);

      const [, , , options] = mockWorkpool.calls[0] as [
        unknown,
        unknown,
        unknown,
        { context: Record<string, unknown> },
      ];
      expect(options.context.partition).toEqual({ name: "orderId", value: "order_456" });
      expect(options.context.globalPosition).toBe(1000);
      expect(options.context.subscriptionName).toBe("order.handler");
      expect(options.context.eventId).toBe("evt_test_123");
      expect(options.context.eventType).toBe("OrderSubmitted");
    });

    it("uses subscription-level onComplete when provided", async () => {
      const subscriptionOnComplete = { name: "subscriptionOnComplete" } as FunctionReference<
        "mutation",
        FunctionVisibility,
        WorkpoolOnCompleteArgs,
        unknown
      >;

      const subscriptions = defineSubscriptions((registry) => {
        registry
          .subscribe("order.handler", mockHandler)
          .forEventTypes("OrderSubmitted")
          .withOnComplete(subscriptionOnComplete)
          .build();
      });

      const bus = new ConvexEventBus(mockWorkpool, subscriptions);
      const event = createTestEvent();
      const chain = createTestChain();

      await bus.publish(mockCtx, event, chain);

      const [, , , options] = mockWorkpool.calls[0] as [
        unknown,
        unknown,
        unknown,
        { onComplete?: FunctionReference<"mutation", FunctionVisibility, unknown, unknown> },
      ];
      expect(options.onComplete).toBe(subscriptionOnComplete);
    });

    it("uses default onComplete from config when subscription has none", async () => {
      const subscriptions = defineSubscriptions((registry) => {
        registry
          .subscribe("order.handler", mockHandler)
          .forEventTypes("OrderSubmitted")
          // No withOnComplete
          .build();
      });

      const bus = new ConvexEventBus(mockWorkpool, subscriptions, {
        defaultOnComplete: mockOnComplete,
      });
      const event = createTestEvent();
      const chain = createTestChain();

      await bus.publish(mockCtx, event, chain);

      const [, , , options] = mockWorkpool.calls[0] as [
        unknown,
        unknown,
        unknown,
        { onComplete?: FunctionReference<"mutation", FunctionVisibility, unknown, unknown> },
      ];
      expect(options.onComplete).toBe(mockOnComplete);
    });

    it("does not include onComplete if neither subscription nor config provides it", async () => {
      const subscriptions = defineSubscriptions((registry) => {
        registry.subscribe("order.handler", mockHandler).forEventTypes("OrderSubmitted").build();
      });

      const bus = new ConvexEventBus(mockWorkpool, subscriptions);
      const event = createTestEvent();
      const chain = createTestChain();

      await bus.publish(mockCtx, event, chain);

      const [, , , options] = mockWorkpool.calls[0] as [
        unknown,
        unknown,
        unknown,
        { onComplete?: unknown },
      ];
      expect(options.onComplete).toBeUndefined();
    });
  });

  describe("hasSubscribersFor", () => {
    it("returns true when event type has indexed subscriptions", () => {
      const subscriptions = defineSubscriptions((registry) => {
        registry.subscribe("order.handler", mockHandler).forEventTypes("OrderSubmitted").build();
      });

      const bus = new ConvexEventBus(mockWorkpool, subscriptions);

      expect(bus.hasSubscribersFor("OrderSubmitted")).toBe(true);
      expect(bus.hasSubscribersFor("OrderCancelled")).toBe(false);
    });

    it("returns true when wildcard subscriptions exist", () => {
      const subscriptions = defineSubscriptions((registry) => {
        // No event type filter = wildcard
        registry.subscribe("wildcard.handler", mockHandler).build();
      });

      const bus = new ConvexEventBus(mockWorkpool, subscriptions);

      expect(bus.hasSubscribersFor("AnyEventType")).toBe(true);
      expect(bus.hasSubscribersFor("AnotherType")).toBe(true);
    });

    it("returns false when no subscriptions exist", () => {
      const bus = new ConvexEventBus(mockWorkpool, []);

      expect(bus.hasSubscribersFor("SomeEvent")).toBe(false);
    });
  });

  describe("getAllSubscriptions", () => {
    it("returns copy of all subscriptions", () => {
      const subscriptions = defineSubscriptions((registry) => {
        registry.subscribe("handler1", mockHandler).build();
        registry.subscribe("handler2", mockHandler).build();
      });

      const bus = new ConvexEventBus(mockWorkpool, subscriptions);
      const all = bus.getAllSubscriptions();

      expect(all).toHaveLength(2);
      expect(all.map((s) => s.name)).toContain("handler1");
      expect(all.map((s) => s.name)).toContain("handler2");
    });

    it("returns empty array when no subscriptions", () => {
      const bus = new ConvexEventBus(mockWorkpool, []);

      expect(bus.getAllSubscriptions()).toEqual([]);
    });
  });

  describe("getMatchingSubscriptions", () => {
    it("returns subscriptions matching event type filter", () => {
      const subscriptions = defineSubscriptions((registry) => {
        registry.subscribe("order.handler", mockHandler).forEventTypes("OrderSubmitted").build();

        registry
          .subscribe("inventory.handler", mockHandler)
          .forEventTypes("InventoryReserved")
          .build();
      });

      const bus = new ConvexEventBus(mockWorkpool, subscriptions);
      const matching = bus.getMatchingSubscriptions({
        eventTypes: ["OrderSubmitted"],
      });

      expect(matching).toHaveLength(1);
      expect(matching[0].name).toBe("order.handler");
    });

    it("returns subscriptions matching category filter", () => {
      const subscriptions = defineSubscriptions((registry) => {
        registry.subscribe("domain.handler", mockHandler).forCategories("domain").build();

        registry.subscribe("integration.handler", mockHandler).forCategories("integration").build();
      });

      const bus = new ConvexEventBus(mockWorkpool, subscriptions);
      const matching = bus.getMatchingSubscriptions({
        categories: ["integration"],
      });

      expect(matching).toHaveLength(1);
      expect(matching[0].name).toBe("integration.handler");
    });
  });

  describe("priority ordering", () => {
    it("publishes to subscriptions in priority order", async () => {
      const subscriptions = defineSubscriptions((registry) => {
        registry.subscribe("low", mockHandler).forEventTypes("TestEvent").withPriority(300).build();

        registry.subscribe("high", mockHandler).forEventTypes("TestEvent").withPriority(50).build();

        registry
          .subscribe("medium", mockHandler)
          .forEventTypes("TestEvent")
          .withPriority(150)
          .build();
      });

      const bus = new ConvexEventBus(mockWorkpool, subscriptions);
      const event = createTestEvent({ eventType: "TestEvent" });
      const chain = createTestChain();

      const result = await bus.publish(mockCtx, event, chain);

      // Should be in priority order
      expect(result.triggeredSubscriptions).toEqual(["high", "medium", "low"]);
    });
  });

  describe("error handling", () => {
    it("propagates workpool errors when enqueue fails", async () => {
      const failingWorkpool: WorkpoolClient = {
        async enqueueMutation() {
          throw new Error("Workpool unavailable");
        },
      };

      const subscriptions = defineSubscriptions((registry) => {
        registry.subscribe("order.handler", mockHandler).forEventTypes("OrderSubmitted").build();
      });

      const bus = new ConvexEventBus(failingWorkpool, subscriptions);
      const event = createTestEvent();
      const chain = createTestChain();

      await expect(bus.publish(mockCtx, event, chain)).rejects.toThrow("Workpool unavailable");
    });

    it("does not enqueue subsequent subscriptions if earlier enqueue fails", async () => {
      let callCount = 0;
      const failingOnSecondWorkpool: WorkpoolClient = {
        async enqueueMutation() {
          callCount++;
          if (callCount === 2) {
            throw new Error("Second enqueue failed");
          }
          return null;
        },
      };

      const subscriptions = defineSubscriptions((registry) => {
        registry
          .subscribe("first.handler", mockHandler)
          .forEventTypes("OrderSubmitted")
          .withPriority(100)
          .build();
        registry
          .subscribe("second.handler", mockHandler)
          .forEventTypes("OrderSubmitted")
          .withPriority(200)
          .build();
        registry
          .subscribe("third.handler", mockHandler)
          .forEventTypes("OrderSubmitted")
          .withPriority(300)
          .build();
      });

      const bus = new ConvexEventBus(failingOnSecondWorkpool, subscriptions);
      const event = createTestEvent();
      const chain = createTestChain();

      await expect(bus.publish(mockCtx, event, chain)).rejects.toThrow("Second enqueue failed");
      // First enqueue succeeded, second failed, third was never attempted
      expect(callCount).toBe(2);
    });
  });

  describe("wildcard subscriptions", () => {
    it("wildcard subscriptions match any event", async () => {
      const subscriptions = defineSubscriptions((registry) => {
        // No filter = matches all
        registry.subscribe("wildcard", mockHandler).build();
      });

      const bus = new ConvexEventBus(mockWorkpool, subscriptions);
      const chain = createTestChain();

      const result1 = await bus.publish(mockCtx, createTestEvent({ eventType: "Event1" }), chain);
      expect(result1.triggeredSubscriptions).toContain("wildcard");

      const result2 = await bus.publish(mockCtx, createTestEvent({ eventType: "Event2" }), chain);
      expect(result2.triggeredSubscriptions).toContain("wildcard");
    });

    it("wildcard with bounded context filter only matches that context", async () => {
      const subscriptions = defineSubscriptions((registry) => {
        registry.subscribe("orders.audit", mockHandler).forBoundedContexts("orders").build();
      });

      const bus = new ConvexEventBus(mockWorkpool, subscriptions);
      const chain = createTestChain();

      const ordersEvent = createTestEvent({ boundedContext: "orders" });
      const inventoryEvent = createTestEvent({ boundedContext: "inventory" });

      const result1 = await bus.publish(mockCtx, ordersEvent, chain);
      expect(result1.matchedSubscriptions).toBe(1);

      mockWorkpool.calls = []; // Reset

      const result2 = await bus.publish(mockCtx, inventoryEvent, chain);
      expect(result2.matchedSubscriptions).toBe(0);
    });
  });
});

describe("createEventBus", () => {
  it("creates EventBus instance", () => {
    const workpool = createMockWorkpool();
    const subscriptions = defineSubscriptions(() => {});

    const bus = createEventBus(workpool, subscriptions);

    expect(bus).toBeInstanceOf(ConvexEventBus);
    expect(bus.getAllSubscriptions()).toHaveLength(0);
  });

  it("passes config to EventBus", () => {
    const workpool = createMockWorkpool();
    const subscriptions = defineSubscriptions((registry) => {
      registry
        .subscribe("handler", { name: "handler" } as FunctionReference<
          "mutation",
          FunctionVisibility,
          Record<string, unknown>,
          unknown
        >)
        .forEventTypes("TestEvent")
        .build();
    });

    const onComplete = { name: "onComplete" } as FunctionReference<
      "mutation",
      FunctionVisibility,
      WorkpoolOnCompleteArgs,
      unknown
    >;

    const bus = createEventBus(workpool, subscriptions, {
      defaultOnComplete: onComplete,
    });

    expect(bus).toBeInstanceOf(ConvexEventBus);
  });
});
