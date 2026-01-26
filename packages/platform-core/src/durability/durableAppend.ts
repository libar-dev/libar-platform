/**
 * @libar-docs
 * @libar-docs-implements EventStoreDurability
 * @libar-docs-status completed
 * @libar-docs-event-sourcing
 *
 * @libar-docs-uses idempotentAppend, Workpool, WorkpoolPartitioningStrategy
 * @libar-docs-used-by SagaEngine, ScheduledJobs, outbox
 * @libar-docs-usecase "When event append must survive failures in async contexts"
 *
 * ## Durable Append via Workpool Actions
 *
 * Failed event appends from async contexts are retried via Workpool actions
 * with exponential backoff until success or dead letter.
 *
 * ### Why Action Wrapper?
 *
 * Workpool only retries actions, not mutations. By wrapping the idempotent
 * append mutation in an action, we get Workpool retry semantics while the
 * underlying idempotent check prevents duplicates.
 *
 * ### When to Use
 *
 * | Scenario | Use durableAppendEvent? | Why |
 * |----------|-------------------------|-----|
 * | Synchronous command handler | No | Atomic dual-write handles this |
 * | Action onComplete | Recommended | Mutation can fail after action succeeded |
 * | Saga step | Yes | Step result must be captured |
 * | Scheduled job | Yes | Job completion must be recorded |
 *
 * ### Architecture
 *
 * ```
 * durableAppendEvent (action)
 *   → ctx.runMutation(idempotentAppend, args)
 *   → If action fails, Workpool retries the action
 *   → Idempotency key prevents duplicate events
 * ```
 *
 * ### Usage
 *
 * ```typescript
 * await durableAppendEvent(ctx, eventAppendPool, {
 *   idempotencyKey: `saga:${sagaId}:step3`,
 *   streamType: "Order",
 *   streamId: orderId,
 *   eventType: "ShipmentScheduled",
 *   eventData: { trackingNumber },
 * }, {
 *   retry: { maxAttempts: 5, initialBackoffMs: 100, base: 2 },
 *   onComplete: internal.saga.onAppendComplete,
 *   context: { sagaId, step: "step3" },
 * });
 * ```
 *
 * @libar-docs-uses EventStoreFoundation, DurableFunctionAdapters
 */

import type {
  IdempotentAppendConfig,
  IdempotentAppendResult,
  IdempotentAppendDependencies,
  IdempotentAppendEventData,
} from "./types.js";
import type { SafeActionRef, SafeMutationRef, SafeQueryRef } from "../function-refs/types.js";
import { idempotentAppendEvent } from "./idempotentAppend.js";

/**
 * Mutation context for workpool operations.
 */
export interface WorkpoolMutationContext {
  db: {
    insert: (table: string, doc: Record<string, unknown>) => Promise<unknown>;
    query: (table: string) => unknown;
    patch: (id: unknown, fields: Record<string, unknown>) => Promise<void>;
  };
}

/**
 * Structural typing for Workpool-like interface.
 *
 * Allows platform-core to work with any Workpool implementation
 * without directly depending on @convex-dev/workpool.
 */
export interface WorkpoolLike {
  enqueueAction: (
    ctx: WorkpoolMutationContext,
    actionRef: SafeActionRef,
    args: Record<string, unknown>,
    options?: {
      key?: string;
      onComplete?: SafeMutationRef;
      context?: Record<string, unknown>;
    }
  ) => Promise<unknown>;
}

/**
 * Arguments for the durable append action.
 *
 * This is the shape of args passed to the app-level action
 * that performs the actual idempotent append.
 */
export interface DurableAppendActionArgs {
  event: IdempotentAppendEventData;
  dependencies: IdempotentAppendDependencies;
}

/**
 * Retry configuration for durable append.
 */
export interface DurableAppendRetryConfig {
  maxAttempts: number;
  initialBackoffMs: number;
  base: number;
}

/**
 * Options for durable append operation.
 */
export interface DurableAppendOptions {
  /** Retry configuration */
  retry?: DurableAppendRetryConfig;
  /** Callback when append completes (success, failure, or dead letter) */
  onComplete?: SafeMutationRef;
  /** Context data passed to onComplete */
  context?: Record<string, unknown>;
}

/**
 * Result of enqueuing a durable append.
 */
export type DurableAppendEnqueueResult = {
  status: "enqueued";
  workId: string;
};

/**
 * Configuration for enqueueing a durable append.
 */
export interface DurableAppendEnqueueConfig {
  /** Workpool instance for retry management */
  workpool: WorkpoolLike;
  /** Reference to the app-level action that performs the append */
  actionRef: SafeActionRef;
  /** Append configuration with idempotency key and event data */
  append: IdempotentAppendConfig;
  /** Optional retry and callback configuration */
  options?: DurableAppendOptions;
}

