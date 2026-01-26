/**
 * Local Backend Integration Test Helpers
 *
 * Domain-specific utilities for integration tests running against a real Convex backend.
 * Generic polling utilities are imported from @libar-dev/platform-core/testing.
 */

import type { ConvexTestingHelper } from "convex-helpers/testing";
import {
  waitUntil,
  sleep,
  testQuery,
  DEFAULT_TIMEOUT_MS,
  DEFAULT_POLL_INTERVAL_MS,
} from "@libar-dev/platform-core/testing";
import { api } from "../../convex/_generated/api";

// Re-export generic utilities for backward compatibility
export {
  waitUntil,
  sleep,
  DEFAULT_TIMEOUT_MS,
  DEFAULT_POLL_INTERVAL_MS,
} from "@libar-dev/platform-core/testing";

/**
 * Wait for projections to process.
 *
 * Since projections are processed asynchronously via workpool,
 * we may need to wait for them to complete after a command.
 */
export async function waitForProjections(
  t: ConvexTestingHelper,
  orderId: string,
  options: {
    timeoutMs?: number;
    pollIntervalMs?: number;
  } = {}
): Promise<void> {
  const { timeoutMs = DEFAULT_TIMEOUT_MS, pollIntervalMs = DEFAULT_POLL_INTERVAL_MS } = options;

  await waitUntil(
    async () => {
      const result = await testQuery(t, api.testing.getTestOrder, { orderId });
      return result?.summary ? result : null;
    },
    {
      timeoutMs,
      pollIntervalMs,
      message: `Projection for order ${orderId} to complete`,
    }
  );
}

/**
 * Wait for a scheduled function to execute.
 *
 * Useful when testing asynchronous processing chains.
 */
export async function waitForScheduledFunctions(
  _t: ConvexTestingHelper,
  options: {
    timeoutMs?: number;
    pollIntervalMs?: number;
  } = {}
): Promise<void> {
  const { timeoutMs = 5000, pollIntervalMs = 500 } = options;

  // Simple wait - scheduled functions execute quickly in test env
  const startTime = Date.now();
  while (Date.now() - startTime < timeoutMs) {
    await sleep(pollIntervalMs);
    // In a real implementation, we'd check if scheduled functions are pending
    // For now, just wait a reasonable amount
    if (Date.now() - startTime >= 1000) {
      return;
    }
  }
}

/**
 * Check if the test environment is properly configured.
 */
export async function verifyTestEnvironment(t: ConvexTestingHelper): Promise<boolean> {
  try {
    const result = await testQuery(t, api.testingFunctions.checkTestEnvironment, {});
    return result?.isTestEnvironment === true;
  } catch (error) {
    console.error("Failed to verify test environment:", error);
    return false;
  }
}

/**
 * Wait for a saga to reach a terminal state (completed or failed).
 *
 * @param t - ConvexTestingHelper instance
 * @param sagaType - The saga type (e.g., "OrderFulfillment")
 * @param sagaId - The saga ID (usually the orderId for OrderFulfillment)
 * @param options - Timeout options
 */
export async function waitForSagaCompletion(
  t: ConvexTestingHelper,
  sagaType: string,
  sagaId: string,
  options: {
    timeoutMs?: number;
    pollIntervalMs?: number;
  } = {}
): Promise<{ status: string; error?: string }> {
  const { timeoutMs = DEFAULT_TIMEOUT_MS, pollIntervalMs = DEFAULT_POLL_INTERVAL_MS } = options;

  return await waitUntil(
    async () => {
      const saga = await testQuery(t, api.sagas.getSaga, { sagaType, sagaId });
      if (saga?.status === "completed" || saga?.status === "failed") {
        return { status: saga.status, error: saga.error };
      }
      return null;
    },
    {
      timeoutMs,
      pollIntervalMs,
      message: `Saga ${sagaType}/${sagaId} to complete`,
    }
  );
}

/**
 * Wait for order projection to reach an expected status.
 *
 * @param t - ConvexTestingHelper instance
 * @param orderId - The order ID to check
 * @param expectedStatus - The expected order status
 * @param options - Timeout options
 */
export async function waitForOrderStatus(
  t: ConvexTestingHelper,
  orderId: string,
  expectedStatus: string,
  options: {
    timeoutMs?: number;
    pollIntervalMs?: number;
  } = {}
): Promise<void> {
  await waitUntil(
    async () => {
      const order = await testQuery(t, api.orders.getOrderSummary, { orderId });
      return order?.status === expectedStatus ? order : null;
    },
    { message: `Order ${orderId} to reach status "${expectedStatus}"`, ...options }
  );
}

/**
 * Wait for inventory projection to update after a command.
 *
 * @param t - ConvexTestingHelper instance
 * @param productId - The product ID to check
 * @param options - Timeout options
 */
export async function waitForInventoryProjection(
  t: ConvexTestingHelper,
  productId: string,
  options: {
    timeoutMs?: number;
    pollIntervalMs?: number;
  } = {}
): Promise<void> {
  await waitUntil(
    async () => {
      const product = await testQuery(t, api.inventory.getProduct, { productId });
      return product;
    },
    { message: `Inventory projection for ${productId}`, ...options }
  );
}

/**
 * Wait for reservation projection to update after a command.
 *
 * @param t - ConvexTestingHelper instance
 * @param reservationId - The reservation ID to check
 * @param options - Timeout options
 */
export async function waitForReservationProjection(
  t: ConvexTestingHelper,
  reservationId: string,
  options: {
    timeoutMs?: number;
    pollIntervalMs?: number;
  } = {}
): Promise<void> {
  await waitUntil(
    async () => {
      const reservation = await testQuery(t, api.inventory.getReservation, { reservationId });
      return reservation;
    },
    { message: `Reservation projection for ${reservationId}`, ...options }
  );
}

/**
 * Wait for reservation by order ID to reach an expected status.
 *
 * This is useful when testing async workflows where the saga completes
 * but downstream projections may still be processing.
 *
 * @param t - ConvexTestingHelper instance
 * @param orderId - The order ID to look up reservation for
 * @param expectedStatus - The expected reservation status
 * @param options - Timeout options
 */
export async function waitForReservationStatus(
  t: ConvexTestingHelper,
  orderId: string,
  expectedStatus: string,
  options: {
    timeoutMs?: number;
    pollIntervalMs?: number;
  } = {}
): Promise<void> {
  await waitUntil(
    async () => {
      const reservation = await testQuery(t, api.inventory.getReservationByOrderId, { orderId });
      return reservation?.status === expectedStatus ? reservation : null;
    },
    { message: `Reservation for order ${orderId} to reach status "${expectedStatus}"`, ...options }
  );
}
