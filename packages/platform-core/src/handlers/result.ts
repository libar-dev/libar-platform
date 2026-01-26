/**
 * Result helper functions for dual-write command handlers.
 *
 * These functions create typed results for the dual-write pattern,
 * reducing boilerplate in command handlers.
 *
 * @example
 * ```typescript
 * import { successResult, rejectedResult } from "@libar-dev/platform-core/handlers";
 *
 * // In a command handler:
 * if (!order) {
 *   return rejectedResult("ORDER_NOT_FOUND", "Order not found", { orderId });
 * }
 *
 * return successResult(
 *   { orderId, customerId },
 *   cms.version + 1,
 *   event
 * );
 * ```
 */
import type {
  EventData,
  CommandHandlerSuccess,
  CommandHandlerRejected,
  CommandHandlerFailed,
} from "../orchestration/types.js";
import type { UnknownRecord } from "../types.js";

/**
 * Type that represents any plain object with string keys.
 *
 * Used instead of `UnknownRecord` for function parameters where we want
 * to accept typed data objects (like `ReserveStockData`) without requiring
 * explicit casts. Any object with string keys is compatible with `Record<string, unknown>`
 * at runtime, but TypeScript's structural typing can't always verify this statically,
 * especially with spread operations creating intersection types.
 */
type PlainObject = object;

/**
 * Create a success result for a command handler.
 *
 * Use this when a command executes successfully and produces an event.
 *
 * The constraint uses `PlainObject` (alias for `object`) instead of `UnknownRecord`
 * to accept typed data objects without requiring explicit casts. This is necessary
 * because TypeScript can't always verify that spread operations like
 * `{ ...result.data, extraField }` extend `Record<string, unknown>`, even though
 * they do at runtime.
 *
 * @param data - The data to return to the caller (typed)
 * @param version - The new aggregate version after this command
 * @param event - The event data to persist
 */
export function successResult<TData extends PlainObject>(
  data: TData,
  version: number,
  event: EventData
): CommandHandlerSuccess<TData> {
  return { status: "success", data, version, event };
}

/**
 * Create a rejected result for a command handler.
 *
 * Use this when a command is rejected due to business rule violations
 * (invariant failures). Rejected commands do NOT produce events.
 *
 * @param code - Error code for programmatic handling
 * @param reason - Human-readable error message
 * @param context - Optional context for debugging
 */
export function rejectedResult(
  code: string,
  reason: string,
  context?: UnknownRecord
): CommandHandlerRejected {
  return {
    status: "rejected",
    code,
    reason,
    ...(context !== undefined && { context }),
  };
}

/**
 * Create a failed result for a command handler.
 *
 * Use this for business failures that SHOULD produce an event.
 * For example, ReserveStock failing due to insufficient stock
 * should emit a ReservationFailed event.
 *
 * Unlike rejected (validation error, no event), failed is a
 * business outcome that gets recorded in the event store.
 *
 * @param reason - Human-readable failure message
 * @param event - The failure event to persist
 * @param expectedVersion - Optional stream version (defaults to 0 for new streams)
 * @param context - Optional context for debugging
 */
export function failedResult(
  reason: string,
  event: EventData,
  expectedVersion?: number,
  context?: UnknownRecord
): CommandHandlerFailed {
  return {
    status: "failed",
    reason,
    event,
    ...(expectedVersion !== undefined && { expectedVersion }),
    ...(context !== undefined && { context }),
  };
}
