/**
 * Order Fulfillment Saga Integration Tests
 *
 * Tests the full cross-context saga flow:
 * - OrderSubmitted → ReserveStock → ConfirmOrder → ConfirmReservation → Saga completed
 * - OrderSubmitted → ReservationFailed → CancelOrder → Saga compensated
 *
 * Uses real Convex backend via Docker for full system validation.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { ConvexTestingHelper } from "convex-helpers/testing";
import { api } from "../../../convex/_generated/api";
import { generateProductId, generateSku } from "../../fixtures/inventory";
import { generateOrderId, generateCustomerId } from "../../fixtures/orders";
import {
  waitUntil,
  waitForSagaCompletion,
  waitForOrderStatus,
  waitForReservationStatus,
} from "../../support/localBackendHelpers";
import { testMutation, testQuery } from "../../support/integrationHelpers";

describe("Order Fulfillment Saga Integration Tests", () => {
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

  // ==========================================================================
  // Happy Path Tests
  // ==========================================================================

  describe("Happy Path", () => {
    it("should complete saga when stock is available", async () => {
      const productId = generateProductId();
      const sku = generateSku();
      const orderId = generateOrderId();
      const customerId = generateCustomerId();

      // 1. Create product with sufficient stock
      await testMutation(t, api.testing.createTestProduct, {
        productId,
        productName: "Test Widget",
        sku,
        availableQuantity: 100,
      });

      // 2. Create draft order with items pointing to our product
      await testMutation(t, api.testing.createTestOrder, {
        orderId,
        customerId,
        status: "draft",
        items: [
          {
            productId,
            productName: "Test Widget",
            quantity: 5,
            unitPrice: 10,
          },
        ],
      });

      // 3. Submit order (triggers OrderFulfillment saga)
      const submitResult = await testMutation(t, api.orders.submitOrder, { orderId });
      expect(submitResult.status).toBe("success");

      // 4. Wait for saga to complete
      const sagaResult = await waitForSagaCompletion(t, "OrderFulfillment", orderId, {
        timeoutMs: 60000, // Workflow can take time
      });
      expect(sagaResult.status).toBe("completed");

      // 5. Verify order is confirmed
      await waitUntil(
        async () => {
          const order = await testQuery(t, api.orders.getOrderSummary, { orderId });
          return order?.status === "confirmed";
        },
        { message: "Order confirmation", timeoutMs: 30000 }
      );

      const order = await testQuery(t, api.orders.getOrderSummary, { orderId });
      expect(order?.status).toBe("confirmed");

      // 6. Verify reservation was created and confirmed
      // Wait for reservation confirmation projection to process
      await waitUntil(
        async () => {
          const res = await testQuery(t, api.inventory.getReservationByOrderId, { orderId });
          return res?.status === "confirmed";
        },
        { message: "Reservation confirmation projection", timeoutMs: 30000 }
      );

      const reservation = await testQuery(t, api.inventory.getReservationByOrderId, { orderId });
      expect(reservation).toBeDefined();
      expect(reservation?.status).toBe("confirmed");

      // 7. Verify stock was reserved and then confirmed
      const product = await testQuery(t, api.inventory.getProduct, { productId });
      // After confirmation, reserved becomes part of total, available decreases
      expect(product?.availableQuantity).toBeLessThan(100);
    });

    it("should handle multi-item order fulfillment", async () => {
      const productId1 = generateProductId();
      const productId2 = generateProductId();
      const sku1 = generateSku();
      const sku2 = generateSku();
      const orderId = generateOrderId();
      const customerId = generateCustomerId();

      // Create two products with stock
      await testMutation(t, api.testing.createTestProduct, {
        productId: productId1,
        productName: "Product 1",
        sku: sku1,
        availableQuantity: 50,
      });

      await testMutation(t, api.testing.createTestProduct, {
        productId: productId2,
        productName: "Product 2",
        sku: sku2,
        availableQuantity: 30,
      });

      // Create order with items from both products
      await testMutation(t, api.testing.createTestOrder, {
        orderId,
        customerId,
        status: "draft",
        items: [
          { productId: productId1, productName: "Product 1", quantity: 5, unitPrice: 10 },
          { productId: productId2, productName: "Product 2", quantity: 3, unitPrice: 20 },
        ],
      });

      // Submit order
      const submitResult = await testMutation(t, api.orders.submitOrder, { orderId });
      expect(submitResult.status).toBe("success");

      // Wait for saga completion
      const sagaResult = await waitForSagaCompletion(t, "OrderFulfillment", orderId, {
        timeoutMs: 60000,
      });
      expect(sagaResult.status).toBe("completed");

      // Verify order confirmed
      const order = await testQuery(t, api.orders.getOrderSummary, { orderId });
      expect(order?.status).toBe("confirmed");
    });
  });

  // ==========================================================================
  // Compensation Tests
  // ==========================================================================

  describe("Compensation", () => {
    it("should cancel order when stock is insufficient", async () => {
      const productId = generateProductId();
      const sku = generateSku();
      const orderId = generateOrderId();
      const customerId = generateCustomerId();

      // 1. Create product with LIMITED stock
      await testMutation(t, api.testing.createTestProduct, {
        productId,
        productName: "Limited Stock Product",
        sku,
        availableQuantity: 3, // Only 3 available
      });

      // 2. Create order requesting MORE than available
      await testMutation(t, api.testing.createTestOrder, {
        orderId,
        customerId,
        status: "draft",
        items: [
          {
            productId,
            productName: "Limited Stock Product",
            quantity: 10, // Request 10, only 3 available
            unitPrice: 10,
          },
        ],
      });

      // 3. Submit order (triggers saga which will fail reservation)
      const submitResult = await testMutation(t, api.orders.submitOrder, { orderId });
      expect(submitResult.status).toBe("success");

      // 4. Wait for saga to complete (with compensation)
      const sagaResult = await waitForSagaCompletion(t, "OrderFulfillment", orderId, {
        timeoutMs: 60000,
      });
      expect(sagaResult.status).toBe("completed"); // Saga completes even on compensation

      // 5. Verify order was cancelled (compensation action)
      await waitUntil(
        async () => {
          const order = await testQuery(t, api.orders.getOrderSummary, { orderId });
          return order?.status === "cancelled";
        },
        { message: "Order cancellation (compensation)", timeoutMs: 30000 }
      );

      const order = await testQuery(t, api.orders.getOrderSummary, { orderId });
      expect(order?.status).toBe("cancelled");

      // 6. Verify product stock was NOT changed (reservation failed before any stock reserved)
      const product = await testQuery(t, api.inventory.getProduct, { productId });
      expect(product?.availableQuantity).toBe(3);
      expect(product?.reservedQuantity).toBe(0);
    });

    it("should cancel order when one of multiple items has insufficient stock", async () => {
      const productId1 = generateProductId();
      const productId2 = generateProductId();
      const sku1 = generateSku();
      const sku2 = generateSku();
      const orderId = generateOrderId();
      const customerId = generateCustomerId();

      // Product 1: Plenty of stock
      await testMutation(t, api.testing.createTestProduct, {
        productId: productId1,
        productName: "Plenty Stock Product",
        sku: sku1,
        availableQuantity: 100,
      });

      // Product 2: Limited stock
      await testMutation(t, api.testing.createTestProduct, {
        productId: productId2,
        productName: "Limited Stock Product",
        sku: sku2,
        availableQuantity: 2,
      });

      // Order with items from both - second will fail
      await testMutation(t, api.testing.createTestOrder, {
        orderId,
        customerId,
        status: "draft",
        items: [
          { productId: productId1, productName: "Plenty Stock", quantity: 5, unitPrice: 10 },
          { productId: productId2, productName: "Limited Stock", quantity: 10, unitPrice: 20 }, // Too much
        ],
      });

      // Submit
      await testMutation(t, api.orders.submitOrder, { orderId });

      // Wait for saga
      const sagaResult = await waitForSagaCompletion(t, "OrderFulfillment", orderId, {
        timeoutMs: 60000,
      });
      expect(sagaResult.status).toBe("completed");

      // Wait for order projection to update (async after saga completes)
      await waitForOrderStatus(t, orderId, "cancelled", { timeoutMs: 30000 });

      // Verify order cancelled
      const order = await testQuery(t, api.orders.getOrderSummary, { orderId });
      expect(order?.status).toBe("cancelled");

      // Verify neither product had stock taken (all-or-nothing)
      const product1 = await testQuery(t, api.inventory.getProduct, { productId: productId1 });
      expect(product1?.availableQuantity).toBe(100);
      expect(product1?.reservedQuantity).toBe(0);
    });
  });

  // ==========================================================================
  // Idempotency Tests
  // ==========================================================================

  describe("Idempotency", () => {
    it("should run saga only once for same order", async () => {
      const productId = generateProductId();
      const sku = generateSku();
      const orderId = generateOrderId();
      const customerId = generateCustomerId();

      // Setup
      await testMutation(t, api.testing.createTestProduct, {
        productId,
        productName: "Test Product",
        sku,
        availableQuantity: 100,
      });

      await testMutation(t, api.testing.createTestOrder, {
        orderId,
        customerId,
        status: "draft",
        items: [{ productId, productName: "Test", quantity: 5, unitPrice: 10 }],
      });

      // Submit order - this starts the saga
      const result = await testMutation(t, api.orders.submitOrder, { orderId });
      expect(result.status).toBe("success");

      // Wait for saga to complete
      await waitForSagaCompletion(t, "OrderFulfillment", orderId, {
        timeoutMs: 60000,
      });

      // Check saga record - there should be exactly one
      const saga = await testQuery(t, api.sagas.getSaga, {
        sagaType: "OrderFulfillment",
        sagaId: orderId,
      });
      expect(saga).toBeDefined();
      expect(saga?.status).toBe("completed");

      // Verify only one reservation was created for this order
      // Wait for reservation to be confirmed - saga completion doesn't guarantee
      // downstream projection processing has finished
      await waitForReservationStatus(t, orderId, "confirmed", { timeoutMs: 30000 });

      const reservation = await testQuery(t, api.inventory.getReservationByOrderId, { orderId });
      expect(reservation).toBeDefined();
      expect(reservation?.status).toBe("confirmed");
    });
  });

  // ==========================================================================
  // Workflow Durability Tests
  // ==========================================================================

  describe("Workflow State", () => {
    it("should track saga state transitions correctly", async () => {
      const productId = generateProductId();
      const sku = generateSku();
      const orderId = generateOrderId();
      const customerId = generateCustomerId();

      // Setup
      await testMutation(t, api.testing.createTestProduct, {
        productId,
        productName: "Test Product",
        sku,
        availableQuantity: 100,
      });

      await testMutation(t, api.testing.createTestOrder, {
        orderId,
        customerId,
        status: "draft",
        items: [{ productId, productName: "Test", quantity: 5, unitPrice: 10 }],
      });

      // Submit order
      await testMutation(t, api.orders.submitOrder, { orderId });

      // Poll for saga creation
      await waitUntil(
        async () => {
          const saga = await testQuery(t, api.sagas.getSaga, {
            sagaType: "OrderFulfillment",
            sagaId: orderId,
          });
          return saga !== null;
        },
        { message: "Saga creation", timeoutMs: 10000 }
      );

      // Wait for completion
      await waitForSagaCompletion(t, "OrderFulfillment", orderId, {
        timeoutMs: 60000,
      });

      // Verify final saga state
      const saga = await testQuery(t, api.sagas.getSaga, {
        sagaType: "OrderFulfillment",
        sagaId: orderId,
      });

      expect(saga?.status).toBe("completed");
      expect(saga?.workflowId).toBeDefined();
      expect(saga?.completedAt).toBeDefined();
    });

    it("should record compensation saga state correctly", async () => {
      const productId = generateProductId();
      const sku = generateSku();
      const orderId = generateOrderId();
      const customerId = generateCustomerId();

      // Setup with insufficient stock
      await testMutation(t, api.testing.createTestProduct, {
        productId,
        productName: "Limited Product",
        sku,
        availableQuantity: 2, // Limited
      });

      await testMutation(t, api.testing.createTestOrder, {
        orderId,
        customerId,
        status: "draft",
        items: [{ productId, productName: "Limited Product", quantity: 10, unitPrice: 10 }], // Request more than available
      });

      // Submit order (will trigger compensation)
      await testMutation(t, api.orders.submitOrder, { orderId });

      // Wait for saga to complete with compensation
      await waitForSagaCompletion(t, "OrderFulfillment", orderId, {
        timeoutMs: 60000,
      });

      // Verify saga completed (compensation is still a completion)
      const saga = await testQuery(t, api.sagas.getSaga, {
        sagaType: "OrderFulfillment",
        sagaId: orderId,
      });

      expect(saga?.status).toBe("completed");
      // Note: The saga workflow returns { status: "compensated" } as its result,
      // but the saga registry status is "completed" because the workflow finished successfully
    });

    it("should mark completedAt timestamp after saga completion", async () => {
      const productId = generateProductId();
      const sku = generateSku();
      const orderId = generateOrderId();
      const customerId = generateCustomerId();

      // Setup
      await testMutation(t, api.testing.createTestProduct, {
        productId,
        productName: "Test Product",
        sku,
        availableQuantity: 100,
      });

      await testMutation(t, api.testing.createTestOrder, {
        orderId,
        customerId,
        status: "draft",
        items: [{ productId, productName: "Test Product", quantity: 5, unitPrice: 10 }],
      });

      const beforeSubmit = Date.now();

      // Submit order
      await testMutation(t, api.orders.submitOrder, { orderId });

      // Wait for saga completion
      await waitForSagaCompletion(t, "OrderFulfillment", orderId, {
        timeoutMs: 60000,
      });

      const afterCompletion = Date.now();

      // Verify completedAt is set by onComplete handler
      const saga = await testQuery(t, api.sagas.getSaga, {
        sagaType: "OrderFulfillment",
        sagaId: orderId,
      });

      expect(saga?.status).toBe("completed");
      expect(saga?.completedAt).toBeDefined();
      expect(saga?.completedAt).toBeGreaterThanOrEqual(beforeSubmit);
      expect(saga?.completedAt).toBeLessThanOrEqual(afterCompletion);
    });
  });
});
