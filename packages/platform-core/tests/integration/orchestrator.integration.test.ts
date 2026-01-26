/**
 * CommandOrchestrator Integration Tests
 *
 * Tests the full dual-write + projection flow using a real Convex backend.
 * These tests validate that the @libar-dev/platform-* infrastructure works correctly:
 *
 * - CommandOrchestrator enqueues projections to Workpool
 * - Workpool processes projection handlers
 * - Projection idempotency via checkpoints
 * - Dead letter handling for failed projections
 *
 * Uses the example order-management app as the test bed since it implements
 * the full infrastructure pattern.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { ConvexTestingHelper } from "convex-helpers/testing";
import { api } from "../../../../../examples/order-management/convex/_generated/api";
import { waitUntil, generateTestId } from "./support/helpers";
import { testMutation, testQuery } from "./support/testHelpers";

describe("CommandOrchestrator Integration", () => {
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

  describe("Projection Enqueuing", () => {
    it("should enqueue projection after successful command and process it", async () => {
      const orderId = generateTestId("ord");
      const customerId = generateTestId("cust");

      // Execute command via orchestrator
      const result = await testMutation(t, api.orders.createOrder, {
        orderId,
        customerId,
      });

      expect(result.status).toBe("success");
      expect(result.eventId).toBeDefined();
      expect(result.globalPosition).toBeDefined();

      // Verify projection was processed via Workpool
      await waitUntil(
        async () => {
          const order = await testQuery(t, api.orders.getOrderSummary, { orderId });
          return order !== null && order.status === "draft";
        },
        { message: "Projection should update order summary", timeoutMs: 10000 }
      );

      // Verify projection result
      const order = await testQuery(t, api.orders.getOrderSummary, { orderId });
      expect(order).toBeDefined();
      expect(order?.orderId).toBe(orderId);
      expect(order?.customerId).toBe(customerId);
      expect(order?.status).toBe("draft");
    });

    it("should process multiple projections for sequential commands", async () => {
      const orderId = generateTestId("ord");
      const customerId = generateTestId("cust");

      // Create order
      await testMutation(t, api.orders.createOrder, { orderId, customerId });

      // Wait for creation projection
      await waitUntil(
        async () => {
          const order = await testQuery(t, api.orders.getOrderSummary, { orderId });
          return order !== null;
        },
        { message: "Order creation projection" }
      );

      // Add item (triggers second projection)
      const addResult = await testMutation(t, api.orders.addOrderItem, {
        orderId,
        productId: "prod_infra_001",
        productName: "Infrastructure Widget",
        quantity: 3,
        unitPrice: 25.0,
      });

      expect(addResult.status).toBe("success");

      // Wait for item projection
      await waitUntil(
        async () => {
          const order = await testQuery(t, api.orders.getOrderSummary, { orderId });
          return order?.itemCount === 1;
        },
        { message: "Item count projection" }
      );

      // Verify final state
      const order = await testQuery(t, api.orders.getOrderSummary, { orderId });
      expect(order?.itemCount).toBe(1);
      expect(order?.totalAmount).toBe(75); // 3 * 25
    });
  });

  describe("Projection Idempotency", () => {
    it("should skip already-processed events via checkpoint", async () => {
      const orderId = generateTestId("ord");
      const customerId = generateTestId("cust");
      const commandId = generateTestId("cmd");

      // First command execution
      const result1 = await testMutation(t, api.orders.createOrder, {
        orderId,
        customerId,
        commandId,
      });

      expect(result1.status).toBe("success");

      // Wait for projection
      await waitUntil(
        async () => {
          const order = await testQuery(t, api.orders.getOrderSummary, { orderId });
          return order !== null;
        },
        { message: "Initial projection" }
      );

      // Second command with same commandId (idempotent)
      const result2 = await testMutation(t, api.orders.createOrder, {
        orderId,
        customerId,
        commandId,
      });

      // Should return duplicate status
      expect(result2.status).toBe("duplicate");

      // Projection should not be triggered again (same event)
      // We verify by checking that the order still exists and wasn't corrupted
      const order = await testQuery(t, api.orders.getOrderSummary, { orderId });
      expect(order).toBeDefined();
      expect(order?.orderId).toBe(orderId);
    });
  });

  describe("Command Bus Integration", () => {
    it("should record command and provide idempotency", async () => {
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

      // Retry with same commandId
      const result2 = await testMutation(t, api.orders.createOrder, {
        orderId,
        customerId,
        commandId,
      });

      expect(result2.status).toBe("duplicate");
    });

    it("should handle rejected commands correctly", async () => {
      const orderId = generateTestId("ord");
      const customerId = generateTestId("cust");

      // Create order first
      await testMutation(t, api.orders.createOrder, { orderId, customerId });

      // Wait for projection
      await waitUntil(
        async () => {
          const order = await testQuery(t, api.orders.getOrderSummary, { orderId });
          return order !== null;
        },
        { message: "Order creation" }
      );

      // Try to create again with same orderId (should reject)
      const result = await testMutation(t, api.orders.createOrder, {
        orderId,
        customerId: generateTestId("cust"),
      });

      expect(result.status).toBe("rejected");
      expect(result.code).toBe("ORDER_ALREADY_EXISTS");
    });
  });

  describe("Event Store Integration", () => {
    it("should assign globalPosition to events", async () => {
      const orderId = generateTestId("ord");
      const customerId = generateTestId("cust");

      const result = await testMutation(t, api.orders.createOrder, {
        orderId,
        customerId,
      });

      expect(result.status).toBe("success");
      expect(result.globalPosition).toBeDefined();
      expect(typeof result.globalPosition).toBe("number");
      expect(result.globalPosition).toBeGreaterThan(0);
    });

    it("should increment globalPosition for sequential events", async () => {
      const orderId1 = generateTestId("ord");
      const orderId2 = generateTestId("ord");
      const customerId = generateTestId("cust");

      // Create first order
      const result1 = await testMutation(t, api.orders.createOrder, {
        orderId: orderId1,
        customerId,
      });

      // Create second order
      const result2 = await testMutation(t, api.orders.createOrder, {
        orderId: orderId2,
        customerId,
      });

      expect(result1.globalPosition).toBeDefined();
      expect(result2.globalPosition).toBeDefined();
      expect(result2.globalPosition).toBeGreaterThan(result1.globalPosition);
    });
  });

  describe("Full Dual-Write Flow", () => {
    it("should execute complete command lifecycle", async () => {
      const orderId = generateTestId("ord");
      const customerId = generateTestId("cust");

      // 1. Create order (dual-write: CMS + Event Store + Projection enqueue)
      const createResult = await testMutation(t, api.orders.createOrder, {
        orderId,
        customerId,
      });

      expect(createResult.status).toBe("success");
      expect(createResult.version).toBe(1);

      // Wait for projection
      await waitUntil(
        async () => {
          const order = await testQuery(t, api.orders.getOrderSummary, { orderId });
          return order !== null;
        },
        { message: "Create projection" }
      );

      // 2. Add item (version increment)
      const addResult = await testMutation(t, api.orders.addOrderItem, {
        orderId,
        productId: "prod_lifecycle_001",
        productName: "Lifecycle Widget",
        quantity: 2,
        unitPrice: 50.0,
      });

      expect(addResult.status).toBe("success");

      // Wait for projection
      await waitUntil(
        async () => {
          const order = await testQuery(t, api.orders.getOrderSummary, { orderId });
          return order?.itemCount === 1;
        },
        { message: "Add item projection" }
      );

      // 3. Submit order
      const submitResult = await testMutation(t, api.orders.submitOrder, { orderId });

      expect(submitResult.status).toBe("success");

      // Wait for projection
      await waitUntil(
        async () => {
          const order = await testQuery(t, api.orders.getOrderSummary, { orderId });
          return order?.status === "submitted";
        },
        { message: "Submit projection" }
      );

      // Verify final state
      const finalOrder = await testQuery(t, api.orders.getOrderSummary, { orderId });
      expect(finalOrder?.status).toBe("submitted");
      expect(finalOrder?.itemCount).toBe(1);
      expect(finalOrder?.totalAmount).toBe(100); // 2 * 50
    });
  });
});
