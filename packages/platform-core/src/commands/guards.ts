/**
 * Type guards for command handler results.
 *
 * These guards provide runtime type narrowing for discriminated unions,
 * making it easier to handle different result statuses in command handlers.
 */

import type {
  CommandHandlerResult,
  CommandHandlerSuccess,
  CommandHandlerRejected,
  CommandHandlerFailed,
} from "../orchestration/types.js";

/**
 * Type guard to check if a result is a success result.
 *
 * @param result - The command handler result to check
 * @returns True if the result is a CommandHandlerSuccess
 *
 * @example
 * ```typescript
 * const result = await executeCommand(ctx, args);
 * if (isSuccessResult(result)) {
 *   // result is narrowed to CommandHandlerSuccess<TData>
 *   console.log(result.data, result.event.eventId);
 * }
 * ```
 */
export function isSuccessResult<T>(
  result: CommandHandlerResult<T>
): result is CommandHandlerSuccess<T> {
  return result.status === "success";
}

/**
 * Type guard to check if a result is a rejected result.
 *
 * Rejected results indicate business rule violations or validation failures
 * that do NOT produce events.
 *
 * @param result - The command handler result to check
 * @returns True if the result is a CommandHandlerRejected
 *
 * @example
 * ```typescript
 * const result = await executeCommand(ctx, args);
 * if (isRejectedResult(result)) {
 *   // result is narrowed to CommandHandlerRejected
 *   console.log(result.code, result.reason);
 * }
 * ```
 */
export function isRejectedResult(
  result: CommandHandlerResult<unknown>
): result is CommandHandlerRejected {
  return result.status === "rejected";
}

/**
 * Type guard to check if a result is a failed result.
 *
 * Failed results indicate business failures that SHOULD produce an event
 * (e.g., ReserveStock failing due to insufficient stock emits a ReservationFailed event).
 *
 * @param result - The command handler result to check
 * @returns True if the result is a CommandHandlerFailed
 *
 * @example
 * ```typescript
 * const result = await executeCommand(ctx, args);
 * if (isFailedResult(result)) {
 *   // result is narrowed to CommandHandlerFailed
 *   console.log(result.reason, result.event.eventType);
 * }
 * ```
 */
export function isFailedResult(
  result: CommandHandlerResult<unknown>
): result is CommandHandlerFailed {
  return result.status === "failed";
}
