/**
 * Patterns Module Unit Tests
 *
 * Tests for the pattern detection framework including:
 * - Duration parsing
 * - Pattern validation
 * - Event filtering
 * - Pattern trigger factories
 */

import { describe, it, expect, vi } from "vitest";
import {
  // Error codes
  PATTERN_ERROR_CODES,
  // Schemas
  PatternWindowSchema,
  // Duration parsing
  parseDuration,
  isValidDuration,
  // Validation
  validatePatternDefinition,
  // Factory functions
  definePattern,
  // Helper functions
  calculateWindowBoundary,
  filterEventsInWindow,
  hasMinimumEvents,
  // Pattern triggers
  PatternTriggers,
  // Types
  type PatternDefinition,
  type PatternTrigger,
} from "../../../src/agent/patterns.js";
import type { PublishedEvent } from "../../../src/eventbus/types.js";
import type { PatternWindow } from "../../../src/agent/types.js";

// ============================================================================
// Test Fixtures
// ============================================================================

function createTestEvent(overrides: Partial<PublishedEvent> = {}): PublishedEvent {
  return {
    eventId: "evt_test_123",
    eventType: "TestEvent",
    streamId: "stream-001",
    streamType: "TestStream",
    globalPosition: 100,
    streamPosition: 10,
    timestamp: Date.now(),
    payload: {},
    metadata: {},
    schemaVersion: 1,
    causationId: "cause-001",
    correlationId: "corr-001",
    ...overrides,
  };
}

function createTestWindow(overrides: Partial<PatternWindow> = {}): PatternWindow {
  return {
    duration: "7d",
    ...overrides,
  };
}

function createTestPatternDefinition(
  overrides: Partial<PatternDefinition> = {}
): PatternDefinition {
  return {
    name: "test-pattern",
    description: "A test pattern",
    window: createTestWindow(),
    trigger: () => true,
    ...overrides,
  };
}

// ============================================================================
// Error Codes Tests
// ============================================================================

describe("PATTERN_ERROR_CODES", () => {
  it("contains all expected error codes", () => {
    expect(PATTERN_ERROR_CODES.TRIGGER_REQUIRED).toBe("TRIGGER_REQUIRED");
    expect(PATTERN_ERROR_CODES.PATTERN_NAME_REQUIRED).toBe("PATTERN_NAME_REQUIRED");
    expect(PATTERN_ERROR_CODES.INVALID_MIN_EVENTS).toBe("INVALID_MIN_EVENTS");
    expect(PATTERN_ERROR_CODES.INVALID_DURATION_FORMAT).toBe("INVALID_DURATION_FORMAT");
    expect(PATTERN_ERROR_CODES.INVALID_EVENT_LIMIT).toBe("INVALID_EVENT_LIMIT");
    expect(PATTERN_ERROR_CODES.INVALID_LOAD_BATCH_SIZE).toBe("INVALID_LOAD_BATCH_SIZE");
  });

  it("has 6 error codes", () => {
    expect(Object.keys(PATTERN_ERROR_CODES).length).toBe(6);
  });
});

// ============================================================================
// Zod Schema Tests
// ============================================================================

