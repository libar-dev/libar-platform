/**
 * Agent Action Handler Unit Tests
 *
 * Tests for createAgentActionHandler() including:
 * - Idempotency (skipping already-processed events)
 * - Skipping inactive agents
 * - Normal processing (first event, null checkpoint)
 * - Rule-based analysis when pattern has no analyze function
 * - Error propagation when pattern executor throws
 * - Deterministic decisionId format
 * - Patterns mode integration (rule-based, LLM analyze, no match)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  createAgentActionHandler,
  type AgentActionState,
} from "../../../src/agent/action-handler.js";
import type { AgentBCConfig } from "../../../src/agent/types.js";
import type { PatternDefinition } from "../../../src/agent/patterns.js";
import type { AgentEventHandlerArgs } from "../../../src/agent/init.js";
import { createMockAgentRuntime } from "../../../src/agent/init.js";

// ============================================================================
// Test Fixtures
// ============================================================================

/** Default test pattern — always triggers, rule-based (no analyze). */
const defaultTestPattern: PatternDefinition = {
  name: "test-pattern",
  window: { duration: "7d" },
  trigger: () => true,
};

function createTestHandlerArgs(
  overrides: Partial<AgentEventHandlerArgs> = {}
): AgentEventHandlerArgs {
  return {
    eventId: "evt_test_123",
    eventType: "OrderCancelled",
    globalPosition: 100,
    correlationId: "corr_001",
    streamType: "Order",
    streamId: "order-001",
    payload: { orderId: "order-001", reason: "customer_request" },
    timestamp: Date.now(),
    category: "domain",
    boundedContext: "orders",
    agentId: "test-agent",
    ...overrides,
  };
}

function createTestCheckpoint(overrides: Partial<AgentCheckpoint> = {}): AgentCheckpoint {
  return {
    agentId: "test-agent",
    subscriptionId: "sub-001",
    lastProcessedPosition: 50,
    lastEventId: "evt_prev_123",
    status: "active",
    eventsProcessed: 50,
    updatedAt: Date.now(),
    ...overrides,
  };
}

function createTestAgentConfig(overrides: Partial<AgentBCConfig> = {}): AgentBCConfig {
  return {
    id: "test-agent",
    subscriptions: ["OrderCancelled", "OrderCreated"],
    patternWindow: { duration: "7d", minEvents: 1, eventLimit: 100 },
    confidenceThreshold: 0.9,
    patterns: [defaultTestPattern],
    ...overrides,
  };
}

function createTestState(overrides: Partial<AgentActionState> = {}): AgentActionState {
  return {
    checkpoint: createTestCheckpoint(),
    eventHistory: [],
    injectedData: {},
    ...overrides,
  };
}

// ============================================================================
// Idempotency Tests
// ============================================================================

describe("createAgentActionHandler - idempotency", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-01-15T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns null when event already processed (checkpoint position >= event position)", async () => {
    const agentConfig = createTestAgentConfig();
    const loadState = vi.fn().mockResolvedValue(
      createTestState({
        checkpoint: createTestCheckpoint({ lastProcessedPosition: 100 }),
      })
    );

    const handler = createAgentActionHandler({
      agentConfig,
      runtime: createMockAgentRuntime(),
      loadState,
    });

    const args = createTestHandlerArgs({ globalPosition: 100 });
    const result = await handler({}, args);

    expect(result).toBeNull();
  });

  it("returns null when checkpoint position exceeds event position", async () => {
    const agentConfig = createTestAgentConfig();
    const loadState = vi.fn().mockResolvedValue(
      createTestState({
        checkpoint: createTestCheckpoint({ lastProcessedPosition: 200 }),
      })
    );

    const handler = createAgentActionHandler({
      agentConfig,
      runtime: createMockAgentRuntime(),
      loadState,
    });

    const args = createTestHandlerArgs({ globalPosition: 100 });
    const result = await handler({}, args);

    expect(result).toBeNull();
  });
});

// ============================================================================
// Inactive Agent Tests
// ============================================================================

