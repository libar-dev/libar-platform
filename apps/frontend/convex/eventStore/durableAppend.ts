/**
 * @libar-docs
 * @libar-docs-pattern DurableAppendAction
 * @libar-docs-status completed
 * @libar-docs-implements DurableEventsIntegration
 * @libar-docs-infra
 *
 * Durable Append - Workpool-backed event append with retry.
 *
 * Provides the action handler for durableAppendEvent() from platform-core.
 * Failed appends are recorded to eventAppendDeadLetters for manual recovery.
 *
 * ### Architecture
 *
 * ```
 * durableAppendEvent(ctx, config)
 *   -> Workpool.enqueueAction(appendEventAction, ...)
 *      -> appendEventAction calls idempotentAppendEvent
 *      -> On failure, Workpool retries with exponential backoff
 *      -> After exhausting retries, onAppendComplete records dead letter
 * ```
 *
 * ### Usage
 *
 * ```typescript
 * import { durableAppendEvent } from "@libar-dev/platform-core";
 * import { durableAppendPool } from "../infrastructure";
 * import { internal } from "../_generated/api";
 *
 * // In a saga step or scheduled job:
 * await durableAppendEvent(ctx, {
 *   workpool: durableAppendPool,
 *   actionRef: internal.eventStore.durableAppend.appendEventAction,
 *   append: {
 *     event: {
 *       idempotencyKey: `saga:${sagaId}:reserveStock`,
 *       streamType: "Inventory",
 *       streamId: productId,
 *       eventType: "StockReserved",
 *       eventData: { quantity, orderId },
 *       boundedContext: "inventory",
 *     },
 *     dependencies: {
 *       getByIdempotencyKey: components.eventStore.lib.getByIdempotencyKey,
 *       appendToStream: components.eventStore.lib.appendToStream,
 *     },
 *   },
 *   options: {
 *     onComplete: internal.eventStore.deadLetters.onAppendComplete,
 *     context: { sagaId, step: "reserveStock" },
 *   },
 * });
 * ```
 *
 * @since Phase 18.5 (DurableEventsIntegration)
 */

import { v } from "convex/values";
import { internalAction } from "../_generated/server";
import { idempotentAppendEvent } from "@libar-dev/platform-core";

// ============================================================================
// Durable Append Action Handler
// ============================================================================

/**
 * Validator for the event data structure.
 *
 * Matches IdempotentAppendEventData from platform-core.
 */
const vEventData = v.object({
  idempotencyKey: v.string(),
  streamType: v.string(),
  streamId: v.string(),
  eventType: v.string(),
  eventData: v.any(),
  boundedContext: v.string(),
  correlationId: v.optional(v.string()),
  causationId: v.optional(v.string()),
  expectedVersion: v.optional(v.number()),
});

/**
 * Validator for the dependencies structure.
 *
 * Function references are passed as `v.any()` since Convex validators
 * cannot express the FunctionReference type directly.
 */
const vDependencies = v.object({
  getByIdempotencyKey: v.any(),
  appendToStream: v.any(),
});

/**
 * Action handler invoked by Workpool for durable event appends.
 *
 * This action:
 * 1. Receives event data and dependencies from Workpool queue
 * 2. Calls idempotentAppendEvent to persist the event
 * 3. Returns result for onComplete callback (success/duplicate status)
 *
 * The Workpool handles retry with exponential backoff on failure.
 * The idempotency key prevents duplicate events even across retries.
 *
 * **Why an action?** Workpool only retries actions, not mutations.
 * By wrapping the idempotent append in an action, we get Workpool
 * retry semantics while the idempotency key prevents duplicates.
 */
export const appendEventAction = internalAction({
  args: {
    event: vEventData,
    dependencies: vDependencies,
  },
  returns: v.object({
    status: v.union(v.literal("appended"), v.literal("duplicate")),
    eventId: v.string(),
    version: v.number(),
  }),
  handler: async (ctx, { event, dependencies }) => {
    const result = await idempotentAppendEvent(ctx, { event, dependencies });
    return {
      status: result.status,
      eventId: result.eventId,
      version: result.version,
    };
  },
});
