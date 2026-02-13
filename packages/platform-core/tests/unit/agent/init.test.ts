/**
 * Agent Init Unit Tests
 *
 * Tests for agent initialization and configuration including:
 * - validateAgentBCConfig: field validation, error codes
 * - toAgentHandlerArgs: event + correlation chain transformation
 * - generateSubscriptionId: deterministic ID generation
 * - initializeAgentBC: bootstrap, checkpoint creation, error handling
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  toAgentHandlerArgs,
  generateSubscriptionId,
  initializeAgentBC,
  AGENT_INIT_ERROR_CODES,
} from "../../../src/agent/init.js";
import type { AgentBCConfig } from "../../../src/agent/types.js";
import { validateAgentBCConfig, AGENT_CONFIG_ERROR_CODES } from "../../../src/agent/types.js";
import type { EventBus, PublishedEvent } from "../../../src/eventbus/types.js";
import type { FunctionReference, FunctionVisibility } from "convex/server";
import type { AgentEventHandlerArgs } from "../../../src/agent/init.js";
import type { CorrelationChain } from "../../../src/correlation/types.js";
import type { PatternDefinition } from "../../../src/agent/patterns.js";

// ============================================================================
// Test Fixtures
// ============================================================================

/** Default test pattern for config fixtures. */
const testPattern: PatternDefinition = {
  name: "test-pattern",
  window: { duration: "7d" },
  trigger: () => true,
};

// ============================================================================
// validateAgentBCConfig Tests
// ============================================================================

describe("validateAgentBCConfig", () => {
  function createValidConfig(overrides: Partial<AgentBCConfig> = {}): Partial<AgentBCConfig> {
    return {
      id: "test-agent",
      subscriptions: ["OrderCancelled"],
      patternWindow: { duration: "7d", minEvents: 1, eventLimit: 100 },
      confidenceThreshold: 0.9,
      patterns: [testPattern],
      ...overrides,
    };
  }

  // ---- AGENT_ID_REQUIRED ----

  describe("AGENT_ID_REQUIRED", () => {
    it("rejects empty string id", () => {
      const result = validateAgentBCConfig(createValidConfig({ id: "" }));
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.code).toBe(AGENT_CONFIG_ERROR_CODES.AGENT_ID_REQUIRED);
      }
    });

    it("rejects undefined id", () => {
      const config = createValidConfig();
      delete (config as Record<string, unknown>).id;
      const result = validateAgentBCConfig(config);
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.code).toBe(AGENT_CONFIG_ERROR_CODES.AGENT_ID_REQUIRED);
      }
    });

    it("rejects whitespace-only id", () => {
      const result = validateAgentBCConfig(createValidConfig({ id: "   " }));
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.code).toBe(AGENT_CONFIG_ERROR_CODES.AGENT_ID_REQUIRED);
      }
    });
  });

  // ---- NO_SUBSCRIPTIONS ----

  describe("NO_SUBSCRIPTIONS", () => {
    it("rejects empty subscriptions array", () => {
      const result = validateAgentBCConfig(createValidConfig({ subscriptions: [] }));
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.code).toBe(AGENT_CONFIG_ERROR_CODES.NO_SUBSCRIPTIONS);
      }
    });

    it("rejects undefined subscriptions", () => {
      const config = createValidConfig();
      delete (config as Record<string, unknown>).subscriptions;
      const result = validateAgentBCConfig(config);
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.code).toBe(AGENT_CONFIG_ERROR_CODES.NO_SUBSCRIPTIONS);
      }
    });
  });

  // ---- INVALID_CONFIDENCE_THRESHOLD ----

  describe("INVALID_CONFIDENCE_THRESHOLD", () => {
    it("rejects negative threshold", () => {
      const result = validateAgentBCConfig(createValidConfig({ confidenceThreshold: -0.1 }));
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.code).toBe(AGENT_CONFIG_ERROR_CODES.INVALID_CONFIDENCE_THRESHOLD);
      }
    });

    it("rejects threshold greater than 1", () => {
      const result = validateAgentBCConfig(createValidConfig({ confidenceThreshold: 1.5 }));
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.code).toBe(AGENT_CONFIG_ERROR_CODES.INVALID_CONFIDENCE_THRESHOLD);
      }
    });
  });

  // ---- INVALID_PATTERN_WINDOW ----

  describe("INVALID_PATTERN_WINDOW", () => {
    it("rejects empty pattern window duration", () => {
      const result = validateAgentBCConfig(createValidConfig({ patternWindow: { duration: "" } }));
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.code).toBe(AGENT_CONFIG_ERROR_CODES.INVALID_PATTERN_WINDOW);
      }
    });

    it("rejects whitespace-only pattern window duration", () => {
      const result = validateAgentBCConfig(
        createValidConfig({ patternWindow: { duration: "   " } })
      );
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.code).toBe(AGENT_CONFIG_ERROR_CODES.INVALID_PATTERN_WINDOW);
      }
    });
  });

  // ---- CONFLICTING_APPROVAL_RULES ----

  describe("CONFLICTING_APPROVAL_RULES", () => {
    it("rejects action in both requiresApproval and autoApprove", () => {
      const result = validateAgentBCConfig(
        createValidConfig({
          humanInLoop: {
            requiresApproval: ["DeleteCustomer", "TransferFunds"],
            autoApprove: ["DeleteCustomer"],
          },
        })
      );
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.code).toBe(AGENT_CONFIG_ERROR_CODES.CONFLICTING_APPROVAL_RULES);
        expect(result.message).toContain("DeleteCustomer");
      }
    });
  });

  // ---- NO_PATTERNS ----

  describe("NO_PATTERNS", () => {
    it("rejects config with no patterns array", () => {
      const config = createValidConfig();
      delete (config as Record<string, unknown>).patterns;
      const result = validateAgentBCConfig(config);
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.code).toBe(AGENT_CONFIG_ERROR_CODES.NO_PATTERNS);
      }
    });

    it("rejects config with empty patterns array", () => {
      const result = validateAgentBCConfig(createValidConfig({ patterns: [] }));
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.code).toBe(AGENT_CONFIG_ERROR_CODES.NO_PATTERNS);
      }
    });
  });

  // ---- Valid configs ----

  describe("valid configs", () => {
    it("accepts valid config with patterns", () => {
      const result = validateAgentBCConfig(createValidConfig());
      expect(result.valid).toBe(true);
    });

    it("accepts config without confidenceThreshold (optional field)", () => {
      const config = createValidConfig();
      delete (config as Record<string, unknown>).confidenceThreshold;
      const result = validateAgentBCConfig(config);
      expect(result.valid).toBe(true);
    });
  });
});

