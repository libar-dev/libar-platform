/**
 * Pattern Registry Unit Tests
 *
 * Tests for validatePatternDefinitions() including:
 * - Valid patterns (single, multiple)
 * - Empty array (no patterns to validate)
 * - Duplicate pattern names
 * - Invalid patterns (missing name, missing trigger)
 * - Error code constants
 */

import { describe, it, expect } from "vitest";
import {
  validatePatternDefinitions,
  PATTERN_REGISTRY_ERROR_CODES,
  type PatternRegistryErrorCode,
} from "../../../src/agent/pattern-registry.js";
import type { PatternDefinition } from "../../../src/agent/patterns.js";

// ============================================================================
// Test Helpers
// ============================================================================

const makePattern = (name: string, overrides?: Partial<PatternDefinition>): PatternDefinition => ({
  name,
  window: { duration: "7d" },
  trigger: () => true,
  ...overrides,
});

// ============================================================================
// Error Code Constants
// ============================================================================

describe("PATTERN_REGISTRY_ERROR_CODES", () => {
  it("contains DUPLICATE_PATTERN error code", () => {
    expect(PATTERN_REGISTRY_ERROR_CODES.DUPLICATE_PATTERN).toBe("DUPLICATE_PATTERN");
  });

  it("contains INVALID_PATTERN error code", () => {
    expect(PATTERN_REGISTRY_ERROR_CODES.INVALID_PATTERN).toBe("INVALID_PATTERN");
  });

  it("contains PATTERN_NAME_REQUIRED error code", () => {
    expect(PATTERN_REGISTRY_ERROR_CODES.PATTERN_NAME_REQUIRED).toBe("PATTERN_NAME_REQUIRED");
  });

  it("contains TRIGGER_REQUIRED error code", () => {
    expect(PATTERN_REGISTRY_ERROR_CODES.TRIGGER_REQUIRED).toBe("TRIGGER_REQUIRED");
  });

  it("has exactly 4 error codes", () => {
    expect(Object.keys(PATTERN_REGISTRY_ERROR_CODES)).toHaveLength(4);
  });
});

// ============================================================================
// Valid Patterns
// ============================================================================

describe("validatePatternDefinitions — valid patterns", () => {
  it("returns valid for a single pattern", () => {
    const result = validatePatternDefinitions([makePattern("churn-risk")]);
    expect(result).toEqual({ valid: true });
  });

  it("returns valid for multiple patterns with unique names", () => {
    const result = validatePatternDefinitions([
      makePattern("churn-risk"),
      makePattern("high-value-customer"),
      makePattern("fraud-detection"),
    ]);
    expect(result).toEqual({ valid: true });
  });

  it("returns valid for patterns with different window configurations", () => {
    const result = validatePatternDefinitions([
      makePattern("short-window", { window: { duration: "1h" } }),
      makePattern("long-window", { window: { duration: "30d", minEvents: 5, eventLimit: 200 } }),
    ]);
    expect(result).toEqual({ valid: true });
  });

  it("returns valid for patterns with analyze functions", () => {
    const result = validatePatternDefinitions([
      makePattern("with-analyzer", {
        analyze: async () => ({
          detected: true,
          confidence: 0.9,
          reasoning: "detected",
          matchingEventIds: [],
        }),
      }),
    ]);
    expect(result).toEqual({ valid: true });
  });
});

// ============================================================================
// Empty Array
// ============================================================================

describe("validatePatternDefinitions — empty array", () => {
  it("returns valid for empty array (no patterns to validate)", () => {
    const result = validatePatternDefinitions([]);
    expect(result).toEqual({ valid: true });
  });
});

// ============================================================================
// Duplicate Names
// ============================================================================

describe("validatePatternDefinitions — duplicate names", () => {
  it("returns DUPLICATE_PATTERN error for two patterns with the same name", () => {
    const result = validatePatternDefinitions([
      makePattern("churn-risk"),
      makePattern("churn-risk"),
    ]);

    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.code).toBe(PATTERN_REGISTRY_ERROR_CODES.DUPLICATE_PATTERN);
      expect(result.message).toContain("churn-risk");
    }
  });

  it("detects duplicate in middle of array", () => {
    const result = validatePatternDefinitions([
      makePattern("alpha"),
      makePattern("beta"),
      makePattern("alpha"),
    ]);

    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.code).toBe(PATTERN_REGISTRY_ERROR_CODES.DUPLICATE_PATTERN);
      expect(result.message).toContain("alpha");
    }
  });

  it("short-circuits on first duplicate found", () => {
    // alpha appears at index 0 and 2, beta appears at index 1 and 3
    // Should detect alpha duplicate first
    const result = validatePatternDefinitions([
      makePattern("alpha"),
      makePattern("beta"),
      makePattern("alpha"),
      makePattern("beta"),
    ]);

    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.code).toBe(PATTERN_REGISTRY_ERROR_CODES.DUPLICATE_PATTERN);
      expect(result.message).toContain("alpha");
    }
  });
});

