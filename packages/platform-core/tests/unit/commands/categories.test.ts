/**
 * Unit Tests for Command Category Utilities
 *
 * Tests the command taxonomy utilities:
 * - CommandCategory type and constants
 * - Type guards and normalizers
 * - Category classification helpers
 */
import { describe, it, expect } from "vitest";
import {
  COMMAND_CATEGORIES,
  CommandCategorySchema,
  DEFAULT_COMMAND_CATEGORY,
  isCommandCategory,
  normalizeCommandCategory,
  isAggregateCommand,
  isProcessCommand,
  isSystemCommand,
  isBatchCommand,
  AggregateTargetSchema,
} from "../../../src/commands/categories";

describe("COMMAND_CATEGORIES", () => {
  it("contains all four command categories", () => {
    expect(COMMAND_CATEGORIES).toHaveLength(4);
    expect(COMMAND_CATEGORIES).toContain("aggregate");
    expect(COMMAND_CATEGORIES).toContain("process");
    expect(COMMAND_CATEGORIES).toContain("system");
    expect(COMMAND_CATEGORIES).toContain("batch");
  });

  it("has correct order (aggregate, process, system, batch)", () => {
    expect(COMMAND_CATEGORIES[0]).toBe("aggregate");
    expect(COMMAND_CATEGORIES[1]).toBe("process");
    expect(COMMAND_CATEGORIES[2]).toBe("system");
    expect(COMMAND_CATEGORIES[3]).toBe("batch");
  });
});

describe("CommandCategorySchema", () => {
  it("validates valid categories", () => {
    expect(CommandCategorySchema.parse("aggregate")).toBe("aggregate");
    expect(CommandCategorySchema.parse("process")).toBe("process");
    expect(CommandCategorySchema.parse("system")).toBe("system");
    expect(CommandCategorySchema.parse("batch")).toBe("batch");
  });

  it("rejects invalid categories", () => {
    expect(() => CommandCategorySchema.parse("invalid")).toThrow();
    expect(() => CommandCategorySchema.parse("AGGREGATE")).toThrow(); // Case-sensitive
    expect(() => CommandCategorySchema.parse("")).toThrow();
    expect(() => CommandCategorySchema.parse(null)).toThrow();
    expect(() => CommandCategorySchema.parse(123)).toThrow();
  });
});

describe("DEFAULT_COMMAND_CATEGORY", () => {
  it("defaults to aggregate", () => {
    expect(DEFAULT_COMMAND_CATEGORY).toBe("aggregate");
  });
});

describe("isCommandCategory", () => {
  describe("with valid categories", () => {
    it("returns true for aggregate", () => {
      expect(isCommandCategory("aggregate")).toBe(true);
    });

    it("returns true for process", () => {
      expect(isCommandCategory("process")).toBe(true);
    });

    it("returns true for system", () => {
      expect(isCommandCategory("system")).toBe(true);
    });

    it("returns true for batch", () => {
      expect(isCommandCategory("batch")).toBe(true);
    });
  });

  describe("with invalid values", () => {
    it("returns false for invalid string", () => {
      expect(isCommandCategory("invalid")).toBe(false);
    });

    it("returns false for uppercase", () => {
      expect(isCommandCategory("AGGREGATE")).toBe(false);
    });

    it("returns false for null", () => {
      expect(isCommandCategory(null)).toBe(false);
    });

    it("returns false for undefined", () => {
      expect(isCommandCategory(undefined)).toBe(false);
    });

    it("returns false for number", () => {
      expect(isCommandCategory(123)).toBe(false);
    });

    it("returns false for empty string", () => {
      expect(isCommandCategory("")).toBe(false);
    });
  });
});

describe("normalizeCommandCategory", () => {
  describe("with valid categories", () => {
    it("returns the category unchanged", () => {
      expect(normalizeCommandCategory("aggregate")).toBe("aggregate");
      expect(normalizeCommandCategory("process")).toBe("process");
      expect(normalizeCommandCategory("system")).toBe("system");
      expect(normalizeCommandCategory("batch")).toBe("batch");
    });
  });

  describe("with invalid values", () => {
    it("returns default for undefined", () => {
      expect(normalizeCommandCategory(undefined)).toBe("aggregate");
    });

    it("returns default for null", () => {
      expect(normalizeCommandCategory(null)).toBe("aggregate");
    });

    it("returns default for invalid string", () => {
      expect(normalizeCommandCategory("invalid")).toBe("aggregate");
    });

    it("returns default for number", () => {
      expect(normalizeCommandCategory(123)).toBe("aggregate");
    });
  });
});

describe("isAggregateCommand", () => {
  it("returns true for aggregate", () => {
    expect(isAggregateCommand("aggregate")).toBe(true);
  });

  it("returns false for process", () => {
    expect(isAggregateCommand("process")).toBe(false);
  });

  it("returns false for system", () => {
    expect(isAggregateCommand("system")).toBe(false);
  });

  it("returns false for batch", () => {
    expect(isAggregateCommand("batch")).toBe(false);
  });
});

describe("isProcessCommand", () => {
  it("returns true for process", () => {
    expect(isProcessCommand("process")).toBe(true);
  });

  it("returns false for aggregate", () => {
    expect(isProcessCommand("aggregate")).toBe(false);
  });

  it("returns false for system", () => {
    expect(isProcessCommand("system")).toBe(false);
  });

  it("returns false for batch", () => {
    expect(isProcessCommand("batch")).toBe(false);
  });
});

describe("isSystemCommand", () => {
  it("returns true for system", () => {
    expect(isSystemCommand("system")).toBe(true);
  });

  it("returns false for aggregate", () => {
    expect(isSystemCommand("aggregate")).toBe(false);
  });

  it("returns false for process", () => {
    expect(isSystemCommand("process")).toBe(false);
  });

  it("returns false for batch", () => {
    expect(isSystemCommand("batch")).toBe(false);
  });
});

describe("isBatchCommand", () => {
  it("returns true for batch", () => {
    expect(isBatchCommand("batch")).toBe(true);
  });

  it("returns false for aggregate", () => {
    expect(isBatchCommand("aggregate")).toBe(false);
  });

  it("returns false for process", () => {
    expect(isBatchCommand("process")).toBe(false);
  });

  it("returns false for system", () => {
    expect(isBatchCommand("system")).toBe(false);
  });
});

describe("AggregateTargetSchema", () => {
  it("validates valid aggregate targets", () => {
    const target = { type: "Order", idField: "orderId" };
    expect(AggregateTargetSchema.parse(target)).toEqual(target);
  });

  it("rejects empty type", () => {
    expect(() => AggregateTargetSchema.parse({ type: "", idField: "orderId" })).toThrow();
  });

  it("rejects empty idField", () => {
    expect(() => AggregateTargetSchema.parse({ type: "Order", idField: "" })).toThrow();
  });

  it("rejects missing type", () => {
    expect(() => AggregateTargetSchema.parse({ idField: "orderId" })).toThrow();
  });

  it("rejects missing idField", () => {
    expect(() => AggregateTargetSchema.parse({ type: "Order" })).toThrow();
  });
});
