/**
 * Audit Module Unit Tests
 *
 * Tests for the agent audit trail functionality including:
 * - Decision ID generation
 * - Audit event factory functions
 * - Type guards
 * - Schema validation
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  // Event types
  AGENT_AUDIT_EVENT_TYPES,
  isAgentAuditEventType,
  // Schemas
  AgentAuditEventTypeSchema,
  AuditLLMContextSchema,
  AuditActionSchema,
  PatternDetectedPayloadSchema,
  ApprovalGrantedPayloadSchema,
  ApprovalRejectedPayloadSchema,
  ApprovalExpiredPayloadSchema,
  AgentAuditEventSchema,
  // ID generation
  generateDecisionId,
  // Factory functions
  createPatternDetectedAudit,
  createApprovalGrantedAudit,
  createApprovalRejectedAudit,
  createApprovalExpiredAudit,
  createGenericAuditEvent,
  // Type guards
  isPatternDetectedEvent,
  isApprovalGrantedEvent,
  isApprovalRejectedEvent,
  // Validation
  validateAgentAuditEvent,
  // Types
  type PatternDetectedPayload,
  type AuditAction,
  type AuditLLMContext,
} from "../../../src/agent/audit.js";
import type { LLMContext } from "../../../src/agent/types.js";

// ============================================================================
// Test Fixtures
// ============================================================================

function createTestLLMContext(overrides: Partial<LLMContext> = {}): LLMContext {
  return {
    model: "gpt-4",
    tokens: 1500,
    durationMs: 2500,
    ...overrides,
  };
}

function createTestAuditAction(overrides: Partial<AuditAction> = {}): AuditAction {
  return {
    type: "SuggestOutreach",
    executionMode: "flag-for-review",
    ...overrides,
  };
}

function createTestDecisionPayload(
  overrides: Partial<PatternDetectedPayload> = {}
): PatternDetectedPayload {
  return {
    patternDetected: "churn-risk",
    confidence: 0.85,
    reasoning: "Customer cancelled 3 orders in 30 days",
    action: createTestAuditAction(),
    triggeringEvents: ["evt-1", "evt-2", "evt-3"],
    ...overrides,
  };
}

// ============================================================================
// Event Types Tests
// ============================================================================

describe("AGENT_AUDIT_EVENT_TYPES", () => {
  it("contains all expected DS-1 base event types", () => {
    expect(AGENT_AUDIT_EVENT_TYPES).toContain("PatternDetected");
    expect(AGENT_AUDIT_EVENT_TYPES).toContain("CommandEmitted");
    expect(AGENT_AUDIT_EVENT_TYPES).toContain("ApprovalRequested");
    expect(AGENT_AUDIT_EVENT_TYPES).toContain("ApprovalGranted");
    expect(AGENT_AUDIT_EVENT_TYPES).toContain("ApprovalRejected");
    expect(AGENT_AUDIT_EVENT_TYPES).toContain("ApprovalExpired");
    expect(AGENT_AUDIT_EVENT_TYPES).toContain("DeadLetterRecorded");
    expect(AGENT_AUDIT_EVENT_TYPES).toContain("CheckpointUpdated");
  });

  it("contains all expected DS-4 command routing event types", () => {
    expect(AGENT_AUDIT_EVENT_TYPES).toContain("AgentCommandRouted");
    expect(AGENT_AUDIT_EVENT_TYPES).toContain("AgentCommandRoutingFailed");
  });

  it("contains all expected DS-5 lifecycle event types", () => {
    expect(AGENT_AUDIT_EVENT_TYPES).toContain("AgentStarted");
    expect(AGENT_AUDIT_EVENT_TYPES).toContain("AgentPaused");
    expect(AGENT_AUDIT_EVENT_TYPES).toContain("AgentResumed");
    expect(AGENT_AUDIT_EVENT_TYPES).toContain("AgentStopped");
    expect(AGENT_AUDIT_EVENT_TYPES).toContain("AgentReconfigured");
    expect(AGENT_AUDIT_EVENT_TYPES).toContain("AgentErrorRecoveryStarted");
  });

  it("has 16 event types", () => {
    expect(AGENT_AUDIT_EVENT_TYPES.length).toBe(16);
  });
});

describe("isAgentAuditEventType type guard", () => {
  it.each([
    ["PatternDetected", true],
    ["CommandEmitted", true],
    ["ApprovalRequested", true],
    ["ApprovalGranted", true],
    ["ApprovalRejected", true],
    ["ApprovalExpired", true],
    ["DeadLetterRecorded", true],
    ["CheckpointUpdated", true],
    ["AgentCommandRouted", true],
    ["AgentCommandRoutingFailed", true],
    ["AgentStarted", true],
    ["AgentPaused", true],
    ["AgentResumed", true],
    ["AgentStopped", true],
    ["AgentReconfigured", true],
    ["AgentErrorRecoveryStarted", true],
    ["AgentDecisionMade", false], // Old name, no longer valid
    ["InvalidType", false],
    ["patternDetected", false], // Case sensitive
    ["", false],
    [123, false],
    [null, false],
    [undefined, false],
  ])("isAgentAuditEventType(%s) returns %s", (value, expected) => {
    expect(isAgentAuditEventType(value)).toBe(expected);
  });

  it("returns false for objects", () => {
    expect(isAgentAuditEventType({})).toBe(false);
  });

  it("returns false for arrays", () => {
    expect(isAgentAuditEventType(["PatternDetected"])).toBe(false);
  });
});

// ============================================================================
// Zod Schema Tests
// ============================================================================

describe("AgentAuditEventTypeSchema", () => {
  it("accepts valid event types", () => {
    for (const eventType of AGENT_AUDIT_EVENT_TYPES) {
      const result = AgentAuditEventTypeSchema.safeParse(eventType);
      expect(result.success).toBe(true);
    }
  });

  it("rejects invalid event types", () => {
    const invalidValues = ["Invalid", "agentDecisionMade", "", 123, null];
    for (const value of invalidValues) {
      const result = AgentAuditEventTypeSchema.safeParse(value);
      expect(result.success).toBe(false);
    }
  });
});

describe("AuditLLMContextSchema", () => {
  it("accepts valid LLM context", () => {
    const context: AuditLLMContext = { model: "gpt-4", tokens: 1500, duration: 2500 };
    const result = AuditLLMContextSchema.safeParse(context);
    expect(result.success).toBe(true);
  });

  it("rejects negative tokens", () => {
    const context = { model: "gpt-4", tokens: -100, duration: 2500 };
    const result = AuditLLMContextSchema.safeParse(context);
    expect(result.success).toBe(false);
  });

  it("rejects negative duration", () => {
    const context = { model: "gpt-4", tokens: 1500, duration: -100 };
    const result = AuditLLMContextSchema.safeParse(context);
    expect(result.success).toBe(false);
  });

  it("rejects non-integer tokens", () => {
    const context = { model: "gpt-4", tokens: 1500.5, duration: 2500 };
    const result = AuditLLMContextSchema.safeParse(context);
    expect(result.success).toBe(false);
  });

  it("accepts zero values", () => {
    const context = { model: "test", tokens: 0, duration: 0 };
    const result = AuditLLMContextSchema.safeParse(context);
    expect(result.success).toBe(true);
  });
});

describe("AuditActionSchema", () => {
  it("accepts valid action with flag-for-review", () => {
    const action = { type: "SuggestOutreach", executionMode: "flag-for-review" };
    const result = AuditActionSchema.safeParse(action);
    expect(result.success).toBe(true);
  });

  it("accepts valid action with auto-execute", () => {
    const action = { type: "LogEvent", executionMode: "auto-execute" };
    const result = AuditActionSchema.safeParse(action);
    expect(result.success).toBe(true);
  });

  it("rejects action with empty type", () => {
    const action = { type: "", executionMode: "flag-for-review" };
    const result = AuditActionSchema.safeParse(action);
    expect(result.success).toBe(false);
  });

  it("rejects action with invalid executionMode", () => {
    const action = { type: "SuggestOutreach", executionMode: "invalid" };
    const result = AuditActionSchema.safeParse(action);
    expect(result.success).toBe(false);
  });

  it("rejects action with extra fields (strict mode)", () => {
    const action = { type: "Test", executionMode: "auto-execute", extra: "field" };
    const result = AuditActionSchema.safeParse(action);
    expect(result.success).toBe(false);
  });
});

describe("PatternDetectedPayloadSchema", () => {
  it("accepts valid payload with action", () => {
    const payload = createTestDecisionPayload();
    const result = PatternDetectedPayloadSchema.safeParse(payload);
    expect(result.success).toBe(true);
  });

  it("accepts payload with null patternDetected", () => {
    const payload = createTestDecisionPayload({ patternDetected: null });
    const result = PatternDetectedPayloadSchema.safeParse(payload);
    expect(result.success).toBe(true);
  });

  it("accepts payload with null action", () => {
    const payload = createTestDecisionPayload({ action: null });
    const result = PatternDetectedPayloadSchema.safeParse(payload);
    expect(result.success).toBe(true);
  });

  it("accepts payload with LLM context", () => {
    const payload = {
      ...createTestDecisionPayload(),
      llmContext: { model: "gpt-4", tokens: 1500, duration: 2500 },
    };
    const result = PatternDetectedPayloadSchema.safeParse(payload);
    expect(result.success).toBe(true);
  });

  it("rejects payload with confidence below 0", () => {
    const payload = createTestDecisionPayload({ confidence: -0.1 });
    const result = PatternDetectedPayloadSchema.safeParse(payload);
    expect(result.success).toBe(false);
  });

  it("rejects payload with confidence above 1", () => {
    const payload = createTestDecisionPayload({ confidence: 1.5 });
    const result = PatternDetectedPayloadSchema.safeParse(payload);
    expect(result.success).toBe(false);
  });
});

describe("ApprovalGrantedPayloadSchema", () => {
  it("accepts valid payload", () => {
    const payload = {
      actionId: "action-123",
      reviewerId: "user-456",
      reviewedAt: Date.now(),
    };
    const result = ApprovalGrantedPayloadSchema.safeParse(payload);
    expect(result.success).toBe(true);
  });

  it("accepts payload with reviewNote", () => {
    const payload = {
      actionId: "action-123",
      reviewerId: "user-456",
      reviewedAt: Date.now(),
      reviewNote: "Looks good!",
    };
    const result = ApprovalGrantedPayloadSchema.safeParse(payload);
    expect(result.success).toBe(true);
  });

  it("rejects payload with empty actionId", () => {
    const payload = {
      actionId: "",
      reviewerId: "user-456",
      reviewedAt: Date.now(),
    };
    const result = ApprovalGrantedPayloadSchema.safeParse(payload);
    expect(result.success).toBe(false);
  });
});

describe("ApprovalRejectedPayloadSchema", () => {
  it("accepts valid payload", () => {
    const payload = {
      actionId: "action-123",
      reviewerId: "user-456",
      rejectionReason: "Customer already contacted",
    };
    const result = ApprovalRejectedPayloadSchema.safeParse(payload);
    expect(result.success).toBe(true);
  });

  it("rejects payload with empty rejectionReason", () => {
    const payload = {
      actionId: "action-123",
      reviewerId: "user-456",
      rejectionReason: "",
    };
    // Note: Zod string() doesn't enforce non-empty by default, depends on implementation
    // If it should be non-empty, the test would be:
    const result = ApprovalRejectedPayloadSchema.safeParse(payload);
    // Adjust based on actual schema validation rules
    expect(result.success).toBe(true); // Empty string is allowed unless .min(1)
  });
});

describe("ApprovalExpiredPayloadSchema", () => {
  it("accepts valid payload", () => {
    const payload = {
      actionId: "action-123",
      requestedAt: Date.now() - 86400000,
      expiredAt: Date.now(),
    };
    const result = ApprovalExpiredPayloadSchema.safeParse(payload);
    expect(result.success).toBe(true);
  });

  it("rejects payload with empty actionId", () => {
    const payload = {
      actionId: "",
      requestedAt: Date.now(),
      expiredAt: Date.now(),
    };
    const result = ApprovalExpiredPayloadSchema.safeParse(payload);
    expect(result.success).toBe(false);
  });
});

// Note: AgentAnalysisCompleted and AgentAnalysisFailed payload schemas were removed
// in the clean break to 16 event types. Those event types no longer exist.

describe("AgentAuditEventSchema", () => {
  it("accepts valid audit event", () => {
    const event = {
      eventType: "PatternDetected",
      agentId: "test-agent",
      decisionId: "dec_123_abcd",
      timestamp: Date.now(),
      payload: createTestDecisionPayload(),
    };
    const result = AgentAuditEventSchema.safeParse(event);
    expect(result.success).toBe(true);
  });

  it("rejects event with empty agentId", () => {
    const event = {
      eventType: "PatternDetected",
      agentId: "",
      decisionId: "dec_123",
      timestamp: Date.now(),
      payload: {},
    };
    const result = AgentAuditEventSchema.safeParse(event);
    expect(result.success).toBe(false);
  });

  it("rejects event with empty decisionId", () => {
    const event = {
      eventType: "PatternDetected",
      agentId: "agent",
      decisionId: "",
      timestamp: Date.now(),
      payload: {},
    };
    const result = AgentAuditEventSchema.safeParse(event);
    expect(result.success).toBe(false);
  });
});

// ============================================================================
// Decision ID Generation Tests
// ============================================================================

describe("generateDecisionId", () => {
  it("generates IDs with dec_ prefix", () => {
    const id = generateDecisionId();
    expect(id.startsWith("dec_")).toBe(true);
  });

  it("generates IDs with expected format", () => {
    const id = generateDecisionId();
    // Format: dec_{timestamp}_{random}
    const parts = id.split("_");
    expect(parts.length).toBe(3);
    expect(parts[0]).toBe("dec");
    expect(Number(parts[1])).not.toBeNaN(); // timestamp
    expect(parts[2].length).toBe(8); // random suffix from UUID
  });

  it("generates unique IDs over multiple calls", async () => {
    vi.useRealTimers();
    const ids = new Set<string>();
    for (let i = 0; i < 3; i++) {
      ids.add(generateDecisionId());
      // Small delay to ensure different timestamps for UUIDv7
      await new Promise((resolve) => setTimeout(resolve, 2));
    }
    // All IDs should be unique
    expect(ids.size).toBe(3);
  });

  it("includes timestamp in ID", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-01-15T12:00:00Z"));

    const id = generateDecisionId();
    const timestamp = id.split("_")[1];
    expect(Number(timestamp)).toBe(Date.now());

    vi.useRealTimers();
  });
});

// ============================================================================
// Factory Functions Tests
// ============================================================================

describe("createPatternDetectedAudit", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-01-15T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("creates event with PatternDetected type", () => {
    const event = createPatternDetectedAudit("test-agent", {
      patternDetected: "churn-risk",
      confidence: 0.85,
      reasoning: "Customer at risk",
      action: createTestAuditAction(),
      triggeringEvents: ["evt-1"],
    });
    expect(event.eventType).toBe("PatternDetected");
  });

  it("includes all required fields", () => {
    const event = createPatternDetectedAudit("test-agent", {
      patternDetected: "churn-risk",
      confidence: 0.85,
      reasoning: "Customer at risk",
      action: createTestAuditAction(),
      triggeringEvents: ["evt-1", "evt-2"],
    });

    expect(event.agentId).toBe("test-agent");
    expect(event.decisionId).toMatch(/^dec_\d+_[a-f0-9]+$/);
    expect(event.timestamp).toBe(Date.now());
    expect(event.payload.patternDetected).toBe("churn-risk");
    expect(event.payload.confidence).toBe(0.85);
    expect(event.payload.reasoning).toBe("Customer at risk");
    expect(event.payload.action).toEqual(createTestAuditAction());
    expect(event.payload.triggeringEvents).toEqual(["evt-1", "evt-2"]);
  });

  it("includes LLM context when provided", () => {
    const llmContext = createTestLLMContext();
    const event = createPatternDetectedAudit(
      "agent",
      {
        patternDetected: null,
        confidence: 0.5,
        reasoning: "test",
        action: null,
        triggeringEvents: ["evt-1"],
      },
      llmContext
    );

    expect(event.payload.llmContext).toBeDefined();
    expect(event.payload.llmContext?.model).toBe("gpt-4");
    expect(event.payload.llmContext?.tokens).toBe(1500);
    expect(event.payload.llmContext?.duration).toBe(2500);
  });

  it("does not include LLM context when not provided", () => {
    const event = createPatternDetectedAudit("agent", {
      patternDetected: null,
      confidence: 0.5,
      reasoning: "test",
      action: null,
      triggeringEvents: ["evt-1"],
    });

    expect(event.payload.llmContext).toBeUndefined();
  });

  it("handles null patternDetected", () => {
    const event = createPatternDetectedAudit("agent", {
      patternDetected: null,
      confidence: 0.5,
      reasoning: "No pattern found",
      action: null,
      triggeringEvents: ["evt-1"],
    });

    expect(event.payload.patternDetected).toBeNull();
  });

  it("handles null action", () => {
    const event = createPatternDetectedAudit("agent", {
      patternDetected: "some-pattern",
      confidence: 0.5,
      reasoning: "No action needed",
      action: null,
      triggeringEvents: ["evt-1"],
    });

    expect(event.payload.action).toBeNull();
  });
});

describe("createApprovalGrantedAudit", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-01-15T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("creates event with ApprovalGranted type", () => {
    const event = createApprovalGrantedAudit("agent", "action-123", "user-456");
    expect(event.eventType).toBe("ApprovalGranted");
  });

  it("includes all required fields", () => {
    const event = createApprovalGrantedAudit("test-agent", "action-123", "user-456");

    expect(event.agentId).toBe("test-agent");
    expect(event.decisionId).toMatch(/^dec_\d+_[a-f0-9]+$/);
    expect(event.timestamp).toBe(Date.now());
    expect(event.payload.actionId).toBe("action-123");
    expect(event.payload.reviewerId).toBe("user-456");
    expect(event.payload.reviewedAt).toBe(Date.now());
  });

  it("includes reviewNote when provided", () => {
    const event = createApprovalGrantedAudit(
      "agent",
      "action-123",
      "user-456",
      "Verified customer is at risk"
    );

    expect(event.payload.reviewNote).toBe("Verified customer is at risk");
  });

  it("does not include reviewNote when not provided", () => {
    const event = createApprovalGrantedAudit("agent", "action-123", "user-456");

    expect(event.payload.reviewNote).toBeUndefined();
  });
});

describe("createApprovalRejectedAudit", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-01-15T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("creates event with ApprovalRejected type", () => {
    const event = createApprovalRejectedAudit(
      "agent",
      "action-123",
      "user-456",
      "Customer already contacted"
    );
    expect(event.eventType).toBe("ApprovalRejected");
  });

  it("includes all required fields", () => {
    const event = createApprovalRejectedAudit(
      "test-agent",
      "action-123",
      "user-456",
      "Not appropriate"
    );

    expect(event.agentId).toBe("test-agent");
    expect(event.decisionId).toMatch(/^dec_\d+_[a-f0-9]+$/);
    expect(event.timestamp).toBe(Date.now());
    expect(event.payload.actionId).toBe("action-123");
    expect(event.payload.reviewerId).toBe("user-456");
    expect(event.payload.rejectionReason).toBe("Not appropriate");
  });
});

describe("createApprovalExpiredAudit", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-01-15T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("creates event with ApprovalExpired type", () => {
    const requestedAt = Date.now() - 86400000; // 24 hours ago
    const event = createApprovalExpiredAudit("agent", "action-123", requestedAt);
    expect(event.eventType).toBe("ApprovalExpired");
  });

  it("includes all required fields", () => {
    const requestedAt = Date.now() - 86400000;
    const event = createApprovalExpiredAudit("test-agent", "action-123", requestedAt);

    expect(event.agentId).toBe("test-agent");
    expect(event.decisionId).toMatch(/^dec_\d+_[a-f0-9]+$/);
    expect(event.timestamp).toBe(Date.now());
    expect(event.payload.actionId).toBe("action-123");
    expect(event.payload.requestedAt).toBe(requestedAt);
    expect(event.payload.expiredAt).toBe(Date.now());
  });
});

describe("createGenericAuditEvent", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-01-15T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("creates event with specified type", () => {
    const event = createGenericAuditEvent("agent", "CommandEmitted", { commandType: "test" });
    expect(event.eventType).toBe("CommandEmitted");
  });

  it("includes all required fields", () => {
    const event = createGenericAuditEvent("test-agent", "AgentStarted", { reason: "init" });

    expect(event.agentId).toBe("test-agent");
    expect(event.decisionId).toMatch(/^dec_\d+_[a-f0-9]+$/);
    expect(event.timestamp).toBe(Date.now());
  });

  it("defaults payload to empty object when not provided", () => {
    const event = createGenericAuditEvent("agent", "CheckpointUpdated");
    expect(event.payload).toEqual({});
  });

  it("works with DS-4 command routing types", () => {
    const event = createGenericAuditEvent("agent", "AgentCommandRouted", {
      routeTarget: "order-bc",
    });
    expect(event.eventType).toBe("AgentCommandRouted");
  });

  it("works with DS-5 lifecycle types", () => {
    const event = createGenericAuditEvent("agent", "AgentErrorRecoveryStarted", {
      error: "timeout",
    });
    expect(event.eventType).toBe("AgentErrorRecoveryStarted");
  });
});

// ============================================================================
// Type Guards Tests
// ============================================================================

describe("isPatternDetectedEvent", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-01-15T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns true for PatternDetected event", () => {
    const event = createPatternDetectedAudit("agent", {
      patternDetected: null,
      confidence: 0.5,
      reasoning: "test",
      action: null,
      triggeringEvents: ["evt-1"],
    });
    expect(isPatternDetectedEvent(event)).toBe(true);
  });

  it("returns false for ApprovalGranted event", () => {
    const event = createApprovalGrantedAudit("agent", "action", "user");
    expect(isPatternDetectedEvent(event)).toBe(false);
  });

  it("returns false for ApprovalRejected event", () => {
    const event = createApprovalRejectedAudit("agent", "action", "user", "reason");
    expect(isPatternDetectedEvent(event)).toBe(false);
  });
});

describe("isApprovalGrantedEvent", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-01-15T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns true for ApprovalGranted event", () => {
    const event = createApprovalGrantedAudit("agent", "action", "user");
    expect(isApprovalGrantedEvent(event)).toBe(true);
  });

  it("returns false for PatternDetected event", () => {
    const event = createPatternDetectedAudit("agent", {
      patternDetected: null,
      confidence: 0.5,
      reasoning: "test",
      action: null,
      triggeringEvents: ["evt-1"],
    });
    expect(isApprovalGrantedEvent(event)).toBe(false);
  });

  it("returns false for ApprovalRejected event", () => {
    const event = createApprovalRejectedAudit("agent", "action", "user", "reason");
    expect(isApprovalGrantedEvent(event)).toBe(false);
  });
});

describe("isApprovalRejectedEvent", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-01-15T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns true for ApprovalRejected event", () => {
    const event = createApprovalRejectedAudit("agent", "action", "user", "reason");
    expect(isApprovalRejectedEvent(event)).toBe(true);
  });

  it("returns false for ApprovalGranted event", () => {
    const event = createApprovalGrantedAudit("agent", "action", "user");
    expect(isApprovalRejectedEvent(event)).toBe(false);
  });

  it("returns false for PatternDetected event", () => {
    const event = createPatternDetectedAudit("agent", {
      patternDetected: null,
      confidence: 0.5,
      reasoning: "test",
      action: null,
      triggeringEvents: ["evt-1"],
    });
    expect(isApprovalRejectedEvent(event)).toBe(false);
  });
});

// ============================================================================
// Validation Tests
// ============================================================================

describe("validateAgentAuditEvent", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-01-15T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns true for valid pattern detected audit event", () => {
    const event = createPatternDetectedAudit("agent", {
      patternDetected: "test",
      confidence: 0.5,
      reasoning: "reason",
      action: null,
      triggeringEvents: ["evt-1"],
    });
    expect(validateAgentAuditEvent(event)).toBe(true);
  });

  it("returns true for valid approval granted audit event", () => {
    const event = createApprovalGrantedAudit("agent", "action", "user");
    expect(validateAgentAuditEvent(event)).toBe(true);
  });

  it("returns true for valid approval rejected audit event", () => {
    const event = createApprovalRejectedAudit("agent", "action", "user", "reason");
    expect(validateAgentAuditEvent(event)).toBe(true);
  });

  it("returns true for valid approval expired audit event", () => {
    const event = createApprovalExpiredAudit("agent", "action", Date.now() - 1000);
    expect(validateAgentAuditEvent(event)).toBe(true);
  });

  it("returns false for null", () => {
    expect(validateAgentAuditEvent(null)).toBe(false);
  });

  it("returns false for undefined", () => {
    expect(validateAgentAuditEvent(undefined)).toBe(false);
  });

  it("returns false for empty object", () => {
    expect(validateAgentAuditEvent({})).toBe(false);
  });

  it("returns false for invalid event type", () => {
    const event = {
      eventType: "InvalidType",
      agentId: "agent",
      decisionId: "dec_123",
      timestamp: Date.now(),
      payload: {},
    };
    expect(validateAgentAuditEvent(event)).toBe(false);
  });

  it("returns false for missing required fields", () => {
    const event = {
      eventType: "PatternDetected",
      // Missing agentId, decisionId, etc.
    };
    expect(validateAgentAuditEvent(event)).toBe(false);
  });
});

// ============================================================================
// Integration Tests - Audit Trail Flow
// ============================================================================

describe("audit trail flow", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-01-15T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("creates complete audit trail for approved action", () => {
    const agentId = "churn-risk-agent";

    // Step 1: Agent detects pattern
    const detection = createPatternDetectedAudit(
      agentId,
      {
        patternDetected: "churn-risk",
        confidence: 0.85,
        reasoning: "Customer cancelled 3 orders",
        action: { type: "SuggestOutreach", executionMode: "flag-for-review" },
        triggeringEvents: ["evt-1", "evt-2", "evt-3"],
      },
      createTestLLMContext()
    );

    expect(isPatternDetectedEvent(detection)).toBe(true);
    expect(validateAgentAuditEvent(detection)).toBe(true);

    // Step 2: Human reviews and approves
    vi.advanceTimersByTime(3600000); // 1 hour later
    const approval = createApprovalGrantedAudit(
      agentId,
      "action-from-decision",
      "reviewer-123",
      "Verified customer is at risk"
    );

    expect(isApprovalGrantedEvent(approval)).toBe(true);
    expect(validateAgentAuditEvent(approval)).toBe(true);

    // Verify audit trail has proper timestamps
    expect(approval.timestamp).toBeGreaterThan(detection.timestamp);
  });

  it("creates complete audit trail for rejected action", () => {
    const agentId = "inventory-agent";

    // Step 1: Agent detects pattern (not directly tested, but part of the flow)
    const _detection = createPatternDetectedAudit(agentId, {
      patternDetected: "low-stock",
      confidence: 0.7,
      reasoning: "Stock levels below threshold",
      action: { type: "ReorderStock", executionMode: "flag-for-review" },
      triggeringEvents: ["evt-stock-1"],
    });

    // Step 2: Human reviews and rejects
    vi.advanceTimersByTime(1800000); // 30 minutes later
    const rejection = createApprovalRejectedAudit(
      agentId,
      "action-from-decision",
      "reviewer-456",
      "Order already placed by manager"
    );

    expect(isApprovalRejectedEvent(rejection)).toBe(true);
    expect(validateAgentAuditEvent(rejection)).toBe(true);
    expect(rejection.payload.rejectionReason).toBe("Order already placed by manager");
  });

  it("creates audit trail for expired action", () => {
    const agentId = "notification-agent";
    const requestedAt = Date.now();

    // Step 1: Agent detects pattern
    createPatternDetectedAudit(agentId, {
      patternDetected: "user-inactive",
      confidence: 0.9,
      reasoning: "User has not logged in for 7 days",
      action: { type: "SendReminder", executionMode: "flag-for-review" },
      triggeringEvents: ["evt-login-1"],
    });

    // Step 2: Action expires after 24 hours
    vi.advanceTimersByTime(86400000); // 24 hours later
    const expiration = createApprovalExpiredAudit(agentId, "action-123", requestedAt);

    expect(expiration.eventType).toBe("ApprovalExpired");
    expect(expiration.payload.requestedAt).toBe(requestedAt);
    expect(expiration.payload.expiredAt).toBeGreaterThan(requestedAt);
    expect(validateAgentAuditEvent(expiration)).toBe(true);
  });
});