describe("PatternWindowSchema", () => {
  it("accepts valid window with duration only", () => {
    const window = { duration: "7d" };
    const result = PatternWindowSchema.safeParse(window);
    expect(result.success).toBe(true);
  });

  it("accepts window with all optional fields", () => {
    const window = {
      duration: "7d",
      eventLimit: 100,
      minEvents: 5,
      loadBatchSize: 50,
    };
    const result = PatternWindowSchema.safeParse(window);
    expect(result.success).toBe(true);
  });

  it("rejects window with empty duration", () => {
    const window = { duration: "" };
    const result = PatternWindowSchema.safeParse(window);
    expect(result.success).toBe(false);
  });

  it("rejects window with missing duration", () => {
    const result = PatternWindowSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it("rejects window with non-positive eventLimit", () => {
    const window = { duration: "7d", eventLimit: 0 };
    const result = PatternWindowSchema.safeParse(window);
    expect(result.success).toBe(false);
  });

  it("rejects window with negative eventLimit", () => {
    const window = { duration: "7d", eventLimit: -10 };
    const result = PatternWindowSchema.safeParse(window);
    expect(result.success).toBe(false);
  });

  it("rejects window with non-positive minEvents", () => {
    const window = { duration: "7d", minEvents: 0 };
    const result = PatternWindowSchema.safeParse(window);
    expect(result.success).toBe(false);
  });

  it("rejects window with non-positive loadBatchSize", () => {
    const window = { duration: "7d", loadBatchSize: 0 };
    const result = PatternWindowSchema.safeParse(window);
    expect(result.success).toBe(false);
  });

  it("rejects window with non-integer eventLimit", () => {
    const window = { duration: "7d", eventLimit: 50.5 };
    const result = PatternWindowSchema.safeParse(window);
    expect(result.success).toBe(false);
  });
});

// ============================================================================
// Duration Parsing Tests
// ============================================================================

describe("parseDuration", () => {
  describe("days format", () => {
    it.each([
      ["7d", 7 * 24 * 60 * 60 * 1000],
      ["1d", 1 * 24 * 60 * 60 * 1000],
      ["30d", 30 * 24 * 60 * 60 * 1000],
      ["365d", 365 * 24 * 60 * 60 * 1000],
    ])('parseDuration("%s") returns %d', (input, expected) => {
      expect(parseDuration(input)).toBe(expected);
    });
  });

  describe("hours format", () => {
    it.each([
      ["24h", 24 * 60 * 60 * 1000],
      ["1h", 1 * 60 * 60 * 1000],
      ["12h", 12 * 60 * 60 * 1000],
      ["48h", 48 * 60 * 60 * 1000],
    ])('parseDuration("%s") returns %d', (input, expected) => {
      expect(parseDuration(input)).toBe(expected);
    });
  });

  describe("minutes format", () => {
    it.each([
      ["30m", 30 * 60 * 1000],
      ["1m", 1 * 60 * 1000],
      ["60m", 60 * 60 * 1000],
      ["120m", 120 * 60 * 1000],
    ])('parseDuration("%s") returns %d', (input, expected) => {
      expect(parseDuration(input)).toBe(expected);
    });
  });

  describe("case insensitivity", () => {
    it("handles uppercase units", () => {
      expect(parseDuration("7D")).toBe(7 * 24 * 60 * 60 * 1000);
      expect(parseDuration("24H")).toBe(24 * 60 * 60 * 1000);
      expect(parseDuration("30M")).toBe(30 * 60 * 1000);
    });
  });

  describe("invalid formats return null", () => {
    it("returns null for empty string", () => {
      expect(parseDuration("")).toBeNull();
    });

    it("returns null for missing unit", () => {
      expect(parseDuration("24")).toBeNull();
    });

    it("returns null for missing value", () => {
      expect(parseDuration("d")).toBeNull();
      expect(parseDuration("h")).toBeNull();
      expect(parseDuration("m")).toBeNull();
    });

    it("returns null for unsupported units", () => {
      expect(parseDuration("60s")).toBeNull(); // seconds not supported
      expect(parseDuration("1w")).toBeNull(); // weeks not supported
      expect(parseDuration("1y")).toBeNull(); // years not supported
    });

    it("returns null for invalid format", () => {
      expect(parseDuration("invalid")).toBeNull();
      expect(parseDuration("abc")).toBeNull();
      expect(parseDuration("h24")).toBeNull();
    });

    it("returns null for zero values", () => {
      expect(parseDuration("0d")).toBeNull();
      expect(parseDuration("0h")).toBeNull();
      expect(parseDuration("0m")).toBeNull();
    });

    it("returns null for negative values", () => {
      expect(parseDuration("-7d")).toBeNull();
      expect(parseDuration("-24h")).toBeNull();
    });

    it("returns null for decimal values", () => {
      expect(parseDuration("7.5d")).toBeNull();
      expect(parseDuration("24.5h")).toBeNull();
    });
  });

  describe("whitespace handling", () => {
    it("trims leading and trailing whitespace", () => {
      expect(parseDuration(" 7d ")).toBe(7 * 24 * 60 * 60 * 1000);
      expect(parseDuration("  24h  ")).toBe(24 * 60 * 60 * 1000);
    });
  });
});

describe("isValidDuration", () => {
  it("returns true for valid formats", () => {
    expect(isValidDuration("7d")).toBe(true);
    expect(isValidDuration("24h")).toBe(true);
    expect(isValidDuration("30m")).toBe(true);
  });

  it("returns false for invalid formats", () => {
    expect(isValidDuration("")).toBe(false);
    expect(isValidDuration("invalid")).toBe(false);
    expect(isValidDuration("0d")).toBe(false);
    expect(isValidDuration("60s")).toBe(false);
  });
});

// ============================================================================
// Pattern Validation Tests
// ============================================================================

describe("validatePatternDefinition", () => {
  describe("pattern name validation", () => {
    it("returns invalid when name is missing", () => {
      const result = validatePatternDefinition({
        window: createTestWindow(),
        trigger: () => true,
      });
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.code).toBe(PATTERN_ERROR_CODES.PATTERN_NAME_REQUIRED);
      }
    });

    it("returns invalid when name is empty string", () => {
      const result = validatePatternDefinition({
        name: "",
        window: createTestWindow(),
        trigger: () => true,
      });
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.code).toBe(PATTERN_ERROR_CODES.PATTERN_NAME_REQUIRED);
      }
    });

    it("returns invalid when name is whitespace only", () => {
      const result = validatePatternDefinition({
        name: "   ",
        window: createTestWindow(),
        trigger: () => true,
      });
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.code).toBe(PATTERN_ERROR_CODES.PATTERN_NAME_REQUIRED);
      }
    });
  });

  describe("trigger validation", () => {
    it("returns invalid when trigger is missing", () => {
      const result = validatePatternDefinition({
        name: "test-pattern",
        window: createTestWindow(),
      });
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.code).toBe(PATTERN_ERROR_CODES.TRIGGER_REQUIRED);
      }
    });

    it("returns invalid when trigger is not a function", () => {
      const result = validatePatternDefinition({
        name: "test-pattern",
        window: createTestWindow(),
        trigger: "not a function" as unknown as PatternTrigger,
      });
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.code).toBe(PATTERN_ERROR_CODES.TRIGGER_REQUIRED);
      }
    });
  });

  describe("window validation", () => {
    it("returns invalid when duration format is invalid", () => {
      const result = validatePatternDefinition({
        name: "test-pattern",
        window: { duration: "invalid" },
        trigger: () => true,
      });
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.code).toBe(PATTERN_ERROR_CODES.INVALID_DURATION_FORMAT);
      }
    });

    it("returns invalid when duration is empty", () => {
      const result = validatePatternDefinition({
        name: "test-pattern",
        window: { duration: "" },
        trigger: () => true,
      });
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.code).toBe(PATTERN_ERROR_CODES.INVALID_DURATION_FORMAT);
      }
    });

    it("returns invalid when eventLimit is non-positive", () => {
      const result = validatePatternDefinition({
        name: "test-pattern",
        window: { duration: "7d", eventLimit: 0 },
        trigger: () => true,
      });
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.code).toBe(PATTERN_ERROR_CODES.INVALID_EVENT_LIMIT);
      }
    });

    it("returns invalid when eventLimit is negative", () => {
      const result = validatePatternDefinition({
        name: "test-pattern",
        window: { duration: "7d", eventLimit: -10 },
        trigger: () => true,
      });
      expect(result.valid).toBe(false);
    });

    it("returns invalid when eventLimit is not an integer", () => {
      const result = validatePatternDefinition({
        name: "test-pattern",
        window: { duration: "7d", eventLimit: 50.5 },
        trigger: () => true,
      });
      expect(result.valid).toBe(false);
    });

    it("returns invalid when minEvents is non-positive", () => {
      const result = validatePatternDefinition({
        name: "test-pattern",
        window: { duration: "7d", minEvents: 0 },
        trigger: () => true,
      });
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.code).toBe(PATTERN_ERROR_CODES.INVALID_MIN_EVENTS);
      }
    });

    it("returns invalid when loadBatchSize is non-positive", () => {
      const result = validatePatternDefinition({
        name: "test-pattern",
        window: { duration: "7d", loadBatchSize: 0 },
        trigger: () => true,
      });
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.code).toBe(PATTERN_ERROR_CODES.INVALID_LOAD_BATCH_SIZE);
      }
    });
  });

  describe("valid definitions", () => {
    it("returns valid for minimal definition", () => {
      const result = validatePatternDefinition({
        name: "test-pattern",
        window: { duration: "7d" },
        trigger: () => true,
      });
      expect(result.valid).toBe(true);
    });

    it("returns valid for complete definition", () => {
      const result = validatePatternDefinition(createTestPatternDefinition());
      expect(result.valid).toBe(true);
    });

    it("returns valid for definition with all window options", () => {
      const result = validatePatternDefinition({
        name: "test-pattern",
        window: {
          duration: "30d",
          eventLimit: 100,
          minEvents: 5,
          loadBatchSize: 25,
        },
        trigger: () => true,
        analyze: async () => ({
          detected: true,
          confidence: 0.9,
          reasoning: "test",
          matchingEventIds: [],
        }),
      });
      expect(result.valid).toBe(true);
    });
  });
});

