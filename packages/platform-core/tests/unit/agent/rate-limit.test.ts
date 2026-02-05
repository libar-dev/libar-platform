/**
 * Rate Limit Module Unit Tests
 *
 * Tests for the LLM rate limiting functionality including:
 * - Configuration validation
 * - Exponential backoff calculation
 * - Budget tracking
 * - Error type guards and factories
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  // Error codes
  RATE_LIMIT_ERROR_CODES,
  // Schemas
  CostBudgetSchema,
  AgentRateLimitConfigSchema,
  // Validation
  validateRateLimitConfig,
  // Factory functions
  createDefaultRateLimitConfig,
  createRateLimitConfigWithBudget,
  createRateLimitError,
  DEFAULT_RATE_LIMIT_VALUES,
  // Type guards
  isRateLimitError,
  isRetryableError,
  isPermanentError,
  // Helper functions
  calculateBackoffDelay,
  getEffectiveRateLimitConfig,
  wouldExceedBudget,
  isAtAlertThreshold,
} from "../../../src/agent/rate-limit.js";
import type { AgentRateLimitConfig } from "../../../src/agent/types.js";

// ============================================================================
// Test Fixtures
// ============================================================================

function createTestBudget(overrides: Partial<{ daily: number; alertThreshold: number }> = {}) {
  return {
    daily: 10.0,
    alertThreshold: 0.8,
    ...overrides,
  };
}

function createTestConfig(overrides: Partial<AgentRateLimitConfig> = {}): AgentRateLimitConfig {
  return {
    maxRequestsPerMinute: 60,
    maxConcurrent: 5,
    queueDepth: 100,
    ...overrides,
  };
}

// ============================================================================
// Error Codes Tests
// ============================================================================

describe("RATE_LIMIT_ERROR_CODES", () => {
  it("contains all expected error codes", () => {
    expect(RATE_LIMIT_ERROR_CODES.LLM_RATE_LIMITED).toBe("LLM_RATE_LIMITED");
    expect(RATE_LIMIT_ERROR_CODES.LLM_UNAVAILABLE).toBe("LLM_UNAVAILABLE");
    expect(RATE_LIMIT_ERROR_CODES.LLM_TIMEOUT).toBe("LLM_TIMEOUT");
    expect(RATE_LIMIT_ERROR_CODES.LLM_INVALID_RESPONSE).toBe("LLM_INVALID_RESPONSE");
    expect(RATE_LIMIT_ERROR_CODES.LLM_AUTH_FAILED).toBe("LLM_AUTH_FAILED");
    expect(RATE_LIMIT_ERROR_CODES.QUEUE_OVERFLOW).toBe("QUEUE_OVERFLOW");
    expect(RATE_LIMIT_ERROR_CODES.BUDGET_EXCEEDED).toBe("BUDGET_EXCEEDED");
    expect(RATE_LIMIT_ERROR_CODES.INVALID_RATE_LIMIT_CONFIG).toBe("INVALID_RATE_LIMIT_CONFIG");
  });

  it("has 8 error codes", () => {
    expect(Object.keys(RATE_LIMIT_ERROR_CODES).length).toBe(8);
  });
});

// ============================================================================
// Zod Schema Tests
// ============================================================================

describe("CostBudgetSchema", () => {
  it("accepts valid cost budget", () => {
    const budget = createTestBudget();
    const result = CostBudgetSchema.safeParse(budget);
    expect(result.success).toBe(true);
  });

  it("rejects budget with non-positive daily", () => {
    const invalid = createTestBudget({ daily: 0 });
    const result = CostBudgetSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it("rejects budget with negative daily", () => {
    const invalid = createTestBudget({ daily: -10 });
    const result = CostBudgetSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it("rejects budget with alertThreshold above 1", () => {
    const invalid = createTestBudget({ alertThreshold: 1.5 });
    const result = CostBudgetSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it("rejects budget with negative alertThreshold", () => {
    const invalid = createTestBudget({ alertThreshold: -0.1 });
    const result = CostBudgetSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it("accepts alertThreshold at boundaries (0 and 1)", () => {
    expect(CostBudgetSchema.safeParse(createTestBudget({ alertThreshold: 0 })).success).toBe(true);
    expect(CostBudgetSchema.safeParse(createTestBudget({ alertThreshold: 1 })).success).toBe(true);
  });
});

describe("AgentRateLimitConfigSchema", () => {
  it("accepts valid config with required fields only", () => {
    const config = { maxRequestsPerMinute: 60 };
    const result = AgentRateLimitConfigSchema.safeParse(config);
    expect(result.success).toBe(true);
  });

  it("accepts config with all optional fields", () => {
    const config = createTestConfig({ costBudget: createTestBudget() });
    const result = AgentRateLimitConfigSchema.safeParse(config);
    expect(result.success).toBe(true);
  });

  it("rejects config with non-positive maxRequestsPerMinute", () => {
    const invalid = { maxRequestsPerMinute: 0 };
    const result = AgentRateLimitConfigSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it("rejects config with negative maxRequestsPerMinute", () => {
    const invalid = { maxRequestsPerMinute: -10 };
    const result = AgentRateLimitConfigSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it("rejects config with non-integer maxRequestsPerMinute", () => {
    const invalid = { maxRequestsPerMinute: 60.5 };
    const result = AgentRateLimitConfigSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it("rejects config with non-positive maxConcurrent", () => {
    const invalid = { maxRequestsPerMinute: 60, maxConcurrent: 0 };
    const result = AgentRateLimitConfigSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it("rejects config with non-positive queueDepth", () => {
    const invalid = { maxRequestsPerMinute: 60, queueDepth: 0 };
    const result = AgentRateLimitConfigSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });
});

// ============================================================================
// Validation Tests
// ============================================================================

describe("validateRateLimitConfig", () => {
  describe("maxRequestsPerMinute validation", () => {
    it("returns invalid when maxRequestsPerMinute is undefined", () => {
      const result = validateRateLimitConfig({});
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.code).toBe(RATE_LIMIT_ERROR_CODES.INVALID_RATE_LIMIT_CONFIG);
        expect(result.message).toContain("maxRequestsPerMinute");
      }
    });

    it("returns invalid when maxRequestsPerMinute is zero", () => {
      const result = validateRateLimitConfig({ maxRequestsPerMinute: 0 });
      expect(result.valid).toBe(false);
    });

    it("returns invalid when maxRequestsPerMinute is negative", () => {
      const result = validateRateLimitConfig({ maxRequestsPerMinute: -10 });
      expect(result.valid).toBe(false);
    });

    it("returns invalid when maxRequestsPerMinute is not an integer", () => {
      const result = validateRateLimitConfig({ maxRequestsPerMinute: 60.5 });
      expect(result.valid).toBe(false);
    });

    it("returns valid for positive integer maxRequestsPerMinute", () => {
      const result = validateRateLimitConfig({ maxRequestsPerMinute: 60 });
      expect(result.valid).toBe(true);
    });
  });

  describe("maxConcurrent validation", () => {
    it("returns invalid when maxConcurrent is zero", () => {
      const result = validateRateLimitConfig({ maxRequestsPerMinute: 60, maxConcurrent: 0 });
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.message).toContain("maxConcurrent");
      }
    });

    it("returns invalid when maxConcurrent is negative", () => {
      const result = validateRateLimitConfig({ maxRequestsPerMinute: 60, maxConcurrent: -5 });
      expect(result.valid).toBe(false);
    });

    it("returns invalid when maxConcurrent is not an integer", () => {
      const result = validateRateLimitConfig({ maxRequestsPerMinute: 60, maxConcurrent: 5.5 });
      expect(result.valid).toBe(false);
    });

    it("returns valid when maxConcurrent is undefined", () => {
      const result = validateRateLimitConfig({ maxRequestsPerMinute: 60 });
      expect(result.valid).toBe(true);
    });
  });

  describe("queueDepth validation", () => {
    it("returns invalid when queueDepth is zero", () => {
      const result = validateRateLimitConfig({ maxRequestsPerMinute: 60, queueDepth: 0 });
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.message).toContain("queueDepth");
      }
    });

    it("returns invalid when queueDepth is negative", () => {
      const result = validateRateLimitConfig({ maxRequestsPerMinute: 60, queueDepth: -100 });
      expect(result.valid).toBe(false);
    });

    it("returns invalid when queueDepth is not an integer", () => {
      const result = validateRateLimitConfig({ maxRequestsPerMinute: 60, queueDepth: 100.5 });
      expect(result.valid).toBe(false);
    });
  });

  describe("costBudget validation", () => {
    it("returns invalid when costBudget.daily is zero", () => {
      const result = validateRateLimitConfig({
        maxRequestsPerMinute: 60,
        costBudget: { daily: 0, alertThreshold: 0.8 },
      });
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.message).toContain("daily");
      }
    });

    it("returns invalid when costBudget.daily is negative", () => {
      const result = validateRateLimitConfig({
        maxRequestsPerMinute: 60,
        costBudget: { daily: -10, alertThreshold: 0.8 },
      });
      expect(result.valid).toBe(false);
    });

    it("returns invalid when costBudget.alertThreshold is below 0", () => {
      const result = validateRateLimitConfig({
        maxRequestsPerMinute: 60,
        costBudget: { daily: 10, alertThreshold: -0.1 },
      });
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.message).toContain("alertThreshold");
      }
    });

    it("returns invalid when costBudget.alertThreshold is above 1", () => {
      const result = validateRateLimitConfig({
        maxRequestsPerMinute: 60,
        costBudget: { daily: 10, alertThreshold: 1.5 },
      });
      expect(result.valid).toBe(false);
    });

    it("returns valid when costBudget is valid", () => {
      const result = validateRateLimitConfig({
        maxRequestsPerMinute: 60,
        costBudget: { daily: 10, alertThreshold: 0.8 },
      });
      expect(result.valid).toBe(true);
    });
  });

  describe("full config validation", () => {
    it("returns valid for complete valid config", () => {
      const result = validateRateLimitConfig({
        maxRequestsPerMinute: 60,
        maxConcurrent: 5,
        queueDepth: 100,
        costBudget: { daily: 10, alertThreshold: 0.8 },
      });
      expect(result.valid).toBe(true);
    });
  });
});

// ============================================================================
// Factory Functions Tests
// ============================================================================

describe("createDefaultRateLimitConfig", () => {
  it("creates config with default maxRequestsPerMinute", () => {
    const config = createDefaultRateLimitConfig();
    expect(config.maxRequestsPerMinute).toBe(DEFAULT_RATE_LIMIT_VALUES.maxRequestsPerMinute);
  });

  it("creates config with default maxConcurrent", () => {
    const config = createDefaultRateLimitConfig();
    expect(config.maxConcurrent).toBe(DEFAULT_RATE_LIMIT_VALUES.maxConcurrent);
  });

  it("creates config with default queueDepth", () => {
    const config = createDefaultRateLimitConfig();
    expect(config.queueDepth).toBe(DEFAULT_RATE_LIMIT_VALUES.queueDepth);
  });

  it("does not include costBudget by default", () => {
    const config = createDefaultRateLimitConfig();
    expect(config.costBudget).toBeUndefined();
  });

  it("creates a valid config that passes validation", () => {
    const config = createDefaultRateLimitConfig();
    const result = validateRateLimitConfig(config);
    expect(result.valid).toBe(true);
  });
});

describe("createRateLimitConfigWithBudget", () => {
  it("creates config with specified dailyBudget", () => {
    const config = createRateLimitConfigWithBudget({ dailyBudget: 25.0 });
    expect(config.costBudget?.daily).toBe(25.0);
  });

  it("uses default alertThreshold when not specified", () => {
    const config = createRateLimitConfigWithBudget({ dailyBudget: 10.0 });
    expect(config.costBudget?.alertThreshold).toBe(0.8);
  });

  it("uses specified alertThreshold", () => {
    const config = createRateLimitConfigWithBudget({ dailyBudget: 10.0, alertThreshold: 0.5 });
    expect(config.costBudget?.alertThreshold).toBe(0.5);
  });

  it("uses specified maxRequestsPerMinute", () => {
    const config = createRateLimitConfigWithBudget({ dailyBudget: 10.0, maxRequestsPerMinute: 30 });
    expect(config.maxRequestsPerMinute).toBe(30);
  });

  it("uses default maxRequestsPerMinute when not specified", () => {
    const config = createRateLimitConfigWithBudget({ dailyBudget: 10.0 });
    expect(config.maxRequestsPerMinute).toBe(DEFAULT_RATE_LIMIT_VALUES.maxRequestsPerMinute);
  });

  it("includes all optional fields", () => {
    const config = createRateLimitConfigWithBudget({
      dailyBudget: 10.0,
      maxRequestsPerMinute: 30,
      maxConcurrent: 3,
      queueDepth: 50,
      alertThreshold: 0.7,
    });
    expect(config.maxRequestsPerMinute).toBe(30);
    expect(config.maxConcurrent).toBe(3);
    expect(config.queueDepth).toBe(50);
    expect(config.costBudget?.daily).toBe(10.0);
    expect(config.costBudget?.alertThreshold).toBe(0.7);
  });
});

describe("createRateLimitError", () => {
  it("creates error with code and message", () => {
    const error = createRateLimitError(
      RATE_LIMIT_ERROR_CODES.LLM_RATE_LIMITED,
      "Rate limit exceeded"
    );
    expect(error.code).toBe("LLM_RATE_LIMITED");
    expect(error.message).toBe("Rate limit exceeded");
  });

  it("creates error without optional fields when not provided", () => {
    const error = createRateLimitError(
      RATE_LIMIT_ERROR_CODES.LLM_UNAVAILABLE,
      "Service unavailable"
    );
    expect(error.retryAfterMs).toBeUndefined();
    expect(error.context).toBeUndefined();
  });

  it("creates error with retryAfterMs when provided", () => {
    const error = createRateLimitError(RATE_LIMIT_ERROR_CODES.LLM_RATE_LIMITED, "Rate limited", {
      retryAfterMs: 5000,
    });
    expect(error.retryAfterMs).toBe(5000);
  });

  it("creates error with context when provided", () => {
    const error = createRateLimitError(RATE_LIMIT_ERROR_CODES.QUEUE_OVERFLOW, "Queue full", {
      context: { queueSize: 100, maxSize: 100 },
    });
    expect(error.context).toEqual({ queueSize: 100, maxSize: 100 });
  });

  it("creates error with both retryAfterMs and context", () => {
    const error = createRateLimitError(RATE_LIMIT_ERROR_CODES.LLM_TIMEOUT, "Timeout", {
      retryAfterMs: 10000,
      context: { attempt: 3 },
    });
    expect(error.retryAfterMs).toBe(10000);
    expect(error.context).toEqual({ attempt: 3 });
  });
});

// ============================================================================
// Type Guard Tests
// ============================================================================

describe("isRateLimitError", () => {
  it("returns true for valid rate limit error", () => {
    const error = createRateLimitError(
      RATE_LIMIT_ERROR_CODES.LLM_RATE_LIMITED,
      "Rate limit exceeded"
    );
    expect(isRateLimitError(error)).toBe(true);
  });

  it("returns true for error with all known error codes", () => {
    const codes = Object.values(RATE_LIMIT_ERROR_CODES);
    for (const code of codes) {
      const error = createRateLimitError(code, "Test error");
      expect(isRateLimitError(error)).toBe(true);
    }
  });

  it("returns false for null", () => {
    expect(isRateLimitError(null)).toBe(false);
  });

  it("returns false for undefined", () => {
    expect(isRateLimitError(undefined)).toBe(false);
  });

  it("returns false for primitive values", () => {
    expect(isRateLimitError("error")).toBe(false);
    expect(isRateLimitError(123)).toBe(false);
    expect(isRateLimitError(true)).toBe(false);
  });

  it("returns false for object without code", () => {
    expect(isRateLimitError({ message: "error" })).toBe(false);
  });

  it("returns false for object without message", () => {
    expect(isRateLimitError({ code: "LLM_RATE_LIMITED" })).toBe(false);
  });

  it("returns false for object with non-string code", () => {
    expect(isRateLimitError({ code: 123, message: "error" })).toBe(false);
  });

  it("returns false for object with unknown code", () => {
    expect(isRateLimitError({ code: "UNKNOWN_CODE", message: "error" })).toBe(false);
  });

  it("returns false for regular Error object", () => {
    expect(isRateLimitError(new Error("error"))).toBe(false);
  });
});

describe("isRetryableError", () => {
  it("returns true for LLM_RATE_LIMITED", () => {
    const error = createRateLimitError(RATE_LIMIT_ERROR_CODES.LLM_RATE_LIMITED, "Rate limited");
    expect(isRetryableError(error)).toBe(true);
  });

  it("returns true for LLM_UNAVAILABLE", () => {
    const error = createRateLimitError(RATE_LIMIT_ERROR_CODES.LLM_UNAVAILABLE, "Unavailable");
    expect(isRetryableError(error)).toBe(true);
  });

  it("returns true for LLM_TIMEOUT", () => {
    const error = createRateLimitError(RATE_LIMIT_ERROR_CODES.LLM_TIMEOUT, "Timeout");
    expect(isRetryableError(error)).toBe(true);
  });

  it("returns false for LLM_AUTH_FAILED", () => {
    const error = createRateLimitError(RATE_LIMIT_ERROR_CODES.LLM_AUTH_FAILED, "Auth failed");
    expect(isRetryableError(error)).toBe(false);
  });

  it("returns false for BUDGET_EXCEEDED", () => {
    const error = createRateLimitError(RATE_LIMIT_ERROR_CODES.BUDGET_EXCEEDED, "Budget exceeded");
    expect(isRetryableError(error)).toBe(false);
  });

  it("returns false for LLM_INVALID_RESPONSE", () => {
    const error = createRateLimitError(
      RATE_LIMIT_ERROR_CODES.LLM_INVALID_RESPONSE,
      "Invalid response"
    );
    expect(isRetryableError(error)).toBe(false);
  });

  it("returns false for QUEUE_OVERFLOW", () => {
    const error = createRateLimitError(RATE_LIMIT_ERROR_CODES.QUEUE_OVERFLOW, "Queue overflow");
    expect(isRetryableError(error)).toBe(false);
  });

  it("returns false for non-rate-limit errors", () => {
    expect(isRetryableError(new Error("regular error"))).toBe(false);
    expect(isRetryableError(null)).toBe(false);
    expect(isRetryableError("error")).toBe(false);
  });
});

describe("isPermanentError", () => {
  it("returns true for LLM_AUTH_FAILED", () => {
    const error = createRateLimitError(RATE_LIMIT_ERROR_CODES.LLM_AUTH_FAILED, "Auth failed");
    expect(isPermanentError(error)).toBe(true);
  });

  it("returns true for BUDGET_EXCEEDED", () => {
    const error = createRateLimitError(RATE_LIMIT_ERROR_CODES.BUDGET_EXCEEDED, "Budget exceeded");
    expect(isPermanentError(error)).toBe(true);
  });

  it("returns false for LLM_RATE_LIMITED", () => {
    const error = createRateLimitError(RATE_LIMIT_ERROR_CODES.LLM_RATE_LIMITED, "Rate limited");
    expect(isPermanentError(error)).toBe(false);
  });

  it("returns false for LLM_UNAVAILABLE", () => {
    const error = createRateLimitError(RATE_LIMIT_ERROR_CODES.LLM_UNAVAILABLE, "Unavailable");
    expect(isPermanentError(error)).toBe(false);
  });

  it("returns false for LLM_TIMEOUT", () => {
    const error = createRateLimitError(RATE_LIMIT_ERROR_CODES.LLM_TIMEOUT, "Timeout");
    expect(isPermanentError(error)).toBe(false);
  });

  it("returns false for non-rate-limit errors", () => {
    expect(isPermanentError(new Error("regular error"))).toBe(false);
    expect(isPermanentError(null)).toBe(false);
  });
});

// ============================================================================
// Backoff Calculation Tests
// ============================================================================

describe("calculateBackoffDelay", () => {
  beforeEach(() => {
    // Mock Math.random to return consistent values
    vi.spyOn(Math, "random").mockReturnValue(0);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("exponential 2^n pattern", () => {
    it("returns base delay for attempt 0", () => {
      const delay = calculateBackoffDelay(0, 1000);
      // 2^0 * 1000 = 1000 (plus 0 jitter since Math.random = 0)
      expect(delay).toBe(1000);
    });

    it("returns 2x base delay for attempt 1", () => {
      const delay = calculateBackoffDelay(1, 1000);
      // 2^1 * 1000 = 2000
      expect(delay).toBe(2000);
    });

    it("returns 4x base delay for attempt 2", () => {
      const delay = calculateBackoffDelay(2, 1000);
      // 2^2 * 1000 = 4000
      expect(delay).toBe(4000);
    });

    it("returns 8x base delay for attempt 3", () => {
      const delay = calculateBackoffDelay(3, 1000);
      // 2^3 * 1000 = 8000
      expect(delay).toBe(8000);
    });

    it("returns 16x base delay for attempt 4", () => {
      const delay = calculateBackoffDelay(4, 1000);
      // 2^4 * 1000 = 16000
      expect(delay).toBe(16000);
    });
  });

  describe("caps at maxDelay", () => {
    it("caps delay at default maxDelay (60000ms)", () => {
      const delay = calculateBackoffDelay(10, 1000); // 2^10 * 1000 = 1024000
      expect(delay).toBe(60000);
    });

    it("caps delay at custom maxDelay", () => {
      const delay = calculateBackoffDelay(5, 1000, 10000); // 2^5 * 1000 = 32000, capped at 10000
      expect(delay).toBe(10000);
    });

    it("does not cap when delay is below max", () => {
      const delay = calculateBackoffDelay(2, 1000, 10000); // 4000 < 10000
      expect(delay).toBe(4000);
    });
  });

  describe("jitter handling", () => {
    it("adds jitter up to 25% of delay", () => {
      // With Math.random = 0.5, jitter = delay * 0.25 * 0.5 = 0.125 * delay
      vi.spyOn(Math, "random").mockReturnValue(0.5);
      const delay = calculateBackoffDelay(0, 1000);
      // 1000 + (1000 * 0.25 * 0.5) = 1125
      expect(delay).toBe(1125);
    });

    it("adds max jitter of 25% when random is 1", () => {
      vi.spyOn(Math, "random").mockReturnValue(1);
      const delay = calculateBackoffDelay(0, 1000);
      // 1000 + (1000 * 0.25 * 1) = 1250
      expect(delay).toBe(1250);
    });
  });

  describe("uses default values", () => {
    it("uses default base delay of 1000ms", () => {
      const delay = calculateBackoffDelay(0);
      expect(delay).toBe(1000);
    });

    it("uses default max delay of 60000ms", () => {
      const delay = calculateBackoffDelay(10); // Very high attempt
      expect(delay).toBe(60000);
    });
  });

  describe("returns integer values", () => {
    it("returns floored integer", () => {
      vi.spyOn(Math, "random").mockReturnValue(0.333);
      const delay = calculateBackoffDelay(0, 1000);
      expect(Number.isInteger(delay)).toBe(true);
    });
  });
});

// ============================================================================
// Budget Helper Tests
// ============================================================================

describe("wouldExceedBudget", () => {
  it("returns true when total exceeds budget", () => {
    const budget = createTestBudget({ daily: 10.0 });
    expect(wouldExceedBudget(9.0, 2.0, budget)).toBe(true); // 9 + 2 = 11 > 10
  });

  it("returns false when total is under budget", () => {
    const budget = createTestBudget({ daily: 10.0 });
    expect(wouldExceedBudget(5.0, 3.0, budget)).toBe(false); // 5 + 3 = 8 < 10
  });

  it("returns false when total equals budget exactly", () => {
    const budget = createTestBudget({ daily: 10.0 });
    expect(wouldExceedBudget(7.0, 3.0, budget)).toBe(false); // 7 + 3 = 10 = 10
  });

  it("returns true when current spend exceeds budget", () => {
    const budget = createTestBudget({ daily: 10.0 });
    expect(wouldExceedBudget(11.0, 0, budget)).toBe(true);
  });

  it("handles zero current spend", () => {
    const budget = createTestBudget({ daily: 10.0 });
    expect(wouldExceedBudget(0, 5.0, budget)).toBe(false);
    expect(wouldExceedBudget(0, 15.0, budget)).toBe(true);
  });

  it("handles small decimal values", () => {
    const budget = createTestBudget({ daily: 0.1 });
    expect(wouldExceedBudget(0.05, 0.04, budget)).toBe(false); // 0.09 < 0.1
    expect(wouldExceedBudget(0.05, 0.06, budget)).toBe(true); // 0.11 > 0.1
  });
});

describe("isAtAlertThreshold", () => {
  it("returns true when spend reaches threshold percentage", () => {
    const budget = createTestBudget({ daily: 10.0, alertThreshold: 0.8 });
    expect(isAtAlertThreshold(8.0, budget)).toBe(true); // 8 >= 10 * 0.8
  });

  it("returns true when spend exceeds threshold", () => {
    const budget = createTestBudget({ daily: 10.0, alertThreshold: 0.8 });
    expect(isAtAlertThreshold(9.0, budget)).toBe(true);
  });

  it("returns false when spend is below threshold", () => {
    const budget = createTestBudget({ daily: 10.0, alertThreshold: 0.8 });
    expect(isAtAlertThreshold(7.0, budget)).toBe(false); // 7 < 8
  });

  it("handles threshold of 0 (always alert)", () => {
    const budget = createTestBudget({ daily: 10.0, alertThreshold: 0 });
    expect(isAtAlertThreshold(0, budget)).toBe(true);
  });

  it("handles threshold of 1 (only at full budget)", () => {
    const budget = createTestBudget({ daily: 10.0, alertThreshold: 1 });
    expect(isAtAlertThreshold(9.99, budget)).toBe(false);
    expect(isAtAlertThreshold(10.0, budget)).toBe(true);
  });
});

// ============================================================================
// Effective Config Tests
// ============================================================================

describe("getEffectiveRateLimitConfig", () => {
  it("returns defaults when no config provided", () => {
    const config = getEffectiveRateLimitConfig();
    expect(config.maxRequestsPerMinute).toBe(DEFAULT_RATE_LIMIT_VALUES.maxRequestsPerMinute);
    expect(config.maxConcurrent).toBe(DEFAULT_RATE_LIMIT_VALUES.maxConcurrent);
    expect(config.queueDepth).toBe(DEFAULT_RATE_LIMIT_VALUES.queueDepth);
  });

  it("returns defaults when undefined config provided", () => {
    const config = getEffectiveRateLimitConfig(undefined);
    expect(config.maxRequestsPerMinute).toBe(DEFAULT_RATE_LIMIT_VALUES.maxRequestsPerMinute);
  });

  it("uses provided maxRequestsPerMinute", () => {
    const config = getEffectiveRateLimitConfig({ maxRequestsPerMinute: 30 });
    expect(config.maxRequestsPerMinute).toBe(30);
  });

  it("uses default maxConcurrent when not provided", () => {
    const config = getEffectiveRateLimitConfig({ maxRequestsPerMinute: 30 });
    expect(config.maxConcurrent).toBe(DEFAULT_RATE_LIMIT_VALUES.maxConcurrent);
  });

  it("uses provided maxConcurrent", () => {
    const config = getEffectiveRateLimitConfig({ maxRequestsPerMinute: 30, maxConcurrent: 3 });
    expect(config.maxConcurrent).toBe(3);
  });

  it("uses default queueDepth when not provided", () => {
    const config = getEffectiveRateLimitConfig({ maxRequestsPerMinute: 30 });
    expect(config.queueDepth).toBe(DEFAULT_RATE_LIMIT_VALUES.queueDepth);
  });

  it("uses provided queueDepth", () => {
    const config = getEffectiveRateLimitConfig({ maxRequestsPerMinute: 30, queueDepth: 50 });
    expect(config.queueDepth).toBe(50);
  });

  it("preserves costBudget when provided", () => {
    const config = getEffectiveRateLimitConfig({
      maxRequestsPerMinute: 30,
      costBudget: { daily: 10, alertThreshold: 0.8 },
    });
    expect(config.costBudget).toEqual({ daily: 10, alertThreshold: 0.8 });
  });

  it("does not include costBudget when not provided", () => {
    const config = getEffectiveRateLimitConfig({ maxRequestsPerMinute: 30 });
    expect(config.costBudget).toBeUndefined();
  });
});
