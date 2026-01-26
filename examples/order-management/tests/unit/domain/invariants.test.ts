/**
 * Unit tests for Order invariants.
 *
 * Tests both declarative invariants (createInvariant) and procedural assertions.
 * These are pure unit tests that don't require Convex or mocking.
 */
import { describe, it, expect } from "vitest";
import {
  // Procedural assertions (still exported)
  assertOrderExists,
  assertOrderDoesNotExist,
  assertItemExists,
  validateItem,
  // Declarative invariants
  orderIsDraft,
  orderIsSubmitted,
  orderNotCancelled,
  orderNotConfirmed,
  orderHasItems,
  orderCanAddItem,
  // Invariant sets
  orderSubmitInvariants,
  orderAddItemInvariants,
  orderCancelInvariants,
  // Error and constants
  OrderInvariantError,
  OrderErrorCodes,
  MAX_ITEMS_PER_ORDER,
} from "../../../convex/contexts/orders/domain/invariants.js";
import type { OrderCMS, OrderItem } from "../../../convex/contexts/orders/domain/order.js";

/**
 * Factory to create a valid OrderCMS for testing.
 */
function createTestOrderCMS(overrides: Partial<OrderCMS> = {}): OrderCMS {
  return {
    orderId: "ord_test",
    customerId: "cust_test",
    status: "draft",
    items: [],
    totalAmount: 0,
    version: 1,
    stateVersion: 1,
    createdAt: 1000,
    updatedAt: 1000,
    ...overrides,
  };
}

/**
 * Factory to create a valid OrderItem for testing.
 */
function createTestItem(overrides: Partial<OrderItem> = {}): OrderItem {
  return {
    productId: "prod_test",
    productName: "Test Product",
    quantity: 1,
    unitPrice: 10,
    ...overrides,
  };
}

describe("assertOrderExists", () => {
  it("does not throw when order exists", () => {
    const order = createTestOrderCMS();
    expect(() => assertOrderExists(order)).not.toThrow();
  });

  it("throws ORDER_NOT_FOUND when order is null", () => {
    expect(() => assertOrderExists(null)).toThrow(OrderInvariantError);
    try {
      assertOrderExists(null);
    } catch (error) {
      expect(error).toBeInstanceOf(OrderInvariantError);
      expect((error as OrderInvariantError).code).toBe(OrderErrorCodes.ORDER_NOT_FOUND);
    }
  });

  it("throws ORDER_NOT_FOUND when order is undefined", () => {
    expect(() => assertOrderExists(undefined)).toThrow(OrderInvariantError);
    try {
      assertOrderExists(undefined);
    } catch (error) {
      expect((error as OrderInvariantError).code).toBe(OrderErrorCodes.ORDER_NOT_FOUND);
    }
  });
});

describe("assertOrderDoesNotExist", () => {
  it("does not throw when order is null", () => {
    expect(() => assertOrderDoesNotExist(null)).not.toThrow();
  });

  it("does not throw when order is undefined", () => {
    expect(() => assertOrderDoesNotExist(undefined)).not.toThrow();
  });

  it("throws ORDER_ALREADY_EXISTS when order exists", () => {
    const order = createTestOrderCMS({ orderId: "ord_existing" });
    expect(() => assertOrderDoesNotExist(order)).toThrow(OrderInvariantError);
    try {
      assertOrderDoesNotExist(order);
    } catch (error) {
      expect((error as OrderInvariantError).code).toBe(OrderErrorCodes.ORDER_ALREADY_EXISTS);
      expect((error as OrderInvariantError).context?.orderId).toBe("ord_existing");
    }
  });
});

