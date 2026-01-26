/**
 * Unit tests for Order domain functions.
 *
 * These are pure unit tests that don't require Convex or mocking.
 */
import { describe, it, expect, beforeEach } from "vitest";
import {
  calculateTotalAmount,
  createInitialOrderCMS,
  upcastOrderCMS,
  CURRENT_ORDER_CMS_VERSION,
  type OrderItem,
  type OrderCMS,
} from "../../../convex/contexts/orders/domain/order.js";

describe("calculateTotalAmount", () => {
  it("returns 0 for empty items array", () => {
    const result = calculateTotalAmount([]);
    expect(result).toBe(0);
  });

  it("calculates total for single item", () => {
    const items: OrderItem[] = [
      {
        productId: "prod_1",
        productName: "Widget",
        quantity: 2,
        unitPrice: 10.5,
      },
    ];
    const result = calculateTotalAmount(items);
    expect(result).toBe(21); // 2 * 10.5
  });

  it("calculates total for multiple items", () => {
    const items: OrderItem[] = [
      {
        productId: "prod_1",
        productName: "Widget",
        quantity: 2,
        unitPrice: 10,
      },
      {
        productId: "prod_2",
        productName: "Gadget",
        quantity: 3,
        unitPrice: 15,
      },
      {
        productId: "prod_3",
        productName: "Sprocket",
        quantity: 1,
        unitPrice: 5,
      },
    ];
    const result = calculateTotalAmount(items);
    expect(result).toBe(70); // (2*10) + (3*15) + (1*5)
  });

  it("handles zero quantity correctly", () => {
    const items: OrderItem[] = [
      {
        productId: "prod_1",
        productName: "Widget",
        quantity: 0,
        unitPrice: 10,
      },
    ];
    const result = calculateTotalAmount(items);
    expect(result).toBe(0);
  });

  it("handles zero price correctly", () => {
    const items: OrderItem[] = [
      {
        productId: "prod_1",
        productName: "Free Sample",
        quantity: 5,
        unitPrice: 0,
      },
    ];
    const result = calculateTotalAmount(items);
    expect(result).toBe(0);
  });

  it("handles decimal prices correctly", () => {
    const items: OrderItem[] = [
      {
        productId: "prod_1",
        productName: "Widget",
        quantity: 3,
        unitPrice: 9.99,
      },
    ];
    const result = calculateTotalAmount(items);
    expect(result).toBeCloseTo(29.97, 2);
  });
});

describe("createInitialOrderCMS", () => {
  let beforeTimestamp: number;

  beforeEach(() => {
    beforeTimestamp = Date.now();
  });

  it("creates CMS with correct orderId and customerId", () => {
    const cms = createInitialOrderCMS("ord_123", "cust_456");

    expect(cms.orderId).toBe("ord_123");
    expect(cms.customerId).toBe("cust_456");
  });

  it("initializes with draft status", () => {
    const cms = createInitialOrderCMS("ord_123", "cust_456");

    expect(cms.status).toBe("draft");
  });

  it("initializes with empty items array", () => {
    const cms = createInitialOrderCMS("ord_123", "cust_456");

    expect(cms.items).toEqual([]);
    expect(cms.items.length).toBe(0);
  });

  it("initializes with zero totalAmount", () => {
    const cms = createInitialOrderCMS("ord_123", "cust_456");

    expect(cms.totalAmount).toBe(0);
  });

  it("initializes with version 0", () => {
    const cms = createInitialOrderCMS("ord_123", "cust_456");

    expect(cms.version).toBe(0);
  });

  it("initializes with current state version", () => {
    const cms = createInitialOrderCMS("ord_123", "cust_456");

    expect(cms.stateVersion).toBe(CURRENT_ORDER_CMS_VERSION);
  });

  it("sets createdAt and updatedAt to current timestamp", () => {
    const cms = createInitialOrderCMS("ord_123", "cust_456");
    const afterTimestamp = Date.now();

    expect(cms.createdAt).toBeGreaterThanOrEqual(beforeTimestamp);
    expect(cms.createdAt).toBeLessThanOrEqual(afterTimestamp);
    expect(cms.updatedAt).toBe(cms.createdAt);
  });
});

describe("upcastOrderCMS", () => {
  it("returns unchanged CMS when already at current version", () => {
    const originalCMS: OrderCMS = {
      orderId: "ord_123",
      customerId: "cust_456",
      status: "draft",
      items: [],
      totalAmount: 0,
      version: 1,
      stateVersion: CURRENT_ORDER_CMS_VERSION,
      createdAt: 1000,
      updatedAt: 1000,
    };

    const result = upcastOrderCMS(originalCMS);

    expect(result).toEqual(originalCMS);
    expect(result.stateVersion).toBe(CURRENT_ORDER_CMS_VERSION);
  });

  it("upgrades CMS with missing stateVersion to current version", () => {
    const oldCMS = {
      orderId: "ord_123",
      customerId: "cust_456",
      status: "draft",
      items: [],
      totalAmount: 0,
      version: 1,
      // stateVersion missing (version 0)
      createdAt: 1000,
      updatedAt: 1000,
    };

    const result = upcastOrderCMS(oldCMS);

    expect(result.stateVersion).toBe(CURRENT_ORDER_CMS_VERSION);
    expect(result.orderId).toBe("ord_123");
    expect(result.customerId).toBe("cust_456");
  });

  it("upgrades CMS with stateVersion 0 to current version", () => {
    const oldCMS = {
      orderId: "ord_123",
      customerId: "cust_456",
      status: "submitted",
      items: [{ productId: "p1", productName: "Test", quantity: 1, unitPrice: 10 }],
      totalAmount: 10,
      version: 3,
      stateVersion: 0,
      createdAt: 1000,
      updatedAt: 2000,
    };

    const result = upcastOrderCMS(oldCMS);

    expect(result.stateVersion).toBe(CURRENT_ORDER_CMS_VERSION);
    // Verify all other fields preserved
    expect(result.status).toBe("submitted");
    expect(result.items).toHaveLength(1);
    expect(result.totalAmount).toBe(10);
  });

  it("preserves all fields during upcast", () => {
    const items: OrderItem[] = [
      { productId: "p1", productName: "Widget", quantity: 2, unitPrice: 15 },
      { productId: "p2", productName: "Gadget", quantity: 1, unitPrice: 25 },
    ];

    const oldCMS = {
      orderId: "ord_abc",
      customerId: "cust_xyz",
      status: "confirmed",
      items,
      totalAmount: 55,
      version: 5,
      stateVersion: 0,
      createdAt: 5000,
      updatedAt: 6000,
    };

    const result = upcastOrderCMS(oldCMS);

    expect(result.orderId).toBe("ord_abc");
    expect(result.customerId).toBe("cust_xyz");
    expect(result.status).toBe("confirmed");
    expect(result.items).toEqual(items);
    expect(result.totalAmount).toBe(55);
    expect(result.version).toBe(5);
    expect(result.createdAt).toBe(5000);
    expect(result.updatedAt).toBe(6000);
  });
});