describe("createAgentActionHandler - inactive agent handling", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-01-15T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns null when agent status is paused", async () => {
    const agentConfig = createTestAgentConfig();
    const loadState = vi.fn().mockResolvedValue(
      createTestState({
        checkpoint: createTestCheckpoint({ status: "paused", lastProcessedPosition: 50 }),
      })
    );

    const handler = createAgentActionHandler({
      agentConfig,
      runtime: createMockAgentRuntime(),
      loadState,
    });

    const args = createTestHandlerArgs({ globalPosition: 100 });
    const result = await handler({}, args);

    expect(result).toBeNull();
  });

  it("returns null when agent status is stopped", async () => {
    const agentConfig = createTestAgentConfig();
    const loadState = vi.fn().mockResolvedValue(
      createTestState({
        checkpoint: createTestCheckpoint({ status: "stopped", lastProcessedPosition: 50 }),
      })
    );

    const handler = createAgentActionHandler({
      agentConfig,
      runtime: createMockAgentRuntime(),
      loadState,
    });

    const args = createTestHandlerArgs({ globalPosition: 100 });
    const result = await handler({}, args);

    expect(result).toBeNull();
  });

  it("returns null when agent status is error_recovery", async () => {
    const agentConfig = createTestAgentConfig();
    const loadState = vi.fn().mockResolvedValue(
      createTestState({
        checkpoint: createTestCheckpoint({ status: "error_recovery", lastProcessedPosition: 50 }),
      })
    );

    const handler = createAgentActionHandler({
      agentConfig,
      runtime: createMockAgentRuntime(),
      loadState,
    });

    const args = createTestHandlerArgs({ globalPosition: 100 });
    const result = await handler({}, args);

    expect(result).toBeNull();
  });
});

// ============================================================================
// Normal Processing Tests
// ============================================================================

describe("createAgentActionHandler - normal processing", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-01-15T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("processes normally when checkpoint is null (first event)", async () => {
    const agentConfig = createTestAgentConfig();
    const loadState = vi.fn().mockResolvedValue(createTestState({ checkpoint: null }));

    const handler = createAgentActionHandler({
      agentConfig,
      runtime: createMockAgentRuntime(),
      loadState,
    });

    const args = createTestHandlerArgs({ globalPosition: 1 });
    const result = await handler({}, args);

    expect(result).not.toBeNull();
    expect(result!.decision).not.toBeNull();
    expect(result!.analysisMethod).toBe("rule-based");
    expect(result!.decisionId).toBe("dec_test-agent_1");
  });

  it("returns rule-based analysis when pattern has no analyze function", async () => {
    const agentConfig = createTestAgentConfig();
    const loadState = vi.fn().mockResolvedValue(createTestState({ checkpoint: null }));

    const handler = createAgentActionHandler({
      agentConfig,
      runtime: createMockAgentRuntime(),
      loadState,
    });

    const args = createTestHandlerArgs();
    const result = await handler({}, args);

    expect(result).not.toBeNull();
    expect(result!.analysisMethod).toBe("rule-based");
    expect(result!.llmMetrics).toBeUndefined();
  });
});

// ============================================================================
// Error Propagation Tests
// ============================================================================

describe("createAgentActionHandler - error propagation", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-01-15T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("re-throws when pattern trigger throws", async () => {
    const throwingPattern: PatternDefinition = {
      name: "throws-pattern",
      window: { duration: "7d" },
      trigger: () => {
        throw new Error("Handler crashed");
      },
    };

    const agentConfig = createTestAgentConfig({ patterns: [throwingPattern] });
    const loadState = vi.fn().mockResolvedValue(createTestState({ checkpoint: null }));

    const handler = createAgentActionHandler({
      agentConfig,
      runtime: createMockAgentRuntime(),
      loadState,
    });

    const args = createTestHandlerArgs();

    await expect(handler({}, args)).rejects.toThrow("Handler crashed");
  });

  it("propagates loadState errors for Workpool retry", async () => {
    const agentConfig = createTestAgentConfig();
    const loadState = vi.fn().mockRejectedValue(new Error("DB connection lost"));

    const handler = createAgentActionHandler({
      agentConfig,
      runtime: createMockAgentRuntime(),
      loadState,
    });

    const args = createTestHandlerArgs();

    await expect(handler({}, args)).rejects.toThrow("DB connection lost");
  });
});

// ============================================================================
// DecisionId Format Tests
// ============================================================================

describe("createAgentActionHandler - decisionId format", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-01-15T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("generates deterministic decisionId from agentId and globalPosition", async () => {
    const agentConfig = createTestAgentConfig();
    const loadState = vi.fn().mockResolvedValue(createTestState({ checkpoint: null }));

    const handler = createAgentActionHandler({
      agentConfig,
      runtime: createMockAgentRuntime(),
      loadState,
    });

    const args = createTestHandlerArgs({
      agentId: "churn-risk-agent",
      globalPosition: 42,
    });
    const result = await handler({}, args);

    expect(result).not.toBeNull();
    expect(result!.decisionId).toBe("dec_churn-risk-agent_42");
  });

  it("generates same decisionId for same inputs (deterministic)", async () => {
    const agentConfig = createTestAgentConfig();
    const loadState = vi.fn().mockResolvedValue(createTestState({ checkpoint: null }));

    const handler = createAgentActionHandler({
      agentConfig,
      runtime: createMockAgentRuntime(),
      loadState,
    });

    const args1 = createTestHandlerArgs({ agentId: "agent-x", globalPosition: 99 });
    const args2 = createTestHandlerArgs({ agentId: "agent-x", globalPosition: 99 });

    const result1 = await handler({}, args1);
    const result2 = await handler({}, args2);

    expect(result1!.decisionId).toBe(result2!.decisionId);
    expect(result1!.decisionId).toBe("dec_agent-x_99");
  });
});