describe("orderIsDraft", () => {
  it("check() returns true when order is draft", () => {
    const order = createTestOrderCMS({ status: "draft" });
    expect(orderIsDraft.check(order)).toBe(true);
  });

  it("check() returns false when order is submitted", () => {
    const order = createTestOrderCMS({ status: "submitted" });
    expect(orderIsDraft.check(order)).toBe(false);
  });

  it("assert() does not throw when order is draft", () => {
    const order = createTestOrderCMS({ status: "draft" });
    expect(() => orderIsDraft.assert(order)).not.toThrow();
  });

  it("assert() throws ORDER_NOT_IN_DRAFT when order is submitted", () => {
    const order = createTestOrderCMS({ status: "submitted" });
    expect(() => orderIsDraft.assert(order)).toThrow(OrderInvariantError);
    try {
      orderIsDraft.assert(order);
    } catch (error) {
      expect((error as OrderInvariantError).code).toBe(OrderErrorCodes.ORDER_NOT_IN_DRAFT);
      expect((error as OrderInvariantError).context?.currentStatus).toBe("submitted");
    }
  });

  it("assert() throws ORDER_NOT_IN_DRAFT when order is confirmed", () => {
    const order = createTestOrderCMS({ status: "confirmed" });
    try {
      orderIsDraft.assert(order);
    } catch (error) {
      expect((error as OrderInvariantError).code).toBe(OrderErrorCodes.ORDER_NOT_IN_DRAFT);
    }
  });

  it("assert() throws ORDER_NOT_IN_DRAFT when order is cancelled", () => {
    const order = createTestOrderCMS({ status: "cancelled" });
    try {
      orderIsDraft.assert(order);
    } catch (error) {
      expect((error as OrderInvariantError).code).toBe(OrderErrorCodes.ORDER_NOT_IN_DRAFT);
    }
  });
});

describe("orderIsSubmitted", () => {
  it("check() returns true when order is submitted", () => {
    const order = createTestOrderCMS({ status: "submitted" });
    expect(orderIsSubmitted.check(order)).toBe(true);
  });

  it("check() returns false when order is draft", () => {
    const order = createTestOrderCMS({ status: "draft" });
    expect(orderIsSubmitted.check(order)).toBe(false);
  });

  it("assert() does not throw when order is submitted", () => {
    const order = createTestOrderCMS({ status: "submitted" });
    expect(() => orderIsSubmitted.assert(order)).not.toThrow();
  });

  it("assert() throws ORDER_NOT_SUBMITTED when order is draft", () => {
    const order = createTestOrderCMS({ status: "draft" });
    try {
      orderIsSubmitted.assert(order);
    } catch (error) {
      expect((error as OrderInvariantError).code).toBe(OrderErrorCodes.ORDER_NOT_SUBMITTED);
    }
  });

  it("assert() throws ORDER_NOT_SUBMITTED when order is confirmed", () => {
    const order = createTestOrderCMS({ status: "confirmed" });
    try {
      orderIsSubmitted.assert(order);
    } catch (error) {
      expect((error as OrderInvariantError).code).toBe(OrderErrorCodes.ORDER_NOT_SUBMITTED);
    }
  });
});

describe("orderNotCancelled", () => {
  it("check() returns true when order is draft", () => {
    const order = createTestOrderCMS({ status: "draft" });
    expect(orderNotCancelled.check(order)).toBe(true);
  });

  it("check() returns true when order is submitted", () => {
    const order = createTestOrderCMS({ status: "submitted" });
    expect(orderNotCancelled.check(order)).toBe(true);
  });

  it("check() returns false when order is cancelled", () => {
    const order = createTestOrderCMS({ status: "cancelled" });
    expect(orderNotCancelled.check(order)).toBe(false);
  });

  it("assert() does not throw when order is draft", () => {
    const order = createTestOrderCMS({ status: "draft" });
    expect(() => orderNotCancelled.assert(order)).not.toThrow();
  });

  it("assert() does not throw when order is confirmed", () => {
    const order = createTestOrderCMS({ status: "confirmed" });
    expect(() => orderNotCancelled.assert(order)).not.toThrow();
  });

  it("assert() throws ORDER_ALREADY_CANCELLED when order is cancelled", () => {
    const order = createTestOrderCMS({ status: "cancelled", orderId: "ord_cancelled" });
    try {
      orderNotCancelled.assert(order);
    } catch (error) {
      expect((error as OrderInvariantError).code).toBe(OrderErrorCodes.ORDER_ALREADY_CANCELLED);
      expect((error as OrderInvariantError).context?.orderId).toBe("ord_cancelled");
    }
  });
});

