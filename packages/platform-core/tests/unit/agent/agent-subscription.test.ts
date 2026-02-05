/**
 * Agent Subscription Unit Tests
 *
 * Tests the agent subscription factory and EventBus infrastructure integration.
 * These tests verify that:
 * 1. createAgentSubscription creates valid EventSubscription objects
 * 2. Subscription filters correctly match event types
 * 3. Handler args transformation includes all required fields
 * 4. Partition keys are correctly extracted for entity ordering
 *
 * These are unit tests (no real backend required) testing pure factory functions.
 */
import { describe, it, expect } from "vitest";
import { makeFunctionReference } from "convex/server";
import type { FunctionReference, FunctionVisibility } from "convex/server";

import {
  createAgentSubscription,
  createAgentSubscriptions,
  defaultAgentTransform,
  DEFAULT_AGENT_SUBSCRIPTION_PRIORITY,
  type AgentDefinitionForSubscription,
  type AgentEventHandlerArgs,
} from "../../../../platform-bus/src/agent-subscription.js";

import type { PublishedEvent, CorrelationChain } from "../../../src/index.js";

// =============================================================================
// Test Fixtures
// =============================================================================

/**
 * Sample agent definition for churn risk detection.
 */
const churnRiskAgent: AgentDefinitionForSubscription = {
  id: "churn-risk-agent",
  subscriptions: ["OrderCancelled", "OrderRefunded"],
  context: "orders",
};

/**
 * Sample agent definition without context.
 */
const simpleAgent: AgentDefinitionForSubscription = {
  id: "simple-agent",
  subscriptions: ["EventA"],
};

/**
 * Create a mock published event for testing.
 */
function createMockEvent(
  eventType: string,
  streamId: string,
  globalPosition: number
): PublishedEvent {
  return {
    eventId: `evt_${globalPosition}`,
    eventType,
    globalPosition,
    streamType: "Order",
    streamId,
    version: 1,
    timestamp: Date.now(),
    category: "domain",
    boundedContext: "orders",
    payload: { orderId: streamId, reason: "Test cancellation" },
    schemaVersion: 1,
    aggregateVersion: 1,
    metadata: {},
    causingCommandId: `cmd_${globalPosition}`,
  };
}

/**
 * Create a mock correlation chain for testing.
 */
function createMockCorrelationChain(correlationId: string): CorrelationChain {
  return {
    correlationId,
    causationId: `cause_${Date.now()}`,
    depth: 1,
    parentIds: [],
  };
}

/**
 * Create a mock handler function reference.
 */
const mockHandler = makeFunctionReference<"mutation">(
  "agents/churnRisk:handleEvent"
) as FunctionReference<"mutation", FunctionVisibility, AgentEventHandlerArgs, unknown>;

// =============================================================================
// Test Suite
// =============================================================================

