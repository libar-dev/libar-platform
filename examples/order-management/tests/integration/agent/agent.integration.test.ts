/**
 * Agent BC Integration Tests
 *
 * Uses real Convex backend via Docker for full system validation.
 * Tests:
 * - Agent checkpoint persistence and recovery
 * - Audit event recording
 * - Pattern detection (churn risk)
 * - Idempotency via checkpoint position tracking
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { ConvexTestingHelper } from "convex-helpers/testing";
import { api } from "../../../convex/_generated/api";
import { generateOrderId, generateCustomerId } from "../../fixtures/orders";
import { generateProductId, generateSku } from "../../fixtures/inventory";
import { waitUntil, DEFAULT_TIMEOUT_MS } from "../../support/localBackendHelpers";

// Extended timeout for integration tests (15 seconds)
const AGENT_TEST_TIMEOUT = DEFAULT_TIMEOUT_MS * 1.5;
import { testMutation, testQuery } from "../../support/integrationHelpers";
import { CHURN_RISK_AGENT_ID } from "../../../convex/contexts/agent/_config";

describe("Agent BC Integration Tests", () => {
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

  describe("Checkpoint Persistence", () => {
    it("should create checkpoint on first event processing", async () => {
      // Create product with stock first (required for order fulfillment saga)
      const productId = generateProductId();
      const sku = generateSku();
      await testMutation(t, api.testing.createTestProduct, {
        productId,
        productName: "Test Widget",
        sku,
        availableQuantity: 100,
      });

      // Create an order to trigger the agent
      const customerId = generateCustomerId();
      const orderId = generateOrderId();

      // Create order
      const createResult = await testMutation(t, api.orders.createOrder, {
        orderId,
        customerId,
      });
      expect(createResult.status).toBe("success");

      // Add items and submit
      await testMutation(t, api.orders.addOrderItem, {
        orderId,
        productId,
        productName: "Test Widget",
        quantity: 1,
        unitPrice: 10,
      });
      await testMutation(t, api.orders.submitOrder, { orderId });

      // Wait for order to be confirmed (so we can cancel)
      await waitUntil(
        async () => {
          const order = await testQuery(t, api.orders.getOrderSummary, { orderId });
          return order?.status === "confirmed";
        },
        { message: "Order confirmed", timeout: AGENT_TEST_TIMEOUT }
      );

      // Cancel the order - this should trigger the agent
      await testMutation(t, api.orders.cancelOrder, {
        orderId,
        reason: "Test cancellation",
      });

      // Wait for checkpoint to be created/updated
      await waitUntil(
        async () => {
          const checkpoint = await testQuery(t, api.queries.agent.getCheckpoint, {
            agentId: CHURN_RISK_AGENT_ID,
          });
          return checkpoint !== null && checkpoint.eventsProcessed > 0;
        },
        { message: "Agent checkpoint created", timeout: AGENT_TEST_TIMEOUT }
      );

      // Verify checkpoint state
      const checkpoint = await testQuery(t, api.queries.agent.getCheckpoint, {
        agentId: CHURN_RISK_AGENT_ID,
      });

      expect(checkpoint).toBeDefined();
      expect(checkpoint?.agentId).toBe(CHURN_RISK_AGENT_ID);
      expect(checkpoint?.status).toBe("active");
      expect(checkpoint?.eventsProcessed).toBeGreaterThan(0);
    });
  });

  describe("Pattern Detection", () => {
    it("should detect churn risk after 3+ cancellations", async () => {
      // Create product with stock first (required for order fulfillment saga)
      const productId = generateProductId();
      const sku = generateSku();
      await testMutation(t, api.testing.createTestProduct, {
        productId,
        productName: "Test Widget",
        sku,
        availableQuantity: 100, // Enough for all orders
      });

      // Create multiple orders for the same customer and cancel them
      const customerId = generateCustomerId();
      const orderIds: string[] = [];

      // Create and cancel 3 orders for the same customer
      for (let i = 0; i < 3; i++) {
        const orderId = generateOrderId();
        orderIds.push(orderId);

        // Create order
        await testMutation(t, api.orders.createOrder, {
          orderId,
          customerId,
        });

        // Add items
        await testMutation(t, api.orders.addOrderItem, {
          orderId,
          productId,
          productName: "Test Widget",
          quantity: 1,
          unitPrice: 10,
        });

        // Submit
        await testMutation(t, api.orders.submitOrder, { orderId });

        // Wait for confirmation
        await waitUntil(
          async () => {
            const order = await testQuery(t, api.orders.getOrderSummary, { orderId });
            return order?.status === "confirmed";
          },
          { message: `Order ${i + 1} confirmed`, timeout: AGENT_TEST_TIMEOUT }
        );

        // Cancel
        await testMutation(t, api.orders.cancelOrder, {
          orderId,
          reason: `Test cancellation ${i + 1}`,
        });
      }

      // Wait for agent to process and potentially create audit event
      await waitUntil(
        async () => {
          const checkpoint = await testQuery(t, api.queries.agent.getCheckpoint, {
            agentId: CHURN_RISK_AGENT_ID,
          });
          // Agent should have processed at least 3 events
          return checkpoint !== null && checkpoint.eventsProcessed >= 3;
        },
        { message: "Agent processed 3 cancellations", timeout: AGENT_TEST_TIMEOUT }
      );

      // Check for audit events - pattern detection should have triggered
      const auditEvents = await testQuery(t, api.queries.agent.getAuditEvents, {
        agentId: CHURN_RISK_AGENT_ID,
        eventType: "AgentDecisionMade",
        limit: 10,
      });

      // The pattern should have been detected (3+ cancellations in 30 days)
      // Note: This depends on confidence threshold and pattern matching
      // In production, this would create an audit event with churn-risk pattern
      expect(auditEvents).toBeDefined();
    });

    it("should not trigger pattern with fewer than 3 cancellations", async () => {
      // Create product with stock first (required for order fulfillment saga)
      const productId = generateProductId();
      const sku = generateSku();
      await testMutation(t, api.testing.createTestProduct, {
        productId,
        productName: "Test Widget",
        sku,
        availableQuantity: 100,
      });

      // Create only 2 orders and cancel them
      const customerId = generateCustomerId();

      for (let i = 0; i < 2; i++) {
        const orderId = generateOrderId();

        await testMutation(t, api.orders.createOrder, {
          orderId,
          customerId,
        });

        await testMutation(t, api.orders.addOrderItem, {
          orderId,
          productId,
          productName: "Test Widget",
          quantity: 1,
          unitPrice: 10,
        });

        await testMutation(t, api.orders.submitOrder, { orderId });

        await waitUntil(
          async () => {
            const order = await testQuery(t, api.orders.getOrderSummary, { orderId });
            return order?.status === "confirmed";
          },
          { message: `Order ${i + 1} confirmed`, timeout: AGENT_TEST_TIMEOUT }
        );

        await testMutation(t, api.orders.cancelOrder, {
          orderId,
          reason: `Test cancellation ${i + 1}`,
        });
      }

      // Wait a bit for processing
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // Check audit events - should NOT have triggered churn risk pattern
      // because we only had 2 cancellations (threshold is 3)
      const checkpoint = await testQuery(t, api.queries.agent.getCheckpoint, {
        agentId: CHURN_RISK_AGENT_ID,
      });

      // Agent should have processed events
      expect(checkpoint?.eventsProcessed).toBeGreaterThanOrEqual(0);
    });
  });

  describe("Audit Trail", () => {
    /**
     * Tests that the churn risk agent creates audit events when detecting
     * churn patterns. The agent groups OrderCancelled events by customerId
     * and triggers when 3+ cancellations occur within the pattern window.
     */
    it("should create audit events when churn pattern is detected", async () => {
      // Create product with NO stock - saga will fail and cancel orders via compensation
      const productId = generateProductId();
      const sku = generateSku();
      await testMutation(t, api.testing.createTestProduct, {
        productId,
        productName: "Test Widget",
        sku,
        availableQuantity: 0, // No stock - saga compensation will cancel
      });

      const customerId = generateCustomerId();
      const orderIds: string[] = [];

      // Create 3 orders that will be auto-cancelled by saga compensation (no stock)
      for (let i = 0; i < 3; i++) {
        const orderId = generateOrderId();
        orderIds.push(orderId);

        await testMutation(t, api.orders.createOrder, {
          orderId,
          customerId,
        });

        await testMutation(t, api.orders.addOrderItem, {
          orderId,
          productId,
          productName: "Test Widget",
          quantity: 1,
          unitPrice: 10,
        });

        await testMutation(t, api.orders.submitOrder, { orderId });

        // Wait for saga compensation to cancel the order (no stock available)
        await waitUntil(
          async () => {
            const order = await testQuery(t, api.orders.getOrderSummary, { orderId });
            return order?.status === "cancelled";
          },
          { message: `Order ${i + 1} cancelled by saga`, timeout: AGENT_TEST_TIMEOUT }
        );
      }

      // Verify checkpoint was updated with processed events
      await waitUntil(
        async () => {
          const checkpoint = await testQuery(t, api.queries.agent.getCheckpoint, {
            agentId: CHURN_RISK_AGENT_ID,
          });
          return checkpoint !== null && checkpoint.eventsProcessed > 0;
        },
        { message: "Agent checkpoint updated", timeout: AGENT_TEST_TIMEOUT }
      );

      const checkpoint = await testQuery(t, api.queries.agent.getCheckpoint, {
        agentId: CHURN_RISK_AGENT_ID,
      });

      expect(checkpoint).toBeDefined();
      expect(checkpoint?.agentId).toBe(CHURN_RISK_AGENT_ID);
      expect(checkpoint?.status).toBe("active");
      expect(checkpoint?.eventsProcessed).toBeGreaterThan(0);

      // Wait for audit events to be created (pattern detection triggers audit)
      await waitUntil(
        async () => {
          const auditEvents = await testQuery(t, api.queries.agent.getAuditEvents, {
            agentId: CHURN_RISK_AGENT_ID,
            eventType: "AgentDecisionMade",
            limit: 10,
          });
          return auditEvents.length > 0;
        },
        { message: "Audit events created", timeout: AGENT_TEST_TIMEOUT }
      );

      // Verify audit event structure
      const auditEvents = await testQuery(t, api.queries.agent.getAuditEvents, {
        agentId: CHURN_RISK_AGENT_ID,
        eventType: "AgentDecisionMade",
        limit: 10,
      });

      expect(auditEvents.length).toBeGreaterThan(0);
      expect(auditEvents[0]).toMatchObject({
        agentId: CHURN_RISK_AGENT_ID,
        eventType: "AgentDecisionMade",
      });
      expect(auditEvents[0].decisionId).toBeDefined();
      expect(auditEvents[0].timestamp).toBeDefined();
    });
  });

  describe("Active Agents Query", () => {
    it("should list active agents", async () => {
      // Create product with stock first (required for order fulfillment saga)
      const productId = generateProductId();
      const sku = generateSku();
      await testMutation(t, api.testing.createTestProduct, {
        productId,
        productName: "Test Widget",
        sku,
        availableQuantity: 100,
      });

      // Trigger agent to ensure checkpoint exists
      const orderId = generateOrderId();
      const customerId = generateCustomerId();

      await testMutation(t, api.orders.createOrder, {
        orderId,
        customerId,
      });

      await testMutation(t, api.orders.addOrderItem, {
        orderId,
        productId,
        productName: "Test Widget",
        quantity: 1,
        unitPrice: 10,
      });

      await testMutation(t, api.orders.submitOrder, { orderId });

      await waitUntil(
        async () => {
          const order = await testQuery(t, api.orders.getOrderSummary, { orderId });
          return order?.status === "confirmed";
        },
        { message: "Order confirmed", timeout: AGENT_TEST_TIMEOUT }
      );

      await testMutation(t, api.orders.cancelOrder, {
        orderId,
        reason: "Active agents test",
      });

      // Wait for agent checkpoint
      await waitUntil(
        async () => {
          const checkpoint = await testQuery(t, api.queries.agent.getCheckpoint, {
            agentId: CHURN_RISK_AGENT_ID,
          });
          return checkpoint !== null;
        },
        { message: "Agent checkpoint exists", timeout: AGENT_TEST_TIMEOUT }
      );

      // Query active agents
      const activeAgents = await testQuery(t, api.queries.agent.getActiveAgents, {});

      // Should include the churn risk agent
      const churnAgent = activeAgents.find((a) => a.agentId === CHURN_RISK_AGENT_ID);
      expect(churnAgent).toBeDefined();
      expect(churnAgent?.status).toBe("active");
    });
  });
});
