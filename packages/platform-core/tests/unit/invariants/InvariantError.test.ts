/**
 * Unit Tests for InvariantError
 *
 * Tests the base invariant error class and its factory:
 * - InvariantError: Base class for domain rule violations
 * - InvariantError.forContext: Factory for context-specific error classes
 * - Type guards: isInvariantError, hasCode
 */
import { describe, it, expect } from "vitest";
import { InvariantError } from "../../../src/invariants/InvariantError";

describe("InvariantError", () => {
  describe("constructor", () => {
    it("creates an error with code and message", () => {
      const error = new InvariantError("ORDER_NOT_FOUND", "Order not found");

      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(InvariantError);
      expect(error.code).toBe("ORDER_NOT_FOUND");
      expect(error.message).toBe("Order not found");
      expect(error.name).toBe("InvariantError");
    });

    it("includes context when provided", () => {
      const error = new InvariantError("VALIDATION_ERROR", "Invalid quantity", {
        productId: "prod_123",
        quantity: -5,
      });

      expect(error.context).toEqual({
        productId: "prod_123",
        quantity: -5,
      });
    });

    it("does not set context property when not provided", () => {
      const error = new InvariantError("SOME_ERROR", "message");

      // With exactOptionalPropertyTypes, context should not be set at all
      expect(error.context).toBeUndefined();
    });

    it("has proper stack trace", () => {
      const error = new InvariantError("ERROR", "message");

      expect(error.stack).toBeDefined();
      expect(error.stack).toContain("InvariantError");
    });
  });

  describe("forContext factory", () => {
    it("creates a context-specific error class", () => {
      const OrderInvariantError = InvariantError.forContext("Order");
      const error = new OrderInvariantError("ORDER_NOT_FOUND", "Order not found");

      expect(error).toBeInstanceOf(InvariantError);
      expect(error.name).toBe("OrderInvariantError");
      expect(error.code).toBe("ORDER_NOT_FOUND");
    });

    it("creates different classes for different contexts", () => {
      const OrderError = InvariantError.forContext("Order");
      const InventoryError = InvariantError.forContext("Inventory");

      const orderError = new OrderError("ORDER_NOT_FOUND", "not found");
      const inventoryError = new InventoryError("PRODUCT_NOT_FOUND", "not found");

      expect(orderError.name).toBe("OrderInvariantError");
      expect(inventoryError.name).toBe("InventoryInvariantError");

      // Both are still InvariantErrors
      expect(orderError).toBeInstanceOf(InvariantError);
      expect(inventoryError).toBeInstanceOf(InvariantError);
    });

    it("supports typed error codes", () => {
      // Define typed error codes
      const OrderErrorCodes = {
        ORDER_NOT_FOUND: "ORDER_NOT_FOUND",
        ORDER_ALREADY_EXISTS: "ORDER_ALREADY_EXISTS",
        ORDER_NOT_IN_DRAFT: "ORDER_NOT_IN_DRAFT",
      } as const;
      type OrderErrorCode = (typeof OrderErrorCodes)[keyof typeof OrderErrorCodes];

      const OrderInvariantError = InvariantError.forContext<OrderErrorCode>("Order");

      // These should compile without error
      new OrderInvariantError(OrderErrorCodes.ORDER_NOT_FOUND, "not found");
      new OrderInvariantError(OrderErrorCodes.ORDER_ALREADY_EXISTS, "exists");

      // TypeScript would catch invalid codes at compile time
      // new OrderInvariantError("INVALID_CODE", "message"); // Would fail type check
    });

    it("includes context in context-specific errors", () => {
      const ProductError = InvariantError.forContext("Product");
      const error = new ProductError("OUT_OF_STOCK", "Product out of stock", {
        productId: "prod_456",
        requested: 10,
        available: 0,
      });

      expect(error.context).toEqual({
        productId: "prod_456",
        requested: 10,
        available: 0,
      });
    });

    it("creates class with proper constructor name", () => {
      const CustomerError = InvariantError.forContext("Customer");
      expect(CustomerError.name).toBe("CustomerInvariantError");
    });
  });

  describe("isInvariantError type guard", () => {
    it("returns true for InvariantError instances", () => {
      const error = new InvariantError("CODE", "message");
      expect(InvariantError.isInvariantError(error)).toBe(true);
    });

    it("returns true for context-specific error instances", () => {
      const OrderError = InvariantError.forContext("Order");
      const error = new OrderError("CODE", "message");
      expect(InvariantError.isInvariantError(error)).toBe(true);
    });

    it("returns false for regular Error instances", () => {
      const error = new Error("message");
      expect(InvariantError.isInvariantError(error)).toBe(false);
    });

    it("returns false for non-error values", () => {
      expect(InvariantError.isInvariantError(null)).toBe(false);
      expect(InvariantError.isInvariantError(undefined)).toBe(false);
      expect(InvariantError.isInvariantError("error")).toBe(false);
      expect(InvariantError.isInvariantError({ code: "ERROR", message: "msg" })).toBe(false);
    });
  });

  describe("hasCode type guard", () => {
    it("returns true when error has the specified code", () => {
      const error = new InvariantError("ORDER_NOT_FOUND", "message");
      expect(InvariantError.hasCode(error, "ORDER_NOT_FOUND")).toBe(true);
    });

    it("returns false when error has a different code", () => {
      const error = new InvariantError("ORDER_NOT_FOUND", "message");
      expect(InvariantError.hasCode(error, "ORDER_ALREADY_EXISTS")).toBe(false);
    });

    it("returns false for non-InvariantError values", () => {
      expect(InvariantError.hasCode(new Error("msg"), "CODE")).toBe(false);
      expect(InvariantError.hasCode(null, "CODE")).toBe(false);
    });

    it("works with context-specific errors", () => {
      const InventoryError = InvariantError.forContext("Inventory");
      const error = new InventoryError("OUT_OF_STOCK", "message");

      expect(InvariantError.hasCode(error, "OUT_OF_STOCK")).toBe(true);
      expect(InvariantError.hasCode(error, "OTHER_CODE")).toBe(false);
    });
  });
});
