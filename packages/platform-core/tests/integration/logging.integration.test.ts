/**
 * Logging Infrastructure Integration Tests
 *
 * Tests that logging infrastructure works correctly in a real Convex backend:
 *
 * - Log calls don't throw errors during command execution
 * - CommandOrchestrator logs at appropriate levels
 * - Projection handlers log checkpoint operations
 * - Dead letter handlers log error states
 *
 * Note: Actual console output verification requires manual inspection of
 * Convex logs. These tests verify the logging code paths execute without
 * errors and don't break the business logic.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { ConvexTestingHelper } from "convex-helpers/testing";
import { api } from "../../../../examples/order-management/convex/_generated/api";
import { waitUntil, generateTestId } from "./support/helpers";
import { testMutation, testQuery } from "./support/testHelpers";

describe("Logging Infrastructure Integration", () => {
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

  describe("CommandOrchestrator Logging", () => {
    it("should log successful command execution without errors", async () => {
      const orderId = generateTestId("ord");
      const customerId = generateTestId("cust");

      // Execute command - this triggers CommandOrchestrator logging:
      // - DEBUG: Command received
      // - DEBUG: Before handler invocation
      // - DEBUG: Event append
      // - DEBUG: Projection triggered
      // - INFO: Command completed
      const result = await testMutation(t, api.orders.createOrder, {
        orderId,
        customerId,
      });

      expect(result.status).toBe("success");
      expect(result.eventId).toBeDefined();

      // Wait for projection to complete (verifies full flow works)
      await waitUntil(
        async () => {
          const order = await testQuery(t, api.orders.getOrderSummary, { orderId });
          return order !== null;
        },
        { message: "Projection should complete", timeoutMs: 10000 }
      );
    });

    it("should log duplicate command detection without errors", async () => {
      const orderId = generateTestId("ord");
      const customerId = generateTestId("cust");
      const commandId = generateTestId("cmd");

      // First execution
      const result1 = await testMutation(t, api.orders.createOrder, {
        orderId,
        customerId,
        commandId,
      });

      expect(result1.status).toBe("success");

      // Second execution with same commandId
      // This triggers: INFO: Duplicate command detected
      const result2 = await testMutation(t, api.orders.createOrder, {
        orderId,
        customerId,
        commandId,
      });

      expect(result2.status).toBe("duplicate");
    });

    it("should log rejected command without errors", async () => {
      const orderId = generateTestId("ord");
      const customerId = generateTestId("cust");

      // Create order first
      await testMutation(t, api.orders.createOrder, { orderId, customerId });

      await waitUntil(
        async () => {
          const order = await testQuery(t, api.orders.getOrderSummary, { orderId });
          return order !== null;
        },
        { message: "Order creation" }
      );

      // Try to create again - triggers:
      // - DEBUG: Command received
      // - INFO: Command rejected
      const result = await testMutation(t, api.orders.createOrder, {
        orderId,
        customerId: generateTestId("cust"),
      });

      expect(result.status).toBe("rejected");
      expect(result.code).toBe("ORDER_ALREADY_EXISTS");
    });
  });

  describe("Projection Checkpoint Logging", () => {
    it("should log projection processing without errors", async () => {
      const orderId = generateTestId("ord");
      const customerId = generateTestId("cust");

      // Create order - triggers projection with checkpoint logging:
      // - INFO: Processing started
      // - INFO: Processing completed
      await testMutation(t, api.orders.createOrder, { orderId, customerId });

      // Wait for projection
      await waitUntil(
        async () => {
          const order = await testQuery(t, api.orders.getOrderSummary, { orderId });
          return order !== null;
        },
        { message: "Projection processing" }
      );

      // Verify projection completed successfully
      const order = await testQuery(t, api.orders.getOrderSummary, { orderId });
      expect(order).toBeDefined();
      expect(order?.orderId).toBe(orderId);
    });

    it("should log multiple sequential projections without errors", async () => {
      const orderId = generateTestId("ord");
      const customerId = generateTestId("cust");

      // Create order
      await testMutation(t, api.orders.createOrder, { orderId, customerId });

      await waitUntil(
        async () => {
          const order = await testQuery(t, api.orders.getOrderSummary, { orderId });
          return order !== null;
        },
        { message: "Order creation projection" }
      );

      // Add item - triggers second projection with separate checkpoint
      await testMutation(t, api.orders.addOrderItem, {
        orderId,
        productId: "prod_log_001",
        productName: "Logging Test Widget",
        quantity: 2,
        unitPrice: 30.0,
      });

      // Wait for item projection
      await waitUntil(
        async () => {
          const order = await testQuery(t, api.orders.getOrderSummary, { orderId });
          return order?.itemCount === 1;
        },
        { message: "Item projection" }
      );

      // Verify final state
      const order = await testQuery(t, api.orders.getOrderSummary, { orderId });
      expect(order?.itemCount).toBe(1);
      expect(order?.totalAmount).toBe(60);
    });
  });

  describe("Saga Logging", () => {
    it("should log saga routing without errors", async () => {
      const orderId = generateTestId("ord");
      const customerId = generateTestId("cust");
      const productId = generateTestId("prod");
      const sku = generateTestId("sku");

      // 1. Create product with sufficient stock for saga to succeed
      await testMutation(t, api.testing.createTestProduct, {
        productId,
        productName: "Saga Test Widget",
        sku,
        availableQuantity: 100,
      });

      // 2. Create order with items pointing to the product
      await testMutation(t, api.testing.createTestOrder, {
        orderId,
        customerId,
        status: "draft",
        items: [
          {
            productId,
            productName: "Saga Test Widget",
            quantity: 1,
            unitPrice: 25.0,
          },
        ],
      });

      await waitUntil(
        async () => {
          const order = await testQuery(t, api.orders.getOrderSummary, { orderId });
          return order !== null;
        },
        { message: "Order creation" }
      );

      // Submit order - triggers OrderSubmitted event which routes to saga
      // This triggers saga router logging:
      // - DEBUG: No saga route configured (for non-saga events) OR
      // - DEBUG: Saga ID resolved
      // - INFO: Saga started / Saga already exists
      const submitResult = await testMutation(t, api.orders.submitOrder, { orderId });

      expect(submitResult.status).toBe("success");

      // Wait for order to be confirmed (saga completes with stock reservation)
      await waitUntil(
        async () => {
          const order = await testQuery(t, api.orders.getOrderSummary, { orderId });
          return order?.status === "confirmed";
        },
        { message: "Saga completion", timeoutMs: 60000 }
      );
    });
  });

  describe("Full Logging Flow", () => {
    it("should execute complete command lifecycle with all logging points", async () => {
      const orderId = generateTestId("ord");
      const customerId = generateTestId("cust");
      const productId = generateTestId("prod");
      const sku = generateTestId("sku");

      // 0. Create product with sufficient stock for saga to succeed
      await testMutation(t, api.testing.createTestProduct, {
        productId,
        productName: "Full Flow Widget",
        sku,
        availableQuantity: 100,
      });

      // 1. Create order with items - logs command + projection + checkpoint
      await testMutation(t, api.testing.createTestOrder, {
        orderId,
        customerId,
        status: "draft",
        items: [
          {
            productId,
            productName: "Full Flow Widget",
            quantity: 2,
            unitPrice: 50.0,
          },
        ],
      });

      await waitUntil(
        async () => {
          const order = await testQuery(t, api.orders.getOrderSummary, { orderId });
          return order !== null;
        },
        { message: "Create projection" }
      );

      // Verify order was created with items
      const createdOrder = await testQuery(t, api.orders.getOrderSummary, { orderId });
      expect(createdOrder?.itemCount).toBe(1);

      // 2. Submit - logs command + saga routing + saga registry
      const submitResult = await testMutation(t, api.orders.submitOrder, { orderId });

      expect(submitResult.status).toBe("success");

      // 3. Wait for saga to complete
      await waitUntil(
        async () => {
          const order = await testQuery(t, api.orders.getOrderSummary, { orderId });
          return order?.status === "confirmed";
        },
        { message: "Saga completion", timeoutMs: 60000 }
      );

      // Verify final state
      const finalOrder = await testQuery(t, api.orders.getOrderSummary, { orderId });
      expect(finalOrder?.status).toBe("confirmed");
      expect(finalOrder?.itemCount).toBe(1);
      expect(finalOrder?.totalAmount).toBe(100);
    });
  });
});
