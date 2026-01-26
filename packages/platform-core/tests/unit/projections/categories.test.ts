/**
 * Projection Categories Unit Tests
 *
 * Tests for the projection category taxonomy, type guards, helper functions,
 * and validation module.
 */

import { describe, it, expect } from "vitest";
import {
  PROJECTION_CATEGORIES,
  ProjectionCategorySchema,
  isProjectionCategory,
  isLogicProjection,
  isViewProjection,
  isReportingProjection,
  isIntegrationProjection,
  isClientExposed,
  type ProjectionCategory,
} from "../../../src/projections/index.js";
import {
  PROJECTION_VALIDATION_ERRORS,
  validateProjectionCategory,
  assertValidCategory,
} from "../../../src/projections/validation.js";

describe("Projection Categories", () => {
  describe("PROJECTION_CATEGORIES tuple", () => {
    it("contains all four categories", () => {
      expect(PROJECTION_CATEGORIES).toEqual(["logic", "view", "reporting", "integration"]);
    });

    it("is a readonly tuple", () => {
      // TypeScript enforces this at compile time, but we can check it's an array
      expect(Array.isArray(PROJECTION_CATEGORIES)).toBe(true);
      expect(PROJECTION_CATEGORIES.length).toBe(4);
    });
  });

  describe("ProjectionCategorySchema", () => {
    it("accepts valid categories", () => {
      for (const category of PROJECTION_CATEGORIES) {
        const result = ProjectionCategorySchema.safeParse(category);
        expect(result.success).toBe(true);
      }
    });

    it("rejects invalid categories", () => {
      const invalidValues = ["custom", "VIEW", "Logic", "viewModel", "read", "", 123, null];
      for (const value of invalidValues) {
        const result = ProjectionCategorySchema.safeParse(value);
        expect(result.success).toBe(false);
      }
    });
  });

  describe("isProjectionCategory type guard", () => {
    it.each([
      ["logic", true],
      ["view", true],
      ["reporting", true],
      ["integration", true],
      ["custom", false],
      ["VIEW", false],
      ["Logic", false],
      ["", false],
      [123, false],
      [null, false],
      [undefined, false],
    ])("isProjectionCategory(%s) returns %s", (value, expected) => {
      expect(isProjectionCategory(value)).toBe(expected);
    });

    describe("edge cases - non-string types", () => {
      it("returns false for objects", () => {
        expect(isProjectionCategory({})).toBe(false);
      });

      it("returns false for arrays", () => {
        expect(isProjectionCategory(["view"])).toBe(false);
      });

      it("returns false for booleans", () => {
        expect(isProjectionCategory(true)).toBe(false);
        expect(isProjectionCategory(false)).toBe(false);
      });

      it("returns false for whitespace-padded strings", () => {
        expect(isProjectionCategory(" view ")).toBe(false);
        expect(isProjectionCategory("\tlogic\n")).toBe(false);
      });
    });
  });

  describe("category helper functions", () => {
    describe("isLogicProjection", () => {
      it("returns true for logic category", () => {
        expect(isLogicProjection("logic")).toBe(true);
      });

      it("returns false for other categories", () => {
        expect(isLogicProjection("view")).toBe(false);
        expect(isLogicProjection("reporting")).toBe(false);
        expect(isLogicProjection("integration")).toBe(false);
      });
    });

    describe("isViewProjection", () => {
      it("returns true for view category", () => {
        expect(isViewProjection("view")).toBe(true);
      });

      it("returns false for other categories", () => {
        expect(isViewProjection("logic")).toBe(false);
        expect(isViewProjection("reporting")).toBe(false);
        expect(isViewProjection("integration")).toBe(false);
      });
    });

    describe("isReportingProjection", () => {
      it("returns true for reporting category", () => {
        expect(isReportingProjection("reporting")).toBe(true);
      });

      it("returns false for other categories", () => {
        expect(isReportingProjection("logic")).toBe(false);
        expect(isReportingProjection("view")).toBe(false);
        expect(isReportingProjection("integration")).toBe(false);
      });
    });

    describe("isIntegrationProjection", () => {
      it("returns true for integration category", () => {
        expect(isIntegrationProjection("integration")).toBe(true);
      });

      it("returns false for other categories", () => {
        expect(isIntegrationProjection("logic")).toBe(false);
        expect(isIntegrationProjection("view")).toBe(false);
        expect(isIntegrationProjection("reporting")).toBe(false);
      });
    });
  });

  describe("isClientExposed", () => {
    it.each([
      ["logic" as ProjectionCategory, false],
      ["view" as ProjectionCategory, true],
      ["reporting" as ProjectionCategory, false],
      ["integration" as ProjectionCategory, false],
    ])("isClientExposed(%s) returns %s", (category, expected) => {
      expect(isClientExposed(category)).toBe(expected);
    });
  });
});

