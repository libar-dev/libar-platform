/**
 * Dead Letter Module Unit Tests
 *
 * Tests for the agent dead letter queue functionality including:
 * - Error message sanitization
 * - Factory functions
 * - Status transitions
 * - Type guards and validation
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  // Error codes
  DEAD_LETTER_ERROR_CODES,
  // Status types
  AGENT_DEAD_LETTER_STATUSES,
  isAgentDeadLetterStatus,
  // Schemas
  AgentDeadLetterStatusSchema,
  AgentDeadLetterContextSchema,
  AgentDeadLetterSchema,
  // Sanitization
  sanitizeErrorMessage,
  // Factory functions
  createAgentDeadLetter,
  incrementDeadLetterAttempt,
  // Status transitions
  markDeadLetterReplayed,
  markDeadLetterIgnored,
  // Type guards
  isDeadLetterPending,
  isDeadLetterReplayed,
  isDeadLetterIgnored,
  // Validation
  validateAgentDeadLetter,
  // Types
  type AgentDeadLetter,
  type AgentDeadLetterContext,
} from "../../../src/agent/dead-letter.js";

// ============================================================================
// Test Fixtures
// ============================================================================

function createTestDeadLetter(overrides: Partial<AgentDeadLetter> = {}): AgentDeadLetter {
  return {
    agentId: "test-agent",
    subscriptionId: "sub-001",
    eventId: "evt-123",
    globalPosition: 1000,
    error: "Test error message",
    attemptCount: 1,
    status: "pending",
    failedAt: Date.now(),
    ...overrides,
  };
}

function createTestContext(
  overrides: Partial<AgentDeadLetterContext> = {}
): AgentDeadLetterContext {
  return {
    correlationId: "corr-123",
    errorCode: "LLM_TIMEOUT",
    triggeringPattern: "churn-risk",
    ...overrides,
  };
}

// ============================================================================
// Error Codes Tests
// ============================================================================

describe("DEAD_LETTER_ERROR_CODES", () => {
  it("contains all expected error codes", () => {
    expect(DEAD_LETTER_ERROR_CODES.DEAD_LETTER_NOT_FOUND).toBe("DEAD_LETTER_NOT_FOUND");
    expect(DEAD_LETTER_ERROR_CODES.INVALID_STATUS_TRANSITION).toBe("INVALID_STATUS_TRANSITION");
    expect(DEAD_LETTER_ERROR_CODES.ALREADY_PROCESSED).toBe("ALREADY_PROCESSED");
  });

  it("has 3 error codes", () => {
    expect(Object.keys(DEAD_LETTER_ERROR_CODES).length).toBe(3);
  });
});

// ============================================================================
// Status Types Tests
// ============================================================================

describe("AGENT_DEAD_LETTER_STATUSES", () => {
  it("contains all three statuses", () => {
    expect(AGENT_DEAD_LETTER_STATUSES).toEqual(["pending", "replayed", "ignored"]);
  });

  it("is a readonly tuple with 3 elements", () => {
    expect(Array.isArray(AGENT_DEAD_LETTER_STATUSES)).toBe(true);
    expect(AGENT_DEAD_LETTER_STATUSES.length).toBe(3);
  });
});

describe("isAgentDeadLetterStatus type guard", () => {
  it.each([
    ["pending", true],
    ["replayed", true],
    ["ignored", true],
    ["invalid", false],
    ["PENDING", false],
    ["Replayed", false],
    ["", false],
    [123, false],
    [null, false],
    [undefined, false],
  ])("isAgentDeadLetterStatus(%s) returns %s", (value, expected) => {
    expect(isAgentDeadLetterStatus(value)).toBe(expected);
  });

  it("returns false for objects", () => {
    expect(isAgentDeadLetterStatus({})).toBe(false);
  });

  it("returns false for arrays", () => {
    expect(isAgentDeadLetterStatus(["pending"])).toBe(false);
  });
});

// ============================================================================
// Zod Schema Tests
// ============================================================================

describe("AgentDeadLetterStatusSchema", () => {
  it("accepts valid statuses", () => {
    for (const status of AGENT_DEAD_LETTER_STATUSES) {
      const result = AgentDeadLetterStatusSchema.safeParse(status);
      expect(result.success).toBe(true);
    }
  });

  it("rejects invalid statuses", () => {
    const invalidValues = ["processing", "PENDING", "Ignored", "", 123, null];
    for (const value of invalidValues) {
      const result = AgentDeadLetterStatusSchema.safeParse(value);
      expect(result.success).toBe(false);
    }
  });
});

describe("AgentDeadLetterContextSchema", () => {
  it("accepts valid context with all fields", () => {
    const context = createTestContext();
    const result = AgentDeadLetterContextSchema.safeParse(context);
    expect(result.success).toBe(true);
  });

  it("accepts context with only correlationId", () => {
    const context = { correlationId: "corr-123" };
    const result = AgentDeadLetterContextSchema.safeParse(context);
    expect(result.success).toBe(true);
  });

  it("accepts context with only errorCode", () => {
    const context = { errorCode: "LLM_TIMEOUT" };
    const result = AgentDeadLetterContextSchema.safeParse(context);
    expect(result.success).toBe(true);
  });

  it("accepts empty context object", () => {
    const result = AgentDeadLetterContextSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it("rejects context with unknown fields (strict mode)", () => {
    const context = { correlationId: "corr-123", unknownField: "value" };
    const result = AgentDeadLetterContextSchema.safeParse(context);
    expect(result.success).toBe(false);
  });
});

describe("AgentDeadLetterSchema", () => {
  it("accepts valid dead letter", () => {
    const deadLetter = createTestDeadLetter();
    const result = AgentDeadLetterSchema.safeParse(deadLetter);
    expect(result.success).toBe(true);
  });

  it("accepts dead letter with context", () => {
    const deadLetter = createTestDeadLetter({ context: createTestContext() });
    const result = AgentDeadLetterSchema.safeParse(deadLetter);
    expect(result.success).toBe(true);
  });

  it("rejects dead letter with empty agentId", () => {
    const deadLetter = { ...createTestDeadLetter(), agentId: "" };
    const result = AgentDeadLetterSchema.safeParse(deadLetter);
    expect(result.success).toBe(false);
  });

  it("rejects dead letter with empty subscriptionId", () => {
    const deadLetter = { ...createTestDeadLetter(), subscriptionId: "" };
    const result = AgentDeadLetterSchema.safeParse(deadLetter);
    expect(result.success).toBe(false);
  });

  it("rejects dead letter with empty eventId", () => {
    const deadLetter = { ...createTestDeadLetter(), eventId: "" };
    const result = AgentDeadLetterSchema.safeParse(deadLetter);
    expect(result.success).toBe(false);
  });

  it("rejects dead letter with negative globalPosition", () => {
    const deadLetter = { ...createTestDeadLetter(), globalPosition: -1 };
    const result = AgentDeadLetterSchema.safeParse(deadLetter);
    expect(result.success).toBe(false);
  });

  it("accepts dead letter with globalPosition of 0", () => {
    const deadLetter = createTestDeadLetter({ globalPosition: 0 });
    const result = AgentDeadLetterSchema.safeParse(deadLetter);
    expect(result.success).toBe(true);
  });

  it("rejects dead letter with non-positive attemptCount", () => {
    const deadLetter = { ...createTestDeadLetter(), attemptCount: 0 };
    const result = AgentDeadLetterSchema.safeParse(deadLetter);
    expect(result.success).toBe(false);
  });

  it("rejects dead letter with missing required fields", () => {
    const result = AgentDeadLetterSchema.safeParse({ agentId: "test" });
    expect(result.success).toBe(false);
  });
});

// ============================================================================
// Error Message Sanitization Tests
// ============================================================================

describe("sanitizeErrorMessage", () => {
  describe("removes stack traces", () => {
    it("removes content after 'at' when followed by path-like content", () => {
      // The STACK_TRACE_PATTERN matches " at " followed by anything
      // This catches both real stack traces AND " at /path/..." patterns
      const error = "Error occurred at /app/src/agent.ts:42:10";
      const sanitized = sanitizeErrorMessage(error);
      expect(sanitized).not.toContain("/app/src/agent.ts:42:10");
      expect(sanitized).toBe("Error occurred");
    });

    it("removes multi-line stack traces", () => {
      const error = `Error: Something failed
    at processEvent (/app/src/handler.ts:100:5)
    at runAgent (/app/src/agent.ts:50:10)`;
      const sanitized = sanitizeErrorMessage(error);
      expect(sanitized).not.toContain("at processEvent");
      expect(sanitized).not.toContain("at runAgent");
    });

    it("preserves the error message itself", () => {
      const error = "LLM timeout during analysis";
      const sanitized = sanitizeErrorMessage(error);
      expect(sanitized).toContain("LLM timeout during analysis");
    });
  });

  describe("removes file paths", () => {
    it("removes TypeScript file paths with 'at' prefix", () => {
      // Note: The " at " is caught by stack trace pattern first
      const error = "Failed at /app/src/agent.ts";
      const sanitized = sanitizeErrorMessage(error);
      expect(sanitized).not.toContain("/app/src/agent.ts");
      expect(sanitized).toBe("Failed");
    });

    it("replaces file paths without 'at' prefix with [path]", () => {
      // When there's no " at " pattern, the file path is replaced with [path]
      const error = "Error in /dist/handler.js:100:5";
      const sanitized = sanitizeErrorMessage(error);
      expect(sanitized).not.toContain("/dist/handler.js");
      expect(sanitized).toBe("Error in [path]");
    });

    it("removes ESM file paths when preceded by 'at'", () => {
      const error = "Module error at /lib/module.mjs";
      const sanitized = sanitizeErrorMessage(error);
      expect(sanitized).not.toContain("/lib/module.mjs");
      expect(sanitized).toBe("Module error");
    });

    it("replaces CJS file paths with [path] when not preceded by 'at'", () => {
      const error = "Require failed for /lib/module.cjs";
      const sanitized = sanitizeErrorMessage(error);
      expect(sanitized).not.toContain("/lib/module.cjs");
      expect(sanitized).toBe("Require failed for [path]");
    });

    it("removes paths with line and column numbers", () => {
      // Stack trace pattern catches this due to " at " pattern
      const error = "Error at /path/to/file.ts:42:10";
      const sanitized = sanitizeErrorMessage(error);
      expect(sanitized).not.toContain(":42:10");
    });
  });

  describe("truncates at 500 chars", () => {
    it("truncates long messages", () => {
      const error = "A".repeat(600);
      const sanitized = sanitizeErrorMessage(error);
      expect(sanitized.length).toBe(500);
      expect(sanitized.endsWith("...")).toBe(true);
    });

    it("does not truncate messages under 500 chars", () => {
      const error = "A".repeat(400);
      const sanitized = sanitizeErrorMessage(error);
      expect(sanitized.length).toBe(400);
      expect(sanitized.endsWith("...")).toBe(false);
    });

    it("truncates at exactly 500 chars", () => {
      const error = "A".repeat(500);
      const sanitized = sanitizeErrorMessage(error);
      expect(sanitized.length).toBe(500);
      expect(sanitized.endsWith("...")).toBe(false);
    });

    it("truncated message ends with '...'", () => {
      const error = "B".repeat(600);
      const sanitized = sanitizeErrorMessage(error);
      expect(sanitized.slice(-3)).toBe("...");
    });
  });

  describe("handles different input types", () => {
    it("handles Error objects", () => {
      const error = new Error("Test error message");
      const sanitized = sanitizeErrorMessage(error);
      expect(sanitized).toContain("Test error message");
    });

    it("handles string errors", () => {
      const error = "String error message";
      const sanitized = sanitizeErrorMessage(error);
      expect(sanitized).toBe("String error message");
    });

    it("handles objects with message property", () => {
      const error = { message: "Object error message" };
      const sanitized = sanitizeErrorMessage(error);
      expect(sanitized).toContain("Object error message");
    });

    it("handles unknown error types", () => {
      const error = { code: 500 }; // No message property
      const sanitized = sanitizeErrorMessage(error);
      expect(sanitized).toBe("Unknown error");
    });

    it("handles null", () => {
      const sanitized = sanitizeErrorMessage(null);
      expect(sanitized).toBe("Unknown error");
    });

    it("handles undefined", () => {
      const sanitized = sanitizeErrorMessage(undefined);
      expect(sanitized).toBe("Unknown error");
    });

    it("handles empty string", () => {
      const sanitized = sanitizeErrorMessage("");
      expect(sanitized).toBe("Unknown error");
    });
  });

  describe("normalizes whitespace", () => {
    it("collapses multiple spaces", () => {
      const error = "Error    with    multiple    spaces";
      const sanitized = sanitizeErrorMessage(error);
      expect(sanitized).toBe("Error with multiple spaces");
    });

    it("trims leading and trailing whitespace", () => {
      const error = "   Error with surrounding whitespace   ";
      const sanitized = sanitizeErrorMessage(error);
      expect(sanitized).toBe("Error with surrounding whitespace");
    });

    it("handles newlines", () => {
      const error = "Error\non\nmultiple\nlines";
      const sanitized = sanitizeErrorMessage(error);
      expect(sanitized).toBe("Error on multiple lines");
    });
  });
});

// ============================================================================
// Factory Functions Tests
// ============================================================================

describe("createAgentDeadLetter", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-01-15T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("creates dead letter with required fields", () => {
    const deadLetter = createAgentDeadLetter(
      "test-agent",
      "sub-001",
      "evt-123",
      1000,
      "Error message"
    );

    expect(deadLetter.agentId).toBe("test-agent");
    expect(deadLetter.subscriptionId).toBe("sub-001");
    expect(deadLetter.eventId).toBe("evt-123");
    expect(deadLetter.globalPosition).toBe(1000);
    expect(deadLetter.error).toBe("Error message");
  });

  it("creates dead letter with pending status", () => {
    const deadLetter = createAgentDeadLetter("agent", "sub", "evt", 0, "error");
    expect(deadLetter.status).toBe("pending");
  });

  it("sets attemptCount to 1", () => {
    const deadLetter = createAgentDeadLetter("agent", "sub", "evt", 0, "error");
    expect(deadLetter.attemptCount).toBe(1);
  });

  it("sets failedAt to current time", () => {
    const deadLetter = createAgentDeadLetter("agent", "sub", "evt", 0, "error");
    expect(deadLetter.failedAt).toBe(Date.now());
  });

  it("includes context when provided", () => {
    const context = createTestContext();
    const deadLetter = createAgentDeadLetter("agent", "sub", "evt", 0, "error", context);
    expect(deadLetter.context).toEqual(context);
  });

  it("does not include context when not provided", () => {
    const deadLetter = createAgentDeadLetter("agent", "sub", "evt", 0, "error");
    expect(deadLetter.context).toBeUndefined();
  });

  describe("error sanitization", () => {
    it("sanitizes Error objects removing stack-like patterns", () => {
      // The " at " pattern is caught by stack trace removal
      const error = new Error("Error at /app/src/handler.ts:42");
      const deadLetter = createAgentDeadLetter("agent", "sub", "evt", 0, error);
      expect(deadLetter.error).toBe("Error");
      expect(deadLetter.error).not.toContain("/app/src/handler.ts");
    });

    it("sanitizes string errors", () => {
      const deadLetter = createAgentDeadLetter(
        "agent",
        "sub",
        "evt",
        0,
        "Error at /app/src/handler.ts:42"
      );
      // " at " pattern is caught by stack trace removal
      expect(deadLetter.error).toBe("Error");
    });

    it("replaces paths in errors without 'at' prefix", () => {
      const deadLetter = createAgentDeadLetter(
        "agent",
        "sub",
        "evt",
        0,
        "Failed loading /app/src/handler.ts"
      );
      // Path is replaced with [path] when not preceded by " at "
      expect(deadLetter.error).toBe("Failed loading [path]");
    });

    it("replaces paths with line:col suffix", () => {
      const deadLetter = createAgentDeadLetter(
        "agent",
        "sub",
        "evt",
        0,
        "Failed loading /app/src/handler.ts:42:10"
      );
      // Path with :line:col is fully replaced
      expect(deadLetter.error).toBe("Failed loading [path]");
    });

    it("sanitizes unknown error types", () => {
      const deadLetter = createAgentDeadLetter("agent", "sub", "evt", 0, { code: 500 });
      expect(deadLetter.error).toBe("Unknown error");
    });
  });
});

describe("incrementDeadLetterAttempt", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-01-15T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("increments attemptCount", () => {
    const deadLetter = createTestDeadLetter({ attemptCount: 1 });
    const updated = incrementDeadLetterAttempt(deadLetter, "New error");
    expect(updated.attemptCount).toBe(2);
  });

  it("updates error message", () => {
    const deadLetter = createTestDeadLetter({ error: "Old error" });
    const updated = incrementDeadLetterAttempt(deadLetter, "New error");
    expect(updated.error).toBe("New error");
  });

  it("sanitizes new error message", () => {
    const deadLetter = createTestDeadLetter();
    // " at " pattern is caught by stack trace removal
    const updated = incrementDeadLetterAttempt(deadLetter, "Error at /app/file.ts:10");
    expect(updated.error).toBe("Error");
  });

  it("sanitizes new error message with [path] when no 'at' prefix", () => {
    const deadLetter = createTestDeadLetter();
    const updated = incrementDeadLetterAttempt(deadLetter, "Failed loading /app/file.ts");
    expect(updated.error).toBe("Failed loading [path]");
  });

  it("updates failedAt to current time", () => {
    const oldTime = Date.now() - 10000;
    const deadLetter = createTestDeadLetter({ failedAt: oldTime });
    const updated = incrementDeadLetterAttempt(deadLetter, "New error");
    expect(updated.failedAt).toBe(Date.now());
    expect(updated.failedAt).not.toBe(oldTime);
  });

  it("preserves other fields", () => {
    const deadLetter = createTestDeadLetter({
      agentId: "my-agent",
      subscriptionId: "my-sub",
      eventId: "my-evt",
      globalPosition: 500,
      status: "pending",
      context: createTestContext(),
    });
    const updated = incrementDeadLetterAttempt(deadLetter, "New error");

    expect(updated.agentId).toBe("my-agent");
    expect(updated.subscriptionId).toBe("my-sub");
    expect(updated.eventId).toBe("my-evt");
    expect(updated.globalPosition).toBe(500);
    expect(updated.status).toBe("pending");
    expect(updated.context).toEqual(createTestContext());
  });

  it("handles multiple increments", () => {
    let deadLetter = createTestDeadLetter({ attemptCount: 1 });
    deadLetter = incrementDeadLetterAttempt(deadLetter, "Retry 1");
    deadLetter = incrementDeadLetterAttempt(deadLetter, "Retry 2");
    deadLetter = incrementDeadLetterAttempt(deadLetter, "Retry 3");
    expect(deadLetter.attemptCount).toBe(4);
    expect(deadLetter.error).toBe("Retry 3");
  });
});

// ============================================================================
// Status Transition Tests
// ============================================================================

describe("markDeadLetterReplayed", () => {
  it("transitions pending to replayed", () => {
    const deadLetter = createTestDeadLetter({ status: "pending" });
    const result = markDeadLetterReplayed(deadLetter);
    expect(result.status).toBe("replayed");
  });

  it("preserves all other fields", () => {
    const deadLetter = createTestDeadLetter({
      status: "pending",
      agentId: "my-agent",
      attemptCount: 3,
      context: createTestContext(),
    });
    const result = markDeadLetterReplayed(deadLetter);

    expect(result.agentId).toBe("my-agent");
    expect(result.attemptCount).toBe(3);
    expect(result.context).toEqual(createTestContext());
  });

  it("throws error when status is replayed", () => {
    const deadLetter = createTestDeadLetter({ status: "replayed" });
    expect(() => markDeadLetterReplayed(deadLetter)).toThrow(
      'current status is "replayed", expected "pending"'
    );
  });

  it("throws error when status is ignored", () => {
    const deadLetter = createTestDeadLetter({ status: "ignored" });
    expect(() => markDeadLetterReplayed(deadLetter)).toThrow(
      'current status is "ignored", expected "pending"'
    );
  });
});

describe("markDeadLetterIgnored", () => {
  it("transitions pending to ignored", () => {
    const deadLetter = createTestDeadLetter({ status: "pending" });
    const result = markDeadLetterIgnored(deadLetter);
    expect(result.status).toBe("ignored");
  });

  it("preserves all other fields", () => {
    const deadLetter = createTestDeadLetter({
      status: "pending",
      eventId: "evt-456",
      error: "Original error",
    });
    const result = markDeadLetterIgnored(deadLetter);

    expect(result.eventId).toBe("evt-456");
    expect(result.error).toBe("Original error");
  });

  it("throws error when status is replayed", () => {
    const deadLetter = createTestDeadLetter({ status: "replayed" });
    expect(() => markDeadLetterIgnored(deadLetter)).toThrow(
      'current status is "replayed", expected "pending"'
    );
  });

  it("throws error when status is already ignored", () => {
    const deadLetter = createTestDeadLetter({ status: "ignored" });
    expect(() => markDeadLetterIgnored(deadLetter)).toThrow(
      'current status is "ignored", expected "pending"'
    );
  });
});

// ============================================================================
// Type Guards Tests
// ============================================================================

describe("isDeadLetterPending", () => {
  it("returns true for pending status", () => {
    const deadLetter = createTestDeadLetter({ status: "pending" });
    expect(isDeadLetterPending(deadLetter)).toBe(true);
  });

  it("returns false for replayed status", () => {
    const deadLetter = createTestDeadLetter({ status: "replayed" });
    expect(isDeadLetterPending(deadLetter)).toBe(false);
  });

  it("returns false for ignored status", () => {
    const deadLetter = createTestDeadLetter({ status: "ignored" });
    expect(isDeadLetterPending(deadLetter)).toBe(false);
  });
});

describe("isDeadLetterReplayed", () => {
  it("returns true for replayed status", () => {
    const deadLetter = createTestDeadLetter({ status: "replayed" });
    expect(isDeadLetterReplayed(deadLetter)).toBe(true);
  });

  it("returns false for pending status", () => {
    const deadLetter = createTestDeadLetter({ status: "pending" });
    expect(isDeadLetterReplayed(deadLetter)).toBe(false);
  });

  it("returns false for ignored status", () => {
    const deadLetter = createTestDeadLetter({ status: "ignored" });
    expect(isDeadLetterReplayed(deadLetter)).toBe(false);
  });
});

describe("isDeadLetterIgnored", () => {
  it("returns true for ignored status", () => {
    const deadLetter = createTestDeadLetter({ status: "ignored" });
    expect(isDeadLetterIgnored(deadLetter)).toBe(true);
  });

  it("returns false for pending status", () => {
    const deadLetter = createTestDeadLetter({ status: "pending" });
    expect(isDeadLetterIgnored(deadLetter)).toBe(false);
  });

  it("returns false for replayed status", () => {
    const deadLetter = createTestDeadLetter({ status: "replayed" });
    expect(isDeadLetterIgnored(deadLetter)).toBe(false);
  });
});

// ============================================================================
// Validation Tests
// ============================================================================

describe("validateAgentDeadLetter", () => {
  it("returns true for valid dead letter", () => {
    const deadLetter = createTestDeadLetter();
    expect(validateAgentDeadLetter(deadLetter)).toBe(true);
  });

  it("returns true for dead letter with context", () => {
    const deadLetter = createTestDeadLetter({ context: createTestContext() });
    expect(validateAgentDeadLetter(deadLetter)).toBe(true);
  });

  it("returns false for null", () => {
    expect(validateAgentDeadLetter(null)).toBe(false);
  });

  it("returns false for undefined", () => {
    expect(validateAgentDeadLetter(undefined)).toBe(false);
  });

  it("returns false for empty object", () => {
    expect(validateAgentDeadLetter({})).toBe(false);
  });

  it("returns false for non-object", () => {
    expect(validateAgentDeadLetter("not an object")).toBe(false);
    expect(validateAgentDeadLetter(123)).toBe(false);
    expect(validateAgentDeadLetter(true)).toBe(false);
  });

  it("returns false for dead letter with invalid status", () => {
    const invalid = { ...createTestDeadLetter(), status: "invalid" };
    expect(validateAgentDeadLetter(invalid)).toBe(false);
  });

  it("returns false for dead letter with missing fields", () => {
    const invalid = { agentId: "test", status: "pending" };
    expect(validateAgentDeadLetter(invalid)).toBe(false);
  });
});

// ============================================================================
// Integration Tests - Dead Letter Lifecycle
// ============================================================================

describe("dead letter lifecycle", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-01-15T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("simulates failed event processing and replay", () => {
    // Step 1: Create dead letter on first failure
    let deadLetter = createAgentDeadLetter(
      "churn-agent",
      "sub-001",
      "evt-500",
      500,
      new Error("LLM timeout"),
      { correlationId: "corr-abc", triggeringPattern: "churn-risk" }
    );

    expect(deadLetter.status).toBe("pending");
    expect(deadLetter.attemptCount).toBe(1);
    expect(validateAgentDeadLetter(deadLetter)).toBe(true);

    // Step 2: Retry fails - increment attempt
    vi.advanceTimersByTime(5000); // 5 seconds later
    deadLetter = incrementDeadLetterAttempt(deadLetter, "LLM timeout on retry");
    expect(deadLetter.attemptCount).toBe(2);
    expect(isDeadLetterPending(deadLetter)).toBe(true);

    // Step 3: Another retry fails
    vi.advanceTimersByTime(10000);
    deadLetter = incrementDeadLetterAttempt(deadLetter, "LLM still unavailable");
    expect(deadLetter.attemptCount).toBe(3);

    // Step 4: Manual replay succeeds
    deadLetter = markDeadLetterReplayed(deadLetter);
    expect(deadLetter.status).toBe("replayed");
    expect(isDeadLetterReplayed(deadLetter)).toBe(true);

    // Step 5: Cannot transition again
    expect(() => markDeadLetterIgnored(deadLetter)).toThrow();
    expect(() => markDeadLetterReplayed(deadLetter)).toThrow();
  });

  it("simulates obsolete event being ignored", () => {
    // Step 1: Create dead letter for an event
    let deadLetter = createAgentDeadLetter(
      "inventory-agent",
      "sub-002",
      "evt-obsolete",
      100,
      "Processing failed"
    );

    expect(isDeadLetterPending(deadLetter)).toBe(true);

    // Step 2: Determine event is obsolete (e.g., compensating event received)
    // Mark as ignored instead of replaying
    deadLetter = markDeadLetterIgnored(deadLetter);
    expect(deadLetter.status).toBe("ignored");
    expect(isDeadLetterIgnored(deadLetter)).toBe(true);

    // Step 3: Cannot transition again
    expect(() => markDeadLetterReplayed(deadLetter)).toThrow();
  });
});
