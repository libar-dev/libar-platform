/**
 * @libar-docs
 * @libar-docs-implements EventStoreDurability
 * @libar-docs-status completed
 * @libar-docs-event-sourcing
 *
 * @libar-docs-uses EventStoreFoundation, idempotentAppend
 * @libar-docs-used-by SagaEngine, LongRunningOperations, ReconciliationService
 * @libar-docs-usecase "When operations span multiple steps and need visibility"
 *
 * ## Intent/Completion Event Pattern
 *
 * Long-running operations bracket with intent and completion events
 * for visibility, timeout detection, and reconciliation support.
 *
 * ### Why Intent/Completion?
 *
 * Without bracketing, partially-completed operations are:
 * - Invisible to monitoring
 * - Undetectable by reconciliation
 * - Missing from audit trail
 *
 * Intent events enable timeout detection and manual intervention
 * for stuck operations.
 *
 * ### Pattern
 *
 * | Operation | Intent Event | Completion Events |
 * |-----------|--------------|-------------------|
 * | Order submission | OrderSubmissionStarted | OrderSubmitted, OrderSubmissionFailed, OrderSubmissionAbandoned |
 * | Payment processing | PaymentProcessingStarted | PaymentCompleted, PaymentFailed |
 * | Stock reservation | ReservationRequested | StockReserved, ReservationFailed |
 *
 * ### Timeout Handling
 *
 * The timeout handler is a scheduled mutation via `ctx.scheduler.runAfter`.
 * This is appropriate because timeout checks are lightweight (query + conditional write).
 * The handler MUST be idempotent as multiple schedulers might fire for the same intent.
 *
 * ### Usage
 *
 * ```typescript
 * // Record intent at operation start
 * const intentKey = await recordIntent(ctx, {
 *   operationType: "OrderSubmission",
 *   streamType: "Order",
 *   streamId: orderId,
 *   timeoutMs: 5 * 60 * 1000, // 5 minutes
 *   onTimeout: internal.orders.checkSubmissionTimeout,
 * });
 *
 * // ... perform operation ...
 *
 * // Record completion
 * await recordCompletion(ctx, {
 *   intentKey,
 *   status: "success",
 *   result: { ... },
 * });
 * ```
 *
 * @libar-docs-uses EventStoreFoundation
 */

import type {
  IntentEvent,
  CompletionEvent,
  CompletionStatus,
  IntentCompletionConfig,
  IdempotentAppendDependencies,
} from "./types.js";
import type { SafeQueryRef, SafeMutationRef } from "../function-refs/types.js";
import { idempotentAppendEvent } from "./idempotentAppend.js";

/**
 * Dependencies for intent/completion operations.
 */
export interface IntentCompletionDependencies extends IdempotentAppendDependencies {
  /** Query to find events by intent key */
  getEventsByIntentKey?: SafeQueryRef;
}

/**
 * Arguments for recording an intent event.
 */
export interface RecordIntentArgs {
  /** Type of operation (e.g., "OrderSubmission", "PaymentProcessing") */
  operationType: string;
  /** Stream to record intent on */
  streamType: string;
  streamId: string;
  /** Bounded context name */
  boundedContext: string;
  /** Timeout configuration */
  timeoutMs: number;
  /** Mutation to call on timeout */
  onTimeout: SafeMutationRef;
  /** Event store dependencies */
  dependencies: IntentCompletionDependencies;
  /** Optional metadata */
  metadata?: Record<string, unknown>;
  /** Correlation ID for tracing */
  correlationId?: string;
}

/**
 * Result of recording an intent.
 */
export interface RecordIntentResult {
  /** Unique key to reference this intent */
  intentKey: string;
  /** Event ID of the intent event */
  intentEventId: string;
}

/**
 * Arguments for recording a completion event.
 */