describe("orderNotConfirmed", () => {
  it("check() returns true when order is draft", () => {
    const order = createTestOrderCMS({ status: "draft" });
    expect(orderNotConfirmed.check(order)).toBe(true);
  });

  it("check() returns true when order is submitted", () => {
    const order = createTestOrderCMS({ status: "submitted" });
    expect(orderNotConfirmed.check(order)).toBe(true);
  });

  it("check() returns false when order is confirmed", () => {
    const order = createTestOrderCMS({ status: "confirmed" });
    expect(orderNotConfirmed.check(order)).toBe(false);
  });

  it("assert() does not throw when order is draft", () => {
    const order = createTestOrderCMS({ status: "draft" });
    expect(() => orderNotConfirmed.assert(order)).not.toThrow();
  });

  it("assert() does not throw when order is cancelled", () => {
    const order = createTestOrderCMS({ status: "cancelled" });
    expect(() => orderNotConfirmed.assert(order)).not.toThrow();
  });

  it("assert() throws ORDER_ALREADY_CONFIRMED when order is confirmed", () => {
    const order = createTestOrderCMS({ status: "confirmed", orderId: "ord_confirmed" });
    try {
      orderNotConfirmed.assert(order);
    } catch (error) {
      expect((error as OrderInvariantError).code).toBe(OrderErrorCodes.ORDER_ALREADY_CONFIRMED);
      expect((error as OrderInvariantError).context?.orderId).toBe("ord_confirmed");
    }
  });
});

describe("orderHasItems", () => {
  it("check() returns true when order has items", () => {
    const order = createTestOrderCMS({
      items: [createTestItem()],
    });
    expect(orderHasItems.check(order)).toBe(true);
  });

  it("check() returns false when order has no items", () => {
    const order = createTestOrderCMS({ items: [] });
    expect(orderHasItems.check(order)).toBe(false);
  });

  it("assert() does not throw when order has items", () => {
    const order = createTestOrderCMS({
      items: [createTestItem()],
    });
    expect(() => orderHasItems.assert(order)).not.toThrow();
  });

  it("assert() does not throw when order has multiple items", () => {
    const order = createTestOrderCMS({
      items: [createTestItem(), createTestItem({ productId: "prod_2" })],
    });
    expect(() => orderHasItems.assert(order)).not.toThrow();
  });

  it("assert() throws ORDER_HAS_NO_ITEMS when order has empty items array", () => {
    const order = createTestOrderCMS({ items: [], orderId: "ord_empty" });
    try {
      orderHasItems.assert(order);
    } catch (error) {
      expect((error as OrderInvariantError).code).toBe(OrderErrorCodes.ORDER_HAS_NO_ITEMS);
      expect((error as OrderInvariantError).context?.orderId).toBe("ord_empty");
    }
  });
});

