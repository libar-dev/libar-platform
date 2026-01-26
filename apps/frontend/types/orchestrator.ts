/**
 * Frontend-specific CommandOrchestrator result types.
 *
 * These are simplified versions of the backend CommandMutationResult,
 * optimized for frontend consumption where we don't need all fields.
 *
 * The backend (platform-core/orchestration/types.ts) has richer types
 * including version, globalPosition, and context fields that are
 * typically not needed in UI code.
 */

/**
 * Success result from CommandOrchestrator.
 * The command was executed successfully.
 *
 * @template TData - Optional typed data returned on success
 */
export interface CommandOrchestratorSuccess<TData = void> {
  status: "success";
  eventId?: string;
  data?: TData;
}

/**
 * Duplicate command detection result.
 * The command was already processed (idempotency).
 *
 * The `commandStatus` indicates the outcome of the original execution:
 * - "pending": Original still processing
 * - "executed": Original completed successfully
 * - "rejected": Original was rejected (validation error)
 * - "failed": Original failed (business rule failure)
 */
export interface CommandOrchestratorDuplicate {
  status: "duplicate";
  commandStatus?: "pending" | "executed" | "rejected" | "failed";
}

/**
 * Command rejected due to validation error.
 * No event is emitted for rejections.
 */
export interface CommandOrchestratorRejected {
  status: "rejected";
  code?: string;
  reason?: string;
}

/**
 * Command failed due to business logic failure.
 * Unlike rejected, failed commands DO emit an event (for audit).
 */
export interface CommandOrchestratorFailed {
  status: "failed";
  reason?: string;
  eventId?: string;
}

/**
 * Union type for all CommandOrchestrator results.
 *
 * @template TData - Optional typed data for success results
 *
 * @example
 * ```typescript
 * const mutation = makeFunctionReference<"mutation">("orders:createOrder") as
 *   FunctionReference<"mutation", "public", CreateOrderArgs, CommandOrchestratorResult>;
 *
 * const result = await mutation(args);
 * if (result.status === "success") {
 *   // Handle success
 * }
 * ```
 */
export type CommandOrchestratorResult<TData = void> =
  | CommandOrchestratorSuccess<TData>
  | CommandOrchestratorDuplicate
  | CommandOrchestratorRejected
  | CommandOrchestratorFailed;

/**
 * Safely extract an error reason from a CommandOrchestrator result.
 *
 * Use this when you've already determined the result is not a success
 * but need to extract the error message for display.
 *
 * @example
 * ```typescript
 * if (!isOrchestratorResultSuccess(result)) {
 *   throw new Error(getOrchestratorErrorReason(result) || "Operation failed");
 * }
 * ```
 */
export function getOrchestratorErrorReason(result: CommandOrchestratorResult): string | undefined {
  if (result.status === "rejected" || result.status === "failed") {
    return result.reason;
  }
  // Duplicate status doesn't have a reason
  return undefined;
}
