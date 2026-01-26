/**
 * Process Manager Integration Tests
 *
 * Tests the event → PM → command flow using a real Convex backend.
 *
 * Tests are organized into two categories:
 *
 * 1. **Normal Flow Tests** - Verify event → PM → command processing works
 * 2. **Crash Recovery Tests** - Verify retry logic with real component transactions
 *
 * Unit tests in withPMCheckpoint.test.ts cover the core checkpoint logic with mocks,
 * but these integration tests verify the behavior with real Convex component
 * sub-transactions where each storage call commits independently.
 *
 * Uses the order-management example app as the test bed.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { ConvexTestingHelper } from "convex-helpers/testing";
import { api } from "../../../../examples/order-management/convex/_generated/api";
import { waitUntil, generateTestId } from "./support/helpers";
import { testMutation, testQuery } from "./support/testHelpers";

describe("Process Manager Integration", () => {
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

  describe("OrderNotification PM Event Flow", () => {
    it("should process OrderConfirmed event and emit SendNotification command", async () => {
      const orderId = generateTestId("ord");
      const customerId = generateTestId("cust");
      const productId = generateTestId("prod");
      const sku = generateTestId("sku");

      // Step 0: Create product with inventory (required for saga to succeed)
      await testMutation(t, api.testing.createTestProduct, {
        productId,
        productName: "PM Test Widget",
        sku,
        availableQuantity: 100,
      });

      // Step 1: Create order (draft status)
      const createResult = await testMutation(t, api.orders.createOrder, {
        orderId,
        customerId,
      });
      expect(createResult.status).toBe("success");

      // Wait for order creation projection
      await waitUntil(
        async () => {
          const order = await testQuery(t, api.orders.getOrderSummary, { orderId });
          return order !== null && order.status === "draft";
        },
        { message: "Order should be created", timeoutMs: 10000 }
      );

      // Step 2: Add an item to the order
      await testMutation(t, api.orders.addOrderItem, {
        orderId,
        productId,
        productName: "PM Test Widget",
        quantity: 1,
        unitPrice: 50.0,
      });

      // Wait for item to be added
      await waitUntil(
        async () => {
          const order = await testQuery(t, api.orders.getOrderSummary, { orderId });
          return order?.itemCount === 1;
        },
        { message: "Item should be added", timeoutMs: 10000 }
      );

      // Step 3: Submit order (changes status to 'submitted')
      const submitResult = await testMutation(t, api.orders.submitOrder, {
        orderId,
      });
      expect(submitResult.status).toBe("success");

      // Wait for order to be submitted
      await waitUntil(
        async () => {
          const order = await testQuery(t, api.orders.getOrderSummary, { orderId });
          return order?.status === "submitted";
        },
        { message: "Order should be submitted", timeoutMs: 10000 }
      );

      // Step 4: Confirm order (triggers OrderConfirmed event → PM subscription)
      const confirmResult = await testMutation(t, api.orders.confirmOrder, {
        orderId,
      });
      expect(confirmResult.status).toBe("success");

      // Wait for order confirmation projection
      // Projection processing via Workpool can take longer under load
      await waitUntil(
        async () => {
          const order = await testQuery(t, api.orders.getOrderSummary, { orderId });
          return order?.status === "confirmed";
        },
        { message: "Order should be confirmed", timeoutMs: 30000 }
      );

      // Step 5: Verify PM processed the event
      // The PM instance ID is the orderId (from correlation strategy)
      await waitUntil(
        async () => {
          const pmState = await testQuery(t, api.testingFunctions.getPMState, {
            processManagerName: "orderNotification",
            instanceId: orderId,
          });
          return pmState !== null && pmState.commandsEmitted > 0;
        },
        { message: "PM should have processed the event and emitted commands", timeoutMs: 15000 }
      );

      // Verify PM state details
      const pmState = await testQuery(t, api.testingFunctions.getPMState, {
        processManagerName: "orderNotification",
        instanceId: orderId,
      });

      expect(pmState).toBeDefined();
      expect(pmState?.processManagerName).toBe("orderNotification");
      expect(pmState?.instanceId).toBe(orderId);
      // One-shot PMs (fire-and-forget) transition to "completed" after processing
      expect(pmState?.status).toBe("completed");
      expect(pmState?.commandsEmitted).toBeGreaterThanOrEqual(1);
      expect(pmState?.lastGlobalPosition).toBeGreaterThan(0);
    });

    it("should handle duplicate events idempotently (no double command emission)", async () => {
      const orderId = generateTestId("ord");
      const customerId = generateTestId("cust");
      const productId = generateTestId("prod");
      const sku = generateTestId("sku");

      // Create product with inventory (required for saga to succeed)
      await testMutation(t, api.testing.createTestProduct, {
        productId,
        productName: "Idempotency Widget",
        sku,
        availableQuantity: 100,
      });

      // Create and confirm order to trigger PM
      await testMutation(t, api.orders.createOrder, { orderId, customerId });
      await waitUntil(
        async () => {
          const order = await testQuery(t, api.orders.getOrderSummary, { orderId });
          return order !== null;
        },
        { message: "Order should be created", timeoutMs: 10000 }
      );

      await testMutation(t, api.orders.addOrderItem, {
        orderId,
        productId,
        productName: "Idempotency Widget",
        quantity: 1,
        unitPrice: 25.0,
      });
      await waitUntil(
        async () => {
          const order = await testQuery(t, api.orders.getOrderSummary, { orderId });
          return order?.itemCount === 1;
        },
        { message: "Item should be added", timeoutMs: 10000 }
      );

      await testMutation(t, api.orders.submitOrder, { orderId });
      await waitUntil(
        async () => {
          const order = await testQuery(t, api.orders.getOrderSummary, { orderId });
          return order?.status === "submitted";
        },
        { message: "Order should be submitted", timeoutMs: 10000 }
      );

      const confirmResult = await testMutation(t, api.orders.confirmOrder, { orderId });
      // Note: submitOrder triggers OrderFulfillment saga which races with this call.
      // If confirmOrder fails, the saga may have already confirmed it, or the saga
      // may cancel due to no inventory. We need the order confirmed for PM to work.
      if (confirmResult.status !== "success") {
        // Wait for saga to complete - order will reach terminal state
        await waitUntil(
          async () => {
            const order = await testQuery(t, api.orders.getOrderSummary, { orderId });
            return order?.status === "confirmed" || order?.status === "cancelled";
          },
          { message: "Order should reach terminal state", timeoutMs: 30000 }
        );

        // Check final state - PM requires OrderConfirmed event
        const order = await testQuery(t, api.orders.getOrderSummary, { orderId });
        if (order?.status !== "confirmed") {
          // Saga cancelled the order (likely no inventory).
          // Since saga cancelled, there's no OrderConfirmed event for PM.
          throw new Error(
            `Order ${orderId} was cancelled by saga. PM requires confirmed orders. ` +
              `Original confirmOrder error: ${confirmResult.message || confirmResult.code}`
          );
        }
        // Saga confirmed the order - OrderConfirmed event exists
      }

      // Wait for confirmed status in projection (Workpool can take longer under load)
      await waitUntil(
        async () => {
          const order = await testQuery(t, api.orders.getOrderSummary, { orderId });
          return order?.status === "confirmed";
        },
        { message: "Order should be confirmed", timeoutMs: 30000 }
      );

      // Wait for PM to process
      await waitUntil(
        async () => {
          const pmState = await testQuery(t, api.testingFunctions.getPMState, {
            processManagerName: "orderNotification",
            instanceId: orderId,
          });
          return pmState !== null && pmState.commandsEmitted > 0;
        },
        { message: "PM should have processed the event and emitted commands", timeoutMs: 15000 }
      );

      // Record initial command count
      const initialState = await testQuery(t, api.testingFunctions.getPMState, {
        processManagerName: "orderNotification",
        instanceId: orderId,
      });
      const initialCommandCount = initialState?.commandsEmitted ?? 0;
      const initialPosition = initialState?.lastGlobalPosition ?? 0;

      // Verify PM is in completed state (terminal - won't process more events)
      expect(initialState?.status).toBe("completed");

      // Poll multiple times to ensure no additional processing occurs
      // This is more reliable than a fixed timeout and catches timing issues
      let checksRemaining = 5;
      while (checksRemaining > 0) {
        await waitUntil(
          async () => {
            // Small delay between checks
            await new Promise((resolve) => setTimeout(resolve, 400));
            return true;
          },
          { message: "Polling interval", timeoutMs: 1000 }
        );

        const currentState = await testQuery(t, api.testingFunctions.getPMState, {
          processManagerName: "orderNotification",
          instanceId: orderId,
        });

        // Verify command count hasn't changed (idempotent)
        expect(currentState?.commandsEmitted).toBe(initialCommandCount);
        expect(currentState?.lastGlobalPosition).toBe(initialPosition);
        checksRemaining--;
      }

      // Final verification
      const finalState = await testQuery(t, api.testingFunctions.getPMState, {
        processManagerName: "orderNotification",
        instanceId: orderId,
      });

      expect(finalState?.commandsEmitted).toBe(initialCommandCount);
      expect(finalState?.lastGlobalPosition).toBe(initialPosition);
    });

    it("should create separate PM instances for different orders", async () => {
      const orderId1 = generateTestId("ord");
      const orderId2 = generateTestId("ord");
      const customerId = generateTestId("cust");

      // Helper to process an order through confirmation
      const processOrder = async (orderId: string) => {
        // Create unique product with inventory for this order (required for saga to succeed)
        const productId = generateTestId("prod");
        const sku = generateTestId("sku");

        await testMutation(t, api.testing.createTestProduct, {
          productId,
          productName: "Multi-order Widget",
          sku,
          availableQuantity: 100,
        });

        await testMutation(t, api.orders.createOrder, { orderId, customerId });
        await waitUntil(
          async () => {
            const order = await testQuery(t, api.orders.getOrderSummary, { orderId });
            return order !== null;
          },
          { message: `Order ${orderId} should be created`, timeoutMs: 10000 }
        );

        await testMutation(t, api.orders.addOrderItem, {
          orderId,
          productId,
          productName: "Multi-order Widget",
          quantity: 1,
          unitPrice: 30.0,
        });
        await waitUntil(
          async () => {
            const order = await testQuery(t, api.orders.getOrderSummary, { orderId });
            return order?.itemCount === 1;
          },
          { message: `Order ${orderId} should have 1 item`, timeoutMs: 10000 }
        );

        await testMutation(t, api.orders.submitOrder, { orderId });
        await waitUntil(
          async () => {
            const order = await testQuery(t, api.orders.getOrderSummary, { orderId });
            return order?.status === "submitted";
          },
          { message: `Order ${orderId} should be submitted`, timeoutMs: 10000 }
        );

        const confirmResult = await testMutation(t, api.orders.confirmOrder, { orderId });
        // Note: submitOrder triggers OrderFulfillment saga which races with this call.
        // If confirmOrder fails, the saga may have already confirmed it, or the saga
        // may cancel due to no inventory. We need the order confirmed for PM to work.
        if (confirmResult.status !== "success") {
          // Wait for saga to complete - order will reach terminal state
          await waitUntil(
            async () => {
              const order = await testQuery(t, api.orders.getOrderSummary, { orderId });
              return order?.status === "confirmed" || order?.status === "cancelled";
            },
            { message: `Order ${orderId} should reach terminal state`, timeoutMs: 30000 }
          );

          // Check final state - PM requires OrderConfirmed event
          const order = await testQuery(t, api.orders.getOrderSummary, { orderId });
          if (order?.status !== "confirmed") {
            // Saga cancelled the order (likely no inventory).
            // Since saga cancelled, there's no OrderConfirmed event for PM.
            throw new Error(
              `Order ${orderId} was cancelled by saga. PM requires confirmed orders. ` +
                `Original confirmOrder error: ${confirmResult.message || confirmResult.code}`
            );
          }
          // Saga confirmed the order - OrderConfirmed event exists
        }

        // Wait for confirmed status in projection
        await waitUntil(
          async () => {
            const order = await testQuery(t, api.orders.getOrderSummary, { orderId });
            return order?.status === "confirmed";
          },
          { message: `Order ${orderId} should be confirmed`, timeoutMs: 30000 }
        );
      };

      // Process both orders
      await processOrder(orderId1);
      await processOrder(orderId2);

      // Wait for both PMs to process
      await waitUntil(
        async () => {
          const pm1 = await testQuery(t, api.testingFunctions.getPMState, {
            processManagerName: "orderNotification",
            instanceId: orderId1,
          });
          const pm2 = await testQuery(t, api.testingFunctions.getPMState, {
            processManagerName: "orderNotification",
            instanceId: orderId2,
          });
          return pm1?.commandsEmitted > 0 && pm2?.commandsEmitted > 0;
        },
        { message: "Both PMs should have emitted commands", timeoutMs: 15000 }
      );

      // Verify separate PM instances exist
      const pm1State = await testQuery(t, api.testingFunctions.getPMState, {
        processManagerName: "orderNotification",
        instanceId: orderId1,
      });
      const pm2State = await testQuery(t, api.testingFunctions.getPMState, {
        processManagerName: "orderNotification",
        instanceId: orderId2,
      });

      expect(pm1State).toBeDefined();
      expect(pm2State).toBeDefined();
      expect(pm1State?.instanceId).toBe(orderId1);
      expect(pm2State?.instanceId).toBe(orderId2);
      expect(pm1State?.commandsEmitted).toBeGreaterThanOrEqual(1);
      expect(pm2State?.commandsEmitted).toBeGreaterThanOrEqual(1);

      // They should have different global positions (different events)
      expect(pm1State?.lastGlobalPosition).not.toBe(pm2State?.lastGlobalPosition);
    });
  });

  describe("Direct PM Handler Invocation", () => {
    /**
     * Tests PM handler logic by invoking it directly, bypassing EventBus/Workpool.
     *
     * This isolates the PM logic from delivery infrastructure. If this test passes
     * but the full flow tests fail, the issue is in EventBus/Workpool delivery,
     * not in the PM handler itself.
     *
     * Key insight: The PM uses `orderId` from payload as instanceId (via instanceIdResolver).
     * To avoid racing with Workpool, we use a synthetic orderId in the payload that
     * doesn't correspond to any real order.
     */
    it("should process event when PM handler called directly", async () => {
      const orderId = generateTestId("ord");
      const customerId = generateTestId("cust");
      const productId = generateTestId("prod");
      const sku = generateTestId("sku");
      // Synthetic orderId for direct test - avoids collision with Workpool processing
      const syntheticOrderId = generateTestId("synthetic-ord");

      // Step 0: Create product with inventory (required for saga to succeed)
      await testMutation(t, api.testing.createTestProduct, {
        productId,
        productName: "Direct Test Widget",
        sku,
        availableQuantity: 100,
      });

      // Step 1: Create and confirm order to generate real event
      // We use dual-write pattern, so the event is appended atomically with CMS update.
      // No need to wait for projections - event exists immediately after mutation succeeds.
      await testMutation(t, api.orders.createOrder, { orderId, customerId });

      // Wait for CMS to exist (verifies createOrder succeeded)
      await waitUntil(
        async () => {
          const order = await testQuery(t, api.orders.getOrderSummary, { orderId });
          return order !== null;
        },
        { message: "Order should be created", timeoutMs: 10000 }
      );

      await testMutation(t, api.orders.addOrderItem, {
        orderId,
        productId,
        productName: "Direct Test Widget",
        quantity: 1,
        unitPrice: 50.0,
      });

      // Wait for item to be added (projection)
      await waitUntil(
        async () => {
          const order = await testQuery(t, api.orders.getOrderSummary, { orderId });
          return order?.itemCount === 1;
        },
        { message: "Item should be added", timeoutMs: 10000 }
      );

      await testMutation(t, api.orders.submitOrder, { orderId });

      // Wait for order to reach "submitted" status before confirming
      await waitUntil(
        async () => {
          const order = await testQuery(t, api.orders.getOrderSummary, { orderId });
          return order?.status === "submitted";
        },
        { message: "Order should be submitted", timeoutMs: 10000 }
      );

      await testMutation(t, api.orders.confirmOrder, { orderId });

      // Wait for order to reach "confirmed" status
      // Projection processing via Workpool can take longer under load
      await waitUntil(
        async () => {
          const order = await testQuery(t, api.orders.getOrderSummary, { orderId });
          return order?.status === "confirmed";
        },
        { message: "Order should be confirmed", timeoutMs: 30000 }
      );

      // Step 2: Get the OrderConfirmed event from the event store
      // Due to dual-write, the event exists immediately after confirmOrder succeeds.
      const events = await testQuery(t, api.testingFunctions.getEventsForStream, {
        streamType: "Order",
        streamId: orderId,
      });
      const confirmedEvent = events.find(
        (e: { eventType: string }) => e.eventType === "OrderConfirmed"
      );
      expect(confirmedEvent).toBeDefined();

      // Step 3: Call PM handler DIRECTLY with synthetic orderId in payload
      // The PM uses orderId from payload as instanceId, so using a synthetic one
      // creates a fresh PM instance that Workpool hasn't touched
      const result = await testMutation(t, api.testingFunctions.invokeOrderNotificationPMDirectly, {
        eventId: generateTestId("evt"), // Synthetic event ID
        eventType: "OrderConfirmed",
        globalPosition: confirmedEvent.globalPosition + 100, // Higher position to avoid conflict
        correlationId: "direct-test-correlation",
        streamType: "Order",
        streamId: syntheticOrderId,
        payload: {
          orderId: syntheticOrderId, // KEY: Use synthetic orderId here
          customerId,
          totalAmount: 50.0,
          confirmedAt: Date.now(),
        },
        timestamp: Date.now(),
        category: "domain",
        boundedContext: "orders",
        instanceId: syntheticOrderId,
      });

      // Step 4: Verify PM processed successfully
      expect(result.status).toBe("processed");
      expect(result.commandsEmitted).toContain("SendNotification");

      // Step 5: Verify PM state was created with correct values
      // The PM uses orderId from payload as instanceId
      const pmState = await testQuery(t, api.testingFunctions.getPMState, {
        processManagerName: "orderNotification",
        instanceId: syntheticOrderId,
      });

      expect(pmState).toBeDefined();
      expect(pmState?.status).toBe("completed");
      expect(pmState?.commandsEmitted).toBeGreaterThanOrEqual(1);
    });
  });

  describe("True Duplicate Event Delivery", () => {
    /**
     * Tests true duplicate event delivery with the same globalPosition.
     *
     * This test verifies that when the same event (same globalPosition) is
     * delivered twice to the PM handler, the second delivery is correctly
     * skipped with "already_processed" reason.
     *
     * Unlike the previous idempotency test which only verified a completed PM
     * doesn't reprocess, this test explicitly sends the same event twice
     * through the direct handler invocation to verify the checkpoint logic.
     */
    it("should skip duplicate event delivery with same globalPosition", async () => {
      // Use synthetic orderId to create a fresh PM instance
      const syntheticOrderId = generateTestId("dup-test-ord");
      const customerId = generateTestId("cust");
      const eventId = generateTestId("evt");
      const globalPosition = 12345678; // Fixed position for both deliveries

      // First delivery - should process
      const result1 = await testMutation(
        t,
        api.testingFunctions.invokeOrderNotificationPMDirectly,
        {
          eventId,
          eventType: "OrderConfirmed",
          globalPosition,
          correlationId: "dup-test-correlation",
          streamType: "Order",
          streamId: syntheticOrderId,
          payload: {
            orderId: syntheticOrderId,
            customerId,
            totalAmount: 100.0,
            confirmedAt: Date.now(),
          },
          timestamp: Date.now(),
          category: "domain",
          boundedContext: "orders",
          instanceId: syntheticOrderId,
        }
      );

      expect(result1.status).toBe("processed");
      expect(result1.commandsEmitted).toContain("SendNotification");

      // Verify PM is now completed
      const pmStateAfterFirst = await testQuery(t, api.testingFunctions.getPMState, {
        processManagerName: "orderNotification",
        instanceId: syntheticOrderId,
      });
      expect(pmStateAfterFirst?.status).toBe("completed");
      expect(pmStateAfterFirst?.lastGlobalPosition).toBe(globalPosition);
      const initialCommandCount = pmStateAfterFirst?.commandsEmitted ?? 0;

      // Second delivery - same event, same globalPosition - should skip
      const result2 = await testMutation(
        t,
        api.testingFunctions.invokeOrderNotificationPMDirectly,
        {
          eventId, // Same event ID
          eventType: "OrderConfirmed",
          globalPosition, // Same globalPosition - THIS IS THE KEY
          correlationId: "dup-test-correlation",
          streamType: "Order",
          streamId: syntheticOrderId,
          payload: {
            orderId: syntheticOrderId,
            customerId,
            totalAmount: 100.0,
            confirmedAt: Date.now(),
          },
          timestamp: Date.now(),
          category: "domain",
          boundedContext: "orders",
          instanceId: syntheticOrderId,
        }
      );

      // Should be skipped due to already_processed (same globalPosition)
      expect(result2.status).toBe("skipped");
      expect(result2.reason).toBe("already_processed");

      // Verify PM state unchanged - no additional commands emitted
      const pmStateAfterSecond = await testQuery(t, api.testingFunctions.getPMState, {
        processManagerName: "orderNotification",
        instanceId: syntheticOrderId,
      });
      expect(pmStateAfterSecond?.commandsEmitted).toBe(initialCommandCount);
      expect(pmStateAfterSecond?.lastGlobalPosition).toBe(globalPosition);
    });

    /**
     * Tests that an event with lower globalPosition than checkpoint is skipped.
     *
     * This verifies the "already_processed" reason is returned when an
     * out-of-order (older) event arrives after a newer event was processed.
     */
    it("should skip event with globalPosition lower than checkpoint", async () => {
      const syntheticOrderId = generateTestId("ooo-test-ord");
      const customerId = generateTestId("cust");

      // First, create PM state with a high checkpoint via normal processing
      await testMutation(t, api.testingFunctions.createPMState, {
        processManagerName: "orderNotification",
        instanceId: syntheticOrderId,
        status: "idle",
        lastGlobalPosition: 50000, // High checkpoint
      });

      // Try to deliver an "older" event with lower globalPosition
      const result = await testMutation(t, api.testingFunctions.invokeOrderNotificationPMDirectly, {
        eventId: generateTestId("evt"),
        eventType: "OrderConfirmed",
        globalPosition: 10000, // Lower than checkpoint (50000)
        correlationId: "ooo-test-correlation",
        streamType: "Order",
        streamId: syntheticOrderId,
        payload: {
          orderId: syntheticOrderId,
          customerId,
          totalAmount: 75.0,
          confirmedAt: Date.now(),
        },
        timestamp: Date.now(),
        category: "domain",
        boundedContext: "orders",
        instanceId: syntheticOrderId,
      });

      // Should be skipped with "already_processed" reason
      expect(result.status).toBe("skipped");
      expect(result.reason).toBe("already_processed");
    });
  });

  describe("PM Crash Recovery", () => {
    /**
     * Tests the critical crash-recovery scenario with real Convex component transactions.
     *
     * This test verifies the fix for the bug where `lastGlobalPosition` was updated
     * too early (in "processing" transition), causing retries to skip events.
     *
     * Scenario:
     * 1. PM exists in "processing" state with lastGlobalPosition=0 (simulates crash)
     * 2. OrderConfirmed event is delivered via normal flow
     * 3. PM should process the event (not skip it)
     * 4. PM state should transition to "completed" with correct checkpoint
     *
     * This tests the same logic as unit tests but with real component sub-transactions.
     */
    it("should allow retry when PM is stuck in processing state (crash recovery)", async () => {
      const orderId = generateTestId("ord");
      const customerId = generateTestId("cust");
      const productId = generateTestId("prod");
      const sku = generateTestId("sku");

      // Step 0: Create product with inventory (required for saga to succeed)
      await testMutation(t, api.testing.createTestProduct, {
        productId,
        productName: "Crash Recovery Widget",
        sku,
        availableQuantity: 100,
      });

      // Step 1: Pre-create PM state in "processing" status
      // This simulates a crash that happened after transitioning to "processing"
      // but before completing. The lastGlobalPosition=0 means the checkpoint
      // hasn't been updated yet (that's the fix we're testing).
      await testMutation(t, api.testingFunctions.createPMState, {
        processManagerName: "orderNotification",
        instanceId: orderId,
        status: "processing",
        lastGlobalPosition: 0, // Not updated yet - simulates crash before completion
      });

      // Verify PM is in the "stuck" state
      const initialPMState = await testQuery(t, api.testingFunctions.getPMState, {
        processManagerName: "orderNotification",
        instanceId: orderId,
      });
      expect(initialPMState?.status).toBe("processing");
      expect(initialPMState?.lastGlobalPosition).toBe(0);

      // Step 2: Execute normal order flow to trigger OrderConfirmed event
      // Due to dual-write, events exist immediately after mutations succeed.
      // We only wait for essential projections needed to continue the flow.
      await testMutation(t, api.orders.createOrder, { orderId, customerId });
      await waitUntil(
        async () => {
          const order = await testQuery(t, api.orders.getOrderSummary, { orderId });
          return order !== null;
        },
        { message: "Order should be created", timeoutMs: 10000 }
      );

      await testMutation(t, api.orders.addOrderItem, {
        orderId,
        productId,
        productName: "Crash Recovery Widget",
        quantity: 1,
        unitPrice: 100.0,
      });
      await waitUntil(
        async () => {
          const order = await testQuery(t, api.orders.getOrderSummary, { orderId });
          return order?.itemCount === 1;
        },
        { message: "Item should be added", timeoutMs: 10000 }
      );

      // Submit and confirm order - no projection waits needed
      // The OrderConfirmed event exists immediately after confirmOrder succeeds
      await testMutation(t, api.orders.submitOrder, { orderId });
      await testMutation(t, api.orders.confirmOrder, { orderId });

      // Step 3: Wait for PM to process the event
      // The PM was in "processing" state before the event arrived.
      // With the bug fix, it should still process the event because:
      // - lastGlobalPosition=0 (not yet checkpointed)
      // - OR status="processing" allows retry
      await waitUntil(
        async () => {
          const pmState = await testQuery(t, api.testingFunctions.getPMState, {
            processManagerName: "orderNotification",
            instanceId: orderId,
          });
          return pmState !== null && pmState.commandsEmitted > 0;
        },
        {
          message: "PM should process event despite being stuck in processing state",
          timeoutMs: 15000,
        }
      );

      // Step 4: Verify PM completed successfully
      const finalPMState = await testQuery(t, api.testingFunctions.getPMState, {
        processManagerName: "orderNotification",
        instanceId: orderId,
      });

      expect(finalPMState).toBeDefined();
      expect(finalPMState?.status).toBe("completed");
      expect(finalPMState?.commandsEmitted).toBeGreaterThanOrEqual(1);
      expect(finalPMState?.lastGlobalPosition).toBeGreaterThan(0);
    });

    it("should allow retry when PM is in failed state", async () => {
      const orderId = generateTestId("ord");
      const customerId = generateTestId("cust");
      const productId = generateTestId("prod");
      const sku = generateTestId("sku");

      // Create product with inventory (required for saga to succeed)
      await testMutation(t, api.testing.createTestProduct, {
        productId,
        productName: "Retry Widget",
        sku,
        availableQuantity: 100,
      });

      // Pre-create PM state in "failed" status with lastGlobalPosition=0
      // This simulates a PM that failed during processing and needs to retry
      await testMutation(t, api.testingFunctions.createPMState, {
        processManagerName: "orderNotification",
        instanceId: orderId,
        status: "failed",
        lastGlobalPosition: 0,
      });

      // Verify PM is in failed state
      const initialPMState = await testQuery(t, api.testingFunctions.getPMState, {
        processManagerName: "orderNotification",
        instanceId: orderId,
      });
      expect(initialPMState?.status).toBe("failed");

      // Execute order flow to trigger OrderConfirmed event
      // Due to dual-write, events exist immediately after mutations succeed.
      await testMutation(t, api.orders.createOrder, { orderId, customerId });
      await waitUntil(
        async () => {
          const order = await testQuery(t, api.orders.getOrderSummary, { orderId });
          return order !== null;
        },
        { message: "Order should be created", timeoutMs: 10000 }
      );

      await testMutation(t, api.orders.addOrderItem, {
        orderId,
        productId,
        productName: "Retry Widget",
        quantity: 1,
        unitPrice: 50.0,
      });
      await waitUntil(
        async () => {
          const order = await testQuery(t, api.orders.getOrderSummary, { orderId });
          return order?.itemCount === 1;
        },
        { message: "Item should be added", timeoutMs: 10000 }
      );

      // Submit and confirm order - no projection waits needed
      await testMutation(t, api.orders.submitOrder, { orderId });
      await testMutation(t, api.orders.confirmOrder, { orderId });

      // Wait for PM to process - it should retry from failed state
      await waitUntil(
        async () => {
          const pmState = await testQuery(t, api.testingFunctions.getPMState, {
            processManagerName: "orderNotification",
            instanceId: orderId,
          });
          return pmState !== null && pmState.commandsEmitted > 0;
        },
        { message: "PM should retry from failed state", timeoutMs: 15000 }
      );

      // Verify PM completed successfully after retry
      const finalPMState = await testQuery(t, api.testingFunctions.getPMState, {
        processManagerName: "orderNotification",
        instanceId: orderId,
      });

      expect(finalPMState).toBeDefined();
      expect(finalPMState?.status).toBe("completed");
      expect(finalPMState?.commandsEmitted).toBeGreaterThanOrEqual(1);
      expect(finalPMState?.lastGlobalPosition).toBeGreaterThan(0);
    });
  });
});