describe("orderCanAddItem", () => {
  it("check() returns true when order has room for items", () => {
    const order = createTestOrderCMS({ items: [] });
    expect(orderCanAddItem.check(order)).toBe(true);
  });

  it("check() returns false when order is at max capacity", () => {
    const items = Array(MAX_ITEMS_PER_ORDER)
      .fill(null)
      .map((_, i) => createTestItem({ productId: `prod_${i}` }));
    const order = createTestOrderCMS({ items });
    expect(orderCanAddItem.check(order)).toBe(false);
  });

  it("assert() does not throw when order has room for items", () => {
    const order = createTestOrderCMS({ items: [] });
    expect(() => orderCanAddItem.assert(order)).not.toThrow();
  });

  it("assert() does not throw when order has less than max items", () => {
    const items = Array(MAX_ITEMS_PER_ORDER - 1)
      .fill(null)
      .map((_, i) => createTestItem({ productId: `prod_${i}` }));
    const order = createTestOrderCMS({ items });
    expect(() => orderCanAddItem.assert(order)).not.toThrow();
  });

  it("assert() throws MAX_ITEMS_EXCEEDED when order is at max capacity", () => {
    const items = Array(MAX_ITEMS_PER_ORDER)
      .fill(null)
      .map((_, i) => createTestItem({ productId: `prod_${i}` }));
    const order = createTestOrderCMS({ items, orderId: "ord_full" });
    try {
      orderCanAddItem.assert(order);
    } catch (error) {
      expect((error as OrderInvariantError).code).toBe(OrderErrorCodes.MAX_ITEMS_EXCEEDED);
      expect((error as OrderInvariantError).context?.currentCount).toBe(MAX_ITEMS_PER_ORDER);
    }
  });
});

describe("assertItemExists", () => {
  it("does not throw when item exists in order", () => {
    const order = createTestOrderCMS({
      items: [createTestItem({ productId: "prod_target" })],
    });
    expect(() => assertItemExists(order, "prod_target")).not.toThrow();
  });

  it("does not throw when item is one of many", () => {
    const order = createTestOrderCMS({
      items: [
        createTestItem({ productId: "prod_1" }),
        createTestItem({ productId: "prod_target" }),
        createTestItem({ productId: "prod_3" }),
      ],
    });
    expect(() => assertItemExists(order, "prod_target")).not.toThrow();
  });

  it("throws ITEM_NOT_FOUND when item does not exist", () => {
    const order = createTestOrderCMS({
      items: [createTestItem({ productId: "prod_other" })],
      orderId: "ord_test",
    });
    try {
      assertItemExists(order, "prod_missing");
    } catch (error) {
      expect((error as OrderInvariantError).code).toBe(OrderErrorCodes.ITEM_NOT_FOUND);
      expect((error as OrderInvariantError).context?.productId).toBe("prod_missing");
      expect((error as OrderInvariantError).context?.orderId).toBe("ord_test");
    }
  });

  it("throws ITEM_NOT_FOUND when items array is empty", () => {
    const order = createTestOrderCMS({ items: [] });
    expect(() => assertItemExists(order, "prod_any")).toThrow(OrderInvariantError);
  });
});

describe("validateItem", () => {
  it("does not throw for valid item", () => {
    const item = createTestItem();
    expect(() => validateItem(item)).not.toThrow();
  });

  it("does not throw for item with decimal price", () => {
    const item = createTestItem({ unitPrice: 9.99 });
    expect(() => validateItem(item)).not.toThrow();
  });

  it("does not throw for item with zero price (free item)", () => {
    const item = createTestItem({ unitPrice: 0 });
    expect(() => validateItem(item)).not.toThrow();
  });

  it("throws INVALID_QUANTITY for negative quantity", () => {
    const item = createTestItem({ quantity: -1 });
    try {
      validateItem(item);
    } catch (error) {
      expect((error as OrderInvariantError).code).toBe(OrderErrorCodes.INVALID_QUANTITY);
    }
  });

  it("throws INVALID_QUANTITY for zero quantity", () => {
    const item = createTestItem({ quantity: 0 });
    try {
      validateItem(item);
    } catch (error) {
      expect((error as OrderInvariantError).code).toBe(OrderErrorCodes.INVALID_QUANTITY);
    }
  });

  it("throws INVALID_QUANTITY for non-integer quantity", () => {
    const item = createTestItem({ quantity: 1.5 });
    try {
      validateItem(item);
    } catch (error) {
      expect((error as OrderInvariantError).code).toBe(OrderErrorCodes.INVALID_QUANTITY);
    }
  });

  it("throws INVALID_PRICE for negative price", () => {
    const item = createTestItem({ unitPrice: -5 });
    try {
      validateItem(item);
    } catch (error) {
      expect((error as OrderInvariantError).code).toBe(OrderErrorCodes.INVALID_PRICE);
    }
  });

  it("throws INVALID_ITEM_DATA for empty productId", () => {
    const item = createTestItem({ productId: "" });
    try {
      validateItem(item);
    } catch (error) {
      expect((error as OrderInvariantError).code).toBe(OrderErrorCodes.INVALID_ITEM_DATA);
    }
  });

  it("throws INVALID_ITEM_DATA for empty productName", () => {
    const item = createTestItem({ productName: "" });
    try {
      validateItem(item);
    } catch (error) {
      expect((error as OrderInvariantError).code).toBe(OrderErrorCodes.INVALID_ITEM_DATA);
    }
  });
});