// ============================================================================
// toAgentHandlerArgs Tests
// ============================================================================

describe("toAgentHandlerArgs", () => {
  function createTestPublishedEvent(overrides: Partial<PublishedEvent> = {}): PublishedEvent {
    return {
      eventId: "evt_001",
      eventType: "OrderCancelled",
      streamType: "Order",
      streamId: "order-001",
      category: "domain",
      schemaVersion: 1,
      boundedContext: "orders",
      globalPosition: 100,
      timestamp: 1705320000000,
      payload: { orderId: "order-001", reason: "customer_request" },
      correlation: {
        correlationId: "corr_001",
        causationId: "cause_001",
      },
      ...overrides,
    };
  }

  function createTestCorrelationChain(): CorrelationChain {
    return {
      commandId: "cmd_001",
      correlationId: "corr_chain_001",
      causationId: "cause_chain_001",
      initiatedAt: 1705320000000,
    };
  }

  it("transforms a standard PublishedEvent and CorrelationChain correctly", () => {
    const event = createTestPublishedEvent();
    const chain = createTestCorrelationChain();

    const result = toAgentHandlerArgs(event, chain, "my-agent");

    expect(result).toMatchObject({
      eventId: "evt_001",
      eventType: "OrderCancelled",
      globalPosition: 100,
      correlationId: "corr_chain_001",
      streamType: "Order",
      streamId: "order-001",
      payload: { orderId: "order-001", reason: "customer_request" },
      timestamp: 1705320000000,
      category: "domain",
      boundedContext: "orders",
      agentId: "my-agent",
    });
  });

  it("wraps non-object payload (array) in { _raw: ... }", () => {
    const event = createTestPublishedEvent({ payload: [1, 2, 3] });
    const chain = createTestCorrelationChain();

    const result = toAgentHandlerArgs(event, chain, "agent-1");

    expect(result.payload).toEqual({ _raw: [1, 2, 3] });
  });

  it("wraps null payload in { _raw: null }", () => {
    const event = createTestPublishedEvent({ payload: null });
    const chain = createTestCorrelationChain();

    const result = toAgentHandlerArgs(event, chain, "agent-1");

    expect(result.payload).toEqual({ _raw: null });
  });

  it("passes through normal object payloads without wrapping", () => {
    const event = createTestPublishedEvent({ payload: { key: "value", nested: { a: 1 } } });
    const chain = createTestCorrelationChain();

    const result = toAgentHandlerArgs(event, chain, "agent-1");

    expect(result.payload).toEqual({ key: "value", nested: { a: 1 } });
  });

  it("uses correlationId from the chain, not from the event", () => {
    const event = createTestPublishedEvent({
      correlation: { correlationId: "event_corr", causationId: "event_cause" },
    });
    const chain = createTestCorrelationChain();

    const result = toAgentHandlerArgs(event, chain, "agent-1");

    expect(result.correlationId).toBe("corr_chain_001");
  });
});

