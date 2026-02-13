/**
 * Thread Adapter Unit Tests
 *
 * Tests for createThreadAdapter() including:
 * - analyze: JSON response parsing with patterns, confidence, reasoning
 * - analyze: Handling suggestedAction in response
 * - analyze: Graceful handling of non-JSON responses
 * - analyze: Graceful handling of JSON parse failures
 * - analyze: Error re-throwing from generateText
 * - analyze: Timing tracking in llmContext
 * - reason: JSON response parsing
 * - reason: Raw text fallback for non-JSON responses
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  createThreadAdapter,
  type ThreadAdapterConfig,
  type GenerateTextResult,
} from "../../../src/agent/thread-adapter.js";
import type { PublishedEvent } from "../../../src/eventbus/types.js";
import { createMockLogger } from "./_test-utils.js";

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
    ...overrides,
  };
}

function createTestConfig(overrides: Partial<ThreadAdapterConfig> = {}): ThreadAdapterConfig {
  return {
    agentId: "test-agent",
    model: "anthropic/claude-sonnet-4-5-20250929",
    generateText: vi.fn().mockResolvedValue({
      text: JSON.stringify({
        patterns: [],
        confidence: 0,
        reasoning: "No patterns detected",
      }),
      usage: { totalTokens: 50 },
    }),
    ...overrides,
  };
}

// ============================================================================
// analyze() Tests
// ============================================================================

describe("createThreadAdapter - analyze", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-01-15T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("calls generateText with formatted prompt and parses JSON response", async () => {
    const generateText = vi.fn().mockResolvedValue({
      text: JSON.stringify({
        patterns: [
          {
            name: "churn-risk",
            confidence: 0.85,
            matchingEventIds: ["evt_1", "evt_2"],
            data: { cancellationCount: 3 },
          },
        ],
        confidence: 0.8,
        reasoning: "Customer shows churn risk indicators",
      }),
      usage: { totalTokens: 100 },
    } satisfies GenerateTextResult);

    const config = createTestConfig({ generateText });
    const adapter = createThreadAdapter(config);

    const events = [createTestEvent(), createTestEvent({ eventId: "evt_2" })];
    const result = await adapter.analyze("Detect churn risk", events);

    expect(generateText).toHaveBeenCalledTimes(1);
    expect(result.patterns).toHaveLength(1);
    expect(result.patterns[0].name).toBe("churn-risk");
    expect(result.patterns[0].confidence).toBe(0.85);
    expect(result.patterns[0].matchingEventIds).toEqual(["evt_1", "evt_2"]);
    expect(result.confidence).toBe(0.8);
    expect(result.reasoning).toBe("Customer shows churn risk indicators");
    expect(result.llmContext).toBeDefined();
    expect(result.llmContext!.model).toBe("anthropic/claude-sonnet-4-5-20250929");
    expect(result.llmContext!.tokens).toBe(100);
  });

  it("handles valid JSON response with suggestedAction", async () => {
    const generateText = vi.fn().mockResolvedValue({
      text: JSON.stringify({
        patterns: [],
        confidence: 0.9,
        reasoning: "High risk detected",
        suggestedAction: {
          type: "SuggestOutreach",
          payload: { urgency: "high" },
        },
      }),
      usage: { totalTokens: 75 },
    } satisfies GenerateTextResult);

    const config = createTestConfig({ generateText });
    const adapter = createThreadAdapter(config);

    const result = await adapter.analyze("Analyze risk", [createTestEvent()]);

    expect(result.suggestedAction).toBeDefined();
    expect(result.suggestedAction!.type).toBe("SuggestOutreach");
    expect(result.suggestedAction!.payload).toEqual({ urgency: "high" });
  });

  it("handles non-JSON response gracefully with defaults", async () => {
    const generateText = vi.fn().mockResolvedValue({
      text: "This is plain text, not JSON",
      usage: { totalTokens: 30 },
    } satisfies GenerateTextResult);

    const config = createTestConfig({ generateText });
    const adapter = createThreadAdapter(config);

    const result = await adapter.analyze("Analyze events", [createTestEvent()]);

    expect(result.patterns).toEqual([]);
    expect(result.confidence).toBe(0);
    expect(result.reasoning).toBe("This is plain text, not JSON");
    expect(result.llmContext).toBeDefined();
  });

  it("handles malformed JSON gracefully", async () => {
    const generateText = vi.fn().mockResolvedValue({
      text: "{ not valid json }}}",
      usage: { totalTokens: 20 },
    } satisfies GenerateTextResult);

    const config = createTestConfig({ generateText });
    const adapter = createThreadAdapter(config);

    const result = await adapter.analyze("Analyze events", [createTestEvent()]);

    // Should not crash, returns defaults
    expect(result.patterns).toEqual([]);
    expect(result.confidence).toBe(0);
    expect(result.reasoning).toBe("{ not valid json }}}");
  });

  it("re-throws generateText errors", async () => {
    const generateText = vi.fn().mockRejectedValue(new Error("API rate limit exceeded"));

    const config = createTestConfig({ generateText });
    const adapter = createThreadAdapter(config);

    await expect(adapter.analyze("Analyze events", [createTestEvent()])).rejects.toThrow(
      "API rate limit exceeded"
    );
  });

  it("tracks timing in llmContext", async () => {
    // Advance time during the call to simulate duration
    const generateText = vi.fn().mockImplementation(async () => {
      vi.advanceTimersByTime(250);
      return {
        text: JSON.stringify({ patterns: [], confidence: 0, reasoning: "test" }),
        usage: { totalTokens: 50 },
      };
    });

    const config = createTestConfig({ generateText });
    const adapter = createThreadAdapter(config);

    const result = await adapter.analyze("Analyze", [createTestEvent()]);

    expect(result.llmContext).toBeDefined();
    expect(result.llmContext!.model).toBe("anthropic/claude-sonnet-4-5-20250929");
    expect(result.llmContext!.tokens).toBe(50);
    expect(result.llmContext!.durationMs).toBe(250);
  });

  it("includes threadId in llmContext when present", async () => {
    const generateText = vi.fn().mockResolvedValue({
      text: JSON.stringify({ patterns: [], confidence: 0, reasoning: "test" }),
      usage: { totalTokens: 50 },
      threadId: "thread_abc123",
    } satisfies GenerateTextResult);

    const config = createTestConfig({ generateText });
    const adapter = createThreadAdapter(config);

    const result = await adapter.analyze("Analyze", [createTestEvent()]);

    expect(result.llmContext!.threadId).toBe("thread_abc123");
  });

  it("omits threadId from llmContext when not present", async () => {
    const generateText = vi.fn().mockResolvedValue({
      text: JSON.stringify({ patterns: [], confidence: 0, reasoning: "test" }),
      usage: { totalTokens: 50 },
      // No threadId
    } satisfies GenerateTextResult);

    const config = createTestConfig({ generateText });
    const adapter = createThreadAdapter(config);

    const result = await adapter.analyze("Analyze", [createTestEvent()]);

    expect(result.llmContext).toBeDefined();
    expect("threadId" in result.llmContext!).toBe(false);
  });

  it("handles missing usage in generateText result", async () => {
    const generateText = vi.fn().mockResolvedValue({
      text: JSON.stringify({ patterns: [], confidence: 0.5, reasoning: "test" }),
      // No usage field
    } satisfies GenerateTextResult);

    const config = createTestConfig({ generateText });
    const adapter = createThreadAdapter(config);

    const result = await adapter.analyze("Analyze", [createTestEvent()]);

    expect(result.llmContext!.tokens).toBe(0);
  });
});

// ============================================================================
// reason() Tests
// ============================================================================

describe("createThreadAdapter - reason", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-01-15T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("calls generateText and parses JSON response", async () => {
    const jsonResponse = {
      observation: "Customer cancelled order after long delay",
      implications: ["potential churn risk"],
      suggestedAction: "follow-up",
    };

    const generateText = vi.fn().mockResolvedValue({
      text: JSON.stringify(jsonResponse),
      usage: { totalTokens: 80 },
    } satisfies GenerateTextResult);

    const config = createTestConfig({ generateText });
    const adapter = createThreadAdapter(config);

    const event = createTestEvent();
    const result = await adapter.reason(event);

    expect(generateText).toHaveBeenCalledTimes(1);
    expect(result).toEqual(jsonResponse);
  });

  it("returns raw text when response is not JSON", async () => {
    const generateText = vi.fn().mockResolvedValue({
      text: "This event indicates a potential issue with order fulfillment.",
      usage: { totalTokens: 40 },
    } satisfies GenerateTextResult);

    const config = createTestConfig({ generateText });
    const adapter = createThreadAdapter(config);

    const event = createTestEvent();
    const result = await adapter.reason(event);

    expect(result).toBe("This event indicates a potential issue with order fulfillment.");
  });

  it("re-throws generateText errors", async () => {
    const generateText = vi.fn().mockRejectedValue(new Error("Network error"));

    const config = createTestConfig({ generateText });
    const adapter = createThreadAdapter(config);

    await expect(adapter.reason(createTestEvent())).rejects.toThrow("Network error");
  });

  it("logs reasoning start and completion", async () => {
    const generateText = vi.fn().mockResolvedValue({
      text: JSON.stringify({ note: "test" }),
      usage: { totalTokens: 30 },
    } satisfies GenerateTextResult);

    const logger = createMockLogger();
    const config = createTestConfig({ generateText, logger });
    const adapter = createThreadAdapter(config);

    await adapter.reason(createTestEvent({ eventType: "PaymentFailed" }));

    expect(logger.debug).toHaveBeenCalledWith(
      "Starting reasoning",
      expect.objectContaining({
        agentId: "test-agent",
        eventType: "PaymentFailed",
      })
    );
    expect(logger.info).toHaveBeenCalledWith(
      "Reasoning completed",
      expect.objectContaining({
        agentId: "test-agent",
        model: "anthropic/claude-sonnet-4-5-20250929",
      })
    );
  });
});
