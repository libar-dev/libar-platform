/**
 * Unit Tests for createInvariant
 *
 * Tests the invariant factory function:
 * - Creates invariants with correct name/code
 * - check() returns boolean based on predicate
 * - assert() throws or does nothing
 * - validate() returns structured results
 * - Parameterized invariants work correctly
 * - Context is optional and handled correctly
 */
import { describe, it, expect } from "vitest";
import { createInvariant } from "../../../src/invariants/createInvariant";
import { InvariantError } from "../../../src/invariants/InvariantError";

// Test fixtures
interface TestState {
  status: "draft" | "submitted" | "confirmed";
  items: Array<{ productId: string; quantity: number }>;
  orderId: string;
}

const TestErrorCodes = {
  NOT_DRAFT: "NOT_DRAFT",
  NO_ITEMS: "NO_ITEMS",
  ITEM_NOT_FOUND: "ITEM_NOT_FOUND",
} as const;
type TestErrorCode = (typeof TestErrorCodes)[keyof typeof TestErrorCodes];

const TestInvariantError = InvariantError.forContext<TestErrorCode>("Test");

describe("createInvariant", () => {
  describe("basic invariant creation", () => {
    const isDraft = createInvariant<TestState, TestErrorCode>(
      {
        name: "isDraft",
        code: TestErrorCodes.NOT_DRAFT,
        check: (state) => state.status === "draft",
        message: (state) => `Expected draft status, got ${state.status}`,
        context: (state) => ({ orderId: state.orderId, currentStatus: state.status }),
      },
      TestInvariantError
    );

    it("creates invariant with correct name and code", () => {
      expect(isDraft.name).toBe("isDraft");
      expect(isDraft.code).toBe("NOT_DRAFT");
    });

    describe("check()", () => {
      it("returns true when state is valid", () => {
        const validState: TestState = {
          status: "draft",
          items: [],
          orderId: "order-1",
        };

        expect(isDraft.check(validState)).toBe(true);
      });

      it("returns false when state is invalid", () => {
        const invalidState: TestState = {
          status: "submitted",
          items: [],
          orderId: "order-1",
        };

        expect(isDraft.check(invalidState)).toBe(false);
      });
    });

    describe("assert()", () => {
      it("does not throw when state is valid", () => {
        const validState: TestState = {
          status: "draft",
          items: [],
          orderId: "order-1",
        };

        expect(() => isDraft.assert(validState)).not.toThrow();
      });

      it("throws InvariantError when state is invalid", () => {
        const invalidState: TestState = {
          status: "submitted",
          items: [],
          orderId: "order-1",
        };

        expect(() => isDraft.assert(invalidState)).toThrow(TestInvariantError);
      });

      it("throws error with correct code", () => {
        const invalidState: TestState = {
          status: "confirmed",
          items: [],
          orderId: "order-1",
        };

        try {
          isDraft.assert(invalidState);
          expect.fail("Expected error to be thrown");
        } catch (error) {
          expect(error).toBeInstanceOf(InvariantError);
          expect((error as InvariantError).code).toBe("NOT_DRAFT");
        }
      });

      it("throws error with correct message", () => {
        const invalidState: TestState = {
          status: "confirmed",
          items: [],
          orderId: "order-1",
        };

        try {
          isDraft.assert(invalidState);
          expect.fail("Expected error to be thrown");
        } catch (error) {
          expect((error as Error).message).toBe("Expected draft status, got confirmed");
        }
      });

      it("throws error with correct context", () => {
        const invalidState: TestState = {
          status: "submitted",
          items: [],
          orderId: "order-123",
        };

        try {
          isDraft.assert(invalidState);
          expect.fail("Expected error to be thrown");
        } catch (error) {
          expect((error as InvariantError).context).toEqual({
            orderId: "order-123",
            currentStatus: "submitted",
          });
        }
      });
    });

    describe("validate()", () => {
      it("returns { valid: true } when state is valid", () => {
        const validState: TestState = {
          status: "draft",
          items: [],
          orderId: "order-1",
        };

        const result = isDraft.validate(validState);
        expect(result).toEqual({ valid: true });
      });

      it("returns violation details when state is invalid", () => {
        const invalidState: TestState = {
          status: "submitted",
          items: [],
          orderId: "order-123",
        };

        const result = isDraft.validate(invalidState);
        expect(result.valid).toBe(false);

        if (!result.valid) {
          expect(result.code).toBe("NOT_DRAFT");
          expect(result.message).toBe("Expected draft status, got submitted");
          expect(result.context).toEqual({
            orderId: "order-123",
            currentStatus: "submitted",
          });
        }
      });
    });
  });

  describe("invariant without context function", () => {
    const hasItems = createInvariant<TestState, TestErrorCode>(
      {
        name: "hasItems",
        code: TestErrorCodes.NO_ITEMS,
        check: (state) => state.items.length > 0,
        message: () => "Order must have at least one item",
        // No context function
      },
      TestInvariantError
    );

    it("assert() throws error without context property", () => {
      const invalidState: TestState = {
        status: "draft",
        items: [],
        orderId: "order-1",
      };

      try {
        hasItems.assert(invalidState);
        expect.fail("Expected error to be thrown");
      } catch (error) {
        expect((error as InvariantError).context).toBeUndefined();
      }
    });

    it("validate() returns result without context property", () => {
      const invalidState: TestState = {
        status: "draft",
        items: [],
        orderId: "order-1",
      };

      const result = hasItems.validate(invalidState);
      expect(result.valid).toBe(false);

      if (!result.valid) {
        expect(result.code).toBe("NO_ITEMS");
        expect(result.message).toBe("Order must have at least one item");
        expect(result.context).toBeUndefined();
      }
    });
  });

  describe("parameterized invariant", () => {
    const itemExists = createInvariant<TestState, TestErrorCode, [string]>(
      {
        name: "itemExists",
        code: TestErrorCodes.ITEM_NOT_FOUND,
        check: (state, productId) => state.items.some((i) => i.productId === productId),
        message: (state, productId) => `Item ${productId} not found in order ${state.orderId}`,
        context: (state, productId) => ({ orderId: state.orderId, productId }),
      },
      TestInvariantError
    );

    it("check() uses parameter correctly", () => {
      const state: TestState = {
        status: "draft",
        items: [{ productId: "prod-1", quantity: 2 }],
        orderId: "order-1",
      };

      expect(itemExists.check(state, "prod-1")).toBe(true);
      expect(itemExists.check(state, "prod-2")).toBe(false);
    });

    it("assert() uses parameter in error", () => {
      const state: TestState = {
        status: "draft",
        items: [{ productId: "prod-1", quantity: 2 }],
        orderId: "order-123",
      };

      try {
        itemExists.assert(state, "prod-missing");
        expect.fail("Expected error to be thrown");
      } catch (error) {
        expect((error as Error).message).toBe("Item prod-missing not found in order order-123");
        expect((error as InvariantError).context).toEqual({
          orderId: "order-123",
          productId: "prod-missing",
        });
      }
    });

    it("validate() uses parameter in result", () => {
      const state: TestState = {
        status: "draft",
        items: [],
        orderId: "order-456",
      };

      const result = itemExists.validate(state, "prod-xyz");
      expect(result.valid).toBe(false);

      if (!result.valid) {
        expect(result.message).toBe("Item prod-xyz not found in order order-456");
        expect(result.context).toEqual({
          orderId: "order-456",
          productId: "prod-xyz",
        });
      }
    });
  });

  describe("error class integration", () => {
    const OrderInvariantError = InvariantError.forContext<"ORDER_ERROR">("Order");

    const orderInvariant = createInvariant<{ valid: boolean }, "ORDER_ERROR">(
      {
        name: "isValid",
        code: "ORDER_ERROR",
        check: (state) => state.valid,
        message: () => "Order is invalid",
      },
      OrderInvariantError
    );

    it("throws error of the correct class", () => {
      try {
        orderInvariant.assert({ valid: false });
        expect.fail("Expected error to be thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(OrderInvariantError);
        expect(error).toBeInstanceOf(InvariantError);
        expect((error as Error).name).toBe("OrderInvariantError");
      }
    });
  });
});