// ============================================================================
// Invalid Pattern — Missing Name
// ============================================================================

describe("validatePatternDefinitions — missing name", () => {
  it("returns PATTERN_NAME_REQUIRED for pattern with empty name", () => {
    const result = validatePatternDefinitions([
      makePattern("", { window: { duration: "7d" }, trigger: () => true }),
    ]);

    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.code).toBe(PATTERN_REGISTRY_ERROR_CODES.PATTERN_NAME_REQUIRED);
    }
  });

  it("returns PATTERN_NAME_REQUIRED for pattern with whitespace-only name", () => {
    const result = validatePatternDefinitions([
      makePattern("   ", { window: { duration: "7d" }, trigger: () => true }),
    ]);

    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.code).toBe(PATTERN_REGISTRY_ERROR_CODES.PATTERN_NAME_REQUIRED);
    }
  });

  it("short-circuits on first invalid pattern (invalid before duplicate)", () => {
    // First pattern is invalid (no name), second would be a duplicate if it got there
    const result = validatePatternDefinitions([makePattern(""), makePattern("churn-risk")]);

    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.code).toBe(PATTERN_REGISTRY_ERROR_CODES.PATTERN_NAME_REQUIRED);
    }
  });
});

// ============================================================================
// Invalid Pattern — Missing Trigger
// ============================================================================

describe("validatePatternDefinitions — missing trigger", () => {
  it("returns TRIGGER_REQUIRED for pattern without trigger function", () => {
    // Force missing trigger by casting
    const badPattern = {
      name: "no-trigger",
      window: { duration: "7d" },
    } as unknown as PatternDefinition;

    const result = validatePatternDefinitions([badPattern]);

    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.code).toBe(PATTERN_REGISTRY_ERROR_CODES.TRIGGER_REQUIRED);
    }
  });

  it("returns TRIGGER_REQUIRED for pattern with non-function trigger", () => {
    const badPattern = {
      name: "bad-trigger",
      window: { duration: "7d" },
      trigger: "not-a-function",
    } as unknown as PatternDefinition;

    const result = validatePatternDefinitions([badPattern]);

    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.code).toBe(PATTERN_REGISTRY_ERROR_CODES.TRIGGER_REQUIRED);
    }
  });
});

// ============================================================================
// Error Code Mapping
// ============================================================================

describe("validatePatternDefinitions — error code mapping", () => {
  it("maps pattern-level PATTERN_NAME_REQUIRED to registry-level PATTERN_NAME_REQUIRED", () => {
    const result = validatePatternDefinitions([makePattern("")]);

    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.code).toBe("PATTERN_NAME_REQUIRED");
    }
  });

  it("maps pattern-level TRIGGER_REQUIRED to registry-level TRIGGER_REQUIRED", () => {
    const badPattern = {
      name: "no-trigger",
      window: { duration: "7d" },
    } as unknown as PatternDefinition;

    const result = validatePatternDefinitions([badPattern]);

    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.code).toBe("TRIGGER_REQUIRED");
    }
  });

  it("maps unknown pattern error codes to INVALID_PATTERN", () => {
    // Invalid duration format produces an error code that maps to INVALID_PATTERN
    const badPattern = {
      name: "bad-window",
      window: { duration: "invalid" },
      trigger: () => true,
    } as PatternDefinition;

    const result = validatePatternDefinitions([badPattern]);

    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.code).toBe("INVALID_PATTERN");
    }
  });
});

// ============================================================================
// Type Safety
// ============================================================================

describe("validatePatternDefinitions — type safety", () => {
  it("accepts readonly array input", () => {
    const patterns: readonly PatternDefinition[] = Object.freeze([makePattern("frozen-pattern")]);

    const result = validatePatternDefinitions(patterns);
    expect(result).toEqual({ valid: true });
  });

  it("error result has correct discriminated union shape", () => {
    const result = validatePatternDefinitions([makePattern("a"), makePattern("a")]);

    if (!result.valid) {
      // TypeScript should narrow to the error variant
      const code: PatternRegistryErrorCode = result.code;
      const message: string = result.message;
      expect(code).toBe("DUPLICATE_PATTERN");
      expect(typeof message).toBe("string");
    } else {
      // If this branch is taken, the test setup is wrong
      expect.unreachable("Expected validation to fail for duplicate names");
    }
  });
});
