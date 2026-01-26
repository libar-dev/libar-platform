/**
 * @libar-docs
 * @libar-docs-pattern MockPaymentActions
 * @libar-docs-status completed
 * @libar-docs-implements DurableEventsIntegration
 * @libar-docs-saga
 *
 * Mock Payment Actions - Simulated external payment service.
 *
 * Provides a mock Stripe charge action for integration testing.
 * In production, this would be replaced with actual Stripe SDK calls.
 *
 * @since Phase 18.5 (DurableEventsIntegration)
 */

import { v } from "convex/values";
import { internalAction } from "../../_generated/server";

// ============================================================================
// Mock Stripe Action
// ============================================================================

/**
 * Mock Stripe charge action.
 *
 * Simulates a Stripe payment API call with configurable failure.
 * Used with ActionRetrier for retry semantics.
 *
 * Usage:
 * ```typescript
 * await actionRetrier.run(ctx, internal.sagas.payments.actions.chargeStripeMock, {
 *   customerId: "cus_123",
 *   amount: 9999,
 *   orderId: "ord_456",
 * }, {
 *   onComplete: internal.sagas.payments.outbox.onPaymentComplete,
 *   context: { orderId, customerId, amount, commandId },
 * });
 * ```
 */
export const chargeStripeMock = internalAction({
  args: {
    customerId: v.string(),
    amount: v.number(),
    orderId: v.string(),
    /** Set to true to simulate payment failure */
    shouldFail: v.optional(v.boolean()),
    /** Custom error message for failure simulation */
    failureReason: v.optional(v.string()),
  },
  returns: v.object({
    chargeId: v.string(),
    receiptUrl: v.string(),
  }),
  handler: async (_ctx, args) => {
    // Note: In production, this would be an actual Stripe API call with network latency.
    // For testing, we skip the artificial delay to keep tests fast.

    // Simulate failure if requested
    if (args.shouldFail) {
      throw new Error(args.failureReason ?? "insufficient_funds");
    }

    // Generate mock charge result
    const chargeId = `ch_${args.orderId}_${Date.now().toString(36)}`;
    const receiptUrl = `https://pay.stripe.com/receipts/${chargeId}`;

    return {
      chargeId,
      receiptUrl,
    };
  },
});

/**
 * Mock refund action.
 *
 * Simulates a Stripe refund API call.
 */
export const refundStripeMock = internalAction({
  args: {
    chargeId: v.string(),
    amount: v.optional(v.number()),
    reason: v.optional(v.string()),
  },
  returns: v.object({
    refundId: v.string(),
    status: v.string(),
  }),
  handler: async (_ctx, args) => {
    // Note: In production, this would be an actual Stripe API call with network latency.
    // For testing, we skip the artificial delay to keep tests fast.

    const refundId = `re_${args.chargeId}_${Date.now().toString(36)}`;

    return {
      refundId,
      status: "succeeded",
    };
  },
});