// ============================================================================
// Patterns Mode Tests
// ============================================================================

describe("createAgentActionHandler - patterns mode", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-01-15T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("invokes pattern executor and returns patternId when pattern triggers", async () => {
    const pattern: PatternDefinition = {
      name: "churn-risk",
      window: { duration: "7d" },
      trigger: () => true,
    };

    const agentConfig = createTestAgentConfig({ patterns: [pattern] });
    const loadState = vi.fn().mockResolvedValue(createTestState({ checkpoint: null }));

    const handler = createAgentActionHandler({
      agentConfig,
      runtime: createMockAgentRuntime(),
      loadState,
    });

    const args = createTestHandlerArgs();
    const result = await handler({}, args);

    expect(result).not.toBeNull();
    expect(result!.patternId).toBe("churn-risk");
    expect(result!.decision).not.toBeNull();
    expect(result!.decision!.command).toBeNull(); // rule-based has no command
    expect(result!.analysisMethod).toBe("rule-based");
  });

  it("returns llm analysis method when pattern has analyze function", async () => {
    const pattern: PatternDefinition = {
      name: "fraud-detection",
      window: { duration: "7d" },
      trigger: () => true,
      analyze: vi.fn().mockResolvedValue({
        detected: true,
        confidence: 0.95,
        reasoning: "Fraud pattern detected by LLM",
        matchingEventIds: ["evt_test_123"],
        command: { type: "FlagFraud", payload: { severity: "high" } },
      }),
    };

    const agentConfig = createTestAgentConfig({ patterns: [pattern] });
    const loadState = vi.fn().mockResolvedValue(createTestState({ checkpoint: null }));

    const handler = createAgentActionHandler({
      agentConfig,
      runtime: createMockAgentRuntime(),
      loadState,
    });

    const args = createTestHandlerArgs();
    const result = await handler({}, args);

    expect(result).not.toBeNull();
    expect(result!.patternId).toBe("fraud-detection");
    expect(result!.analysisMethod).toBe("llm");
    expect(result!.decision!.command).toBe("FlagFraud");
    expect(result!.decision!.confidence).toBe(0.95);
  });

  it("returns no patternId when no pattern matches", async () => {
    const pattern: PatternDefinition = {
      name: "no-trigger",
      window: { duration: "7d" },
      trigger: () => false,
    };

    const agentConfig = createTestAgentConfig({ patterns: [pattern] });
    const loadState = vi.fn().mockResolvedValue(createTestState({ checkpoint: null }));

    const handler = createAgentActionHandler({
      agentConfig,
      runtime: createMockAgentRuntime(),
      loadState,
    });

    const args = createTestHandlerArgs();
    const result = await handler({}, args);

    expect(result).not.toBeNull();
    expect(result!.patternId).toBeUndefined();
    expect(result!.decision).toBeNull();
  });

  it("does not invoke LLM enrichment via runtime (patterns handle LLM internally)", async () => {
    const pattern: PatternDefinition = {
      name: "rule-only",
      window: { duration: "7d" },
      trigger: () => true,
    };

    const runtime = {
      analyze: vi.fn().mockResolvedValue({
        patterns: [],
        confidence: 0,
        reasoning: "Should not be called",
      }),
      reason: vi.fn(),
    };

    const agentConfig = createTestAgentConfig({ patterns: [pattern] });
    const loadState = vi.fn().mockResolvedValue(createTestState({ checkpoint: null }));

    const handler = createAgentActionHandler({
      agentConfig,
      runtime,
      loadState,
    });

    const args = createTestHandlerArgs();
    const result = await handler({}, args);

    expect(result).not.toBeNull();
    expect(runtime.analyze).not.toHaveBeenCalled();
    expect(result!.llmMetrics).toBeUndefined();
  });

  it("re-throws when pattern executor fails", async () => {
    const pattern: PatternDefinition = {
      name: "throws-pattern",
      window: { duration: "7d" },
      trigger: () => {
        throw new Error("Trigger exploded");
      },
    };

    const agentConfig = createTestAgentConfig({ patterns: [pattern] });
    const loadState = vi.fn().mockResolvedValue(createTestState({ checkpoint: null }));

    const handler = createAgentActionHandler({
      agentConfig,
      runtime: createMockAgentRuntime(),
      loadState,
    });

    const args = createTestHandlerArgs();

    await expect(handler({}, args)).rejects.toThrow("Trigger exploded");
  });
});