export interface RecordCompletionArgs {
  /** Intent key from recordIntent */
  intentKey: string;
  /** Completion status */
  status: CompletionStatus;
  /** Stream to record completion on */
  streamType: string;
  streamId: string;
  /** Bounded context name */
  boundedContext: string;
  /** Event store dependencies */
  dependencies: IntentCompletionDependencies;
  /** Result data (for success) */
  result?: Record<string, unknown>;
  /** Error message (for failure) */
  error?: string;
  /** Correlation ID for tracing */
  correlationId?: string;
}

/**
 * Context type for intent/completion operations.
 */
interface IntentContext {
  runQuery: <T>(ref: SafeQueryRef, args: Record<string, unknown>) => Promise<T>;
  runMutation: <T>(ref: SafeMutationRef, args: Record<string, unknown>) => Promise<T>;
  scheduler: {
    runAfter: (
      delayMs: number,
      handler: SafeMutationRef,
      args: Record<string, unknown>
    ) => Promise<unknown>;
  };
}

/**
 * Record an intent event at the start of a long-running operation.
 *
 * Automatically schedules a timeout check that will trigger if no
 * completion event is recorded within the specified timeout.
 *
 * @param ctx - Mutation context with scheduler
 * @param args - Intent arguments
 * @returns Intent key for referencing in completion
 *
 * @example
 * ```typescript
 * const { intentKey } = await recordIntent(ctx, {
 *   operationType: "OrderSubmission",
 *   streamType: "Order",
 *   streamId: orderId,
 *   boundedContext: "orders",
 *   timeoutMs: 5 * 60 * 1000,
 *   onTimeout: internal.orders.checkSubmissionTimeout,
 *   dependencies: {
 *     getByIdempotencyKey: components.eventStore.lib.getByIdempotencyKey,
 *     appendToStream: components.eventStore.lib.appendToStream,
 *   },
 *   correlationId,
 * });
 * ```
 */
export async function recordIntent(
  ctx: IntentContext,
  args: RecordIntentArgs
): Promise<RecordIntentResult> {
  const now = Date.now();
  const intentKey = buildIntentKey(args.operationType, args.streamType, args.streamId, now);

  // Append intent event using idempotent append
  const result = await idempotentAppendEvent(ctx, {
    event: {
      idempotencyKey: `intent:${intentKey}`,
      streamType: args.streamType,
      streamId: args.streamId,
      eventType: `${args.operationType}Started`,
      eventData: {
        intentKey,
        operationType: args.operationType,
        startedAt: now,
        timeoutMs: args.timeoutMs,
        metadata: args.metadata,
      },
      boundedContext: args.boundedContext,
      ...(args.correlationId !== undefined && { correlationId: args.correlationId }),
    },
    dependencies: args.dependencies,
  });

  // Schedule timeout check
  await ctx.scheduler.runAfter(args.timeoutMs, args.onTimeout, { intentKey });

  return {
    intentKey,
    intentEventId: result.eventId,
  };
}

/**
 * Record a completion event at the end of a long-running operation.
 *
 * The completion event references the intent event via intentKey,
 * enabling correlation and marking the operation as complete.
 *
 * @param ctx - Mutation context
 * @param args - Completion arguments
 *
 * @example
 * ```typescript
 * await recordCompletion(ctx, {
 *   intentKey,
 *   status: "success",
 *   streamType: "Order",
 *   streamId: orderId,
 *   boundedContext: "orders",
 *   dependencies: {
 *     getByIdempotencyKey: components.eventStore.lib.getByIdempotencyKey,
 *     appendToStream: components.eventStore.lib.appendToStream,
 *   },
 *   result: { orderId, orderNumber },
 * });
 * ```
 */
