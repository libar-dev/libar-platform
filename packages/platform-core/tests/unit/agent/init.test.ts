/**
 * Agent Event Handler Unit Tests
 *
 * Tests for createAgentEventHandler() including:
 * - Handler skipping inactive agents
 * - Event filtering by pattern window
 * - Execution context creation
 * - Command emission
 * - Approval creation
 * - Dead letter creation on failure
 * - Checkpoint updates
 * - Idempotency (skipping already processed events)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  createAgentEventHandler,
  createMockAgentRuntime,
  type CreateAgentEventHandlerContext,
} from "../../../src/agent/init.js";
import type { AgentBCConfig, AgentDecision, PatternWindow } from "../../../src/agent/types.js";
import type { AgentCheckpoint } from "../../../src/agent/checkpoint.js";
import type { PublishedEvent } from "../../../src/eventbus/types.js";
import type { Logger } from "../../../src/logging/types.js";

// ============================================================================
// Test Fixtures
// ============================================================================

function createTestEvent(overrides: Partial<PublishedEvent> = {}): PublishedEvent {
  return {
    eventId: "evt_test_123",
    eventType: "OrderCancelled",
    streamId: "order-001",
    streamType: "Order",
    globalPosition: 100,
    timestamp: Date.now(),
    payload: { orderId: "order-001", reason: "customer_request" },
    schemaVersion: 1,
    boundedContext: "orders",
    category: "domain",
    correlation: {
      correlationId: "corr-001",
      causationId: "cause-001",
    },
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

function createTestPatternWindow(overrides: Partial<PatternWindow> = {}): PatternWindow {
  return {
    duration: "7d",
    minEvents: 1,
    eventLimit: 100,
    ...overrides,
  };
}

function createTestConfig(overrides: Partial<AgentBCConfig> = {}): AgentBCConfig {
  return {
    id: "test-agent",
    subscriptions: ["OrderCancelled", "OrderCreated"],
    patternWindow: createTestPatternWindow(),
    confidenceThreshold: 0.9,
    onEvent: vi.fn().mockResolvedValue(null),
    ...overrides,
  };
}

function createMockLogger(): Logger {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn().mockReturnThis(),
    flush: vi.fn(),
  };
}

function createTestHandlerContext(
  overrides: Partial<CreateAgentEventHandlerContext> = {}
): CreateAgentEventHandlerContext {
  const config = overrides.config ?? createTestConfig();
  return {
    config,
    runtime: createMockAgentRuntime(),
    logger: createMockLogger(),
    loadHistory: vi.fn().mockResolvedValue([]),
    loadCheckpoint: vi.fn().mockResolvedValue(null),
    updateCheckpoint: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

// ============================================================================
// Handler Skipping Inactive Agents Tests
// ============================================================================

describe("createAgentEventHandler - inactive agent handling", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-01-15T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("skips processing when checkpoint status is paused", async () => {
    const ctx = createTestHandlerContext();
    const handler = createAgentEventHandler(ctx);

    const event = createTestEvent();
    const checkpoint = createTestCheckpoint({ status: "paused" });

    const result = await handler(event, checkpoint);

    expect(result.success).toBe(true);
    expect(result.decision).toBeNull();
    expect(ctx.loadHistory).not.toHaveBeenCalled();
    expect(ctx.updateCheckpoint).not.toHaveBeenCalled();
  });

  it("skips processing when checkpoint status is stopped", async () => {
    const ctx = createTestHandlerContext();
    const handler = createAgentEventHandler(ctx);

    const event = createTestEvent();
    const checkpoint = createTestCheckpoint({ status: "stopped" });

    const result = await handler(event, checkpoint);

    expect(result.success).toBe(true);
    expect(result.decision).toBeNull();
    expect(ctx.loadHistory).not.toHaveBeenCalled();
    expect(ctx.updateCheckpoint).not.toHaveBeenCalled();
  });

  it("processes events when checkpoint status is active", async () => {
    const ctx = createTestHandlerContext();
    const handler = createAgentEventHandler(ctx);

    const event = createTestEvent();
    const checkpoint = createTestCheckpoint({ status: "active" });

    await handler(event, checkpoint);

    expect(ctx.loadHistory).toHaveBeenCalled();
  });

  it("logs debug message when skipping inactive agent", async () => {
    const logger = createMockLogger();
    const ctx = createTestHandlerContext({ logger });
    const handler = createAgentEventHandler(ctx);

    const event = createTestEvent();
    const checkpoint = createTestCheckpoint({ status: "paused" });

    await handler(event, checkpoint);

    expect(logger.debug).toHaveBeenCalledWith(
      "Agent is not active, skipping event",
      expect.objectContaining({
        agentId: "test-agent",
        eventId: "evt_test_123",
        status: "paused",
      })
    );
  });
});

// ============================================================================
// Event Filtering by Pattern Window Tests
// ============================================================================

describe("createAgentEventHandler - pattern window filtering", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-01-15T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("loads history for the correct stream", async () => {
    const loadHistory = vi.fn().mockResolvedValue([]);
    const config = createTestConfig();
    const ctx = createTestHandlerContext({ config, loadHistory });
    const handler = createAgentEventHandler(ctx);

    const event = createTestEvent({ streamId: "order-specific-001" });
    const checkpoint = createTestCheckpoint();

    await handler(event, checkpoint);

    expect(loadHistory).toHaveBeenCalledWith("order-specific-001", config);
  });

  it("skips processing when history has insufficient events", async () => {
    const onEvent = vi.fn().mockResolvedValue(null);
    const config = createTestConfig({
      patternWindow: createTestPatternWindow({ minEvents: 5 }),
      onEvent,
    });
    // Return only 2 events when minEvents is 5
    const loadHistory = vi
      .fn()
      .mockResolvedValue([
        createTestEvent({ eventId: "evt_1", timestamp: Date.now() - 1000 }),
        createTestEvent({ eventId: "evt_2", timestamp: Date.now() - 500 }),
      ]);
    const ctx = createTestHandlerContext({ config, loadHistory });
    const handler = createAgentEventHandler(ctx);

    const event = createTestEvent();
    const checkpoint = createTestCheckpoint();

    const result = await handler(event, checkpoint);

    expect(result.success).toBe(true);
    expect(result.decision).toBeNull();
    expect(onEvent).not.toHaveBeenCalled();
  });

  it("still updates checkpoint even when insufficient events", async () => {
    const updateCheckpoint = vi.fn().mockResolvedValue(undefined);
    const config = createTestConfig({
      patternWindow: createTestPatternWindow({ minEvents: 5 }),
    });
    const loadHistory = vi.fn().mockResolvedValue([createTestEvent()]);
    const ctx = createTestHandlerContext({ config, loadHistory, updateCheckpoint });
    const handler = createAgentEventHandler(ctx);

    const event = createTestEvent({ eventId: "evt_456", globalPosition: 150 });
    const checkpoint = createTestCheckpoint();

    await handler(event, checkpoint);

    expect(updateCheckpoint).toHaveBeenCalledWith("test-agent", "evt_456", 150);
  });

  it("filters events outside the pattern window", async () => {
    const now = Date.now();
    const oneDay = 24 * 60 * 60 * 1000;
    const onEvent = vi.fn().mockResolvedValue(null);
    const config = createTestConfig({
      patternWindow: createTestPatternWindow({ duration: "1d", minEvents: 1 }),
      onEvent,
    });

    // One event within window, one outside
    const loadHistory = vi.fn().mockResolvedValue([
      createTestEvent({ eventId: "evt_old", timestamp: now - 2 * oneDay }), // Outside window
      createTestEvent({ eventId: "evt_recent", timestamp: now - 12 * 60 * 60 * 1000 }), // Inside window
    ]);

    const ctx = createTestHandlerContext({ config, loadHistory });
    const handler = createAgentEventHandler(ctx);

    const event = createTestEvent({ timestamp: now });
    const checkpoint = createTestCheckpoint();

    await handler(event, checkpoint);

    // onEvent should be called with filtered history (only recent event)
    expect(onEvent).toHaveBeenCalled();
    const callArg = onEvent.mock.calls[0][1];
    // The history in the execution context should have filtered events
    expect(callArg.history.length).toBe(1);
    expect(callArg.history[0].eventId).toBe("evt_recent");
  });

  it("logs debug message when insufficient events for pattern detection", async () => {
    const logger = createMockLogger();
    const config = createTestConfig({
      patternWindow: createTestPatternWindow({ minEvents: 10 }),
    });
    const loadHistory = vi.fn().mockResolvedValue([createTestEvent(), createTestEvent()]);
    const ctx = createTestHandlerContext({ config, loadHistory, logger });
    const handler = createAgentEventHandler(ctx);

    const event = createTestEvent();
    const checkpoint = createTestCheckpoint();

    await handler(event, checkpoint);

    expect(logger.debug).toHaveBeenCalledWith(
      "Insufficient events for pattern detection",
      expect.objectContaining({
        agentId: "test-agent",
        historyCount: expect.any(Number),
        minEvents: 10,
      })
    );
  });
});

// ============================================================================
// Execution Context Tests
// ============================================================================

describe("createAgentEventHandler - execution context", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-01-15T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("calls onEvent with correct execution context shape", async () => {
    const now = Date.now();
    const onEvent = vi.fn().mockResolvedValue(null);
    const config = createTestConfig({ onEvent });
    const historyEvents = [
      createTestEvent({ eventId: "hist_1", timestamp: now - 1000 }),
      createTestEvent({ eventId: "hist_2", timestamp: now - 500 }),
    ];
    const loadHistory = vi.fn().mockResolvedValue(historyEvents);
    const ctx = createTestHandlerContext({ config, loadHistory });
    const handler = createAgentEventHandler(ctx);

    const event = createTestEvent({ eventId: "current_evt" });
    const checkpoint = createTestCheckpoint({
      lastProcessedPosition: 99,
      lastEventId: "prev_evt",
      eventsProcessed: 99,
    });

    await handler(event, checkpoint);

    expect(onEvent).toHaveBeenCalledTimes(1);
    const [receivedEvent, executionContext] = onEvent.mock.calls[0];

    // Verify event passed correctly
    expect(receivedEvent.eventId).toBe("current_evt");

    // Verify execution context structure
    expect(executionContext).toMatchObject({
      agent: expect.objectContaining({
        analyze: expect.any(Function),
        reason: expect.any(Function),
      }),
      history: expect.any(Array),
      checkpoint: {
        lastProcessedPosition: 99,
        lastEventId: "prev_evt",
        eventsProcessed: 99,
      },
      config: expect.objectContaining({
        id: "test-agent",
      }),
    });
  });

  it("provides filtered history in execution context", async () => {
    const now = Date.now();
    const oneHour = 60 * 60 * 1000;
    const onEvent = vi.fn().mockResolvedValue(null);
    const config = createTestConfig({
      patternWindow: createTestPatternWindow({ duration: "1h" }),
      onEvent,
    });
    const loadHistory = vi.fn().mockResolvedValue([
      createTestEvent({ eventId: "recent_1", timestamp: now - 30 * 60 * 1000 }),
      createTestEvent({ eventId: "recent_2", timestamp: now - 15 * 60 * 1000 }),
      createTestEvent({ eventId: "old", timestamp: now - 2 * oneHour }), // Outside 1h window
    ]);
    const ctx = createTestHandlerContext({ config, loadHistory });
    const handler = createAgentEventHandler(ctx);

    const event = createTestEvent({ timestamp: now });
    const checkpoint = createTestCheckpoint();

    await handler(event, checkpoint);

    const executionContext = onEvent.mock.calls[0][1];
    expect(executionContext.history.length).toBe(2);
    const historyIds = executionContext.history.map((e: PublishedEvent) => e.eventId);
    expect(historyIds).toContain("recent_1");
    expect(historyIds).toContain("recent_2");
    expect(historyIds).not.toContain("old");
  });

  it("includes readonly config in execution context", async () => {
    const onEvent = vi.fn().mockResolvedValue(null);
    const config = createTestConfig({
      id: "my-special-agent",
      confidenceThreshold: 0.85,
      onEvent,
    });
    const loadHistory = vi.fn().mockResolvedValue([createTestEvent()]);
    const ctx = createTestHandlerContext({ config, loadHistory });
    const handler = createAgentEventHandler(ctx);

    const event = createTestEvent();
    const checkpoint = createTestCheckpoint();

    await handler(event, checkpoint);

    const executionContext = onEvent.mock.calls[0][1];
    expect(executionContext.config.id).toBe("my-special-agent");
    expect(executionContext.config.confidenceThreshold).toBe(0.85);
  });
});

// ============================================================================
// Command Emission Tests
// ============================================================================

describe("createAgentEventHandler - command emission", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-01-15T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("creates emittedCommand when decision has command", async () => {
    const decision: AgentDecision = {
      command: "SuggestCustomerOutreach",
      payload: { customerId: "cust-123", risk: 0.85 },
      confidence: 0.95,
      reason: "Customer cancelled 3 orders in 30 days",
      requiresApproval: false,
      triggeringEvents: ["evt_1", "evt_2", "evt_3"],
    };
    const onEvent = vi.fn().mockResolvedValue(decision);
    const config = createTestConfig({ onEvent, confidenceThreshold: 0.9 });
    const loadHistory = vi.fn().mockResolvedValue([createTestEvent()]);
    const ctx = createTestHandlerContext({ config, loadHistory });
    const handler = createAgentEventHandler(ctx);

    const event = createTestEvent();
    const checkpoint = createTestCheckpoint();

    const result = await handler(event, checkpoint);

    expect(result.success).toBe(true);
    expect(result.decision).toEqual(decision);
    expect(result.emittedCommand).toBeDefined();
    expect(result.emittedCommand?.type).toBe("SuggestCustomerOutreach");
    expect(result.emittedCommand?.payload).toEqual({ customerId: "cust-123", risk: 0.85 });
    expect(result.emittedCommand?.metadata.agentId).toBe("test-agent");
    expect(result.emittedCommand?.metadata.confidence).toBe(0.95);
    expect(result.emittedCommand?.metadata.reason).toBe("Customer cancelled 3 orders in 30 days");
  });

  it("does not create emittedCommand when decision command is null", async () => {
    const decision: AgentDecision = {
      command: null,
      payload: null,
      confidence: 0.0,
      reason: "No pattern detected",
      requiresApproval: false,
      triggeringEvents: [],
    };
    const onEvent = vi.fn().mockResolvedValue(decision);
    const config = createTestConfig({ onEvent });
    const loadHistory = vi.fn().mockResolvedValue([createTestEvent()]);
    const ctx = createTestHandlerContext({ config, loadHistory });
    const handler = createAgentEventHandler(ctx);

    const event = createTestEvent();
    const checkpoint = createTestCheckpoint();

    const result = await handler(event, checkpoint);

    expect(result.success).toBe(true);
    expect(result.decision).toEqual(decision);
    expect(result.emittedCommand).toBeUndefined();
    expect(result.pendingApproval).toBeUndefined();
  });

  it("returns null decision when onEvent returns null", async () => {
    const onEvent = vi.fn().mockResolvedValue(null);
    const config = createTestConfig({ onEvent });
    const loadHistory = vi.fn().mockResolvedValue([createTestEvent()]);
    const ctx = createTestHandlerContext({ config, loadHistory });
    const handler = createAgentEventHandler(ctx);

    const event = createTestEvent();
    const checkpoint = createTestCheckpoint();

    const result = await handler(event, checkpoint);

    expect(result.success).toBe(true);
    expect(result.decision).toBeNull();
    expect(result.emittedCommand).toBeUndefined();
  });

  it("logs info when emitting command", async () => {
    const logger = createMockLogger();
    const decision: AgentDecision = {
      command: "TestCommand",
      payload: {},
      confidence: 0.95,
      reason: "Test reason",
      requiresApproval: false,
      triggeringEvents: ["evt_1"],
    };
    const onEvent = vi.fn().mockResolvedValue(decision);
    const config = createTestConfig({ onEvent });
    const loadHistory = vi.fn().mockResolvedValue([createTestEvent()]);
    const ctx = createTestHandlerContext({ config, loadHistory, logger });
    const handler = createAgentEventHandler(ctx);

    const event = createTestEvent();
    const checkpoint = createTestCheckpoint();

    await handler(event, checkpoint);

    expect(logger.info).toHaveBeenCalledWith(
      "Agent emitting command",
      expect.objectContaining({
        agentId: "test-agent",
        commandType: "TestCommand",
        confidence: 0.95,
      })
    );
  });
});

// ============================================================================
// Approval Creation Tests
// ============================================================================

describe("createAgentEventHandler - approval workflow", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-01-15T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("creates pendingApproval when decision requiresApproval is true", async () => {
    const decision: AgentDecision = {
      command: "DeleteCustomer",
      payload: { customerId: "cust-123" },
      confidence: 0.95,
      reason: "Customer inactive for 2 years",
      requiresApproval: true,
      triggeringEvents: ["evt_1"],
    };
    const onEvent = vi.fn().mockResolvedValue(decision);
    const config = createTestConfig({ onEvent });
    const loadHistory = vi.fn().mockResolvedValue([createTestEvent()]);
    const ctx = createTestHandlerContext({ config, loadHistory });
    const handler = createAgentEventHandler(ctx);

    const event = createTestEvent();
    const checkpoint = createTestCheckpoint();

    const result = await handler(event, checkpoint);

    expect(result.success).toBe(true);
    expect(result.decision).toEqual(decision);
    expect(result.pendingApproval).toBeDefined();
    expect(result.pendingApproval?.agentId).toBe("test-agent");
    expect(result.pendingApproval?.action.type).toBe("DeleteCustomer");
    expect(result.pendingApproval?.confidence).toBe(0.95);
    expect(result.pendingApproval?.reason).toBe("Customer inactive for 2 years");
    expect(result.pendingApproval?.status).toBe("pending");
    expect(result.emittedCommand).toBeUndefined();
  });

  it("creates pendingApproval when confidence is below threshold", async () => {
    const decision: AgentDecision = {
      command: "SuggestOutreach",
      payload: { customerId: "cust-123" },
      confidence: 0.7, // Below 0.9 threshold
      reason: "Low confidence detection",
      requiresApproval: false,
      triggeringEvents: ["evt_1"],
    };
    const onEvent = vi.fn().mockResolvedValue(decision);
    const config = createTestConfig({
      onEvent,
      confidenceThreshold: 0.9,
      humanInLoop: {
        confidenceThreshold: 0.9,
      },
    });
    const loadHistory = vi.fn().mockResolvedValue([createTestEvent()]);
    const ctx = createTestHandlerContext({ config, loadHistory });
    const handler = createAgentEventHandler(ctx);

    const event = createTestEvent();
    const checkpoint = createTestCheckpoint();

    const result = await handler(event, checkpoint);

    expect(result.success).toBe(true);
    expect(result.pendingApproval).toBeDefined();
    expect(result.pendingApproval?.confidence).toBe(0.7);
    expect(result.emittedCommand).toBeUndefined();
  });

  it("creates pendingApproval when action is in requiresApproval list", async () => {
    const decision: AgentDecision = {
      command: "DeleteCustomer",
      payload: { customerId: "cust-123" },
      confidence: 0.99, // Very high confidence
      reason: "High confidence but restricted action",
      requiresApproval: false,
      triggeringEvents: ["evt_1"],
    };
    const onEvent = vi.fn().mockResolvedValue(decision);
    const config = createTestConfig({
      onEvent,
      confidenceThreshold: 0.9,
      humanInLoop: {
        confidenceThreshold: 0.9,
        requiresApproval: ["DeleteCustomer", "TransferFunds"],
      },
    });
    const loadHistory = vi.fn().mockResolvedValue([createTestEvent()]);
    const ctx = createTestHandlerContext({ config, loadHistory });
    const handler = createAgentEventHandler(ctx);

    const event = createTestEvent();
    const checkpoint = createTestCheckpoint();

    const result = await handler(event, checkpoint);

    expect(result.success).toBe(true);
    expect(result.pendingApproval).toBeDefined();
    expect(result.emittedCommand).toBeUndefined();
  });

  it("emits command directly when confidence is above threshold and not in requiresApproval", async () => {
    const decision: AgentDecision = {
      command: "SendNotification",
      payload: { customerId: "cust-123" },
      confidence: 0.95,
      reason: "Safe action with high confidence",
      requiresApproval: false,
      triggeringEvents: ["evt_1"],
    };
    const onEvent = vi.fn().mockResolvedValue(decision);
    const config = createTestConfig({
      onEvent,
      confidenceThreshold: 0.9,
      humanInLoop: {
        confidenceThreshold: 0.9,
        requiresApproval: ["DeleteCustomer"],
      },
    });
    const loadHistory = vi.fn().mockResolvedValue([createTestEvent()]);
    const ctx = createTestHandlerContext({ config, loadHistory });
    const handler = createAgentEventHandler(ctx);

    const event = createTestEvent();
    const checkpoint = createTestCheckpoint();

    const result = await handler(event, checkpoint);

    expect(result.success).toBe(true);
    expect(result.emittedCommand).toBeDefined();
    expect(result.emittedCommand?.type).toBe("SendNotification");
    expect(result.pendingApproval).toBeUndefined();
  });

  it("logs info when creating pending approval", async () => {
    const logger = createMockLogger();
    const decision: AgentDecision = {
      command: "TestCommand",
      payload: {},
      confidence: 0.75,
      reason: "Test reason",
      requiresApproval: true,
      triggeringEvents: ["evt_1"],
    };
    const onEvent = vi.fn().mockResolvedValue(decision);
    const config = createTestConfig({ onEvent });
    const loadHistory = vi.fn().mockResolvedValue([createTestEvent()]);
    const ctx = createTestHandlerContext({ config, loadHistory, logger });
    const handler = createAgentEventHandler(ctx);

    const event = createTestEvent();
    const checkpoint = createTestCheckpoint();

    await handler(event, checkpoint);

    expect(logger.info).toHaveBeenCalledWith(
      "Created pending approval for agent decision",
      expect.objectContaining({
        agentId: "test-agent",
        command: "TestCommand",
        confidence: 0.75,
      })
    );
  });
});

// ============================================================================
// Dead Letter Creation Tests
// ============================================================================

describe("createAgentEventHandler - dead letter on failure", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-01-15T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("creates deadLetter when onEvent throws an error", async () => {
    const error = new Error("LLM timeout during analysis");
    const onEvent = vi.fn().mockRejectedValue(error);
    const config = createTestConfig({ onEvent });
    const loadHistory = vi.fn().mockResolvedValue([createTestEvent()]);
    const ctx = createTestHandlerContext({ config, loadHistory });
    const handler = createAgentEventHandler(ctx);

    const event = createTestEvent({ eventId: "failing_evt", globalPosition: 200 });
    const checkpoint = createTestCheckpoint({ subscriptionId: "sub-test-123" });

    const result = await handler(event, checkpoint);

    expect(result.success).toBe(false);
    expect(result.decision).toBeNull();
    expect(result.deadLetter).toBeDefined();
    expect(result.deadLetter?.agentId).toBe("test-agent");
    expect(result.deadLetter?.subscriptionId).toBe("sub-test-123");
    expect(result.deadLetter?.eventId).toBe("failing_evt");
    expect(result.deadLetter?.globalPosition).toBe(200);
    expect(result.deadLetter?.error).toContain("LLM timeout during analysis");
    expect(result.deadLetter?.status).toBe("pending");
    expect(result.error).toBe("LLM timeout during analysis");
  });

  it("creates deadLetter when loadHistory throws an error", async () => {
    const error = new Error("Database connection failed");
    const loadHistory = vi.fn().mockRejectedValue(error);
    const ctx = createTestHandlerContext({ loadHistory });
    const handler = createAgentEventHandler(ctx);

    const event = createTestEvent({ eventId: "evt_123" });
    const checkpoint = createTestCheckpoint();

    const result = await handler(event, checkpoint);

    expect(result.success).toBe(false);
    expect(result.deadLetter).toBeDefined();
    expect(result.deadLetter?.error).toContain("Database connection failed");
  });

  it("handles non-Error objects thrown as exceptions", async () => {
    const onEvent = vi.fn().mockRejectedValue("String error message");
    const config = createTestConfig({ onEvent });
    const loadHistory = vi.fn().mockResolvedValue([createTestEvent()]);
    const ctx = createTestHandlerContext({ config, loadHistory });
    const handler = createAgentEventHandler(ctx);

    const event = createTestEvent();
    const checkpoint = createTestCheckpoint();

    const result = await handler(event, checkpoint);

    expect(result.success).toBe(false);
    expect(result.deadLetter).toBeDefined();
    expect(result.deadLetter?.error).toContain("String error message");
    expect(result.error).toBe("String error message");
  });

  it("logs error when processing fails", async () => {
    const logger = createMockLogger();
    const error = new Error("Processing failed");
    const onEvent = vi.fn().mockRejectedValue(error);
    const config = createTestConfig({ onEvent });
    const loadHistory = vi.fn().mockResolvedValue([createTestEvent()]);
    const ctx = createTestHandlerContext({ config, loadHistory, logger });
    const handler = createAgentEventHandler(ctx);

    const event = createTestEvent({ eventId: "failing_evt" });
    const checkpoint = createTestCheckpoint();

    await handler(event, checkpoint);

    expect(logger.error).toHaveBeenCalledWith(
      "Agent event processing failed",
      expect.objectContaining({
        agentId: "test-agent",
        eventId: "failing_evt",
        error: "Processing failed",
      })
    );
  });

  it("includes error field in result when processing fails", async () => {
    const onEvent = vi.fn().mockRejectedValue(new Error("Specific error message"));
    const config = createTestConfig({ onEvent });
    const loadHistory = vi.fn().mockResolvedValue([createTestEvent()]);
    const ctx = createTestHandlerContext({ config, loadHistory });
    const handler = createAgentEventHandler(ctx);

    const event = createTestEvent();
    const checkpoint = createTestCheckpoint();

    const result = await handler(event, checkpoint);

    expect(result.error).toBe("Specific error message");
  });
});

// ============================================================================
// Checkpoint Update Tests
// ============================================================================

describe("createAgentEventHandler - checkpoint updates", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-01-15T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("updates checkpoint after successful processing", async () => {
    const updateCheckpoint = vi.fn().mockResolvedValue(undefined);
    const onEvent = vi.fn().mockResolvedValue(null);
    const config = createTestConfig({ onEvent });
    const loadHistory = vi.fn().mockResolvedValue([createTestEvent()]);
    const ctx = createTestHandlerContext({ config, loadHistory, updateCheckpoint });
    const handler = createAgentEventHandler(ctx);

    const event = createTestEvent({ eventId: "evt_new_123", globalPosition: 150 });
    const checkpoint = createTestCheckpoint();

    await handler(event, checkpoint);

    expect(updateCheckpoint).toHaveBeenCalledWith("test-agent", "evt_new_123", 150);
  });

  it("updates checkpoint with correct event ID and position", async () => {
    const updateCheckpoint = vi.fn().mockResolvedValue(undefined);
    const onEvent = vi.fn().mockResolvedValue(null);
    const config = createTestConfig({ onEvent });
    const loadHistory = vi.fn().mockResolvedValue([createTestEvent()]);
    const ctx = createTestHandlerContext({ config, loadHistory, updateCheckpoint });
    const handler = createAgentEventHandler(ctx);

    const event = createTestEvent({
      eventId: "specific_event_id",
      globalPosition: 999,
    });
    const checkpoint = createTestCheckpoint();

    await handler(event, checkpoint);

    expect(updateCheckpoint).toHaveBeenCalledWith("test-agent", "specific_event_id", 999);
  });

  it("updates checkpoint after decision with command", async () => {
    const updateCheckpoint = vi.fn().mockResolvedValue(undefined);
    const decision: AgentDecision = {
      command: "TestCommand",
      payload: {},
      confidence: 0.95,
      reason: "Test",
      requiresApproval: false,
      triggeringEvents: ["evt_1"],
    };
    const onEvent = vi.fn().mockResolvedValue(decision);
    const config = createTestConfig({ onEvent });
    const loadHistory = vi.fn().mockResolvedValue([createTestEvent()]);
    const ctx = createTestHandlerContext({ config, loadHistory, updateCheckpoint });
    const handler = createAgentEventHandler(ctx);

    const event = createTestEvent({ eventId: "cmd_evt", globalPosition: 500 });
    const checkpoint = createTestCheckpoint();

    await handler(event, checkpoint);

    expect(updateCheckpoint).toHaveBeenCalledWith("test-agent", "cmd_evt", 500);
  });

  it("does not update checkpoint when agent is inactive", async () => {
    const updateCheckpoint = vi.fn().mockResolvedValue(undefined);
    const ctx = createTestHandlerContext({ updateCheckpoint });
    const handler = createAgentEventHandler(ctx);

    const event = createTestEvent();
    const checkpoint = createTestCheckpoint({ status: "paused" });

    await handler(event, checkpoint);

    expect(updateCheckpoint).not.toHaveBeenCalled();
  });

  it("does not update checkpoint on processing failure", async () => {
    const updateCheckpoint = vi.fn().mockResolvedValue(undefined);
    const onEvent = vi.fn().mockRejectedValue(new Error("Failed"));
    const config = createTestConfig({ onEvent });
    const loadHistory = vi.fn().mockResolvedValue([createTestEvent()]);
    const ctx = createTestHandlerContext({ config, loadHistory, updateCheckpoint });
    const handler = createAgentEventHandler(ctx);

    const event = createTestEvent();
    const checkpoint = createTestCheckpoint();

    await handler(event, checkpoint);

    // updateCheckpoint should NOT be called on failure (checkpoint is called before onEvent in this flow)
    // Actually looking at the code, updateCheckpoint IS called after onEvent
    // Let me verify the implementation...
    // The checkpoint is updated AFTER calling onEvent, so if onEvent fails, the catch block runs
    // and checkpoint is NOT updated on failure
    expect(updateCheckpoint).not.toHaveBeenCalled();
  });
});

// ============================================================================
// Integration-style Tests
// ============================================================================

describe("createAgentEventHandler - full workflow", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-01-15T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("processes event through full happy path with command emission", async () => {
    const decision: AgentDecision = {
      command: "SuggestCustomerOutreach",
      payload: { customerId: "cust-123", urgency: "high" },
      confidence: 0.92,
      reason: "Detected churn risk pattern",
      requiresApproval: false,
      triggeringEvents: ["evt_1", "evt_2"],
    };

    const onEvent = vi.fn().mockResolvedValue(decision);
    const updateCheckpoint = vi.fn().mockResolvedValue(undefined);
    const logger = createMockLogger();

    const config = createTestConfig({
      id: "churn-risk-agent",
      onEvent,
      confidenceThreshold: 0.9,
    });

    const loadHistory = vi
      .fn()
      .mockResolvedValue([
        createTestEvent({ eventId: "hist_1", timestamp: Date.now() - 3600000 }),
        createTestEvent({ eventId: "hist_2", timestamp: Date.now() - 1800000 }),
      ]);

    const ctx = createTestHandlerContext({
      config,
      loadHistory,
      updateCheckpoint,
      logger,
    });
    const handler = createAgentEventHandler(ctx);

    const event = createTestEvent({
      eventId: "trigger_evt",
      globalPosition: 250,
    });
    const checkpoint = createTestCheckpoint({
      agentId: "churn-risk-agent",
      status: "active",
      lastProcessedPosition: 200,
    });

    const result = await handler(event, checkpoint);

    // Verify full success path
    expect(result.success).toBe(true);
    expect(result.decision).toEqual(decision);
    expect(result.emittedCommand).toBeDefined();
    expect(result.emittedCommand?.type).toBe("SuggestCustomerOutreach");
    expect(result.emittedCommand?.metadata.agentId).toBe("churn-risk-agent");
    expect(result.pendingApproval).toBeUndefined();
    expect(result.deadLetter).toBeUndefined();

    // Verify checkpoint updated
    expect(updateCheckpoint).toHaveBeenCalledWith("churn-risk-agent", "trigger_evt", 250);

    // Verify logging
    expect(logger.info).toHaveBeenCalledWith("Agent emitting command", expect.any(Object));
  });

  it("processes event through full path with approval required", async () => {
    const decision: AgentDecision = {
      command: "DeleteInactiveCustomer",
      payload: { customerId: "cust-456" },
      confidence: 0.85,
      reason: "Customer inactive for extended period",
      requiresApproval: false, // Will be overridden by humanInLoop config
      triggeringEvents: ["evt_1"],
    };

    const onEvent = vi.fn().mockResolvedValue(decision);
    const logger = createMockLogger();

    const config = createTestConfig({
      onEvent,
      confidenceThreshold: 0.9,
      humanInLoop: {
        confidenceThreshold: 0.9,
        requiresApproval: ["DeleteInactiveCustomer"],
      },
    });

    const loadHistory = vi.fn().mockResolvedValue([createTestEvent()]);
    const ctx = createTestHandlerContext({ config, loadHistory, logger });
    const handler = createAgentEventHandler(ctx);

    const event = createTestEvent();
    const checkpoint = createTestCheckpoint();

    const result = await handler(event, checkpoint);

    expect(result.success).toBe(true);
    expect(result.decision).toEqual(decision);
    expect(result.pendingApproval).toBeDefined();
    expect(result.pendingApproval?.status).toBe("pending");
    expect(result.emittedCommand).toBeUndefined();

    expect(logger.info).toHaveBeenCalledWith(
      "Created pending approval for agent decision",
      expect.any(Object)
    );
  });

  it("handles complete failure scenario with dead letter", async () => {
    const error = new Error("Critical LLM API failure");
    const onEvent = vi.fn().mockRejectedValue(error);
    const updateCheckpoint = vi.fn().mockResolvedValue(undefined);
    const logger = createMockLogger();

    const config = createTestConfig({ onEvent });
    const loadHistory = vi.fn().mockResolvedValue([createTestEvent()]);
    const ctx = createTestHandlerContext({
      config,
      loadHistory,
      updateCheckpoint,
      logger,
    });
    const handler = createAgentEventHandler(ctx);

    const event = createTestEvent({
      eventId: "failed_evt",
      globalPosition: 300,
    });
    const checkpoint = createTestCheckpoint({ subscriptionId: "sub-999" });

    const result = await handler(event, checkpoint);

    expect(result.success).toBe(false);
    expect(result.decision).toBeNull();
    expect(result.deadLetter).toBeDefined();
    expect(result.deadLetter?.eventId).toBe("failed_evt");
    expect(result.deadLetter?.globalPosition).toBe(300);
    expect(result.deadLetter?.subscriptionId).toBe("sub-999");
    expect(result.error).toBe("Critical LLM API failure");

    // Verify checkpoint NOT updated on failure
    expect(updateCheckpoint).not.toHaveBeenCalled();

    // Verify error logged
    expect(logger.error).toHaveBeenCalledWith("Agent event processing failed", expect.any(Object));
  });
});
