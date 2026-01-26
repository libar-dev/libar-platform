/**
 * Unit Tests for createInvariantSet
 *
 * Tests the invariant set builder:
 * - Creates set with all invariants
 * - checkAll() returns true/false appropriately
 * - assertAll() throws on first failure (fail-fast)
 * - validateAll() collects all violations
 * - Empty set always passes
 */
import { describe, it, expect } from "vitest";
import { createInvariant } from "../../../src/invariants/createInvariant";
import { createInvariantSet } from "../../../src/invariants/createInvariantSet";
import { InvariantError } from "../../../src/invariants/InvariantError";

// Test fixtures
interface TestState {
  status: "draft" | "submitted" | "confirmed";
  items: Array<{ productId: string }>;
  orderId: string;
}

const TestErrorCodes = {
  NOT_DRAFT: "NOT_DRAFT",
  NO_ITEMS: "NO_ITEMS",
  TOO_MANY_ITEMS: "TOO_MANY_ITEMS",
} as const;
type TestErrorCode = (typeof TestErrorCodes)[keyof typeof TestErrorCodes];

const TestInvariantError = InvariantError.forContext<TestErrorCode>("Test");

// Create test invariants
const isDraft = createInvariant<TestState, TestErrorCode>(
  {
    name: "isDraft",
    code: TestErrorCodes.NOT_DRAFT,
    check: (state) => state.status === "draft",
    message: (state) => `Expected draft, got ${state.status}`,
    context: (state) => ({ orderId: state.orderId }),
  },
  TestInvariantError
);

const hasItems = createInvariant<TestState, TestErrorCode>(
  {
    name: "hasItems",
    code: TestErrorCodes.NO_ITEMS,
    check: (state) => state.items.length > 0,
    message: () => "Order must have at least one item",
  },
  TestInvariantError
);

const notTooManyItems = createInvariant<TestState, TestErrorCode>(
  {
    name: "notTooManyItems",
    code: TestErrorCodes.TOO_MANY_ITEMS,
    check: (state) => state.items.length <= 10,
    message: (state) => `Too many items: ${state.items.length}`,
    context: (state) => ({ count: state.items.length }),
  },
  TestInvariantError
);