export async function recordCompletion(
  ctx: IntentContext,
  args: RecordCompletionArgs
): Promise<void> {
  const now = Date.now();

  // Derive event type from status
  const eventTypeSuffix =
    args.status === "success" ? "Completed" : args.status === "failure" ? "Failed" : "Abandoned";

  // Extract operation type from intent key
  const operationType = args.intentKey.split(":")[0];

  // Append completion event
  await idempotentAppendEvent(ctx, {
    event: {
      idempotencyKey: `completion:${args.intentKey}:${args.status}`,
      streamType: args.streamType,
      streamId: args.streamId,
      eventType: `${operationType}${eventTypeSuffix}`,
      eventData: {
        intentKey: args.intentKey,
        status: args.status,
        completedAt: now,
        result: args.result,
        error: args.error,
      },
      boundedContext: args.boundedContext,
      ...(args.correlationId !== undefined && { correlationId: args.correlationId }),
    },
    dependencies: args.dependencies,
  });
}

/**
 * Arguments for checking intent timeout.
 */
export interface CheckIntentTimeoutArgs {
  /** Intent key to check */
  intentKey: string;
  /** Stream where events are stored */
  streamType: string;
  streamId: string;
  /** Bounded context name */
  boundedContext: string;
  /** Event store dependencies */
  dependencies: IntentCompletionDependencies;
  /** Correlation ID for tracing */
  correlationId?: string;
}

/**
 * Check for orphaned intents (intent without completion after timeout).
 *
 * This is typically called from a scheduled timeout handler.
 * The function is idempotent - if a completion already exists,
 * it returns without action.
 *
 * @param ctx - Mutation context
 * @param args - Timeout check arguments
 * @returns Status of the check
 *
 * @example
 * ```typescript
 * // In the timeout handler mutation
 * export const checkSubmissionTimeout = internalMutation({
 *   args: { intentKey: v.string() },
 *   handler: async (ctx, { intentKey }) => {
 *     const result = await checkIntentTimeout(ctx, {
 *       intentKey,
 *       streamType: "Order",
 *       streamId: extractStreamIdFromIntentKey(intentKey),
 *       boundedContext: "orders",
 *       dependencies: {
 *         getByIdempotencyKey: components.eventStore.lib.getByIdempotencyKey,
 *         appendToStream: components.eventStore.lib.appendToStream,
 *       },
 *     });
 *
 *     if (result.status === "abandoned") {
 *       // Alert or take action
 *     }
 *   },
 * });
 * ```
 */
export async function checkIntentTimeout(
  ctx: IntentContext,
  args: CheckIntentTimeoutArgs
): Promise<{
  status: "completed" | "abandoned" | "already_resolved";
  completionEventId?: string;
}> {
  // Check if a completion event already exists for this intent
  // Try all possible completion statuses
  const completionStatuses: CompletionStatus[] = ["success", "failure", "abandoned"];

  for (const status of completionStatuses) {
    const completionKey = `completion:${args.intentKey}:${status}`;
    const existing = await ctx.runQuery<{ eventId: string } | null>(
      args.dependencies.getByIdempotencyKey,
      {
        idempotencyKey: completionKey,
      }
    );

    if (existing) {
      // Completion already exists
      return {
        status: "already_resolved",
        completionEventId: existing.eventId,
      };
    }
  }

  // No completion exists - record abandonment
  const completionArgs: RecordCompletionArgs = {
    intentKey: args.intentKey,
    status: "abandoned",
    streamType: args.streamType,
    streamId: args.streamId,
    boundedContext: args.boundedContext,
    dependencies: args.dependencies,
    error: "Operation timed out without completion",
  };
  if (args.correlationId !== undefined) {
    completionArgs.correlationId = args.correlationId;
  }
  await recordCompletion(ctx, completionArgs);

  return { status: "abandoned" };
}

/**
 * Arguments for querying orphaned intents.
 */
export interface QueryOrphanedIntentsArgs {
  /** Filter by operation type (optional) */
  operationType?: string;
  /** Only return intents older than this many milliseconds */
  olderThanMs: number;
  /** Maximum number of results to return */
  limit?: number;
  /** Query function reference that returns intent events */
  queryIntentEvents: SafeQueryRef;
  /** Query function reference that checks for completion by intent key */
  hasCompletion: SafeQueryRef;
}