/**
 * Enqueue a durable event append via Workpool.
 *
 * The append is wrapped in an action that calls the idempotent append
 * mutation. If the action fails, Workpool retries with exponential backoff.
 * The idempotency key prevents duplicate events even across retries.
 *
 * **Important:** The `actionRef` must be a reference to an action registered
 * in the app's convex/ directory that uses `createDurableAppendActionHandler`
 * to create its handler.
 *
 * @param ctx - Mutation context (for enqueueing to Workpool)
 * @param config - Full configuration including workpool, action ref, and append data
 * @returns Work ID for tracking
 *
 * @example
 * ```typescript
 * // In app's convex/ directory:
 * // eventStore/durableAppend.ts
 * export const appendEventAction = internalAction({
 *   args: { ... },
 *   handler: createDurableAppendActionHandler({
 *     getByIdempotencyKey: components.eventStore.lib.getByIdempotencyKey,
 *     appendToStream: components.eventStore.lib.appendToStream,
 *   }),
 * });
 *
 * // Usage in saga or scheduled job:
 * const { workId } = await durableAppendEvent(ctx, {
 *   workpool: eventAppendPool,
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
 */
export async function durableAppendEvent(
  ctx: WorkpoolMutationContext,
  config: DurableAppendEnqueueConfig
): Promise<DurableAppendEnqueueResult> {
  const { workpool, actionRef, append, options } = config;

  // Create partition key for per-entity ordering
  const partitionKey = createAppendPartitionKey(append.event.streamType, append.event.streamId);

  // Prepare action args - spread the event data and dependencies as separate fields
  const actionArgs: Record<string, unknown> = {
    event: append.event,
    dependencies: append.dependencies,
  };

  // Build workpool options - only include defined fields
  const workpoolOptions: {
    key?: string;
    onComplete?: SafeMutationRef;
    context?: Record<string, unknown>;
  } = {
    key: partitionKey.value,
    context: {
      idempotencyKey: append.event.idempotencyKey,
      streamType: append.event.streamType,
      streamId: append.event.streamId,
      correlationId: append.event.correlationId,
      ...(options?.context ?? {}),
    },
  };

  if (options?.onComplete) {
    workpoolOptions.onComplete = options.onComplete;
  }

  // Enqueue the action via Workpool
  const workId = await workpool.enqueueAction(ctx, actionRef, actionArgs, workpoolOptions);

  return {
    status: "enqueued",
    workId: String(workId),
  };
}

/**
 * Create the partition key for durable append operations.
 *
 * Uses `append:${streamId}` format to ensure per-entity ordering
 * while allowing parallel processing across different entities.
 *
 * @param streamType - Stream type
 * @param streamId - Stream ID
 * @returns Partition key object
 */
export function createAppendPartitionKey(
  streamType: string,
  streamId: string
): { name: string; value: string } {
  return {
    name: "append",
    value: `${streamType}:${streamId}`,
  };
}

/**
 * Create the action handler for durable append.
 *
 * This factory creates the handler function used in the app's convex/
 * directory for the durable append action. The action performs the
 * idempotent append using injected dependencies.
 *
 * **Why a factory?** The action needs access to event store function
 * references which are only available at the app level. The factory
 * pattern allows platform-core to provide the logic while the app
 * provides the dependencies.
 *
 * @returns Action handler function
 *
 * @example
 * ```typescript
 * // In app's convex/eventStore/durableAppend.ts
 * import { internalAction } from "./_generated/server";
 * import { v } from "convex/values";
 * import { createDurableAppendActionHandler } from "@libar-dev/platform-core/durability";
 * import { components } from "./_generated/api";
 *
 * export const appendEventAction = internalAction({
 *   args: {
 *     event: v.object({
 *       idempotencyKey: v.string(),
 *       streamType: v.string(),
 *       streamId: v.string(),
 *       eventType: v.string(),
 *       eventData: v.any(),
 *       boundedContext: v.string(),
 *       correlationId: v.optional(v.string()),
 *       causationId: v.optional(v.string()),
 *       expectedVersion: v.optional(v.number()),
 *     }),
 *     dependencies: v.object({
 *       getByIdempotencyKey: v.any(),
 *       appendToStream: v.any(),
 *     }),
 *   },
 *   handler: createDurableAppendActionHandler(),
 * });
 * ```
 */
/**
 * Context for the durable append action handler.
 */
interface DurableAppendActionContext {
  runQuery: <T>(ref: SafeQueryRef, args: Record<string, unknown>) => Promise<T>;
  runMutation: <T>(ref: SafeMutationRef, args: Record<string, unknown>) => Promise<T>;
}

export function createDurableAppendActionHandler(): (
  ctx: DurableAppendActionContext,
  args: DurableAppendActionArgs
) => Promise<IdempotentAppendResult> {
  return async (ctx, args) => {
    const result = await idempotentAppendEvent(ctx, {
      event: args.event,
      dependencies: args.dependencies,
    });

    return result;
  };
}