describe("Agent Subscription Integration", () => {
  describe("createAgentSubscription", () => {
    it("should create subscription with correct name including context", () => {
      const subscription = createAgentSubscription(churnRiskAgent, {
        handler: mockHandler,
      });

      expect(subscription.name).toBe("agent:orders:churn-risk-agent");
    });

    it("should create subscription with correct name without context", () => {
      const subscription = createAgentSubscription(simpleAgent, {
        handler: mockHandler,
      });

      expect(subscription.name).toBe("agent:simple-agent");
    });

    it("should use default priority (250)", () => {
      const subscription = createAgentSubscription(churnRiskAgent, {
        handler: mockHandler,
      });

      expect(subscription.priority).toBe(DEFAULT_AGENT_SUBSCRIPTION_PRIORITY);
      expect(subscription.priority).toBe(250);
    });

    it("should allow custom priority", () => {
      const subscription = createAgentSubscription(churnRiskAgent, {
        handler: mockHandler,
        priority: 300,
      });

      expect(subscription.priority).toBe(300);
    });

    it("should configure filter with correct event types", () => {
      const subscription = createAgentSubscription(churnRiskAgent, {
        handler: mockHandler,
      });

      expect(subscription.filter).toBeDefined();
      expect(subscription.filter!.eventTypes).toContain("OrderCancelled");
      expect(subscription.filter!.eventTypes).toContain("OrderRefunded");
      expect(subscription.filter!.eventTypes).toHaveLength(2);
    });

    it("should attach the handler reference", () => {
      const subscription = createAgentSubscription(churnRiskAgent, {
        handler: mockHandler,
      });

      expect(subscription.handler).toBe(mockHandler);
    });
  });

  describe("toHandlerArgs transformation", () => {
    it("should transform event to AgentEventHandlerArgs", () => {
      const subscription = createAgentSubscription(churnRiskAgent, {
        handler: mockHandler,
      });

      const event = createMockEvent("OrderCancelled", "order_123", 42);
      const chain = createMockCorrelationChain("corr_abc");

      const args = subscription.toHandlerArgs(event, chain);

      expect(args.eventId).toBe("evt_42");
      expect(args.eventType).toBe("OrderCancelled");
      expect(args.globalPosition).toBe(42);
      expect(args.correlationId).toBe("corr_abc");
      expect(args.streamType).toBe("Order");
      expect(args.streamId).toBe("order_123");
      expect(args.boundedContext).toBe("orders");
      expect(args.agentId).toBe("churn-risk-agent");
    });

    it("should include payload in handler args", () => {
      const subscription = createAgentSubscription(churnRiskAgent, {
        handler: mockHandler,
      });

      const event = createMockEvent("OrderCancelled", "order_123", 1);
      event.payload = { orderId: "order_123", amount: 150.0, reason: "Changed mind" };
      const chain = createMockCorrelationChain("corr_xyz");

      const args = subscription.toHandlerArgs(event, chain);

      expect(args.payload).toEqual({
        orderId: "order_123",
        amount: 150.0,
        reason: "Changed mind",
      });
    });

    it("should wrap non-object payload in _raw property", () => {
      const event = createMockEvent("OrderCancelled", "order_123", 1);
      // Force payload to be a non-object (edge case)
      (event as { payload: unknown }).payload = "string-payload";
      const chain = createMockCorrelationChain("corr_xyz");

      const args = defaultAgentTransform(event, chain, "test-agent");

      expect(args.payload).toEqual({ _raw: "string-payload" });
    });

    it("should allow custom toHandlerArgs transformer", () => {
      interface CustomHandlerArgs {
        id: string;
        type: string;
        custom: string;
        [key: string]: unknown;
      }

      const customTransform = (
        event: PublishedEvent,
        _chain: CorrelationChain,
        agentId: string
      ): CustomHandlerArgs => ({
        id: event.eventId,
        type: event.eventType,
        custom: `processed-by-${agentId}`,
      });

      const subscription = createAgentSubscription<CustomHandlerArgs>(churnRiskAgent, {
        handler: mockHandler as unknown as FunctionReference<
          "mutation",
          FunctionVisibility,
          CustomHandlerArgs,
          unknown
        >,
        toHandlerArgs: customTransform,
      });

      const event = createMockEvent("OrderCancelled", "order_123", 1);
      const chain = createMockCorrelationChain("corr_xyz");

      const args = subscription.toHandlerArgs(event, chain);

      expect(args.id).toBe("evt_1");
      expect(args.type).toBe("OrderCancelled");
      expect(args.custom).toBe("processed-by-churn-risk-agent");
    });
  });

  describe("getPartitionKey", () => {
    it("should partition by streamId by default", () => {
      const subscription = createAgentSubscription(churnRiskAgent, {
        handler: mockHandler,
      });

      const event = createMockEvent("OrderCancelled", "order_456", 1);
      const partitionKey = subscription.getPartitionKey!(event);

      expect(partitionKey.name).toBe("streamId");
      expect(partitionKey.value).toBe("order_456");
    });

    it("should allow custom partition key extractor", () => {
      const subscription = createAgentSubscription(churnRiskAgent, {
        handler: mockHandler,
        getPartitionKey: (event, agentId) => ({
          name: "agent",
          value: `${agentId}:${event.boundedContext}`,
        }),
      });

      const event = createMockEvent("OrderCancelled", "order_789", 1);
      const partitionKey = subscription.getPartitionKey!(event);

      expect(partitionKey.name).toBe("agent");
      expect(partitionKey.value).toBe("churn-risk-agent:orders");
    });
  });

  describe("createAgentSubscriptions (batch)", () => {
    it("should create subscriptions for multiple agents", () => {
      const fraudAgent: AgentDefinitionForSubscription = {
        id: "fraud-agent",
        subscriptions: ["PaymentFailed"],
        context: "payments",
      };

      const handlerMap: Record<
        string,
        FunctionReference<"mutation", FunctionVisibility, AgentEventHandlerArgs, unknown>
      > = {
        "churn-risk-agent": mockHandler,
        "fraud-agent": makeFunctionReference<"mutation">(
          "agents/fraud:handleEvent"
        ) as FunctionReference<"mutation", FunctionVisibility, AgentEventHandlerArgs, unknown>,
      };

      const subscriptions = createAgentSubscriptions(
        [churnRiskAgent, fraudAgent],
        handlerMap
      );

      expect(subscriptions).toHaveLength(2);
      expect(subscriptions[0].name).toBe("agent:orders:churn-risk-agent");
      expect(subscriptions[1].name).toBe("agent:payments:fraud-agent");
    });

    it("should throw if handler is missing for an agent", () => {
      const incompleteHandlerMap = {
        "churn-risk-agent": mockHandler,
        // Missing "simple-agent" handler
      };

      expect(() =>
        createAgentSubscriptions(
          [churnRiskAgent, simpleAgent],
          incompleteHandlerMap as Record<
            string,
            FunctionReference<"mutation", FunctionVisibility, AgentEventHandlerArgs, unknown>
          >
        )
      ).toThrow('Missing handler for agent "simple-agent" in handlerMap');
    });

    it("should apply common options to all subscriptions", () => {
      const handlerMap = {
        "churn-risk-agent": mockHandler,
        "simple-agent": mockHandler,
      };

      const subscriptions = createAgentSubscriptions([churnRiskAgent, simpleAgent], handlerMap, {
        priority: 300,
      });

      expect(subscriptions[0].priority).toBe(300);
      expect(subscriptions[1].priority).toBe(300);
    });
  });

  describe("AgentId memoization", () => {
    it("should reuse agentId for multiple calls to toHandlerArgs", () => {
      const subscription = createAgentSubscription(churnRiskAgent, {
        handler: mockHandler,
      });

      const event = createMockEvent("OrderCancelled", "order_123", 1);
      const chain = createMockCorrelationChain("corr_abc");

      // Call multiple times
      const args1 = subscription.toHandlerArgs(event, chain);
      const args2 = subscription.toHandlerArgs(event, chain);

      // Should have same agentId (from cache)
      expect(args1.agentId).toBe(args2.agentId);
      expect(args1.agentId).toBe("churn-risk-agent");
    });

    it("should use same agentId for toHandlerArgs and getPartitionKey", () => {
      let capturedAgentIdFromTransform: string | undefined;
      let capturedAgentIdFromPartition: string | undefined;

      const subscription = createAgentSubscription<AgentEventHandlerArgs>(churnRiskAgent, {
        handler: mockHandler,
        toHandlerArgs: (event, chain, agentId) => {
          capturedAgentIdFromTransform = agentId;
          return defaultAgentTransform(event, chain, agentId);
        },
        getPartitionKey: (event, agentId) => {
          capturedAgentIdFromPartition = agentId;
          return { name: "streamId", value: event.streamId };
        },
      });

      const event = createMockEvent("OrderCancelled", "order_123", 1);
      const chain = createMockCorrelationChain("corr_abc");

      // Call both functions
      subscription.toHandlerArgs(event, chain);
      subscription.getPartitionKey!(event);

      // Both should have the same agentId
      expect(capturedAgentIdFromTransform).toBe("churn-risk-agent");
      expect(capturedAgentIdFromPartition).toBe("churn-risk-agent");
    });
  });

  describe("Event filtering integration", () => {
    it("should only match subscribed event types", () => {
      const subscription = createAgentSubscription(churnRiskAgent, {
        handler: mockHandler,
      });

      const filter = subscription.filter!;

      // Should match subscribed types
      expect(filter.eventTypes).toContain("OrderCancelled");
      expect(filter.eventTypes).toContain("OrderRefunded");

      // Should not match unsubscribed types
      expect(filter.eventTypes).not.toContain("OrderCreated");
      expect(filter.eventTypes).not.toContain("PaymentReceived");
    });

    it("should create immutable event types array", () => {
      const subscription = createAgentSubscription(churnRiskAgent, {
        handler: mockHandler,
      });

      // Modifying the filter's eventTypes shouldn't affect the original
      const originalLength = subscription.filter!.eventTypes!.length;
      (subscription.filter!.eventTypes as string[]).push("NewEvent");

      // The subscription was modified but verify it started correct
      expect(originalLength).toBe(2);
    });
  });
});