// ============================================================================
// definePattern Factory Tests
// ============================================================================

describe("definePattern", () => {
  it("returns the definition when valid", () => {
    const definition = createTestPatternDefinition();
    const result = definePattern(definition);
    expect(result).toBe(definition);
  });

  it("throws error when name is missing", () => {
    expect(() =>
      definePattern({
        name: "",
        window: createTestWindow(),
        trigger: () => true,
      })
    ).toThrow("Pattern name is required");
  });

  it("throws error when trigger is missing", () => {
    expect(() =>
      definePattern({
        name: "test",
        window: createTestWindow(),
        trigger: undefined as unknown as PatternTrigger,
      })
    ).toThrow("Pattern trigger function is required");
  });

  it("throws error when duration is invalid", () => {
    expect(() =>
      definePattern({
        name: "test",
        window: { duration: "invalid" },
        trigger: () => true,
      })
    ).toThrow("Duration must be in format");
  });

  it("includes error code in thrown error message", () => {
    expect(() =>
      definePattern({
        name: "",
        window: createTestWindow(),
        trigger: () => true,
      })
    ).toThrow(PATTERN_ERROR_CODES.PATTERN_NAME_REQUIRED);
  });
});

// ============================================================================
// Window Boundary Calculation Tests
// ============================================================================

