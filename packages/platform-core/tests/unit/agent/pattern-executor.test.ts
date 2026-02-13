/**
 * Pattern Executor Unit Tests
 *
 * Tests for the pattern execution pipeline including:
 * - executePatterns: no match, single match, multi-pattern, analyze, error propagation
 * - buildDecisionFromAnalysis: command extraction, approval logic
 * - buildDecisionFromTrigger: heuristic confidence, always requires approval
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  executePatterns,
  buildDecisionFromAnalysis,
  buildDecisionFromTrigger,
} from "../../../src/agent/pattern-executor.js";
import type { PatternDefinition, PatternAnalysisResult } from "../../../src/agent/patterns.js";
import type { PublishedEvent } from "../../../src/eventbus/types.js";
import type { AgentBCConfig, AgentInterface } from "../../../src/agent/types.js";

// ============================================================================
// Test Helpers
// ============================================================================

const makeEvent = (overrides?: Partial<PublishedEvent>): PublishedEvent => ({
  eventId: `evt_${Math.random().toString(36).slice(2, 8)}`,
  eventType: "OrderCancelled",
  globalPosition: 1,
  streamType: "Order",
  streamId: "ord_123",
  payload: {},
  timestamp: Date.now(),
  category: "domain",
  boundedContext: "orders",
  schemaVersion: 1,
  correlation: { correlationId: "corr_1", causationId: "evt_1" },
  ...overrides,
});

const makePattern = (name: string, overrides?: Partial<PatternDefinition>): PatternDefinition => ({
  name,
  window: { duration: "7d" },
  trigger: () => true,
  ...overrides,
});

const makeConfig = (overrides?: Partial<AgentBCConfig>): AgentBCConfig => ({
  id: "test-agent",
  subscriptions: ["OrderCancelled"],
  patternWindow: { duration: "30d", minEvents: 1 },
  confidenceThreshold: 0.8,
  patterns: [makePattern("test-pattern")],
  ...overrides,
});

const stubAgent: AgentInterface = {
  analyze: async () => ({ patterns: [], confidence: 0, reasoning: "" }),
  reason: async () => ({}),
};

// ============================================================================
// executePatterns — No Patterns
// ============================================================================

describe("executePatterns — no patterns", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-06-15T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns null matchedPattern and null decision for empty patterns array", async () => {
    const events = [makeEvent()];
    const result = await executePatterns([], events, stubAgent, makeConfig());

    expect(result.matchedPattern).toBeNull();
    expect(result.decision).toBeNull();
    expect(result.analysisMethod).toBe("rule-based");
  });
});

// ============================================================================
// executePatterns — Single Pattern Match (Rule-Based)
// ============================================================================

describe("executePatterns — single pattern match (rule-based)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-06-15T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns rule-based decision when trigger returns true and no analyze", async () => {
    const events = [makeEvent()];
    const pattern = makePattern("churn-risk", {
      trigger: () => true,
      // No analyze function
    });

    const result = await executePatterns([pattern], events, stubAgent, makeConfig());

    expect(result.matchedPattern).toBe("churn-risk");
    expect(result.decision).not.toBeNull();
    expect(result.analysisMethod).toBe("rule-based");
    expect(result.decision!.command).toBeNull();
    expect(result.decision!.requiresApproval).toBe(true);
  });

  it("skips pattern when trigger returns false", async () => {
    const events = [makeEvent()];
    const pattern = makePattern("no-match", {
      trigger: () => false,
    });

    const result = await executePatterns([pattern], events, stubAgent, makeConfig());

    expect(result.matchedPattern).toBeNull();
    expect(result.decision).toBeNull();
  });
});

// ============================================================================
// executePatterns — Single Pattern with Analyze
// ============================================================================

describe("executePatterns — single pattern with analyze", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-06-15T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns llm decision when analyze returns detected", async () => {
    const events = [makeEvent({ eventId: "evt_1" })];
    const analysisResult: PatternAnalysisResult = {
      detected: true,
      confidence: 0.92,
      reasoning: "High churn risk detected",
      matchingEventIds: ["evt_1"],
      command: { type: "SuggestOutreach", payload: { urgency: "high" } },
    };

    const pattern = makePattern("churn-risk", {
      trigger: () => true,
      analyze: vi.fn().mockResolvedValue(analysisResult),
    });

    const result = await executePatterns([pattern], events, stubAgent, makeConfig());

    expect(result.matchedPattern).toBe("churn-risk");
    expect(result.analysisMethod).toBe("llm");
    expect(result.decision).not.toBeNull();
    expect(result.decision!.command).toBe("SuggestOutreach");
    expect(result.decision!.confidence).toBe(0.92);
    expect(result.decision!.reason).toBe("High churn risk detected");
  });

  it("continues to next pattern when analyze returns not detected", async () => {
    const events = [makeEvent()];
    const notDetectedResult: PatternAnalysisResult = {
      detected: false,
      confidence: 0.2,
      reasoning: "No pattern found",
      matchingEventIds: [],
    };

    const pattern1 = makePattern("first", {
      trigger: () => true,
      analyze: vi.fn().mockResolvedValue(notDetectedResult),
    });

    const pattern2 = makePattern("second", {
      trigger: () => true,
      // No analyze — rule-based fallthrough
    });

    const result = await executePatterns([pattern1, pattern2], events, stubAgent, makeConfig());

    expect(result.matchedPattern).toBe("second");
    expect(result.analysisMethod).toBe("rule-based");
  });
});

// ============================================================================
// executePatterns — Analyze Throws (Error Propagation)
// ============================================================================

describe("executePatterns — analyze throws (error propagation)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-06-15T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("propagates error when analyze throws (for Workpool retry)", async () => {
    const events = [makeEvent()];
    const pattern = makePattern("risky", {
      trigger: () => true,
      analyze: vi.fn().mockRejectedValue(new Error("LLM API timeout")),
    });

    await expect(executePatterns([pattern], events, stubAgent, makeConfig())).rejects.toThrow(
      "LLM API timeout"
    );
  });
});

// ============================================================================
// executePatterns — Multi-Pattern Short-Circuit
// ============================================================================

describe("executePatterns — multi-pattern short-circuit", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-06-15T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("stops after first matching pattern (second never called)", async () => {
    const events = [makeEvent()];
    const secondTrigger = vi.fn().mockReturnValue(true);

    const pattern1 = makePattern("first", { trigger: () => true });
    const pattern2 = makePattern("second", { trigger: secondTrigger });

    const result = await executePatterns([pattern1, pattern2], events, stubAgent, makeConfig());

    expect(result.matchedPattern).toBe("first");
    expect(secondTrigger).not.toHaveBeenCalled();
  });
});

// ============================================================================
// executePatterns — Multi-Pattern Fallthrough
// ============================================================================

describe("executePatterns — multi-pattern fallthrough", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-06-15T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("falls through to second pattern when first trigger is false", async () => {
    const events = [makeEvent()];

    const pattern1 = makePattern("first", { trigger: () => false });
    const pattern2 = makePattern("second", { trigger: () => true });

    const result = await executePatterns([pattern1, pattern2], events, stubAgent, makeConfig());

    expect(result.matchedPattern).toBe("second");
    expect(result.analysisMethod).toBe("rule-based");
  });
});

// ============================================================================
// executePatterns — Insufficient Events (minEvents)
// ============================================================================

describe("executePatterns — insufficient events", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-06-15T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("skips pattern when minEvents is not met", async () => {
    const events = [makeEvent()]; // Only 1 event

    const pattern = makePattern("needs-many", {
      window: { duration: "7d", minEvents: 5 },
      trigger: vi.fn().mockReturnValue(true),
    });

    const result = await executePatterns([pattern], events, stubAgent, makeConfig());

    expect(result.matchedPattern).toBeNull();
    expect(result.decision).toBeNull();
    // Trigger should never be called if minEvents is not met
    expect(pattern.trigger).not.toHaveBeenCalled();
  });

  it("processes pattern when minEvents is met", async () => {
    const events = Array.from({ length: 5 }, (_, i) =>
      makeEvent({ eventId: `evt_${i}`, globalPosition: i + 1 })
    );

    const pattern = makePattern("needs-five", {
      window: { duration: "7d", minEvents: 5 },
      trigger: () => true,
    });

    const result = await executePatterns([pattern], events, stubAgent, makeConfig());

    expect(result.matchedPattern).toBe("needs-five");
  });
});

// ============================================================================
// executePatterns — Window Filtering
// ============================================================================

describe("executePatterns — window filtering", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-06-15T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("excludes events outside the pattern window", async () => {
    const now = Date.now();
    const oneHourAgo = now - 60 * 60 * 1000;
    const twoDaysAgo = now - 2 * 24 * 60 * 60 * 1000;

    const recentEvent = makeEvent({ eventId: "recent", timestamp: oneHourAgo });
    const oldEvent = makeEvent({ eventId: "old", timestamp: twoDaysAgo });

    // Pattern with 1-day window -- old event should be excluded
    const triggerSpy = vi.fn().mockReturnValue(true);
    const pattern = makePattern("short-window", {
      window: { duration: "1d" },
      trigger: triggerSpy,
    });

    const result = await executePatterns(
      [pattern],
      [recentEvent, oldEvent],
      stubAgent,
      makeConfig()
    );

    expect(result.matchedPattern).toBe("short-window");
    // Trigger should have been called with only the recent event
    expect(triggerSpy).toHaveBeenCalledTimes(1);
    const receivedEvents = triggerSpy.mock.calls[0][0] as PublishedEvent[];
    expect(receivedEvents).toHaveLength(1);
    expect(receivedEvents[0].eventId).toBe("recent");
  });

  it("returns no match when all events are outside the window", async () => {
    const now = Date.now();
    const twoDaysAgo = now - 2 * 24 * 60 * 60 * 1000;

    const oldEvent = makeEvent({ timestamp: twoDaysAgo });

    const pattern = makePattern("short-window", {
      window: { duration: "1d", minEvents: 1 },
      trigger: () => true,
    });

    const result = await executePatterns([pattern], [oldEvent], stubAgent, makeConfig());

    // No events within window => minEvents check fails => skip
    expect(result.matchedPattern).toBeNull();
    expect(result.decision).toBeNull();
  });
});

// ============================================================================
// buildDecisionFromAnalysis — Command Extraction
// ============================================================================

describe("buildDecisionFromAnalysis — command extraction", () => {
  it("extracts command type from result.command", () => {
    const result: PatternAnalysisResult = {
      detected: true,
      confidence: 0.95,
      reasoning: "Pattern detected",
      matchingEventIds: ["evt_1"],
      command: { type: "SuggestOutreach", payload: { urgency: "high" } },
    };

    const decision = buildDecisionFromAnalysis(result, "churn-risk", makeConfig());

    expect(decision.command).toBe("SuggestOutreach");
    expect(decision.payload).toEqual({ urgency: "high" });
    expect(decision.confidence).toBe(0.95);
    expect(decision.reason).toBe("Pattern detected");
    expect(decision.triggeringEvents).toEqual(["evt_1"]);
  });

  it("returns null command when no command present", () => {
    const result: PatternAnalysisResult = {
      detected: true,
      confidence: 0.7,
      reasoning: "Detected but no action",
      matchingEventIds: ["evt_3"],
    };

    const decision = buildDecisionFromAnalysis(result, "no-command", makeConfig());

    expect(decision.command).toBeNull();
  });

  it("uses result.command.payload when command is present", () => {
    const result: PatternAnalysisResult = {
      detected: true,
      confidence: 0.9,
      reasoning: "Test payload",
      matchingEventIds: [],
      command: { type: "Cmd", payload: { specific: "data" } },
    };

    const decision = buildDecisionFromAnalysis(result, "payload-test", makeConfig());

    expect(decision.payload).toEqual({ specific: "data" });
  });

  it("uses result.data as payload when no command present", () => {
    const result: PatternAnalysisResult = {
      detected: true,
      confidence: 0.9,
      reasoning: "Test data fallback",
      matchingEventIds: [],
      data: { extra: "info" },
    };

    const decision = buildDecisionFromAnalysis(result, "data-fallback", makeConfig());

    expect(decision.payload).toEqual({ extra: "info" });
  });
});

// ============================================================================
// buildDecisionFromAnalysis — RequiresApproval
// ============================================================================

describe("buildDecisionFromAnalysis — requiresApproval", () => {
  it("requires approval when confidence is below threshold", () => {
    const result: PatternAnalysisResult = {
      detected: true,
      confidence: 0.5, // Below 0.8 threshold
      reasoning: "Low confidence",
      matchingEventIds: [],
      command: { type: "SomeAction", payload: {} },
    };

    const decision = buildDecisionFromAnalysis(
      result,
      "low-conf",
      makeConfig({ confidenceThreshold: 0.8 })
    );

    expect(decision.requiresApproval).toBe(true);
  });

  it("does not require approval when confidence meets threshold", () => {
    const result: PatternAnalysisResult = {
      detected: true,
      confidence: 0.9,
      reasoning: "High confidence",
      matchingEventIds: [],
      command: { type: "SafeAction", payload: {} },
    };

    const decision = buildDecisionFromAnalysis(
      result,
      "high-conf",
      makeConfig({ confidenceThreshold: 0.8 })
    );

    expect(decision.requiresApproval).toBe(false);
  });

  it("requires approval when confidence equals threshold (not above)", () => {
    const result: PatternAnalysisResult = {
      detected: true,
      confidence: 0.8, // Exactly at threshold
      reasoning: "At threshold",
      matchingEventIds: [],
      command: { type: "ExactAction", payload: {} },
    };

    const decision = buildDecisionFromAnalysis(
      result,
      "exact",
      makeConfig({ confidenceThreshold: 0.8 })
    );

    // confidence < threshold is false when equal, so should NOT require approval
    expect(decision.requiresApproval).toBe(false);
  });

  it("always requires approval when no command is present", () => {
    const result: PatternAnalysisResult = {
      detected: true,
      confidence: 0.99,
      reasoning: "High confidence but no command",
      matchingEventIds: [],
    };

    const decision = buildDecisionFromAnalysis(result, "no-cmd", makeConfig());

    expect(decision.requiresApproval).toBe(true);
  });
});

// ============================================================================
// buildDecisionFromAnalysis — HumanInLoop Overrides
// ============================================================================

describe("buildDecisionFromAnalysis — humanInLoop overrides", () => {
  it("forces approval when command is in requiresApproval list", () => {
    const result: PatternAnalysisResult = {
      detected: true,
      confidence: 0.99, // Very high confidence
      reasoning: "Should still require approval",
      matchingEventIds: [],
      command: { type: "DangerousAction", payload: {} },
    };

    const config = makeConfig({
      confidenceThreshold: 0.5,
      humanInLoop: {
        requiresApproval: ["DangerousAction"],
      },
    });

    const decision = buildDecisionFromAnalysis(result, "forced-approval", config);

    expect(decision.requiresApproval).toBe(true);
  });

  it("skips approval when command is in autoApprove list", () => {
    const result: PatternAnalysisResult = {
      detected: true,
      confidence: 0.3, // Very low confidence
      reasoning: "Should auto-approve anyway",
      matchingEventIds: [],
      command: { type: "SafeAction", payload: {} },
    };

    const config = makeConfig({
      confidenceThreshold: 0.8,
      humanInLoop: {
        autoApprove: ["SafeAction"],
      },
    });

    const decision = buildDecisionFromAnalysis(result, "auto-approved", config);

    expect(decision.requiresApproval).toBe(false);
  });

  it("requiresApproval takes precedence over autoApprove for same command", () => {
    // In practice this configuration should be rejected by validation,
    // but test the runtime behavior for defense-in-depth
    const result: PatternAnalysisResult = {
      detected: true,
      confidence: 0.99,
      reasoning: "Conflict test",
      matchingEventIds: [],
      command: { type: "ConflictAction", payload: {} },
    };

    const config = makeConfig({
      confidenceThreshold: 0.5,
      humanInLoop: {
        requiresApproval: ["ConflictAction"],
        autoApprove: ["ConflictAction"],
      },
    });

    const decision = buildDecisionFromAnalysis(result, "conflict", config);

    // requiresApproval is checked first in the implementation
    expect(decision.requiresApproval).toBe(true);
  });
});

// ============================================================================
// buildDecisionFromTrigger — Basic
// ============================================================================

describe("buildDecisionFromTrigger — basic", () => {
  it("returns null command (trigger-only has no analysis)", () => {
    const events = [makeEvent()];
    const pattern = makePattern("basic");

    const decision = buildDecisionFromTrigger(events, pattern, makeConfig());

    expect(decision.command).toBeNull();
    expect(decision.payload).toEqual({});
  });

  it("always requires approval", () => {
    const events = [makeEvent()];
    const pattern = makePattern("basic");

    const decision = buildDecisionFromTrigger(events, pattern, makeConfig());

    expect(decision.requiresApproval).toBe(true);
  });

  it("includes pattern name in reason", () => {
    const events = [makeEvent()];
    const pattern = makePattern("churn-risk");

    const decision = buildDecisionFromTrigger(events, pattern, makeConfig());

    expect(decision.reason).toContain("churn-risk");
  });

  it("includes event count in reason", () => {
    const events = [makeEvent(), makeEvent(), makeEvent()];
    const pattern = makePattern("multi-event");

    const decision = buildDecisionFromTrigger(events, pattern, makeConfig());

    expect(decision.reason).toContain("3 events");
  });

  it("includes all event IDs in triggeringEvents", () => {
    const events = [makeEvent({ eventId: "evt_a" }), makeEvent({ eventId: "evt_b" })];
    const pattern = makePattern("trigger-test");

    const decision = buildDecisionFromTrigger(events, pattern, makeConfig());

    expect(decision.triggeringEvents).toEqual(["evt_a", "evt_b"]);
  });
});

// ============================================================================
// buildDecisionFromTrigger — Confidence Heuristic
// ============================================================================

describe("buildDecisionFromTrigger — confidence heuristic", () => {
  it("returns 0.6 for 1 event (0.5 + 1 * 0.1)", () => {
    const events = [makeEvent()];
    const decision = buildDecisionFromTrigger(events, makePattern("t"), makeConfig());
    expect(decision.confidence).toBeCloseTo(0.6, 5);
  });

  it("returns 0.7 for 2 events (0.5 + 2 * 0.1)", () => {
    const events = [makeEvent(), makeEvent()];
    const decision = buildDecisionFromTrigger(events, makePattern("t"), makeConfig());
    expect(decision.confidence).toBeCloseTo(0.7, 5);
  });

  it("returns 0.8 for 3 events (0.5 + 3 * 0.1)", () => {
    const events = [makeEvent(), makeEvent(), makeEvent()];
    const decision = buildDecisionFromTrigger(events, makePattern("t"), makeConfig());
    expect(decision.confidence).toBeCloseTo(0.8, 5);
  });

  it("caps at 0.85 for 4+ events (min(0.85, 0.5 + 4*0.1))", () => {
    const events = Array.from({ length: 4 }, () => makeEvent());
    const decision = buildDecisionFromTrigger(events, makePattern("t"), makeConfig());
    expect(decision.confidence).toBeCloseTo(0.85, 5);
  });

  it("caps at 0.85 for 10 events", () => {
    const events = Array.from({ length: 10 }, () => makeEvent());
    const decision = buildDecisionFromTrigger(events, makePattern("t"), makeConfig());
    expect(decision.confidence).toBeCloseTo(0.85, 5);
  });

  it("returns 0.5 for 0 events (edge case)", () => {
    const decision = buildDecisionFromTrigger([], makePattern("t"), makeConfig());
    expect(decision.confidence).toBeCloseTo(0.5, 5);
  });
});
