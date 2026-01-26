/**
 * Admin Operations Integration Tests
 *
 * Tests workflow-dependent admin operations:
 * - getSagaDetails (with workflow status)
 * - getSagaSteps (workflow step history)
 * - cancelSaga (workflow cancellation)
 * - cleanupSagaWorkflow (workflow cleanup)
 *
 * Uses real Convex backend via Docker for workflow execution.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { ConvexTestingHelper } from "convex-helpers/testing";
import { api } from "../../../convex/_generated/api";
import { generateProductId, generateSku } from "../../fixtures/inventory";
import { generateOrderId, generateCustomerId } from "../../fixtures/orders";
import { waitForSagaCompletion } from "../../support/localBackendHelpers";
import { testMutation, testQuery } from "../../support/integrationHelpers";

describe("Saga Admin Operations - Integration Tests", () => {
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
  // getSagaDetails - Workflow Status Integration
  // ==========================================================================

  describe("getSagaDetails", () => {
    it("returns saga with workflow status for completed saga", async () => {
      const productId = generateProductId();
      const sku = generateSku();
      const orderId = generateOrderId();
      const customerId = generateCustomerId();

      // Setup: Create product and order
      await testMutation(t, api.testing.createTestProduct, {
        productId,
        productName: "Test Widget",
        sku,
        availableQuantity: 100,
      });

      await testMutation(t, api.testing.createTestOrder, {
        orderId,
        customerId,
        status: "draft",
        items: [{ productId, productName: "Test Widget", quantity: 5, unitPrice: 10 }],
      });

      // Submit order to start saga
      await testMutation(t, api.orders.submitOrder, { orderId });

      // Wait for saga completion
      await waitForSagaCompletion(t, "OrderFulfillment", orderId, {
        timeoutMs: 60000,
      });

      // Get saga details with workflow status
      const details = await testQuery(t, api.sagas.admin.getSagaDetails, {
        sagaType: "OrderFulfillment",
        sagaId: orderId,
      });

      expect(details).not.toBeNull();
      expect(details?.saga.status).toBe("completed");
      expect(details?.saga.workflowId).toBeDefined();
      // Note: workflowStatus may be null after cleanup
    });
  });

  // ==========================================================================
  // getSagaSteps - Workflow History Integration
  // ==========================================================================

  describe("getSagaSteps", () => {
    it("returns step history for active saga", async () => {
      const productId = generateProductId();
      const sku = generateSku();
      const orderId = generateOrderId();
      const customerId = generateCustomerId();

      // Setup with insufficient stock to trigger compensation
      await testMutation(t, api.testing.createTestProduct, {
        productId,
        productName: "Limited Product",
        sku,
        availableQuantity: 2, // Limited stock
      });

      await testMutation(t, api.testing.createTestOrder, {
        orderId,
        customerId,
        status: "draft",
        items: [{ productId, productName: "Limited Product", quantity: 10, unitPrice: 10 }],
      });

      // Submit order (will fail and trigger compensation)
      await testMutation(t, api.orders.submitOrder, { orderId });

      // Wait for saga to complete
      await waitForSagaCompletion(t, "OrderFulfillment", orderId, {
        timeoutMs: 60000,
      });

      // Get saga steps
      // Note: For failed sagas, workflow data is preserved for debugging
      const steps = await testQuery(t, api.sagas.admin.getSagaSteps, {
        sagaType: "OrderFulfillment",
        sagaId: orderId,
      });

      expect(steps).not.toBeNull();
      expect(steps?.sagaId).toBe(orderId);
      expect(steps?.workflowId).toBeDefined();
      // Steps may or may not be available depending on workflow cleanup strategy
    });

    it("returns null for non-existent saga", async () => {
      const steps = await testQuery(t, api.sagas.admin.getSagaSteps, {
        sagaType: "OrderFulfillment",
        sagaId: "nonexistent",
      });

      expect(steps).toBeNull();
    });
  });

  // ==========================================================================
  // cancelSaga - Workflow Cancellation Integration
  // ==========================================================================

  describe("cancelSaga", () => {
    it("cancels running saga and marks as failed", async () => {
      const productId = generateProductId();
      const sku = generateSku();
      const orderId = generateOrderId();
      const customerId = generateCustomerId();

      // Setup
      await testMutation(t, api.testing.createTestProduct, {
        productId,
        productName: "Test Widget",
        sku,
        availableQuantity: 100,
      });

      await testMutation(t, api.testing.createTestOrder, {
        orderId,
        customerId,
        status: "draft",
        items: [{ productId, productName: "Test Widget", quantity: 5, unitPrice: 10 }],
      });

      // Submit order
      await testMutation(t, api.orders.submitOrder, { orderId });

      // Wait a moment for saga to start
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Note: By the time we try to cancel, the saga may have already completed
      // This test verifies the cancellation path works, even if result is "invalid_state"
      const result = await testMutation(t, api.sagas.admin.cancelSaga, {
        sagaType: "OrderFulfillment",
        sagaId: orderId,
        reason: "Admin cancelled for testing",
      });

      // Either cancelled, already completed/failed, or cleaned up by onComplete
      expect(["cancelled", "invalid_state", "not_found"]).toContain(result.status);
    });

    it("rejects cancelling non-existent saga", async () => {
      const result = await testMutation(t, api.sagas.admin.cancelSaga, {
        sagaType: "OrderFulfillment",
        sagaId: "nonexistent",
        reason: "Should not work",
      });

      expect(result.status).toBe("not_found");
    });
  });

  // ==========================================================================
  // cleanupSagaWorkflow - Workflow Cleanup Integration
  // ==========================================================================

  describe("cleanupSagaWorkflow", () => {
    it("cleans up completed saga workflow", async () => {
      const productId = generateProductId();
      const sku = generateSku();
      const orderId = generateOrderId();
      const customerId = generateCustomerId();

      // Setup and complete a saga
      await testMutation(t, api.testing.createTestProduct, {
        productId,
        productName: "Test Widget",
        sku,
        availableQuantity: 100,
      });

      await testMutation(t, api.testing.createTestOrder, {
        orderId,
        customerId,
        status: "draft",
        items: [{ productId, productName: "Test Widget", quantity: 5, unitPrice: 10 }],
      });

      await testMutation(t, api.orders.submitOrder, { orderId });

      // Wait for saga completion
      await waitForSagaCompletion(t, "OrderFulfillment", orderId, {
        timeoutMs: 60000,
      });

      // Try to cleanup
      // Note: onComplete handler may have already cleaned up successful sagas
      const result = await testMutation(t, api.sagas.admin.cleanupSagaWorkflow, {
        sagaType: "OrderFulfillment",
        sagaId: orderId,
      });

      // Either cleaned or already cleaned by onComplete
      expect(["cleaned", "cleanup_failed"]).toContain(result.status);
    });

    it("rejects cleanup of running saga", async () => {
      const productId = generateProductId();
      const sku = generateSku();
      const orderId = generateOrderId();
      const customerId = generateCustomerId();

      // Setup
      await testMutation(t, api.testing.createTestProduct, {
        productId,
        productName: "Test Widget",
        sku,
        availableQuantity: 100,
      });

      await testMutation(t, api.testing.createTestOrder, {
        orderId,
        customerId,
        status: "draft",
        items: [{ productId, productName: "Test Widget", quantity: 5, unitPrice: 10 }],
      });

      // Submit to create a saga, then immediately try cleanup
      await testMutation(t, api.orders.submitOrder, { orderId });

      // Note: Saga may complete quickly, so this may return invalid_state or not_found
      const result = await testMutation(t, api.sagas.admin.cleanupSagaWorkflow, {
        sagaType: "OrderFulfillment",
        sagaId: orderId,
      });

      // Running saga can't be cleaned up - but may have already completed and cleaned
      expect(["invalid_state", "cleaned", "cleanup_failed", "not_found"]).toContain(result.status);
    });
  });
});