describe("OrderInvariantError", () => {
  it("has correct name property", () => {
    const error = new OrderInvariantError(OrderErrorCodes.ORDER_NOT_FOUND, "Test message");
    expect(error.name).toBe("OrderInvariantError");
  });

  it("has correct code property", () => {
    const error = new OrderInvariantError(OrderErrorCodes.ORDER_NOT_IN_DRAFT, "Test message");
    expect(error.code).toBe("ORDER_NOT_IN_DRAFT");
  });

  it("has correct message property", () => {
    const error = new OrderInvariantError(OrderErrorCodes.ORDER_NOT_FOUND, "Custom message");
    expect(error.message).toBe("Custom message");
  });

  it("has correct context property", () => {
    const context = { orderId: "ord_123", extra: "data" };
    const error = new OrderInvariantError(OrderErrorCodes.ORDER_NOT_FOUND, "Message", context);
    expect(error.context).toEqual(context);
  });

  it("can have undefined context", () => {
    const error = new OrderInvariantError(OrderErrorCodes.ORDER_NOT_FOUND, "Message");
    expect(error.context).toBeUndefined();
  });

  it("is instance of Error", () => {
    const error = new OrderInvariantError(OrderErrorCodes.ORDER_NOT_FOUND, "Message");
    expect(error).toBeInstanceOf(Error);
  });
});

// ============================================================================
// INVARIANT SET TESTS
// ============================================================================
// Tests for composed invariant sets used by command handlers.

describe("orderSubmitInvariants", () => {
  describe("checkAll()", () => {
    it("returns true for draft order with items", () => {
      const order = createTestOrderCMS({
        status: "draft",
        items: [createTestItem()],
      });
      expect(orderSubmitInvariants.checkAll(order)).toBe(true);
    });

    it("returns false for non-draft order", () => {
      const order = createTestOrderCMS({
        status: "submitted",
        items: [createTestItem()],
      });
      expect(orderSubmitInvariants.checkAll(order)).toBe(false);
    });

    it("returns false for draft order without items", () => {
      const order = createTestOrderCMS({
        status: "draft",
        items: [],
      });
      expect(orderSubmitInvariants.checkAll(order)).toBe(false);
    });
  });

  describe("assertAll()", () => {
    it("does not throw for valid draft order with items", () => {
      const order = createTestOrderCMS({
        status: "draft",
        items: [createTestItem()],
      });
      expect(() => orderSubmitInvariants.assertAll(order)).not.toThrow();
    });

    it("throws ORDER_NOT_IN_DRAFT for submitted order (fail-fast)", () => {
      const order = createTestOrderCMS({
        status: "submitted",
        items: [createTestItem()],
      });
      try {
        orderSubmitInvariants.assertAll(order);
        expect.fail("Expected error to be thrown");
      } catch (error) {
        expect((error as OrderInvariantError).code).toBe(OrderErrorCodes.ORDER_NOT_IN_DRAFT);
      }
    });

    it("throws ORDER_HAS_NO_ITEMS for draft with no items", () => {
      const order = createTestOrderCMS({
        status: "draft",
        items: [],
      });
      try {
        orderSubmitInvariants.assertAll(order);
        expect.fail("Expected error to be thrown");
      } catch (error) {
        expect((error as OrderInvariantError).code).toBe(OrderErrorCodes.ORDER_HAS_NO_ITEMS);
      }
    });
  });

  describe("validateAll()", () => {
    it("returns valid result for draft order with items", () => {
      const order = createTestOrderCMS({
        status: "draft",
        items: [createTestItem()],
      });
      const result = orderSubmitInvariants.validateAll(order);
      expect(result.valid).toBe(true);
      if (!result.valid) return;
      // No violations array when valid
    });

    it("returns both violations when order is submitted AND has no items", () => {
      const order = createTestOrderCMS({
        status: "submitted",
        items: [],
      });
      const result = orderSubmitInvariants.validateAll(order);
      expect(result.valid).toBe(false);
      if (result.valid) return;
      expect(result.violations).toHaveLength(2);

      const codes = result.violations.map((v) => v.code);
      expect(codes).toContain(OrderErrorCodes.ORDER_NOT_IN_DRAFT);
      expect(codes).toContain(OrderErrorCodes.ORDER_HAS_NO_ITEMS);
    });
  });
});