/**
 * Query for orphaned intents within a time window.
 *
 * Useful for reconciliation dashboards and manual intervention.
 *
 * **Note:** This function requires app-level query implementations:
 * - `queryIntentEvents` - Returns intent events (events with eventType ending in "Started")
 * - `hasCompletion` - Checks if a completion event exists for a given intent key
 *
 * @param ctx - Query context
 * @param args - Query arguments
 * @returns List of orphaned intents with time since intent
 *
 * @example
 * ```typescript
 * const orphans = await queryOrphanedIntents(ctx, {
 *   operationType: "OrderSubmission",
 *   olderThanMs: 5 * 60 * 1000, // 5 minutes
 *   limit: 100,
 *   queryIntentEvents: internal.eventStore.queries.getIntentEvents,
 *   hasCompletion: internal.eventStore.queries.hasCompletionForIntent,
 * });
 *
 * for (const orphan of orphans) {
 *   console.log(`Orphan: ${orphan.intentKey}, age: ${orphan.timeSinceIntent}ms`);
 * }
 * ```
 */
/**
 * Shape of an intent event from the event store.
 */
interface IntentEventFromStore {
  _creationTime?: number;
  payload?: {
    intentKey?: string;
    operationType?: string;
    startedAt?: number;
    timeoutMs?: number;
    metadata?: Record<string, unknown>;
  };
  eventData?: {
    intentKey?: string;
    operationType?: string;
    startedAt?: number;
    timeoutMs?: number;
    metadata?: Record<string, unknown>;
  };
}

/**
 * Context for querying orphaned intents.
 */
interface QueryOrphanedIntentsContext {
  runQuery: <T>(ref: SafeQueryRef, args: Record<string, unknown>) => Promise<T>;
}

export async function queryOrphanedIntents(
  ctx: QueryOrphanedIntentsContext,
  args: QueryOrphanedIntentsArgs
): Promise<Array<IntentEvent & { timeSinceIntent: number }>> {
  const now = Date.now();
  const cutoffTime = now - args.olderThanMs;

  // Query for intent events
  const intentEvents = await ctx.runQuery<IntentEventFromStore[]>(args.queryIntentEvents, {
    operationType: args.operationType,
    beforeTimestamp: cutoffTime,
    limit: (args.limit ?? 100) * 2, // Fetch more to account for filtering
  });

  // Filter to find orphaned intents (no completion)
  const orphans: Array<IntentEvent & { timeSinceIntent: number }> = [];

  for (const event of intentEvents) {
    if (orphans.length >= (args.limit ?? 100)) {
      break;
    }

    // Check if completion exists
    const hasCompletion = await ctx.runQuery<boolean>(args.hasCompletion, {
      intentKey: event.payload?.intentKey ?? event.eventData?.intentKey,
    });

    if (!hasCompletion) {
      const startedAt =
        event.payload?.startedAt ?? event.eventData?.startedAt ?? event._creationTime ?? 0;
      const metadata = event.payload?.metadata ?? event.eventData?.metadata;
      const orphan: IntentEvent & { timeSinceIntent: number } = {
        intentKey: event.payload?.intentKey ?? event.eventData?.intentKey ?? "",
        operationType: event.payload?.operationType ?? event.eventData?.operationType ?? "",
        startedAt,
        timeoutMs: event.payload?.timeoutMs ?? event.eventData?.timeoutMs ?? 0,
        timeSinceIntent: now - startedAt,
      };

      if (metadata !== undefined) {
        orphan.metadata = metadata;
      }

      orphans.push(orphan);
    }
  }

  return orphans;
}

/**
 * Build the intent key from operation details.
 *
 * @param operationType - Type of operation
 * @param streamType - Stream type
 * @param streamId - Stream ID
 * @param timestamp - Start timestamp
 * @returns Formatted intent key
 */
export function buildIntentKey(
  operationType: string,
  streamType: string,
  streamId: string,
  timestamp: number
): string {
  return `${operationType}:${streamType}:${streamId}:${timestamp}`;
}