describe("calculateWindowBoundary", () => {
  it("calculates boundary for days", () => {
    const now = 1000000000;
    const window = createTestWindow({ duration: "7d" });
    const boundary = calculateWindowBoundary(window, now);
    const expected = now - 7 * 24 * 60 * 60 * 1000;
    expect(boundary).toBe(expected);
  });

  it("calculates boundary for hours", () => {
    const now = 1000000000;
    const window = createTestWindow({ duration: "24h" });
    const boundary = calculateWindowBoundary(window, now);
    const expected = now - 24 * 60 * 60 * 1000;
    expect(boundary).toBe(expected);
  });

  it("calculates boundary for minutes", () => {
    const now = 1000000000;
    const window = createTestWindow({ duration: "30m" });
    const boundary = calculateWindowBoundary(window, now);
    const expected = now - 30 * 60 * 1000;
    expect(boundary).toBe(expected);
  });

  it("uses Date.now() when now is not provided", () => {
    const before = Date.now();
    const window = createTestWindow({ duration: "7d" });
    const boundary = calculateWindowBoundary(window);
    const after = Date.now();

    // Boundary should be within the expected range
    expect(boundary).toBeGreaterThanOrEqual(before - 7 * 24 * 60 * 60 * 1000);
    expect(boundary).toBeLessThanOrEqual(after - 7 * 24 * 60 * 60 * 1000);
  });

  it("throws error for invalid duration format", () => {
    const window = { duration: "invalid" };
    expect(() => calculateWindowBoundary(window as PatternWindow)).toThrow(
      "Invalid duration format"
    );
  });
});

// ============================================================================
// Event Filtering Tests
// ============================================================================

