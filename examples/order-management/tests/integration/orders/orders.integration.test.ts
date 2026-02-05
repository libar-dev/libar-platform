/**
 * Orders Integration Tests
 *
 * Uses real Convex backend via Docker for full system validation.
 * Tests the complete flow: commands → events → projections.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { ConvexTestingHelper } from "convex-helpers/testing";
import { api } from "../../../convex/_generated/api";
import { generateCommandId, generateOrderId, generateCustomerId } from "../../fixtures/orders";
import { waitUntil } from "../../support/localBackendHelpers";
import { testMutation, testQuery } from "../../support/integrationHelpers";

describe("Orders Integration Tests", () => {
  let t: ConvexTestingHelper;

  beforeEach(() => {
    t = new ConvexTestingHelper({
      backendUrl: process.env.CONVEX_URL || "http://127.0.0.1:3210",
    });
  });

  afterEach(async () => {
    // No clearAll needed - namespace isolation via testRunId prefix
    await t.close();
  });

  describe("CreateOrder", () => {
    it("should create a new order successfully", async () => {
      const orderId = generateOrderId();
      const customerId = generateCustomerId();

      const result = await testMutation(t, api.orders.createOrder, {
        orderId,
        customerId,
      });

      expect(result.status).toBe("success");
      expect(result.eventId).toBeDefined();

      // Wait for projection to process
      await waitUntil(
        async () => {
          const order = await testQuery(t, api.orders.getOrderSummary, { orderId });
          return order !== null;
        },
        { message: "Order summary projection" }
      );

      // Verify order exists in projection
      const order = await testQuery(t, api.orders.getOrderSummary, { orderId });
      expect(order).toBeDefined();
      expect(order?.status).toBe("draft");
      expect(order?.customerId).toBe(customerId);
    });

    it("should reject duplicate order ID", async () => {
      const orderId = generateOrderId();
      const customerId = generateCustomerId();

      // Create first order
      const result1 = await testMutation(t, api.orders.createOrder, {
        orderId,
        customerId,
      });
      expect(result1.status).toBe("success");

      // Try to create again with same ID
      const result2 = await testMutation(t, api.orders.createOrder, {
        orderId,
        customerId: generateCustomerId(),
      });

      expect(result2.status).toBe("rejected");
      expect(result2.code).toBe("ORDER_ALREADY_EXISTS");
    });

    it("should be idempotent with same commandId", async () => {
      const orderId = generateOrderId();
      const customerId = generateCustomerId();
      const commandId = generateCommandId();

      // First call
      const result1 = await testMutation(t, api.orders.createOrder, {
        orderId,
        customerId,
        commandId,
      });
      expect(result1.status).toBe("success");

      // Second call with same commandId
      const result2 = await testMutation(t, api.orders.createOrder, {
        orderId,
        customerId,
        commandId,
      });

      // Should return duplicate status
      expect(result2.status).toBe("duplicate");
    });
  });

  describe("AddOrderItem", () => {
    it("should add item to draft order", async () => {
      const orderId = generateOrderId();
      const customerId = generateCustomerId();

      // Create order
      await testMutation(t, api.orders.createOrder, {
        orderId,
        customerId,
      });

      // Wait for order to be created
      await waitUntil(
        async () => {
          const order = await testQuery(t, api.orders.getOrderSummary, { orderId });
          return order !== null;
        },
        { message: "Order creation" }
      );

      // Add item
      const addResult = await testMutation(t, api.orders.addOrderItem, {
        orderId,
        productId: "prod_001",
        productName: "Widget",
        quantity: 2,
        unitPrice: 15.0,
      });

      expect(addResult.status).toBe("success");

      // Wait for projection to update
      await waitUntil(
        async () => {
          const order = await testQuery(t, api.orders.getOrderSummary, { orderId });
          return order?.itemCount === 1;
        },
        { message: "Item count projection" }
      );

      // Verify
      const order = await testQuery(t, api.orders.getOrderSummary, { orderId });
      expect(order?.itemCount).toBe(1);
      expect(order?.totalAmount).toBe(30); // 2 * 15
    });

    it("should reject adding item to submitted order", async () => {
      const orderId = generateOrderId();
      const customerId = generateCustomerId();

      // Create and setup order via testing helper
      await testMutation(t, api.testing.createTestOrder, {
        orderId,
        customerId,
        status: "submitted",
        items: [{ productId: "prod_001", productName: "Widget", quantity: 1, unitPrice: 10 }],
      });

      // Try to add item
      const result = await testMutation(t, api.orders.addOrderItem, {
        orderId,
        productId: "prod_002",
        productName: "Gadget",
        quantity: 1,
        unitPrice: 20.0,
      });

      expect(result.status).toBe("rejected");
      expect(result.code).toBe("ORDER_NOT_IN_DRAFT");
    });
  });

  describe("SubmitOrder", () => {
    it("should submit order with items", async () => {
      const orderId = generateOrderId();
      const customerId = generateCustomerId();

      // Create order with items via testing helper
      await testMutation(t, api.testing.createTestOrder, {
        orderId,
        customerId,
        status: "draft",
        items: [
          { productId: "prod_001", productName: "Widget", quantity: 2, unitPrice: 10 },
          { productId: "prod_002", productName: "Gadget", quantity: 1, unitPrice: 25 },
        ],
      });

      // Submit
      const result = await testMutation(t, api.orders.submitOrder, { orderId });

      expect(result.status).toBe("success");

      // Wait for projection
      await waitUntil(
        async () => {
          const order = await testQuery(t, api.orders.getOrderSummary, { orderId });
          return order?.status === "submitted";
        },
        { message: "Submit status projection" }
      );

      // Verify
      const order = await testQuery(t, api.orders.getOrderSummary, { orderId });
      expect(order?.status).toBe("submitted");
      expect(order?.totalAmount).toBe(45); // 2*10 + 1*25
    });

    it("should reject submitting empty order", async () => {
      const orderId = generateOrderId();
      const customerId = generateCustomerId();

      // Create empty order via testing helper
      await testMutation(t, api.testing.createTestOrder, {
        orderId,
        customerId,
        status: "draft",
        items: [],
      });

      // Try to submit
      const result = await testMutation(t, api.orders.submitOrder, { orderId });

      expect(result.status).toBe("rejected");
      expect(result.code).toBe("ORDER_HAS_NO_ITEMS");
    });

    it("should reject submitting already submitted order", async () => {
      const orderId = generateOrderId();
      const customerId = generateCustomerId();

      // Create submitted order via testing helper
      await testMutation(t, api.testing.createTestOrder, {
        orderId,
        customerId,
        status: "submitted",
        items: [{ productId: "prod_001", productName: "Widget", quantity: 1, unitPrice: 10 }],
      });

      // Try to submit again
      const result = await testMutation(t, api.orders.submitOrder, { orderId });

      expect(result.status).toBe("rejected");
      expect(result.code).toBe("ORDER_NOT_IN_DRAFT");
    });
  });

  describe("CancelOrder", () => {
    it("should cancel draft order", async () => {
      const orderId = generateOrderId();
      const customerId = generateCustomerId();

      // Create draft order
      await testMutation(t, api.testing.createTestOrder, {
        orderId,
        customerId,
        status: "draft",
      });

      // Cancel
      const result = await testMutation(t, api.orders.cancelOrder, {
        orderId,
        reason: "Changed my mind",
      });

      expect(result.status).toBe("success");

      // Wait for projection
      await waitUntil(
        async () => {
          const order = await testQuery(t, api.orders.getOrderSummary, { orderId });
          return order?.status === "cancelled";
        },
        { message: "Cancel status projection" }
      );

      // Verify
      const order = await testQuery(t, api.orders.getOrderSummary, { orderId });
      expect(order?.status).toBe("cancelled");
    });

    it("should cancel submitted order", async () => {
      const orderId = generateOrderId();
      const customerId = generateCustomerId();

      // Create submitted order
      await testMutation(t, api.testing.createTestOrder, {
        orderId,
        customerId,
        status: "submitted",
        items: [{ productId: "prod_001", productName: "Widget", quantity: 1, unitPrice: 10 }],
      });

      // Cancel
      const result = await testMutation(t, api.orders.cancelOrder, {
        orderId,
        reason: "Found better price",
      });

      expect(result.status).toBe("success");
    });

    it("should reject cancelling already cancelled order", async () => {
      const orderId = generateOrderId();
      const customerId = generateCustomerId();

      // Create cancelled order
      await testMutation(t, api.testing.createTestOrder, {
        orderId,
        customerId,
        status: "cancelled",
      });

      // Try to cancel again
      const result = await testMutation(t, api.orders.cancelOrder, {
        orderId,
        reason: "Double cancel",
      });

      expect(result.status).toBe("rejected");
      expect(result.code).toBe("ORDER_ALREADY_CANCELLED");
    });

    it("should successfully cancel confirmed order", async () => {
      const orderId = generateOrderId();
      const customerId = generateCustomerId();

      // Create confirmed order
      await testMutation(t, api.testing.createTestOrder, {
        orderId,
        customerId,
        status: "confirmed",
        items: [{ productId: "prod_001", productName: "Widget", quantity: 1, unitPrice: 10 }],
      });

      // Cancel the confirmed order - this is now allowed
      const result = await testMutation(t, api.orders.cancelOrder, {
        orderId,
        reason: "Customer changed mind after confirmation",
      });

      // Confirmed orders can now be cancelled (ConfirmedOrderCancellation feature)
      expect(result.status).toBe("success");
    });
  });

  describe("Query APIs", () => {
    it("should get orders by customer", async () => {
      const customerId = generateCustomerId();

      // Create multiple orders for same customer
      const orderIds = [generateOrderId(), generateOrderId()];

      for (const orderId of orderIds) {
        await testMutation(t, api.testing.createTestOrder, {
          orderId,
          customerId,
          status: "draft",
        });
      }

      // Wait for projections
      await waitUntil(
        async () => {
          const orders = await testQuery(t, api.orders.getCustomerOrders, { customerId });
          return orders?.length === 2;
        },
        { message: "Customer orders projection" }
      );

      const orders = await testQuery(t, api.orders.getCustomerOrders, { customerId });
      expect(orders).toHaveLength(2);
    });

    it("should get orders by status", async () => {
      const customerId = generateCustomerId();

      // Create orders with different statuses - store IDs for namespace-safe waiting
      const draftOrderId = generateOrderId();
      const submittedOrderId = generateOrderId();

      await testMutation(t, api.testing.createTestOrder, {
        orderId: draftOrderId,
        customerId,
        status: "draft",
      });

      await testMutation(t, api.testing.createTestOrder, {
        orderId: submittedOrderId,
        customerId,
        status: "submitted",
        items: [{ productId: "p1", productName: "P1", quantity: 1, unitPrice: 10 }],
      });

      // Wait for specific orders to be projected (namespace-safe - doesn't rely on global counts)
      await waitUntil(
        async () => {
          const draftOrder = await testQuery(t, api.orders.getOrderSummary, {
            orderId: draftOrderId,
          });
          const submittedOrder = await testQuery(t, api.orders.getOrderSummary, {
            orderId: submittedOrderId,
          });
          return draftOrder !== null && submittedOrder !== null;
        },
        { message: "Both order projections" }
      );

      // Query by status - use toBeGreaterThanOrEqual for namespace isolation compatibility
      const draftOrders = await testQuery(t, api.orders.getOrdersByStatus, { status: "draft" });
      expect(draftOrders?.length).toBeGreaterThanOrEqual(1);

      const submittedOrders = await testQuery(t, api.orders.getOrdersByStatus, {
        status: "submitted",
      });
      expect(submittedOrders?.length).toBeGreaterThanOrEqual(1);
    });
  });
});
