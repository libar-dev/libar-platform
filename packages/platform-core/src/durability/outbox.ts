/**
 * @libar-docs
 * @libar-docs-implements EventStoreDurability
 * @libar-docs-status completed
 * @libar-docs-event-sourcing
 *
 * @libar-docs-uses idempotentAppend, ActionRetrier, Workpool
 * @libar-docs-used-by CommandOrchestrator, SagaEngine, PaymentHandler
 * @libar-docs-usecase "When capturing external API results as domain events"
 *
 * ## Outbox Pattern for Action Results
 *
 * Captures external API results (success or failure) as domain events using
 * the `onComplete` callback guarantee from Workpool/Action Retrier.
 *
 * ### Why Outbox Pattern?
 *
 * Actions are at-most-once by default. If an action succeeds but the subsequent
 * event append fails, the side effect is orphaned. The outbox pattern uses
 * `onComplete` callbacks which are guaranteed to be called after the action finishes.
 *
 * ### onComplete Guarantee
 *
 * The `onComplete` mutation is scheduled atomically when the action completes.
 * It will be called regardless of action success/failure/cancel. If the
 * `onComplete` mutation itself fails:
 * - Convex OCC auto-retry handles transient conflicts
 * - If OCC exhausted, the failure is logged for manual recovery
 * - The `context` parameter preserves all data needed for recovery
 *
 * ### Usage
 *
 * ```typescript
 * // Create the onComplete handler
 * export const onPaymentComplete = createOutboxHandler({
 *   getIdempotencyKey: (ctx) => `payment:${ctx.orderId}`,
 *   buildEvent: (result, ctx) => ({
 *     streamType: "Order",
 *     streamId: ctx.orderId,
 *     eventType: result.kind === "success" ? "PaymentCompleted" : "PaymentFailed",
 *     eventData: result.kind === "success"
 *       ? { chargeId: result.returnValue.chargeId }
 *       : { error: result.error },
 *   }),
 * });
 *
 * // Use with Action Retrier
 * await retrier.run(ctx, internal.payments.chargeStripe, args, {
 *   onComplete: internal.payments.onPaymentComplete,
 *   context: { orderId, customerId, amount },
 * });
 * ```
 *
 * @libar-docs-uses EventStoreFoundation, DurableFunctionAdapters
 */

import type {
  ActionResult,
  OutboxHandlerConfig,
  IdempotentAppendDependencies,
  BaseHandlerContext,
} from "./types.js";
import { idempotentAppendEvent } from "./idempotentAppend.js";

/**
 * Context type for outbox handler operations.
 *
 * Currently identical to BaseHandlerContext, but defined separately
 * to allow future extension with outbox-specific context needs
 * (e.g., logging, metrics) without breaking changes.
 */
export type OutboxHandlerContext = BaseHandlerContext;

/**
 * Extended outbox handler configuration with event store dependencies.
 */
export interface OutboxHandlerFullConfig<TContext, TResult> extends OutboxHandlerConfig<
  TContext,
  TResult
> {
  /** Event store function references for idempotent append */
  dependencies: IdempotentAppendDependencies;
  /** Bounded context name for the events */
  boundedContext: string;
}

/**
 * Create an onComplete mutation handler for the outbox pattern.
 *
 * The returned handler can be used as the `onComplete` callback for
 * Workpool or Action Retrier. It captures the action result as an
 * event using idempotent append.
 *
 * @param config - Handler configuration including event store dependencies
 * @returns Mutation handler function
 *
 * @example
 * ```typescript
 * export const onPaymentComplete = createOutboxHandler({
 *   getIdempotencyKey: (ctx) => `payment:${ctx.orderId}`,
 *   buildEvent: (result, ctx) => ({
 *     streamType: "Order",
 *     streamId: ctx.orderId,
 *     eventType: result.kind === "success" ? "PaymentCompleted" : "PaymentFailed",
 *     eventData: result.kind === "success"
 *       ? { chargeId: result.returnValue.chargeId }
 *       : { error: result.error },
 *   }),
 *   boundedContext: "orders",
 *   dependencies: {
 *     getByIdempotencyKey: components.eventStore.lib.getByIdempotencyKey,
 *     appendToStream: components.eventStore.lib.appendToStream,
 *   },
 * });
 * ```
 */
export function createOutboxHandler<TContext, TResult>(
  config: OutboxHandlerFullConfig<TContext, TResult>
): (
  ctx: OutboxHandlerContext,
  args: { result: ActionResult<TResult>; context: TContext }
) => Promise<void> {
  const { getIdempotencyKey, buildEvent, dependencies, boundedContext } = config;

  return async (ctx, args) => {
    const { result, context } = args;

    // Build idempotency key from context
    const idempotencyKey = getIdempotencyKey(context);

    // Build event from result and context
    const eventSpec = buildEvent(result, context);

    // Use idempotent append to capture the event
    // This is safe to retry - duplicate appends return existing event
    await idempotentAppendEvent(ctx, {
      event: {
        idempotencyKey,
        streamType: eventSpec.streamType,
        streamId: eventSpec.streamId,
        eventType: eventSpec.eventType,
        eventData: eventSpec.eventData,
        boundedContext,
      },
      dependencies,
    });
  };
}
