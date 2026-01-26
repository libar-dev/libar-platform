/**
 * Unit Tests for Process Manager EventBus Subscription
 *
 * Tests the PM subscription helpers:
 * - computePMInstanceId for instance ID resolution
 * - createPMSubscription for single PM registration
 * - createPMSubscriptions for bulk PM registration
 */
import { describe, it, expect, vi } from "vitest";
import {
  computePMInstanceId,
  createPMSubscription,
  createPMSubscriptions,
  DEFAULT_PM_SUBSCRIPTION_PRIORITY,
  type PMDefinitionForSubscription,
  type PMEventHandlerArgs,
} from "../../../src/processManager/subscription";
import type { PublishedEvent } from "../../../src/eventbus/types";
import type { CorrelationChain } from "../../../src/correlation/types";
import type { FunctionReference } from "convex/server";

describe("computePMInstanceId", () => {
  const createMockEvent = (overrides?: Partial<PublishedEvent>): PublishedEvent => ({
    eventId: "evt_001",
    eventType: "OrderConfirmed",
    globalPosition: 1000,
    streamType: "Order",
    streamId: "ord_123",
    payload: { orderId: "ord_123", customerId: "cust_456" },
    timestamp: Date.now(),
    category: "domain",
    boundedContext: "orders",
    ...overrides,
  });

  it("returns streamId when no correlation strategy is provided", () => {
    const event = createMockEvent({ streamId: "ord_custom_id" });

    const instanceId = computePMInstanceId(event, undefined);

    expect(instanceId).toBe("ord_custom_id");
  });

  it("returns correlation property value when strategy is provided", () => {
    const event = createMockEvent({
      payload: { orderId: "ord_999", customerId: "cust_888" },
    });
    const strategy = { correlationProperty: "customerId" };

    const instanceId = computePMInstanceId(event, strategy);

    expect(instanceId).toBe("cust_888");
  });

  it("falls back to streamId when correlation property not in payload", () => {
    const event = createMockEvent({
      streamId: "ord_fallback",
      payload: { orderId: "ord_123" }, // No customerId
    });
    const strategy = { correlationProperty: "customerId" };

    const instanceId = computePMInstanceId(event, strategy);

    expect(instanceId).toBe("ord_fallback");
  });

  it("falls back to streamId when correlation property is not a string", () => {
    const event = createMockEvent({
      streamId: "ord_fallback",
      payload: { orderId: "ord_123", numericId: 12345 },
    });
    const strategy = { correlationProperty: "numericId" };

    const instanceId = computePMInstanceId(event, strategy);

    expect(instanceId).toBe("ord_fallback");
  });

  it("falls back to streamId when correlation property is null", () => {
    const event = createMockEvent({
      streamId: "ord_null_fallback",
      payload: { orderId: "ord_123", nullField: null },
    });
    const strategy = { correlationProperty: "nullField" };

    const instanceId = computePMInstanceId(event, strategy);

    expect(instanceId).toBe("ord_null_fallback");
  });

  it("falls back to streamId when correlation property is undefined", () => {
    const event = createMockEvent({
      streamId: "ord_undefined_fallback",
      payload: { orderId: "ord_123", undefinedField: undefined },
    });
    const strategy = { correlationProperty: "undefinedField" };

    const instanceId = computePMInstanceId(event, strategy);

    expect(instanceId).toBe("ord_undefined_fallback");
  });

  it("handles empty string correlation property value", () => {
    // Empty string is a valid string, so it should be used (even if unusual)
    const event = createMockEvent({
      streamId: "ord_fallback",
      payload: { orderId: "", customerId: "cust_123" },
    });
    const strategy = { correlationProperty: "orderId" };

    const instanceId = computePMInstanceId(event, strategy);

    // Empty string is still a string, so it's used as-is
    expect(instanceId).toBe("");
  });

  it("handles whitespace-only correlation property value", () => {
    // Whitespace is a valid string, so it should be used (even if unusual)
    const event = createMockEvent({
      streamId: "ord_fallback",
      payload: { orderId: "   ", customerId: "cust_123" },
    });
    const strategy = { correlationProperty: "orderId" };

    const instanceId = computePMInstanceId(event, strategy);

    // Whitespace string is still a string, so it's used as-is
    expect(instanceId).toBe("   ");
  });

  it("uses orderId correlation strategy correctly", () => {
    const event = createMockEvent({
      streamId: "stream_123",
      payload: { orderId: "order_specific_id" },
    });
    const strategy = { correlationProperty: "orderId" };

    const instanceId = computePMInstanceId(event, strategy);

    expect(instanceId).toBe("order_specific_id");
  });
});

