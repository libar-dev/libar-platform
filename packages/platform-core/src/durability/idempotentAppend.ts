/**
 * @libar-docs
 * @libar-docs-implements EventStoreDurability
 * @libar-docs-status completed
 * @libar-docs-event-sourcing
 *
 * @libar-docs-uses EventStoreFoundation
 * @libar-docs-used-by outbox, durableAppend, publication, SagaEngine
 * @libar-docs-usecase "When appending events that may be retried or deduplicated"
 *
 * ## Idempotent Event Append
 *
 * Ensures each logical event is stored exactly once in the event store,
 * regardless of how many times the append operation is retried.
 *
 * ### Idempotency Key Strategy
 *
 * | Event Source | Pattern | Example |
 * |--------------|---------|---------|
 * | Command result | `{commandType}:{entityId}:{commandId}` | `SubmitOrder:ord-123:cmd-456` |
 * | Action result | `{actionType}:{entityId}` | `payment:ord-123` |
 * | Saga step | `{sagaType}:{sagaId}:{step}` | `OrderFulfillment:saga-789:reserveStock` |
 * | Scheduled job | `{jobType}:{scheduleId}:{timestamp}` | `expireReservations:job-001:1704067200` |
 *
 * ### Usage
 *
 * ```typescript
 * const result = await idempotentAppendEvent(ctx, {
 *   idempotencyKey: `payment:${orderId}`,
 *   streamType: "Order",
 *   streamId: orderId,
 *   eventType: "PaymentCompleted",
 *   eventData: { chargeId, amount },
 * });
 *
 * if (result.status === "duplicate") {
 *   // Event already exists, no action needed
 * }
 * ```
 *
 * @libar-docs-uses EventStoreFoundation
 */

import type { IdempotentAppendConfig, IdempotentAppendResult } from "./types.js";
import type { SafeQueryRef, SafeMutationRef } from "../function-refs/types.js";
import { v7 as uuidv7 } from "uuid";

/**
 * Context type for idempotent append operations.
 */
export interface IdempotentAppendContext {
  runQuery: <T>(ref: SafeQueryRef, args: Record<string, unknown>) => Promise<T>;
  runMutation: <T>(ref: SafeMutationRef, args: Record<string, unknown>) => Promise<T>;
}

/**
 * Shape of an existing event returned from idempotency check.
 */
interface ExistingEvent {
  eventId: string;
  version: number;
}

/**
 * Shape of the append result from the event store.
 */
interface AppendResult {
  status: "success" | "conflict";
  newVersion?: number;
  currentVersion?: number;
}

/**
 * Append an event to the event store with idempotency guarantee.
 *
 * If an event with the same idempotency key already exists, returns
 * `{ status: "duplicate" }` without creating a new event.
 *
 * This function requires event store function references to be passed in
 * via config.dependencies. These come from the mounted event store component.
 *
 * @param ctx - Mutation context with runQuery/runMutation capabilities
 * @param config - Append configuration with event data and dependencies
 * @returns Result indicating whether event was appended or duplicate
 *
 * @example
 * ```typescript
 * const result = await idempotentAppendEvent(ctx, {
 *   event: {
 *     idempotencyKey: `payment:${orderId}`,
 *     streamType: "Order",
 *     streamId: orderId,
 *     eventType: "PaymentCompleted",
 *     eventData: { chargeId, amount },
 *     boundedContext: "orders",
 *     correlationId,
 *   },
 *   dependencies: {
 *     getByIdempotencyKey: components.eventStore.lib.getByIdempotencyKey,
 *     appendToStream: components.eventStore.lib.appendToStream,
 *   },
 * });
 * ```
 */
export async function idempotentAppendEvent(
  ctx: IdempotentAppendContext,
  config: IdempotentAppendConfig
): Promise<IdempotentAppendResult> {
  const { event, dependencies } = config;
  const { getByIdempotencyKey, appendToStream } = dependencies;

  // Step 1: Check if event already exists by idempotency key
  const existing = await ctx.runQuery<ExistingEvent | null>(getByIdempotencyKey, {
    idempotencyKey: event.idempotencyKey,
  });

  if (existing) {
    // Duplicate detected - return existing event info
    return {
      status: "duplicate",
      eventId: existing.eventId,
      version: existing.version,
    };
  }

  // Step 2: Generate event ID and append
  const eventId = `evt_${uuidv7()}`;

  const appendResult = await ctx.runMutation<AppendResult>(appendToStream, {
    streamType: event.streamType,
    streamId: event.streamId,
    expectedVersion: event.expectedVersion ?? 0,
    boundedContext: event.boundedContext,
    events: [
      {
        eventId,
        eventType: event.eventType,
        payload: event.eventData,
        idempotencyKey: event.idempotencyKey,
        metadata: {
          correlationId: event.correlationId ?? `corr_${uuidv7()}`,
          ...(event.causationId && { causationId: event.causationId }),
        },
      },
    ],
  });

  // Handle OCC conflict by re-checking for duplicate
  // (Another process may have appended with same idempotency key)
  if (appendResult.status === "conflict") {
    // Re-check for existing event - might have been appended by concurrent process
    const recheck = await ctx.runQuery<ExistingEvent | null>(getByIdempotencyKey, {
      idempotencyKey: event.idempotencyKey,
    });

    if (recheck) {
      return {
        status: "duplicate",
        eventId: recheck.eventId,
        version: recheck.version,
      };
    }

    // True OCC conflict - let caller handle retry with updated expected version
    throw new Error(
      `OCC conflict on stream ${event.streamType}:${event.streamId}. ` +
        `Expected version ${event.expectedVersion ?? 0}, ` +
        `current version ${appendResult.currentVersion}. ` +
        `Retry with expectedVersion: ${appendResult.currentVersion}.`
    );
  }

  return {
    status: "appended",
    eventId,
    version: appendResult.newVersion ?? 1,
  };
}

/**
 * Build an idempotency key for command results.
 *
 * @param commandType - Type of command
 * @param entityId - Entity ID
 * @param commandId - Unique command ID
 * @returns Formatted idempotency key
 */
export function buildCommandIdempotencyKey(
  commandType: string,
  entityId: string,
  commandId: string
): string {
  return `${commandType}:${entityId}:${commandId}`;
}

/**
 * Build an idempotency key for action results.
 *
 * @param actionType - Type of action (e.g., "payment", "shipment")
 * @param entityId - Entity ID
 * @returns Formatted idempotency key
 */
export function buildActionIdempotencyKey(actionType: string, entityId: string): string {
  return `${actionType}:${entityId}`;
}

/**
 * Build an idempotency key for saga step results.
 *
 * @param sagaType - Type of saga
 * @param sagaId - Unique saga instance ID
 * @param step - Step name within saga
 * @returns Formatted idempotency key
 */
export function buildSagaStepIdempotencyKey(
  sagaType: string,
  sagaId: string,
  step: string
): string {
  return `${sagaType}:${sagaId}:${step}`;
}

/**
 * Build an idempotency key for scheduled job results.
 *
 * @param jobType - Type of scheduled job
 * @param scheduleId - Schedule identifier
 * @param runTimestamp - Unix timestamp of this run
 * @returns Formatted idempotency key
 */
export function buildScheduledJobIdempotencyKey(
  jobType: string,
  scheduleId: string,
  runTimestamp: number
): string {
  return `${jobType}:${scheduleId}:${runTimestamp}`;
}