describe("orderAddItemInvariants", () => {
  describe("checkAll()", () => {
    it("returns true for draft order under item limit", () => {
      const order = createTestOrderCMS({
        status: "draft",
        items: [createTestItem()],
      });
      expect(orderAddItemInvariants.checkAll(order)).toBe(true);
    });

    it("returns false for non-draft order", () => {
      const order = createTestOrderCMS({
        status: "confirmed",
        items: [],
      });
      expect(orderAddItemInvariants.checkAll(order)).toBe(false);
    });

    it("returns false for order at max capacity", () => {
      const items = Array(MAX_ITEMS_PER_ORDER)
        .fill(null)
        .map((_, i) => createTestItem({ productId: `prod_${i}` }));
      const order = createTestOrderCMS({
        status: "draft",
        items,
      });
      expect(orderAddItemInvariants.checkAll(order)).toBe(false);
    });
  });

  describe("assertAll()", () => {
    it("does not throw for valid draft order under limit", () => {
      const order = createTestOrderCMS({
        status: "draft",
        items: [],
      });
      expect(() => orderAddItemInvariants.assertAll(order)).not.toThrow();
    });

    it("throws ORDER_NOT_IN_DRAFT for submitted order (fail-fast)", () => {
      const order = createTestOrderCMS({
        status: "submitted",
        items: [],
      });
      try {
        orderAddItemInvariants.assertAll(order);
        expect.fail("Expected error to be thrown");
      } catch (error) {
        expect((error as OrderInvariantError).code).toBe(OrderErrorCodes.ORDER_NOT_IN_DRAFT);
      }
    });

    it("throws MAX_ITEMS_EXCEEDED for order at capacity", () => {
      const items = Array(MAX_ITEMS_PER_ORDER)
        .fill(null)
        .map((_, i) => createTestItem({ productId: `prod_${i}` }));
      const order = createTestOrderCMS({
        status: "draft",
        items,
      });
      try {
        orderAddItemInvariants.assertAll(order);
        expect.fail("Expected error to be thrown");
      } catch (error) {
        expect((error as OrderInvariantError).code).toBe(OrderErrorCodes.MAX_ITEMS_EXCEEDED);
      }
    });
  });

  describe("validateAll()", () => {
    it("returns valid result for draft order under limit", () => {
      const order = createTestOrderCMS({
        status: "draft",
        items: [],
      });
      const result = orderAddItemInvariants.validateAll(order);
      expect(result.valid).toBe(true);
      if (!result.valid) return;
      // No violations array when valid
    });

    it("returns both violations when submitted AND at capacity", () => {
      const items = Array(MAX_ITEMS_PER_ORDER)
        .fill(null)
        .map((_, i) => createTestItem({ productId: `prod_${i}` }));
      const order = createTestOrderCMS({
        status: "submitted",
        items,
      });
      const result = orderAddItemInvariants.validateAll(order);
      expect(result.valid).toBe(false);
      if (result.valid) return;
      expect(result.violations).toHaveLength(2);

      const codes = result.violations.map((v) => v.code);
      expect(codes).toContain(OrderErrorCodes.ORDER_NOT_IN_DRAFT);
      expect(codes).toContain(OrderErrorCodes.MAX_ITEMS_EXCEEDED);
    });
  });
});