describe("Projection Validation", () => {
  describe("PROJECTION_VALIDATION_ERRORS", () => {
    it("has CATEGORY_REQUIRED error code", () => {
      expect(PROJECTION_VALIDATION_ERRORS.CATEGORY_REQUIRED).toBe("CATEGORY_REQUIRED");
    });

    it("has INVALID_CATEGORY error code", () => {
      expect(PROJECTION_VALIDATION_ERRORS.INVALID_CATEGORY).toBe("INVALID_CATEGORY");
    });
  });

  describe("validateProjectionCategory", () => {
    describe("CATEGORY_REQUIRED error", () => {
      it("returns error for undefined", () => {
        const result = validateProjectionCategory(undefined);
        expect(result.valid).toBe(false);
        if (!result.valid) {
          expect(result.error.code).toBe("CATEGORY_REQUIRED");
          expect(result.error.message).toContain("required");
          expect(result.error.suggestedCategories).toEqual(PROJECTION_CATEGORIES);
        }
      });

      it("returns error for null", () => {
        const result = validateProjectionCategory(null);
        expect(result.valid).toBe(false);
        if (!result.valid) {
          expect(result.error.code).toBe("CATEGORY_REQUIRED");
          expect(result.error.suggestedCategories).toEqual(PROJECTION_CATEGORIES);
        }
      });
    });

    describe("INVALID_CATEGORY error", () => {
      it.each(["custom", "VIEW", "Logic", "viewModel", "read"])(
        "returns error for invalid value '%s'",
        (value) => {
          const result = validateProjectionCategory(value);
          expect(result.valid).toBe(false);
          if (!result.valid) {
            expect(result.error.code).toBe("INVALID_CATEGORY");
            expect(result.error.message).toContain(value);
            expect(result.error.suggestedCategories).toEqual(PROJECTION_CATEGORIES);
          }
        }
      );
    });

    describe("edge cases - non-string types", () => {
      it("returns INVALID_CATEGORY for objects", () => {
        const result = validateProjectionCategory({});
        expect(result.valid).toBe(false);
        if (!result.valid) {
          expect(result.error.code).toBe("INVALID_CATEGORY");
        }
      });

      it("returns INVALID_CATEGORY for arrays", () => {
        const result = validateProjectionCategory(["view"]);
        expect(result.valid).toBe(false);
        if (!result.valid) {
          expect(result.error.code).toBe("INVALID_CATEGORY");
        }
      });

      it("returns INVALID_CATEGORY for booleans", () => {
        const result = validateProjectionCategory(true);
        expect(result.valid).toBe(false);
        if (!result.valid) {
          expect(result.error.code).toBe("INVALID_CATEGORY");
        }
      });

      it("returns INVALID_CATEGORY for numbers", () => {
        const result = validateProjectionCategory(42);
        expect(result.valid).toBe(false);
        if (!result.valid) {
          expect(result.error.code).toBe("INVALID_CATEGORY");
        }
      });

      it("returns INVALID_CATEGORY for whitespace-padded strings", () => {
        const result = validateProjectionCategory(" view ");
        expect(result.valid).toBe(false);
        if (!result.valid) {
          expect(result.error.code).toBe("INVALID_CATEGORY");
        }
      });
    });

    describe("valid categories", () => {
      it.each(["logic", "view", "reporting", "integration"] as const)(
        "returns valid for '%s'",
        (category) => {
          const result = validateProjectionCategory(category);
          expect(result.valid).toBe(true);
          if (result.valid) {
            expect(result.category).toBe(category);
          }
        }
      );
    });
  });

  describe("assertValidCategory", () => {
    it("returns category for valid input", () => {
      expect(assertValidCategory("view")).toBe("view");
      expect(assertValidCategory("logic")).toBe("logic");
    });

    it("throws for invalid input", () => {
      expect(() => assertValidCategory("invalid")).toThrow("INVALID_CATEGORY");
    });

    it("throws for undefined input", () => {
      expect(() => assertValidCategory(undefined)).toThrow("CATEGORY_REQUIRED");
    });
  });
});