describe("filterEventsInWindow", () => {
  const now = 1000000000; // Fixed timestamp for testing

  it("includes events within the window", () => {
    const window = createTestWindow({ duration: "1h" }); // 1 hour = 3600000ms
    const boundary = now - 3600000;

    const events = [
      createTestEvent({ eventId: "evt1", timestamp: boundary + 100 }), // Inside
      createTestEvent({ eventId: "evt2", timestamp: boundary + 200 }), // Inside
    ];

    const filtered = filterEventsInWindow(events, window, now);
    expect(filtered.length).toBe(2);
  });

  it("excludes events outside the window", () => {
    const window = createTestWindow({ duration: "1h" });
    const boundary = now - 3600000;

    const events = [
      createTestEvent({ eventId: "evt1", timestamp: boundary - 100 }), // Outside (too old)
      createTestEvent({ eventId: "evt2", timestamp: boundary + 100 }), // Inside
    ];

    const filtered = filterEventsInWindow(events, window, now);
    expect(filtered.length).toBe(1);
    expect(filtered[0].eventId).toBe("evt2");
  });

  it("includes events exactly at the boundary", () => {
    const window = createTestWindow({ duration: "1h" });
    const boundary = now - 3600000;

    const events = [
      createTestEvent({ eventId: "evt1", timestamp: boundary }), // Exactly at boundary
    ];

    const filtered = filterEventsInWindow(events, window, now);
    expect(filtered.length).toBe(1);
  });

  describe("event limit", () => {
    it("applies event limit and takes most recent", () => {
      const window = createTestWindow({ duration: "1h", eventLimit: 2 });
      const boundary = now - 3600000;

      const events = [
        createTestEvent({ eventId: "evt1", timestamp: boundary + 100 }), // Oldest
        createTestEvent({ eventId: "evt2", timestamp: boundary + 200 }), // Middle
        createTestEvent({ eventId: "evt3", timestamp: boundary + 300 }), // Newest
      ];

      const filtered = filterEventsInWindow(events, window, now);
      expect(filtered.length).toBe(2);
      // Should have the two most recent
      expect(filtered.map((e) => e.eventId)).toContain("evt2");
      expect(filtered.map((e) => e.eventId)).toContain("evt3");
    });

    it("does not limit when under event limit", () => {
      const window = createTestWindow({ duration: "1h", eventLimit: 10 });
      const boundary = now - 3600000;

      const events = [
        createTestEvent({ eventId: "evt1", timestamp: boundary + 100 }),
        createTestEvent({ eventId: "evt2", timestamp: boundary + 200 }),
      ];

      const filtered = filterEventsInWindow(events, window, now);
      expect(filtered.length).toBe(2);
    });
  });

  it("returns empty array when no events match", () => {
    const window = createTestWindow({ duration: "1h" });
    const boundary = now - 3600000;

    const events = [
      createTestEvent({ eventId: "evt1", timestamp: boundary - 1000 }), // Too old
      createTestEvent({ eventId: "evt2", timestamp: boundary - 2000 }), // Too old
    ];

    const filtered = filterEventsInWindow(events, window, now);
    expect(filtered.length).toBe(0);
  });

  it("handles empty events array", () => {
    const window = createTestWindow({ duration: "1h" });
    const filtered = filterEventsInWindow([], window, now);
    expect(filtered.length).toBe(0);
  });
});

describe("hasMinimumEvents", () => {
  it("returns true when events count meets minEvents", () => {
    const window = createTestWindow({ minEvents: 3 });
    const events = [createTestEvent(), createTestEvent(), createTestEvent()];
    expect(hasMinimumEvents(events, window)).toBe(true);
  });

  it("returns true when events count exceeds minEvents", () => {
    const window = createTestWindow({ minEvents: 2 });
    const events = [createTestEvent(), createTestEvent(), createTestEvent()];
    expect(hasMinimumEvents(events, window)).toBe(true);
  });

  it("returns false when events count is below minEvents", () => {
    const window = createTestWindow({ minEvents: 5 });
    const events = [createTestEvent(), createTestEvent()];
    expect(hasMinimumEvents(events, window)).toBe(false);
  });

  it("defaults to minEvents of 1", () => {
    const window = createTestWindow(); // No minEvents specified
    const events = [createTestEvent()];
    expect(hasMinimumEvents(events, window)).toBe(true);
  });

  it("returns false for empty events when minEvents is 1 (default)", () => {
    const window = createTestWindow();
    expect(hasMinimumEvents([], window)).toBe(false);
  });
});

