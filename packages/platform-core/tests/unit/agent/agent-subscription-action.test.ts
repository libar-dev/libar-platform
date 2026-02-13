/**
 * Agent Subscription Action Overload Unit Tests
 *
 * Tests for the ACTION overload of createAgentSubscription() including:
 * - Creates ActionSubscription with handlerType: "action"
 * - onComplete is present on action subscription
 * - retry config is passed through
 * - toWorkpoolContext produces correct shape
 * - Default priority is 250
 * - Subscription name follows agent naming convention
 *
 * NOTE: The existing agent-subscription.test.ts already tests mutation
 * subscriptions. This file only tests the new action overload.
 */

import { describe, it, expect } from "vitest";
import { makeFunctionReference } from "convex/server";
import type { FunctionReference, FunctionVisibility } from "convex/server";

import {
  createAgentSubscription,
  DEFAULT_AGENT_SUBSCRIPTION_PRIORITY,
  type AgentDefinitionForSubscription,
  type AgentEventHandlerArgs,
} from "../../../../platform-bus/src/agent-subscription.js";

import type {
  PublishedEvent,
  CorrelationChain,
  ActionSubscription,
  WorkpoolOnCompleteArgs,
} from "../../../src/index.js";

// =============================================================================
// Test Fixtures
// =============================================================================

const llmAgent: AgentDefinitionForSubscription = {
  id: "llm-churn-risk",
  subscriptions: ["OrderCancelled", "OrderRefunded"],
  context: "orders",
};

const simpleAgent: AgentDefinitionForSubscription = {
  id: "simple-llm-agent",
  subscriptions: ["EventA"],
};

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
    payload: { orderId: streamId, reason: "Test" },
    schemaVersion: 1,
    aggregateVersion: 1,
    metadata: {},
    causingCommandId: `cmd_${globalPosition}`,
  };
}

function createMockCorrelationChain(correlationId: string): CorrelationChain {
  return {
    correlationId,
    causationId: `cause_${Date.now()}`,
    depth: 1,
    parentIds: [],
  };
}

const mockActionHandler = makeFunctionReference<"action">(
  "agents/llmChurnRisk:analyzeEvent"
) as FunctionReference<"action", FunctionVisibility, AgentEventHandlerArgs, unknown>;

const mockOnComplete = makeFunctionReference<"mutation">(
  "agents/llmChurnRisk:onComplete"
) as FunctionReference<"mutation", FunctionVisibility, WorkpoolOnCompleteArgs, unknown>;

// =============================================================================
// Test Suite
// =============================================================================

