/**
 * Command-Event Correlation Integration Tests
 *
 * Tests the @libar-dev/platform-bus correlation tracking functionality
 * against a real Convex backend.
 *
 * Validates:
 * - Commands produce correlated events
 * - Correlation records are persisted correctly
 * - Rejected commands don't produce correlations
 * - Correlation queries work correctly
 *
 * Uses the example order-management app as the test bed since it implements
 * the full infrastructure pattern.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { ConvexTestingHelper } from "convex-helpers/testing";
import { api } from "../../../../examples/order-management/convex/_generated/api";
import { waitUntil, generateTestId } from "./support/helpers";
import { testMutation, testQuery } from "./support/testHelpers";

describe("Command-Event Correlation Integration", () => {
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

  describe("Correlation Recording", () => {
    it("should record correlation after successful command", async () => {
      const orderId = generateTestId("ord");
      const customerId = generateTestId("cust");
      const commandId = generateTestId("cmd");

      // Execute command with known commandId
      const result = await testMutation(t, api.orders.createOrder, {
        orderId,
        customerId,
        commandId,
      });

      expect(result.status).toBe("success");

      // Query the correlation
      const correlation = await testQuery(t, api["queries/correlations"].getCommandEvents, {
        commandId,
      });

      expect(correlation).toBeDefined();
      expect(correlation?.commandId).toBe(commandId);
      expect(correlation?.eventIds).toHaveLength(1);
      expect(correlation?.eventIds[0]).toBeDefined();
    });

    it("should NOT record correlation for rejected command", async () => {
      const orderId = generateTestId("ord");
      const customerId = generateTestId("cust");

      // First, create an order
      await testMutation(t, api.orders.createOrder, {
        orderId,
        customerId,
      });

      // Wait for projection
      await waitUntil(
        async () => {
          const order = await testQuery(t, api.orders.getOrderSummary, { orderId });
          return order !== null;
        },
        { message: "Order creation" }
      );

      // Try to create duplicate - this should be rejected
      const commandId = generateTestId("cmd");
      const result = await testMutation(t, api.orders.createOrder, {
        orderId,
        customerId: generateTestId("cust"),
        commandId,
      });

      expect(result.status).toBe("rejected");
      expect(result.code).toBe("ORDER_ALREADY_EXISTS");

      // Query the correlation - should be null or empty
      const correlation = await testQuery(t, api["queries/correlations"].getCommandEvents, {
        commandId,
      });

      // Rejected commands don't produce events, so no correlation
      expect(correlation?.eventIds ?? []).toHaveLength(0);
    });
  });

  describe("Correlation Tracing", () => {
    it("should trace command with full context", async () => {
      const orderId = generateTestId("ord");
      const customerId = generateTestId("cust");
      const commandId = generateTestId("cmd");

      // Execute command
      await testMutation(t, api.orders.createOrder, {
        orderId,
        customerId,
        commandId,
      });

      // Trace the command
      const trace = await testQuery(t, api["queries/correlations"].traceCommand, { commandId });

      expect(trace.commandId).toBe(commandId);
      expect(trace.command).toBeDefined();
      expect(trace.command?.status).toBe("executed");
      expect(trace.eventCount).toBe(1);
      expect(trace.correlation?.eventIds).toHaveLength(1);
    });
  });

  describe("Correlation Queries", () => {
    it("should get command history by bounded context", async () => {
      const orderId = generateTestId("ord");
      const customerId = generateTestId("cust");

      // Execute a command
      await testMutation(t, api.orders.createOrder, {
        orderId,
        customerId,
      });

      // Wait for projection
      await waitUntil(
        async () => {
          const order = await testQuery(t, api.orders.getOrderSummary, { orderId });
          return order !== null;
        },
        { message: "Order creation" }
      );

      // Get order command history
      const history = await testQuery(t, api["queries/correlations"].getOrderCommandHistory, {
        limit: 10,
      });

      expect(history).toBeDefined();
      expect(history.length).toBeGreaterThanOrEqual(1);
      expect(history[0]?.boundedContext).toBe("orders");
    });

    it("should produce distinct correlations for multiple commands", async () => {
      const orderId1 = generateTestId("ord");
      const orderId2 = generateTestId("ord");
      const customerId = generateTestId("cust");
      const commandId1 = generateTestId("cmd");
      const commandId2 = generateTestId("cmd");

      // Create first order
      await testMutation(t, api.orders.createOrder, {
        orderId: orderId1,
        customerId,
        commandId: commandId1,
      });

      // Wait for first correlation to be recorded
      await waitUntil(
        async () => {
          const corr = await testQuery(t, api["queries/correlations"].getCommandEvents, {
            commandId: commandId1,
          });
          return corr !== null && corr.eventIds.length > 0;
        },
        { message: "First correlation recording" }
      );

      // Create second order
      await testMutation(t, api.orders.createOrder, {
        orderId: orderId2,
        customerId,
        commandId: commandId2,
      });

      // Wait for second correlation to be recorded
      await waitUntil(
        async () => {
          const corr = await testQuery(t, api["queries/correlations"].getCommandEvents, {
            commandId: commandId2,
          });
          return corr !== null && corr.eventIds.length > 0;
        },
        { message: "Second correlation recording" }
      );

      // Get both correlations
      const corr1 = await testQuery(t, api["queries/correlations"].getCommandEvents, {
        commandId: commandId1,
      });
      const corr2 = await testQuery(t, api["queries/correlations"].getCommandEvents, {
        commandId: commandId2,
      });

      // Verify correlations are defined and each command has its own record
      expect(corr1).toBeDefined();
      expect(corr2).toBeDefined();

      // Each command produces a distinct correlation record with unique commandId
      expect(corr1?.commandId).toBe(commandId1);
      expect(corr2?.commandId).toBe(commandId2);
      expect(corr1?.commandId).not.toBe(corr2?.commandId);

      // Each correlation has unique eventIds
      expect(corr1?.eventIds[0]).toBeDefined();
      expect(corr2?.eventIds[0]).toBeDefined();
      expect(corr1?.eventIds[0]).not.toBe(corr2?.eventIds[0]);

      // Verify bounded context is correct for both
      expect(corr1?.boundedContext).toBe("orders");
      expect(corr2?.boundedContext).toBe("orders");
    });
  });
});