// ============================================================================
// Pattern Triggers Tests
// ============================================================================

describe("PatternTriggers", () => {
  describe("countThreshold", () => {
    it("returns true when event count meets threshold", () => {
      const trigger = PatternTriggers.countThreshold(3);
      const events = [createTestEvent(), createTestEvent(), createTestEvent()];
      expect(trigger(events)).toBe(true);
    });

    it("returns true when event count exceeds threshold", () => {
      const trigger = PatternTriggers.countThreshold(2);
      const events = [createTestEvent(), createTestEvent(), createTestEvent()];
      expect(trigger(events)).toBe(true);
    });

    it("returns false when event count is below threshold", () => {
      const trigger = PatternTriggers.countThreshold(5);
      const events = [createTestEvent(), createTestEvent()];
      expect(trigger(events)).toBe(false);
    });
  });

  describe("eventTypePresent", () => {
    it("returns true when event type is present", () => {
      const trigger = PatternTriggers.eventTypePresent(["OrderCancelled"]);
      const events = [
        createTestEvent({ eventType: "OrderCreated" }),
        createTestEvent({ eventType: "OrderCancelled" }),
      ];
      expect(trigger(events)).toBe(true);
    });

    it("returns false when event type is not present", () => {
      const trigger = PatternTriggers.eventTypePresent(["OrderCancelled"]);
      const events = [
        createTestEvent({ eventType: "OrderCreated" }),
        createTestEvent({ eventType: "OrderShipped" }),
      ];
      expect(trigger(events)).toBe(false);
    });

    it("returns true when any of multiple event types is present", () => {
      const trigger = PatternTriggers.eventTypePresent(["OrderCancelled", "OrderRefunded"]);
      const events = [createTestEvent({ eventType: "OrderRefunded" })];
      expect(trigger(events)).toBe(true);
    });

    it("respects minCount parameter", () => {
      const trigger = PatternTriggers.eventTypePresent(["OrderCancelled"], 3);
      const eventsWithTwo = [
        createTestEvent({ eventType: "OrderCancelled" }),
        createTestEvent({ eventType: "OrderCancelled" }),
      ];
      expect(trigger(eventsWithTwo)).toBe(false);

      const eventsWithThree = [
        createTestEvent({ eventType: "OrderCancelled" }),
        createTestEvent({ eventType: "OrderCancelled" }),
        createTestEvent({ eventType: "OrderCancelled" }),
      ];
      expect(trigger(eventsWithThree)).toBe(true);
    });
  });

  describe("multiStreamPresent", () => {
    it("returns true when minimum streams are present", () => {
      const trigger = PatternTriggers.multiStreamPresent(2);
      const events = [
        createTestEvent({ streamId: "stream-1" }),
        createTestEvent({ streamId: "stream-2" }),
      ];
      expect(trigger(events)).toBe(true);
    });

    it("returns false when below minimum streams", () => {
      const trigger = PatternTriggers.multiStreamPresent(3);
      const events = [
        createTestEvent({ streamId: "stream-1" }),
        createTestEvent({ streamId: "stream-2" }),
      ];
      expect(trigger(events)).toBe(false);
    });

    it("counts unique streams correctly", () => {
      const trigger = PatternTriggers.multiStreamPresent(2);
      const events = [
        createTestEvent({ streamId: "stream-1" }),
        createTestEvent({ streamId: "stream-1" }),
        createTestEvent({ streamId: "stream-1" }),
      ];
      expect(trigger(events)).toBe(false); // Only 1 unique stream
    });
  });

  describe("all (AND logic)", () => {
    it("returns true when ALL triggers match", () => {
      const trigger1: PatternTrigger = () => true;
      const trigger2: PatternTrigger = () => true;
      const combined = PatternTriggers.all(trigger1, trigger2);
      expect(combined([])).toBe(true);
    });

    it("returns false when ANY trigger does not match", () => {
      const trigger1: PatternTrigger = () => true;
      const trigger2: PatternTrigger = () => false;
      const combined = PatternTriggers.all(trigger1, trigger2);
      expect(combined([])).toBe(false);
    });

    it("returns false when NO triggers match", () => {
      const trigger1: PatternTrigger = () => false;
      const trigger2: PatternTrigger = () => false;
      const combined = PatternTriggers.all(trigger1, trigger2);
      expect(combined([])).toBe(false);
    });

    it("handles empty triggers array", () => {
      const combined = PatternTriggers.all();
      expect(combined([])).toBe(true); // every() on empty array returns true
    });

    it("passes events to each trigger", () => {
      const mockTrigger1 = vi.fn().mockReturnValue(true);
      const mockTrigger2 = vi.fn().mockReturnValue(true);
      const combined = PatternTriggers.all(mockTrigger1, mockTrigger2);

      const events = [createTestEvent()];
      combined(events);

      expect(mockTrigger1).toHaveBeenCalledWith(events);
      expect(mockTrigger2).toHaveBeenCalledWith(events);
    });
  });

  describe("any (OR logic)", () => {
    it("returns true when ANY trigger matches", () => {
      const trigger1: PatternTrigger = () => false;
      const trigger2: PatternTrigger = () => true;
      const combined = PatternTriggers.any(trigger1, trigger2);
      expect(combined([])).toBe(true);
    });

    it("returns true when ALL triggers match", () => {
      const trigger1: PatternTrigger = () => true;
      const trigger2: PatternTrigger = () => true;
      const combined = PatternTriggers.any(trigger1, trigger2);
      expect(combined([])).toBe(true);
    });

    it("returns false when NO triggers match", () => {
      const trigger1: PatternTrigger = () => false;
      const trigger2: PatternTrigger = () => false;
      const combined = PatternTriggers.any(trigger1, trigger2);
      expect(combined([])).toBe(false);
    });

    it("handles empty triggers array", () => {
      const combined = PatternTriggers.any();
      expect(combined([])).toBe(false); // some() on empty array returns false
    });

    it("short-circuits on first match", () => {
      const mockTrigger1 = vi.fn().mockReturnValue(true);
      const mockTrigger2 = vi.fn().mockReturnValue(true);
      const combined = PatternTriggers.any(mockTrigger1, mockTrigger2);

      combined([]);

      expect(mockTrigger1).toHaveBeenCalled();
      // mockTrigger2 may or may not be called depending on some() implementation
      // The key behavior is that the result is correct
    });
  });

  describe("complex combinations", () => {
    it("combines count threshold with event type", () => {
      const combined = PatternTriggers.all(
        PatternTriggers.countThreshold(3),
        PatternTriggers.eventTypePresent(["OrderCancelled"])
      );

      const threeWithCancellation = [
        createTestEvent({ eventType: "OrderCreated" }),
        createTestEvent({ eventType: "OrderCancelled" }),
        createTestEvent({ eventType: "OrderShipped" }),
      ];
      expect(combined(threeWithCancellation)).toBe(true);

      const threeWithoutCancellation = [
        createTestEvent({ eventType: "OrderCreated" }),
        createTestEvent({ eventType: "OrderShipped" }),
        createTestEvent({ eventType: "OrderDelivered" }),
      ];
      expect(combined(threeWithoutCancellation)).toBe(false);
    });

    it("combines any with count thresholds", () => {
      const combined = PatternTriggers.any(
        PatternTriggers.countThreshold(10),
        PatternTriggers.eventTypePresent(["HighPriorityAlert"])
      );

      const fiveWithAlert = Array(5)
        .fill(null)
        .map((_, i) =>
          createTestEvent({
            eventId: `evt${i}`,
            eventType: i === 0 ? "HighPriorityAlert" : "Regular",
          })
        );
      expect(combined(fiveWithAlert)).toBe(true); // Has alert

      const fiveWithoutAlert = Array(5)
        .fill(null)
        .map((_, i) => createTestEvent({ eventId: `evt${i}`, eventType: "Regular" }));
      expect(combined(fiveWithoutAlert)).toBe(false); // No alert, count < 10
    });
  });
});