// ============================================================================
// generateSubscriptionId Tests
// ============================================================================

describe("generateSubscriptionId", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-01-15T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("starts with sub_ prefix", () => {
    const id = generateSubscriptionId("my-agent");
    expect(id.startsWith("sub_")).toBe(true);
  });

  it("contains the agentId", () => {
    const id = generateSubscriptionId("churn-risk-agent");
    expect(id).toContain("churn-risk-agent");
  });

  it("contains a timestamp segment", () => {
    const id = generateSubscriptionId("my-agent");
    const timestamp = String(Date.now());
    expect(id).toContain(timestamp);
  });

  it("produces different IDs when timestamp differs", () => {
    const id1 = generateSubscriptionId("my-agent");
    // Advance time by 1ms to guarantee a different timestamp component
    vi.advanceTimersByTime(1);
    const id2 = generateSubscriptionId("my-agent");
    expect(id1).not.toBe(id2);
  });
});

// ============================================================================
// initializeAgentBC Tests
// ============================================================================

describe("initializeAgentBC", () => {
  function createValidAgentConfig(overrides: Partial<AgentBCConfig> = {}): AgentBCConfig {
    return {
      id: "test-agent",
      subscriptions: ["OrderCancelled"],
      patternWindow: { duration: "7d", minEvents: 1, eventLimit: 100 },
      confidenceThreshold: 0.9,
      patterns: [testPattern],
      ...overrides,
    };
  }

  it("returns success with handle for a valid config", () => {
    const config = createValidAgentConfig();
    const mockEventBus = {} as EventBus;
    const mockHandler = {} as FunctionReference<
      "mutation",
      FunctionVisibility,
      AgentEventHandlerArgs,
      void
    >;

    const result = initializeAgentBC(config, {
      eventBus: mockEventBus,
      handler: mockHandler,
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.handle.agentId).toBe("test-agent");
      expect(result.handle.config).toBe(config);
      expect(result.handle.subscription.agentId).toBe("test-agent");
      expect(result.handle.subscription.subscriptionName).toBe("agent:test-agent");
      expect(result.handle.checkpoint).toBeDefined();
      // Initial checkpoint starts as "active" with position -1 (sentinel)
      expect(result.handle.checkpoint.status).toBe("active");
    }
  });

  it("returns error with INVALID_CONFIG code for invalid config", () => {
    const config = createValidAgentConfig({ id: "" });
    const mockEventBus = {} as EventBus;
    const mockHandler = {} as FunctionReference<
      "mutation",
      FunctionVisibility,
      AgentEventHandlerArgs,
      void
    >;

    const result = initializeAgentBC(config, {
      eventBus: mockEventBus,
      handler: mockHandler,
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.code).toBe(AGENT_INIT_ERROR_CODES.INVALID_CONFIG);
    }
  });

  it("uses existing checkpoint when provided", () => {
    const config = createValidAgentConfig();
    const mockEventBus = {} as EventBus;
    const mockHandler = {} as FunctionReference<
      "mutation",
      FunctionVisibility,
      AgentEventHandlerArgs,
      void
    >;
    const existingCheckpoint = {
      agentId: "test-agent",
      subscriptionId: "sub_existing",
      lastProcessedPosition: 200,
      lastEventId: "evt_200",
      status: "active" as const,
      eventsProcessed: 200,
      updatedAt: Date.now(),
    };

    const result = initializeAgentBC(config, {
      eventBus: mockEventBus,
      handler: mockHandler,
      existingCheckpoint,
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.handle.checkpoint).toBe(existingCheckpoint);
      expect(result.handle.checkpoint.lastProcessedPosition).toBe(200);
      expect(result.handle.checkpoint.status).toBe("active");
    }
  });

  it("creates a new checkpoint when no existing checkpoint provided", () => {
    const config = createValidAgentConfig({ id: "fresh-agent" });
    const mockEventBus = {} as EventBus;
    const mockHandler = {} as FunctionReference<
      "mutation",
      FunctionVisibility,
      AgentEventHandlerArgs,
      void
    >;

    const result = initializeAgentBC(config, {
      eventBus: mockEventBus,
      handler: mockHandler,
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.handle.checkpoint.agentId).toBe("fresh-agent");
      // Initial checkpoint starts at position -1 (sentinel: all real events >= 0)
      expect(result.handle.checkpoint.lastProcessedPosition).toBe(-1);
      expect(result.handle.checkpoint.eventsProcessed).toBe(0);
      // Initial checkpoint status is "active" (ready to process)
      expect(result.handle.checkpoint.status).toBe("active");
    }
  });
});