describe("Agent Subscription - Action Overload", () => {
  describe("createAgentSubscription with actionHandler", () => {
    it("creates ActionSubscription with handlerType action", () => {
      const subscription = createAgentSubscription(llmAgent, {
        actionHandler: mockActionHandler,
        onComplete: mockOnComplete,
      });

      expect(subscription.handlerType).toBe("action");
    });

    it("includes onComplete reference on action subscription", () => {
      const subscription = createAgentSubscription(llmAgent, {
        actionHandler: mockActionHandler,
        onComplete: mockOnComplete,
      });

      // Type assertion to ActionSubscription to access onComplete
      const actionSub = subscription as ActionSubscription<AgentEventHandlerArgs>;
      expect(actionSub.onComplete).toBe(mockOnComplete);
    });

    it("includes handler reference pointing to the action", () => {
      const subscription = createAgentSubscription(llmAgent, {
        actionHandler: mockActionHandler,
        onComplete: mockOnComplete,
      });

      expect(subscription.handler).toBe(mockActionHandler);
    });

    it("passes retry config through", () => {
      const retryConfig = { maxAttempts: 3, initialBackoffMs: 1000, base: 2 };

      const subscription = createAgentSubscription(llmAgent, {
        actionHandler: mockActionHandler,
        onComplete: mockOnComplete,
        retry: retryConfig,
      });

      const actionSub = subscription as ActionSubscription<AgentEventHandlerArgs>;
      expect(actionSub.retry).toEqual(retryConfig);
    });

    it("passes boolean retry config through", () => {
      const subscription = createAgentSubscription(llmAgent, {
        actionHandler: mockActionHandler,
        onComplete: mockOnComplete,
        retry: true,
      });

      const actionSub = subscription as ActionSubscription<AgentEventHandlerArgs>;
      expect(actionSub.retry).toBe(true);
    });

    it("omits retry field when not specified", () => {
      const subscription = createAgentSubscription(llmAgent, {
        actionHandler: mockActionHandler,
        onComplete: mockOnComplete,
        // No retry specified
      });

      const actionSub = subscription as ActionSubscription<AgentEventHandlerArgs>;
      expect("retry" in actionSub).toBe(false);
    });
  });

  describe("toWorkpoolContext", () => {
    it("produces correct shape with all required fields", () => {
      const subscription = createAgentSubscription(llmAgent, {
        actionHandler: mockActionHandler,
        onComplete: mockOnComplete,
      });

      const actionSub = subscription as ActionSubscription<AgentEventHandlerArgs>;
      expect(actionSub.toWorkpoolContext).toBeDefined();

      const event = createMockEvent("OrderCancelled", "order_123", 42);
      const chain = createMockCorrelationChain("corr_abc");

      const context = actionSub.toWorkpoolContext!(event, chain, "agent:orders:llm-churn-risk");

      expect(context).toEqual({
        agentId: "llm-churn-risk",
        subscriptionId: "agent:orders:llm-churn-risk",
        eventId: "evt_42",
        eventType: "OrderCancelled",
        globalPosition: 42,
        correlationId: "corr_abc",
        causationId: "evt_42",
        streamId: "order_123",
        streamType: "Order",
        boundedContext: "orders",
      });
    });

    it("uses event eventId as causationId", () => {
      const subscription = createAgentSubscription(llmAgent, {
        actionHandler: mockActionHandler,
        onComplete: mockOnComplete,
      });

      const actionSub = subscription as ActionSubscription<AgentEventHandlerArgs>;
      const event = createMockEvent("OrderRefunded", "order_789", 99);
      const chain = createMockCorrelationChain("corr_xyz");

      const context = actionSub.toWorkpoolContext!(event, chain, "sub_name");

      expect(context.causationId).toBe("evt_99");
      expect(context.causationId).toBe(event.eventId);
    });
  });

  describe("priority", () => {
    it("uses default priority of 250", () => {
      const subscription = createAgentSubscription(llmAgent, {
        actionHandler: mockActionHandler,
        onComplete: mockOnComplete,
      });

      expect(subscription.priority).toBe(DEFAULT_AGENT_SUBSCRIPTION_PRIORITY);
      expect(subscription.priority).toBe(250);
    });

    it("allows custom priority", () => {
      const subscription = createAgentSubscription(llmAgent, {
        actionHandler: mockActionHandler,
        onComplete: mockOnComplete,
        priority: 300,
      });

      expect(subscription.priority).toBe(300);
    });
  });

  describe("subscription naming", () => {
    it("follows agent:<context>:<id> format when context provided", () => {
      const subscription = createAgentSubscription(llmAgent, {
        actionHandler: mockActionHandler,
        onComplete: mockOnComplete,
      });

      expect(subscription.name).toBe("agent:orders:llm-churn-risk");
    });

    it("follows agent:<id> format when no context provided", () => {
      const subscription = createAgentSubscription(simpleAgent, {
        actionHandler: mockActionHandler,
        onComplete: mockOnComplete,
      });

      expect(subscription.name).toBe("agent:simple-llm-agent");
    });
  });

  describe("event filtering", () => {
    it("configures filter with correct event types", () => {
      const subscription = createAgentSubscription(llmAgent, {
        actionHandler: mockActionHandler,
        onComplete: mockOnComplete,
      });

      expect(subscription.filter).toBeDefined();
      expect(subscription.filter!.eventTypes).toContain("OrderCancelled");
      expect(subscription.filter!.eventTypes).toContain("OrderRefunded");
      expect(subscription.filter!.eventTypes).toHaveLength(2);
    });
  });

  describe("toHandlerArgs transformation", () => {
    it("transforms event to AgentEventHandlerArgs", () => {
      const subscription = createAgentSubscription(llmAgent, {
        actionHandler: mockActionHandler,
        onComplete: mockOnComplete,
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
      expect(args.agentId).toBe("llm-churn-risk");
    });
  });

  describe("getPartitionKey", () => {
    it("partitions by streamId by default", () => {
      const subscription = createAgentSubscription(llmAgent, {
        actionHandler: mockActionHandler,
        onComplete: mockOnComplete,
      });

      const event = createMockEvent("OrderCancelled", "order_456", 1);
      const partitionKey = subscription.getPartitionKey!(event);

      expect(partitionKey.name).toBe("streamId");
      expect(partitionKey.value).toBe("order_456");
    });
  });
});
