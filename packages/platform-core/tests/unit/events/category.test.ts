/**
 * Unit Tests for Event Category Utilities
 *
 * Tests the event taxonomy utilities:
 * - EventCategory type and constants
 * - Type guards and normalizers
 * - Category classification helpers
 */
import { describe, it, expect } from "vitest";
import {
  EVENT_CATEGORIES,
  EventCategorySchema,
  DEFAULT_EVENT_CATEGORY,
  DEFAULT_SCHEMA_VERSION,
  isEventCategory,
  normalizeCategory,
  normalizeSchemaVersion,
  isExternalCategory,
  isCrossContextCategory,
} from "../../../src/events/category";

describe("EVENT_CATEGORIES", () => {
  it("contains all four event categories", () => {
    expect(EVENT_CATEGORIES).toHaveLength(4);
    expect(EVENT_CATEGORIES).toContain("domain");
    expect(EVENT_CATEGORIES).toContain("integration");
    expect(EVENT_CATEGORIES).toContain("trigger");
    expect(EVENT_CATEGORIES).toContain("fat");
  });

  it("has correct order (domain, integration, trigger, fat)", () => {
    // `as const` provides type-level immutability, not runtime freezing
    expect(EVENT_CATEGORIES[0]).toBe("domain");
    expect(EVENT_CATEGORIES[1]).toBe("integration");
    expect(EVENT_CATEGORIES[2]).toBe("trigger");
    expect(EVENT_CATEGORIES[3]).toBe("fat");
  });
});

describe("EventCategorySchema", () => {
  it("validates valid categories", () => {
    expect(EventCategorySchema.parse("domain")).toBe("domain");
    expect(EventCategorySchema.parse("integration")).toBe("integration");
    expect(EventCategorySchema.parse("trigger")).toBe("trigger");
    expect(EventCategorySchema.parse("fat")).toBe("fat");
  });

  it("rejects invalid categories", () => {
    expect(() => EventCategorySchema.parse("invalid")).toThrow();
    expect(() => EventCategorySchema.parse("DOMAIN")).toThrow(); // Case-sensitive
    expect(() => EventCategorySchema.parse("")).toThrow();
    expect(() => EventCategorySchema.parse(null)).toThrow();
    expect(() => EventCategorySchema.parse(123)).toThrow();
  });
});

describe("DEFAULT_EVENT_CATEGORY", () => {
  it("defaults to domain", () => {
    expect(DEFAULT_EVENT_CATEGORY).toBe("domain");
  });
});

describe("DEFAULT_SCHEMA_VERSION", () => {
  it("defaults to 1", () => {
    expect(DEFAULT_SCHEMA_VERSION).toBe(1);
  });
});

describe("isEventCategory", () => {
  describe("with valid categories", () => {
    it("returns true for domain", () => {
      expect(isEventCategory("domain")).toBe(true);
    });

    it("returns true for integration", () => {
      expect(isEventCategory("integration")).toBe(true);
    });

    it("returns true for trigger", () => {
      expect(isEventCategory("trigger")).toBe(true);
    });

    it("returns true for fat", () => {
      expect(isEventCategory("fat")).toBe(true);
    });
  });

  describe("with invalid values", () => {
    it("returns false for invalid string", () => {
      expect(isEventCategory("invalid")).toBe(false);
    });

    it("returns false for uppercase", () => {
      expect(isEventCategory("DOMAIN")).toBe(false);
    });

    it("returns false for null", () => {
      expect(isEventCategory(null)).toBe(false);
    });

    it("returns false for undefined", () => {
      expect(isEventCategory(undefined)).toBe(false);
    });

    it("returns false for number", () => {
      expect(isEventCategory(123)).toBe(false);
    });

    it("returns false for empty string", () => {
      expect(isEventCategory("")).toBe(false);
    });
  });
});

describe("normalizeCategory", () => {
  describe("with valid categories", () => {
    it("returns the category unchanged", () => {
      expect(normalizeCategory("domain")).toBe("domain");
      expect(normalizeCategory("integration")).toBe("integration");
      expect(normalizeCategory("trigger")).toBe("trigger");
      expect(normalizeCategory("fat")).toBe("fat");
    });
  });

  describe("with invalid values", () => {
    it("returns default for undefined", () => {
      expect(normalizeCategory(undefined)).toBe("domain");
    });

    it("returns default for null", () => {
      expect(normalizeCategory(null)).toBe("domain");
    });

    it("returns default for invalid string", () => {
      expect(normalizeCategory("invalid")).toBe("domain");
    });

    it("returns default for number", () => {
      expect(normalizeCategory(123)).toBe("domain");
    });
  });
});

describe("normalizeSchemaVersion", () => {
  describe("with valid versions", () => {
    it("returns the version unchanged for positive integers", () => {
      expect(normalizeSchemaVersion(1)).toBe(1);
      expect(normalizeSchemaVersion(2)).toBe(2);
      expect(normalizeSchemaVersion(100)).toBe(100);
    });
  });

  describe("with invalid values", () => {
    it("returns default for undefined", () => {
      expect(normalizeSchemaVersion(undefined)).toBe(1);
    });

    it("returns default for null", () => {
      expect(normalizeSchemaVersion(null)).toBe(1);
    });

    it("returns default for zero", () => {
      expect(normalizeSchemaVersion(0)).toBe(1);
    });

    it("returns default for negative numbers", () => {
      expect(normalizeSchemaVersion(-1)).toBe(1);
      expect(normalizeSchemaVersion(-100)).toBe(1);
    });

    it("returns default for non-integers", () => {
      expect(normalizeSchemaVersion(1.5)).toBe(1);
      expect(normalizeSchemaVersion(2.9)).toBe(1);
    });

    it("returns default for strings", () => {
      expect(normalizeSchemaVersion("1")).toBe(1);
    });
  });
});

describe("isExternalCategory", () => {
  it("returns true for trigger", () => {
    expect(isExternalCategory("trigger")).toBe(true);
  });

  it("returns true for fat", () => {
    expect(isExternalCategory("fat")).toBe(true);
  });

  it("returns false for domain", () => {
    expect(isExternalCategory("domain")).toBe(false);
  });

  it("returns false for integration", () => {
    expect(isExternalCategory("integration")).toBe(false);
  });
});

describe("isCrossContextCategory", () => {
  it("returns true for integration", () => {
    expect(isCrossContextCategory("integration")).toBe(true);
  });

  it("returns false for domain", () => {
    expect(isCrossContextCategory("domain")).toBe(false);
  });

  it("returns false for trigger", () => {
    expect(isCrossContextCategory("trigger")).toBe(false);
  });

  it("returns false for fat", () => {
    expect(isCrossContextCategory("fat")).toBe(false);
  });
});