describe("createInvariantSet", () => {
  describe("set creation", () => {
    it("creates set with all invariants accessible", () => {
      const set = createInvariantSet([isDraft, hasItems]);

      expect(set.invariants).toHaveLength(2);
      expect(set.invariants[0].name).toBe(isDraft.name);
      expect(set.invariants[1].name).toBe(hasItems.name);
    });

    it("invariants array is immutable (frozen copy)", () => {
      const originalArray = [isDraft, hasItems];
      const set = createInvariantSet(originalArray);

      // Verify the array is frozen
      expect(Object.isFrozen(set.invariants)).toBe(true);

      // Verify it's a copy (mutating original doesn't affect set)
      originalArray.push(notTooManyItems);
      expect(set.invariants).toHaveLength(2);
    });
  });

  describe("checkAll()", () => {
    const set = createInvariantSet([isDraft, hasItems]);

    it("returns true when all invariants pass", () => {
      const validState: TestState = {
        status: "draft",
        items: [{ productId: "prod-1" }],
        orderId: "order-1",
      };

      expect(set.checkAll(validState)).toBe(true);
    });

    it("returns false when first invariant fails", () => {
      const invalidState: TestState = {
        status: "submitted",
        items: [{ productId: "prod-1" }],
        orderId: "order-1",
      };

      expect(set.checkAll(invalidState)).toBe(false);
    });

    it("returns false when second invariant fails", () => {
      const invalidState: TestState = {
        status: "draft",
        items: [],
        orderId: "order-1",
      };

      expect(set.checkAll(invalidState)).toBe(false);
    });

    it("returns false when all invariants fail", () => {
      const invalidState: TestState = {
        status: "submitted",
        items: [],
        orderId: "order-1",
      };

      expect(set.checkAll(invalidState)).toBe(false);
    });
  });

  describe("assertAll()", () => {
    const set = createInvariantSet([isDraft, hasItems, notTooManyItems]);

    it("does not throw when all invariants pass", () => {
      const validState: TestState = {
        status: "draft",
        items: [{ productId: "prod-1" }],
        orderId: "order-1",
      };

      expect(() => set.assertAll(validState)).not.toThrow();
    });

    it("throws on first failure (fail-fast)", () => {
      const invalidState: TestState = {
        status: "submitted", // First invariant fails
        items: [], // Second would also fail
        orderId: "order-1",
      };

      try {
        set.assertAll(invalidState);
        expect.fail("Expected error to be thrown");
      } catch (error) {
        // Should fail on first invariant (isDraft), not second (hasItems)
        expect((error as InvariantError).code).toBe("NOT_DRAFT");
      }
    });

    it("throws correct error class", () => {
      const invalidState: TestState = {
        status: "confirmed",
        items: [{ productId: "prod-1" }],
        orderId: "order-1",
      };

      try {
        set.assertAll(invalidState);
        expect.fail("Expected error to be thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(TestInvariantError);
        expect(error).toBeInstanceOf(InvariantError);
      }
    });

    it("throws error with context when provided", () => {
      const invalidState: TestState = {
        status: "submitted",
        items: [{ productId: "prod-1" }],
        orderId: "order-123",
      };

      try {
        set.assertAll(invalidState);
        expect.fail("Expected error to be thrown");
      } catch (error) {
        expect((error as InvariantError).context).toEqual({ orderId: "order-123" });
      }
    });
  });

  describe("validateAll()", () => {
    const set = createInvariantSet([isDraft, hasItems, notTooManyItems]);

    it("returns { valid: true } when all invariants pass", () => {
      const validState: TestState = {
        status: "draft",
        items: [{ productId: "prod-1" }],
        orderId: "order-1",
      };

      const result = set.validateAll(validState);
      expect(result).toEqual({ valid: true });
    });

    it("collects single violation", () => {
      const invalidState: TestState = {
        status: "submitted",
        items: [{ productId: "prod-1" }],
        orderId: "order-123",
      };

      const result = set.validateAll(invalidState);
      expect(result.valid).toBe(false);

      if (!result.valid) {
        expect(result.violations).toHaveLength(1);
        expect(result.violations[0].code).toBe("NOT_DRAFT");
        expect(result.violations[0].message).toBe("Expected draft, got submitted");
        expect(result.violations[0].context).toEqual({ orderId: "order-123" });
      }
    });

    it("collects multiple violations (does not short-circuit)", () => {
      const invalidState: TestState = {
        status: "submitted", // Fails isDraft
        items: [], // Fails hasItems
        orderId: "order-1",
      };

      const result = set.validateAll(invalidState);
      expect(result.valid).toBe(false);

      if (!result.valid) {
        expect(result.violations).toHaveLength(2);

        // First violation: isDraft
        expect(result.violations[0].code).toBe("NOT_DRAFT");

        // Second violation: hasItems
        expect(result.violations[1].code).toBe("NO_ITEMS");
      }
    });

    it("collects all three violations when all fail", () => {
      // Create state that violates all three invariants
      const manyItems = Array.from({ length: 15 }, (_, i) => ({ productId: `prod-${i}` }));
      const invalidState: TestState = {
        status: "submitted", // Fails isDraft
        items: manyItems, // Fails notTooManyItems (but passes hasItems)
        orderId: "order-1",
      };

      const result = set.validateAll(invalidState);
      expect(result.valid).toBe(false);

      if (!result.valid) {
        expect(result.violations).toHaveLength(2);
        expect(result.violations.map((v) => v.code)).toContain("NOT_DRAFT");
        expect(result.violations.map((v) => v.code)).toContain("TOO_MANY_ITEMS");
      }
    });

    it("omits context when invariant has no context function", () => {
      const invalidState: TestState = {
        status: "draft",
        items: [], // Fails hasItems (which has no context)
        orderId: "order-1",
      };

      const result = set.validateAll(invalidState);
      expect(result.valid).toBe(false);

      if (!result.valid) {
        expect(result.violations).toHaveLength(1);
        expect(result.violations[0].code).toBe("NO_ITEMS");
        expect(result.violations[0].context).toBeUndefined();
      }
    });
  });

  describe("empty set", () => {
    const emptySet = createInvariantSet<TestState, TestErrorCode>([]);

    it("checkAll returns true for empty set", () => {
      const state: TestState = {
        status: "submitted",
        items: [],
        orderId: "order-1",
      };

      expect(emptySet.checkAll(state)).toBe(true);
    });

    it("assertAll does not throw for empty set", () => {
      const state: TestState = {
        status: "submitted",
        items: [],
        orderId: "order-1",
      };

      expect(() => emptySet.assertAll(state)).not.toThrow();
    });

    it("validateAll returns valid for empty set", () => {
      const state: TestState = {
        status: "submitted",
        items: [],
        orderId: "order-1",
      };

      expect(emptySet.validateAll(state)).toEqual({ valid: true });
    });
  });

  describe("single invariant set", () => {
    const singleSet = createInvariantSet([isDraft]);

    it("works with single invariant", () => {
      const validState: TestState = {
        status: "draft",
        items: [],
        orderId: "order-1",
      };

      expect(singleSet.checkAll(validState)).toBe(true);
      expect(() => singleSet.assertAll(validState)).not.toThrow();
      expect(singleSet.validateAll(validState)).toEqual({ valid: true });
    });
  });
});