describe("createPMSubscription", () => {
  // Type-safe mock handler
  const mockHandler =
    "internal.processManagers.orderNotification.handleEvent" as unknown as FunctionReference<
      "mutation",
      "internal",
      PMEventHandlerArgs,
      unknown
    >;

  const basePMDefinition: PMDefinitionForSubscription = {
    processManagerName: "orderNotification",
    eventSubscriptions: ["OrderConfirmed", "OrderShipped"] as const,
  };

  const createMockEvent = (overrides?: Partial<PublishedEvent>): PublishedEvent => ({
    eventId: "evt_001",
    eventType: "OrderConfirmed",
    globalPosition: 1000,
    streamType: "Order",
    streamId: "ord_123",
    payload: { orderId: "ord_123" },
    timestamp: Date.now(),
    category: "domain",
    boundedContext: "orders",
    ...overrides,
  });

  const mockCorrelationChain: CorrelationChain = {
    correlationId: "corr_001",
    causationId: "cause_001",
    metadata: {},
  };

  describe("subscription naming", () => {
    it("creates subscription name without context", () => {
      const subscription = createPMSubscription(basePMDefinition, { handler: mockHandler });

      expect(subscription.name).toBe("pm:orderNotification");
    });

    it("creates subscription name with context", () => {
      const definition: PMDefinitionForSubscription = {
        ...basePMDefinition,
        context: "orders",
      };

      const subscription = createPMSubscription(definition, { handler: mockHandler });

      expect(subscription.name).toBe("pm:orders:orderNotification");
    });
  });

  describe("priority configuration", () => {
    it("uses default priority 200", () => {
      const subscription = createPMSubscription(basePMDefinition, { handler: mockHandler });

      expect(subscription.priority).toBe(200);
      expect(subscription.priority).toBe(DEFAULT_PM_SUBSCRIPTION_PRIORITY);
    });

    it("uses custom priority when provided", () => {
      const subscription = createPMSubscription(basePMDefinition, {
        handler: mockHandler,
        priority: 150,
      });

      expect(subscription.priority).toBe(150);
    });
  });

  describe("event filtering", () => {
    it("filters by event types from PM definition", () => {
      const subscription = createPMSubscription(basePMDefinition, { handler: mockHandler });

      expect(subscription.filter?.eventTypes).toEqual(["OrderConfirmed", "OrderShipped"]);
    });

    it("creates mutable copy of event types", () => {
      const subscription = createPMSubscription(basePMDefinition, { handler: mockHandler });

      // Should be a copy, not the original readonly array
      expect(subscription.filter?.eventTypes).not.toBe(basePMDefinition.eventSubscriptions);
      expect(subscription.filter?.eventTypes).toEqual([...basePMDefinition.eventSubscriptions]);
    });
  });

  describe("handler args transformation", () => {
    it("uses default toHandlerArgs transformer", () => {
      const subscription = createPMSubscription(basePMDefinition, { handler: mockHandler });

      const event = createMockEvent({
        eventId: "evt_test",
        eventType: "OrderConfirmed",
        globalPosition: 2000,
        streamId: "ord_456",
        payload: { orderId: "ord_456", total: 100 },
      });

      const args = subscription.toHandlerArgs!(event, mockCorrelationChain);

      expect(args).toEqual({
        eventId: "evt_test",
        eventType: "OrderConfirmed",
        globalPosition: 2000,
        correlationId: "corr_001",
        streamType: "Order",
        streamId: "ord_456",
        payload: { orderId: "ord_456", total: 100 },
        timestamp: event.timestamp,
        category: "domain",
        boundedContext: "orders",
        instanceId: "ord_456", // Default: uses streamId
      });
    });

    it("computes instanceId from correlation strategy", () => {
      const definition: PMDefinitionForSubscription = {
        ...basePMDefinition,
        correlationStrategy: { correlationProperty: "orderId" },
      };

      const subscription = createPMSubscription(definition, { handler: mockHandler });

      const event = createMockEvent({
        streamId: "stream_different",
        payload: { orderId: "ord_from_payload" },
      });

      const args = subscription.toHandlerArgs!(event, mockCorrelationChain);

      expect(args.instanceId).toBe("ord_from_payload");
    });

    it("uses custom toHandlerArgs transformer", () => {
      const customTransformer = vi.fn((_event, _chain, instanceId) => ({
        customField: "custom_value",
        instanceId,
      }));

      const subscription = createPMSubscription(basePMDefinition, {
        handler: mockHandler as unknown as FunctionReference<
          "mutation",
          "internal",
          { customField: string; instanceId: string },
          unknown
        >,
        toHandlerArgs: customTransformer,
      });

      const event = createMockEvent();
      const args = subscription.toHandlerArgs!(event, mockCorrelationChain);

      expect(customTransformer).toHaveBeenCalledWith(event, mockCorrelationChain, "ord_123");
      expect(args).toEqual({
        customField: "custom_value",
        instanceId: "ord_123",
      });
    });
  });

  describe("partition key", () => {
    it("uses default partition by instanceId", () => {
      const subscription = createPMSubscription(basePMDefinition, { handler: mockHandler });

      const event = createMockEvent({ streamId: "ord_partition_test" });
      const partitionKey = subscription.getPartitionKey!(event);

      expect(partitionKey).toEqual({
        name: "instanceId",
        value: "ord_partition_test",
      });
    });

    it("uses correlation strategy for partition key", () => {
      const definition: PMDefinitionForSubscription = {
        ...basePMDefinition,
        correlationStrategy: { correlationProperty: "customerId" },
      };

      const subscription = createPMSubscription(definition, { handler: mockHandler });

      const event = createMockEvent({
        payload: { customerId: "cust_partition" },
      });
      const partitionKey = subscription.getPartitionKey!(event);

      expect(partitionKey).toEqual({
        name: "instanceId",
        value: "cust_partition",
      });
    });

    it("uses custom getPartitionKey", () => {
      const customPartitionKey = vi.fn((_event, instanceId) => ({
        name: "customPartition",
        value: `custom:${instanceId}`,
      }));

      const subscription = createPMSubscription(basePMDefinition, {
        handler: mockHandler,
        getPartitionKey: customPartitionKey,
      });

      const event = createMockEvent({ streamId: "ord_custom" });
      const partitionKey = subscription.getPartitionKey!(event);

      expect(customPartitionKey).toHaveBeenCalledWith(event, "ord_custom");
      expect(partitionKey).toEqual({
        name: "customPartition",
        value: "custom:ord_custom",
      });
    });
  });

  describe("handler reference", () => {
    it("passes through handler reference", () => {
      const subscription = createPMSubscription(basePMDefinition, { handler: mockHandler });

      expect(subscription.handler).toBe(mockHandler);
    });
  });
});