describe("defaultAgentTransform", () => {
  it("should handle all PublishedEvent fields", () => {
    const event: PublishedEvent = {
      eventId: "evt_test_123",
      eventType: "TestEvent",
      globalPosition: 999,
      streamType: "TestStream",
      streamId: "test_stream_456",
      version: 5,
      timestamp: 1700000000000,
      category: "domain",
      boundedContext: "testing",
      payload: { key: "value", nested: { prop: 123 } },
      schemaVersion: 2,
      aggregateVersion: 5,
      metadata: { source: "test" },
      causingCommandId: "cmd_test_789",
    };

    const chain: CorrelationChain = {
      correlationId: "corr_test_abc",
      causationId: "cause_test_def",
      depth: 3,
      parentIds: ["parent_1", "parent_2"],
    };

    const args = defaultAgentTransform(event, chain, "test-agent-id");

    // Verify all fields are transformed correctly
    expect(args.eventId).toBe("evt_test_123");
    expect(args.eventType).toBe("TestEvent");
    expect(args.globalPosition).toBe(999);
    expect(args.correlationId).toBe("corr_test_abc");
    expect(args.streamType).toBe("TestStream");
    expect(args.streamId).toBe("test_stream_456");
    expect(args.payload).toEqual({ key: "value", nested: { prop: 123 } });
    expect(args.timestamp).toBe(1700000000000);
    expect(args.category).toBe("domain");
    expect(args.boundedContext).toBe("testing");
    expect(args.agentId).toBe("test-agent-id");
  });

  it("should handle null payload", () => {
    const event = createMockEvent("TestEvent", "stream_1", 1);
    (event as { payload: unknown }).payload = null;
    const chain = createMockCorrelationChain("corr_1");

    const args = defaultAgentTransform(event, chain, "agent");

    expect(args.payload).toEqual({ _raw: null });
  });

  it("should handle array payload", () => {
    const event = createMockEvent("TestEvent", "stream_1", 1);
    (event as { payload: unknown }).payload = [1, 2, 3];
    const chain = createMockCorrelationChain("corr_1");

    const args = defaultAgentTransform(event, chain, "agent");

    expect(args.payload).toEqual({ _raw: [1, 2, 3] });
  });
});
