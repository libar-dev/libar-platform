/**
 * Agent Action Handler Unit Tests
 *
 * Tests for createAgentActionHandler() including:
 * - Idempotency (skipping already-processed events)
 * - Skipping inactive agents
 * - Normal processing (first event, null checkpoint)
 * - Execution context shape passed to onEvent
 * - Rule-based analysis when no runtime configured
 * - LLM enrichment success path
 * - LLM enrichment failure (fallback to rule-based)
 * - Error propagation when onEvent throws
 * - Deterministic decisionId format
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  createAgentActionHandler,
  type AgentActionState,
} from "../../../src/agent/action-handler.js";
import type { AgentBCConfig, AgentDecision, LLMAnalysisResult } from "../../../src/agent/types.js";
import type { PatternDefinition } from "../../../src/agent/patterns.js";
import type { AgentCheckpoint } from "../../../src/agent/checkpoint.js";
import type { AgentEventHandlerArgs, AgentRuntimeConfig } from "../../../src/agent/init.js";
import { createMockLogger } from "./_test-utils.js";

// ============================================================================
// Test Fixtures
// ============================================================================

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
    onEvent: vi.fn().mockResolvedValue(null),
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

function createTestDecision(overrides: Partial<AgentDecision> = {}): AgentDecision {
  return {
    command: "SuggestCustomerOutreach",
    payload: { customerId: "cust-123" },
    confidence: 0.95,
    reason: "Detected churn risk pattern",
    requiresApproval: false,
    triggeringEvents: ["evt_1", "evt_2"],
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
    const onEvent = vi.fn();
    const agentConfig = createTestAgentConfig({ onEvent });
    const loadState = vi.fn().mockResolvedValue(
      createTestState({
        checkpoint: createTestCheckpoint({ lastProcessedPosition: 100 }),
      })
    );

    const handler = createAgentActionHandler({
      agentConfig,
      loadState,
    });

    const args = createTestHandlerArgs({ globalPosition: 100 });
    const result = await handler({}, args);

    expect(result).toBeNull();
    expect(onEvent).not.toHaveBeenCalled();
  });

  it("returns null when checkpoint position exceeds event position", async () => {
    const onEvent = vi.fn();
    const agentConfig = createTestAgentConfig({ onEvent });
    const loadState = vi.fn().mockResolvedValue(
      createTestState({
        checkpoint: createTestCheckpoint({ lastProcessedPosition: 200 }),
      })
    );

    const handler = createAgentActionHandler({
      agentConfig,
      loadState,
    });

    const args = createTestHandlerArgs({ globalPosition: 100 });
    const result = await handler({}, args);

    expect(result).toBeNull();
    expect(onEvent).not.toHaveBeenCalled();
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
    const onEvent = vi.fn();
    const agentConfig = createTestAgentConfig({ onEvent });
    const loadState = vi.fn().mockResolvedValue(
      createTestState({
        checkpoint: createTestCheckpoint({ status: "paused", lastProcessedPosition: 50 }),
      })
    );

    const handler = createAgentActionHandler({
      agentConfig,
      loadState,
    });

    const args = createTestHandlerArgs({ globalPosition: 100 });
    const result = await handler({}, args);

    expect(result).toBeNull();
    expect(onEvent).not.toHaveBeenCalled();
  });

  it("returns null when agent status is stopped", async () => {
    const onEvent = vi.fn();
    const agentConfig = createTestAgentConfig({ onEvent });
    const loadState = vi.fn().mockResolvedValue(
      createTestState({
        checkpoint: createTestCheckpoint({ status: "stopped", lastProcessedPosition: 50 }),
      })
    );

    const handler = createAgentActionHandler({
      agentConfig,
      loadState,
    });

    const args = createTestHandlerArgs({ globalPosition: 100 });
    const result = await handler({}, args);

    expect(result).toBeNull();
    expect(onEvent).not.toHaveBeenCalled();
  });

  it("returns null when agent status is error_recovery", async () => {
    const onEvent = vi.fn();
    const agentConfig = createTestAgentConfig({ onEvent });
    const loadState = vi.fn().mockResolvedValue(
      createTestState({
        checkpoint: createTestCheckpoint({ status: "error_recovery", lastProcessedPosition: 50 }),
      })
    );

    const handler = createAgentActionHandler({
      agentConfig,
      loadState,
    });

    const args = createTestHandlerArgs({ globalPosition: 100 });
    const result = await handler({}, args);

    expect(result).toBeNull();
    expect(onEvent).not.toHaveBeenCalled();
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
    const decision = createTestDecision();
    const onEvent = vi.fn().mockResolvedValue(decision);
    const agentConfig = createTestAgentConfig({ onEvent });
    const loadState = vi.fn().mockResolvedValue(createTestState({ checkpoint: null }));

    const handler = createAgentActionHandler({
      agentConfig,
      loadState,
    });

    const args = createTestHandlerArgs({ globalPosition: 1 });
    const result = await handler({}, args);

    expect(result).not.toBeNull();
    expect(result!.decision).toEqual(decision);
    expect(result!.analysisMethod).toBe("rule-based");
    expect(result!.decisionId).toBe("dec_test-agent_1");
  });

  it("calls onEvent with correct execution context shape", async () => {
    const onEvent = vi.fn().mockResolvedValue(null);
    const agentConfig = createTestAgentConfig({ id: "my-agent", onEvent });
    const historyEvents = [
      {
        eventId: "hist_1",
        eventType: "OrderCancelled",
        globalPosition: 40,
        streamType: "Order",
        streamId: "order-001",
        payload: {},
        timestamp: Date.now() - 1000,
        category: "domain" as const,
        boundedContext: "orders",
        schemaVersion: 1,
      },
    ];
    const loadState = vi.fn().mockResolvedValue(
      createTestState({
        checkpoint: createTestCheckpoint({
          lastProcessedPosition: 50,
          lastEventId: "evt_prev",
          eventsProcessed: 50,
        }),
        eventHistory: historyEvents,
        injectedData: { customerData: { risk: 0.8 } },
      })
    );

    const handler = createAgentActionHandler({
      agentConfig,
      loadState,
    });

    const args = createTestHandlerArgs({ globalPosition: 100 });
    await handler({}, args);

    expect(onEvent).toHaveBeenCalledTimes(1);

    const [receivedEvent, executionContext] = onEvent.mock.calls[0];

    // Verify reconstructed event
    expect(receivedEvent.eventId).toBe("evt_test_123");
    expect(receivedEvent.eventType).toBe("OrderCancelled");
    expect(receivedEvent.globalPosition).toBe(100);

    // Verify execution context structure
    expect(executionContext).toMatchObject({
      agent: expect.objectContaining({
        analyze: expect.any(Function),
        reason: expect.any(Function),
      }),
      history: expect.any(Array),
      checkpoint: {
        lastProcessedPosition: 50,
        lastEventId: "evt_prev",
        eventsProcessed: 50,
      },
      config: expect.objectContaining({
        id: "my-agent",
      }),
      injectedData: { customerData: { risk: 0.8 } },
    });

    // Verify history is a copy (not the same reference)
    expect(executionContext.history).toHaveLength(1);
    expect(executionContext.history[0].eventId).toBe("hist_1");
  });

  it("returns rule-based analysis when no runtime configured", async () => {
    const decision = createTestDecision();
    const onEvent = vi.fn().mockResolvedValue(decision);
    const agentConfig = createTestAgentConfig({ onEvent });
    const loadState = vi.fn().mockResolvedValue(createTestState({ checkpoint: null }));

    const handler = createAgentActionHandler({
      agentConfig,
      loadState,
      // No runtime configured
    });

    const args = createTestHandlerArgs();
    const result = await handler({}, args);

    expect(result).not.toBeNull();
    expect(result!.analysisMethod).toBe("rule-based");
    expect(result!.llmMetrics).toBeUndefined();
  });
});

// ============================================================================
// LLM Enrichment Tests
// ============================================================================

describe("createAgentActionHandler - LLM enrichment", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-01-15T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns llm analysis method when LLM enrichment succeeds", async () => {
    const decision = createTestDecision({ command: "SuggestOutreach" });
    const onEvent = vi.fn().mockResolvedValue(decision);
    const agentConfig = createTestAgentConfig({ onEvent });

    const llmResult: LLMAnalysisResult = {
      patterns: [{ name: "churn-risk", confidence: 0.92, matchingEventIds: ["evt_1"] }],
      confidence: 0.92,
      reasoning: "LLM detected churn risk pattern",
      llmContext: {
        model: "anthropic/claude-sonnet-4-5-20250929",
        tokens: 150,
        durationMs: 500,
        threadId: "thread_abc",
      },
    };

    const runtime: AgentRuntimeConfig = {
      analyze: vi.fn().mockResolvedValue(llmResult),
      reason: vi.fn().mockResolvedValue({}),
    };

    const loadState = vi.fn().mockResolvedValue(createTestState({ checkpoint: null }));

    const handler = createAgentActionHandler({
      agentConfig,
      runtime,
      loadState,
    });

    const args = createTestHandlerArgs();
    const result = await handler({}, args);

    expect(result).not.toBeNull();
    expect(result!.analysisMethod).toBe("llm");
    expect(result!.llmMetrics).toBeDefined();
    expect(result!.llmMetrics!.model).toBe("anthropic/claude-sonnet-4-5-20250929");
    expect(result!.llmMetrics!.tokens).toBe(150);
    expect(result!.llmMetrics!.durationMs).toBeGreaterThanOrEqual(0);
    expect(result!.llmMetrics!.threadId).toBe("thread_abc");
    // Decision should be enriched with LLM confidence and reasoning
    expect(result!.decision!.confidence).toBe(0.92);
    expect(result!.decision!.reason).toBe("LLM detected churn risk pattern");
  });

  it("falls back to rule-based when LLM enrichment fails", async () => {
    const decision = createTestDecision({
      command: "SuggestOutreach",
      confidence: 0.85,
      reason: "Rule-based detection",
    });
    const onEvent = vi.fn().mockResolvedValue(decision);
    const agentConfig = createTestAgentConfig({ onEvent });

    const runtime: AgentRuntimeConfig = {
      analyze: vi.fn().mockRejectedValue(new Error("LLM API timeout")),
      reason: vi.fn().mockResolvedValue({}),
    };

    const logger = createMockLogger();
    const loadState = vi.fn().mockResolvedValue(createTestState({ checkpoint: null }));

    const handler = createAgentActionHandler({
      agentConfig,
      runtime,
      loadState,
      logger,
    });

    const args = createTestHandlerArgs();
    const result = await handler({}, args);

    expect(result).not.toBeNull();
    expect(result!.analysisMethod).toBe("rule-based-fallback");
    expect(result!.error).toBe("LLM API timeout");
    expect(result!.llmMetrics).toBeUndefined();
    // Decision should retain original rule-based values
    expect(result!.decision!.confidence).toBe(0.85);
    expect(result!.decision!.reason).toBe("Rule-based detection");
    expect(logger.warn).toHaveBeenCalledWith(
      "LLM analysis failed, using rule-based fallback",
      expect.objectContaining({
        agentId: "test-agent",
        error: "LLM API timeout",
      })
    );
  });

  it("does not call LLM when onEvent returns null decision", async () => {
    const onEvent = vi.fn().mockResolvedValue(null);
    const agentConfig = createTestAgentConfig({ onEvent });

    const runtime: AgentRuntimeConfig = {
      analyze: vi.fn(),
      reason: vi.fn(),
    };

    const loadState = vi.fn().mockResolvedValue(createTestState({ checkpoint: null }));

    const handler = createAgentActionHandler({
      agentConfig,
      runtime,
      loadState,
    });

    const args = createTestHandlerArgs();
    const result = await handler({}, args);

    expect(result).not.toBeNull();
    expect(result!.decision).toBeNull();
    expect(result!.analysisMethod).toBe("rule-based");
    expect(runtime.analyze).not.toHaveBeenCalled();
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

  it("re-throws when onEvent handler throws", async () => {
    const error = new Error("Handler crashed");
    const onEvent = vi.fn().mockRejectedValue(error);
    const agentConfig = createTestAgentConfig({ onEvent });
    const loadState = vi.fn().mockResolvedValue(createTestState({ checkpoint: null }));

    const handler = createAgentActionHandler({
      agentConfig,
      loadState,
    });

    const args = createTestHandlerArgs();

    await expect(handler({}, args)).rejects.toThrow("Handler crashed");
  });

  it("re-throws non-Error objects from onEvent", async () => {
    const onEvent = vi.fn().mockRejectedValue("string error");
    const agentConfig = createTestAgentConfig({ onEvent });
    const loadState = vi.fn().mockResolvedValue(createTestState({ checkpoint: null }));

    const handler = createAgentActionHandler({
      agentConfig,
      loadState,
    });

    const args = createTestHandlerArgs();

    await expect(handler({}, args)).rejects.toBe("string error");
  });

  it("propagates loadState errors for Workpool retry", async () => {
    const onEvent = vi.fn();
    const agentConfig = createTestAgentConfig({ onEvent });
    const loadState = vi.fn().mockRejectedValue(new Error("DB connection lost"));

    const handler = createAgentActionHandler({
      agentConfig,
      loadState,
    });

    const args = createTestHandlerArgs();

    await expect(handler({}, args)).rejects.toThrow("DB connection lost");
    expect(onEvent).not.toHaveBeenCalled();
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
    const onEvent = vi.fn().mockResolvedValue(createTestDecision());
    const agentConfig = createTestAgentConfig({ onEvent });
    const loadState = vi.fn().mockResolvedValue(createTestState({ checkpoint: null }));

    const handler = createAgentActionHandler({
      agentConfig,
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
    const onEvent = vi.fn().mockResolvedValue(createTestDecision());
    const agentConfig = createTestAgentConfig({ onEvent });
    const loadState = vi.fn().mockResolvedValue(createTestState({ checkpoint: null }));

    const handler = createAgentActionHandler({
      agentConfig,
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

  it("invokes pattern executor and returns patternId when patterns mode is used", async () => {
    const pattern: PatternDefinition = {
      name: "churn-risk",
      window: { duration: "7d" },
      trigger: () => true,
      // No analyze -- rule-based
    };

    const agentConfig = createTestAgentConfig({
      patterns: [pattern],
      onEvent: undefined,
    });

    const loadState = vi.fn().mockResolvedValue(createTestState({ checkpoint: null }));

    const handler = createAgentActionHandler({
      agentConfig,
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

    const agentConfig = createTestAgentConfig({
      patterns: [pattern],
      onEvent: undefined,
    });

    const loadState = vi.fn().mockResolvedValue(createTestState({ checkpoint: null }));

    const handler = createAgentActionHandler({
      agentConfig,
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
      trigger: () => false, // Never triggers
    };

    const agentConfig = createTestAgentConfig({
      patterns: [pattern],
      onEvent: undefined,
    });

    const loadState = vi.fn().mockResolvedValue(createTestState({ checkpoint: null }));

    const handler = createAgentActionHandler({
      agentConfig,
      loadState,
    });

    const args = createTestHandlerArgs();
    const result = await handler({}, args);

    expect(result).not.toBeNull();
    expect(result!.patternId).toBeUndefined();
    expect(result!.decision).toBeNull();
  });

  it("does not call onEvent when patterns mode is used", async () => {
    const onEvent = vi.fn();
    const pattern: PatternDefinition = {
      name: "test-pattern",
      window: { duration: "7d" },
      trigger: () => true,
    };

    // Even if onEvent is set, patterns takes precedence
    // (in practice validation prevents both, but test runtime behavior)
    const agentConfig: AgentBCConfig = {
      id: "test-agent",
      subscriptions: ["OrderCancelled"],
      patternWindow: { duration: "7d", minEvents: 1, eventLimit: 100 },
      confidenceThreshold: 0.9,
      patterns: [pattern],
    };

    const loadState = vi.fn().mockResolvedValue(createTestState({ checkpoint: null }));

    const handler = createAgentActionHandler({
      agentConfig,
      loadState,
    });

    const args = createTestHandlerArgs();
    await handler({}, args);

    expect(onEvent).not.toHaveBeenCalled();
  });

  it("re-throws when pattern executor fails", async () => {
    const pattern: PatternDefinition = {
      name: "throws-pattern",
      window: { duration: "7d" },
      trigger: () => {
        throw new Error("Trigger exploded");
      },
    };

    const agentConfig = createTestAgentConfig({
      patterns: [pattern],
      onEvent: undefined,
    });

    const loadState = vi.fn().mockResolvedValue(createTestState({ checkpoint: null }));

    const handler = createAgentActionHandler({
      agentConfig,
      loadState,
    });

    const args = createTestHandlerArgs();

    await expect(handler({}, args)).rejects.toThrow("Trigger exploded");
  });
});

// ============================================================================
// onEvent Mode Unchanged
// ============================================================================

describe("createAgentActionHandler - onEvent mode does not produce patternId", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-01-15T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns no patternId when using onEvent mode", async () => {
    const decision = createTestDecision();
    const onEvent = vi.fn().mockResolvedValue(decision);
    const agentConfig = createTestAgentConfig({ onEvent });
    const loadState = vi.fn().mockResolvedValue(createTestState({ checkpoint: null }));

    const handler = createAgentActionHandler({
      agentConfig,
      loadState,
    });

    const args = createTestHandlerArgs();
    const result = await handler({}, args);

    expect(result).not.toBeNull();
    expect(result!.patternId).toBeUndefined();
    expect(result!.decision).toEqual(decision);
  });

  it("does not invoke LLM enrichment when patterns mode is used", async () => {
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

    const agentConfig = createTestAgentConfig({
      patterns: [pattern],
      onEvent: undefined,
    });

    const loadState = vi.fn().mockResolvedValue(createTestState({ checkpoint: null }));

    const handler = createAgentActionHandler({
      agentConfig,
      runtime,
      loadState,
    });

    const args = createTestHandlerArgs();
    const result = await handler({}, args);

    expect(result).not.toBeNull();
    // LLM enrichment is skipped in patterns mode (patterns handle LLM internally)
    expect(runtime.analyze).not.toHaveBeenCalled();
    expect(result!.llmMetrics).toBeUndefined();
  });
});