describe("createPMSubscriptions", () => {
  const mockHandler1 =
    "internal.processManagers.orderNotification.handleEvent" as unknown as FunctionReference<
      "mutation",
      "internal",
      PMEventHandlerArgs,
      unknown
    >;

  const mockHandler2 =
    "internal.processManagers.orderAnalytics.handleEvent" as unknown as FunctionReference<
      "mutation",
      "internal",
      PMEventHandlerArgs,
      unknown
    >;

  const pm1: PMDefinitionForSubscription = {
    processManagerName: "orderNotification",
    eventSubscriptions: ["OrderConfirmed"] as const,
    context: "orders",
  };

  const pm2: PMDefinitionForSubscription = {
    processManagerName: "orderAnalytics",
    eventSubscriptions: ["OrderConfirmed", "OrderShipped"] as const,
    context: "analytics",
  };

  it("creates subscriptions for all definitions", () => {
    const subscriptions = createPMSubscriptions([pm1, pm2], {
      orderNotification: mockHandler1,
      orderAnalytics: mockHandler2,
    });

    expect(subscriptions).toHaveLength(2);
    expect(subscriptions[0]?.name).toBe("pm:orders:orderNotification");
    expect(subscriptions[1]?.name).toBe("pm:analytics:orderAnalytics");
  });

  it("throws error when handler is missing", () => {
    expect(() =>
      createPMSubscriptions([pm1, pm2], {
        orderNotification: mockHandler1,
        // Missing orderAnalytics handler
      })
    ).toThrow('Missing handler for process manager "orderAnalytics" in handlerMap');
  });

  it("applies common options to all subscriptions", () => {
    const subscriptions = createPMSubscriptions(
      [pm1, pm2],
      {
        orderNotification: mockHandler1,
        orderAnalytics: mockHandler2,
      },
      { priority: 250 }
    );

    expect(subscriptions[0]?.priority).toBe(250);
    expect(subscriptions[1]?.priority).toBe(250);
  });

  it("creates subscriptions with correct event filters", () => {
    const subscriptions = createPMSubscriptions([pm1, pm2], {
      orderNotification: mockHandler1,
      orderAnalytics: mockHandler2,
    });

    expect(subscriptions[0]?.filter?.eventTypes).toEqual(["OrderConfirmed"]);
    expect(subscriptions[1]?.filter?.eventTypes).toEqual(["OrderConfirmed", "OrderShipped"]);
  });

  it("handles empty definitions array", () => {
    const subscriptions = createPMSubscriptions([], {});

    expect(subscriptions).toEqual([]);
  });

  it("passes handlers correctly", () => {
    const subscriptions = createPMSubscriptions([pm1, pm2], {
      orderNotification: mockHandler1,
      orderAnalytics: mockHandler2,
    });

    expect(subscriptions[0]?.handler).toBe(mockHandler1);
    expect(subscriptions[1]?.handler).toBe(mockHandler2);
  });
});

describe("DEFAULT_PM_SUBSCRIPTION_PRIORITY", () => {
  it("has value of 200", () => {
    expect(DEFAULT_PM_SUBSCRIPTION_PRIORITY).toBe(200);
  });

  it("is after projections (100) and before sagas (300)", () => {
    const PROJECTION_PRIORITY = 100;
    const SAGA_PRIORITY = 300;

    expect(DEFAULT_PM_SUBSCRIPTION_PRIORITY).toBeGreaterThan(PROJECTION_PRIORITY);
    expect(DEFAULT_PM_SUBSCRIPTION_PRIORITY).toBeLessThan(SAGA_PRIORITY);
  });
});