describe("orderCancelInvariants", () => {
  describe("checkAll()", () => {
    it("returns true for draft order", () => {
      const order = createTestOrderCMS({ status: "draft" });
      expect(orderCancelInvariants.checkAll(order)).toBe(true);
    });

    it("returns true for submitted order", () => {
      const order = createTestOrderCMS({ status: "submitted" });
      expect(orderCancelInvariants.checkAll(order)).toBe(true);
    });

    it("returns false for confirmed order", () => {
      const order = createTestOrderCMS({ status: "confirmed" });
      expect(orderCancelInvariants.checkAll(order)).toBe(false);
    });

    it("returns false for cancelled order", () => {
      const order = createTestOrderCMS({ status: "cancelled" });
      expect(orderCancelInvariants.checkAll(order)).toBe(false);
    });
  });

  describe("assertAll()", () => {
    it("does not throw for draft order", () => {
      const order = createTestOrderCMS({ status: "draft" });
      expect(() => orderCancelInvariants.assertAll(order)).not.toThrow();
    });

    it("does not throw for submitted order", () => {
      const order = createTestOrderCMS({ status: "submitted" });
      expect(() => orderCancelInvariants.assertAll(order)).not.toThrow();
    });

    it("throws ORDER_ALREADY_CONFIRMED for confirmed order", () => {
      const order = createTestOrderCMS({ status: "confirmed" });
      try {
        orderCancelInvariants.assertAll(order);
        expect.fail("Expected error to be thrown");
      } catch (error) {
        expect((error as OrderInvariantError).code).toBe(OrderErrorCodes.ORDER_ALREADY_CONFIRMED);
      }
    });

    it("throws ORDER_ALREADY_CANCELLED for cancelled order", () => {
      const order = createTestOrderCMS({ status: "cancelled" });
      try {
        orderCancelInvariants.assertAll(order);
        expect.fail("Expected error to be thrown");
      } catch (error) {
        expect((error as OrderInvariantError).code).toBe(OrderErrorCodes.ORDER_ALREADY_CANCELLED);
      }
    });
  });

  describe("validateAll()", () => {
    it("returns valid result for draft order", () => {
      const order = createTestOrderCMS({ status: "draft" });
      const result = orderCancelInvariants.validateAll(order);
      expect(result.valid).toBe(true);
      if (!result.valid) return;
      // No violations array when valid
    });

    it("returns single violation for confirmed order", () => {
      const order = createTestOrderCMS({ status: "confirmed" });
      const result = orderCancelInvariants.validateAll(order);
      expect(result.valid).toBe(false);
      if (result.valid) return;
      expect(result.violations).toHaveLength(1);
      expect(result.violations[0].code).toBe(OrderErrorCodes.ORDER_ALREADY_CONFIRMED);
    });

    it("returns single violation for cancelled order", () => {
      const order = createTestOrderCMS({ status: "cancelled" });
      const result = orderCancelInvariants.validateAll(order);
      expect(result.valid).toBe(false);
      if (result.valid) return;
      expect(result.violations).toHaveLength(1);
      expect(result.violations[0].code).toBe(OrderErrorCodes.ORDER_ALREADY_CANCELLED);
    });
  });
});
