/**
 * @libar-docs
 * @libar-docs-pattern PaymentOutboxHandler
 * @libar-docs-status completed
 * @libar-docs-implements DurableEventsIntegration
 * @libar-docs-saga
 *
 * Payment Outbox Handler - Captures payment action results as events.
 *
 * Uses the outbox pattern to ensure that payment results (success/failure)
 * are recorded as domain events, even if subsequent processing fails.
 *
 * ### Pattern
 *
 * ```
 * actionRetrier.run(chargeStripeMock, args, {
 *   onComplete: onPaymentComplete,
 *   context: { orderId, customerId, amount, commandId },
 * })
 * ```
 *
 * When the action completes:
 * - Success -> PaymentCompleted event appended
 * - Failure -> PaymentFailed event appended
 * - Canceled -> PaymentFailed event with "canceled" error
 *
 * @since Phase 18.5 (DurableEventsIntegration)
 */

import { v } from "convex/values";
import { makeFunctionReference } from "convex/server";
import { internalMutation } from "../../_generated/server";
import type { SafeQueryRef, SafeMutationRef } from "@libar-dev/platform-core";
import { idempotentAppendEvent, createScopedLogger } from "@libar-dev/platform-core";
import { PLATFORM_LOG_LEVEL } from "../../infrastructure";

/**
 * Logger for Payment Outbox operations.
 */
const logger = createScopedLogger("PaymentOutbox", PLATFORM_LOG_LEVEL);

// ============================================================================
// Event Store Component References (TS2589 Prevention)
// ============================================================================

const getByIdempotencyKeyRef = makeFunctionReference<"query">(
  "component:eventStore:lib:getByIdempotencyKey"
) as SafeQueryRef;

const appendToStreamRef = makeFunctionReference<"mutation">(
  "component:eventStore:lib:appendToStream"
) as SafeMutationRef;

// ============================================================================
// Types
// ============================================================================

/**
 * Context passed to onComplete handler.
 */
export interface PaymentContext {
  orderId: string;
  customerId: string;
  amount: number;
  commandId: string;
}

/**
 * Successful Stripe charge result.
 */
export interface StripeChargeResult {
  chargeId: string;
  receiptUrl: string;
}

// ============================================================================
// Payment Outbox Handler
// ============================================================================

/**
 * onComplete handler for payment action results.
 *
 * Appends PaymentCompleted or PaymentFailed event based on action result.
 * Uses idempotent append to prevent duplicate events on retry.
 */
export const onPaymentComplete = internalMutation({
  args: {
    result: v.union(
      v.object({
        kind: v.literal("success"),
        returnValue: v.object({
          chargeId: v.string(),
          receiptUrl: v.string(),
        }),
      }),
      v.object({
        kind: v.literal("failed"),
        error: v.string(),
      }),
      v.object({
        kind: v.literal("canceled"),
      })
    ),
    context: v.object({
      orderId: v.string(),
      customerId: v.string(),
      amount: v.number(),
      commandId: v.string(),
    }),
  },
  returns: v.object({
    status: v.union(v.literal("appended"), v.literal("duplicate")),
    eventId: v.string(),
  }),
  handler: async (ctx, { result, context }) => {
    // Build idempotency key from order and command
    const idempotencyKey = `payment:${context.orderId}:${context.commandId}`;

    // Determine event type and data based on result
    const isSuccess = result.kind === "success";
    const eventType = isSuccess ? "PaymentCompleted" : "PaymentFailed";

    const eventData = isSuccess
      ? {
          orderId: context.orderId,
          customerId: context.customerId,
          amount: context.amount,
          chargeId: result.returnValue.chargeId,
          receiptUrl: result.returnValue.receiptUrl,
        }
      : {
          orderId: context.orderId,
          customerId: context.customerId,
          amount: context.amount,
          error: result.kind === "failed" ? result.error : "canceled",
        };

    // Append event idempotently
    const appendResult = await idempotentAppendEvent(ctx, {
      event: {
        idempotencyKey,
        streamType: "Order",
        streamId: context.orderId,
        eventType,
        eventData,
        boundedContext: "orders",
      },
      dependencies: {
        getByIdempotencyKey: getByIdempotencyKeyRef,
        appendToStream: appendToStreamRef,
      },
    });

    // Log for observability
    if (appendResult.status === "appended") {
      logger.info(`${eventType} recorded for order ${context.orderId}`, {
        eventId: appendResult.eventId,
        chargeId: isSuccess ? result.returnValue.chargeId : undefined,
      });
    } else {
      logger.info(`Duplicate ${eventType} for order ${context.orderId}`, {
        eventId: appendResult.eventId,
      });
    }

    return {
      status: appendResult.status,
      eventId: appendResult.eventId,
    };
  },
});
