"use client";

import { useState, useCallback } from "react";
import { useMutation } from "convex/react";
import type { FunctionReference, FunctionArgs, FunctionReturnType } from "convex/server";

/**
 * State of the mutation execution.
 */
export type MutationState = "idle" | "pending" | "success" | "error";

/**
 * CommandOrchestrator error result type.
 *
 * Used to discriminate between general domain objects and
 * CommandOrchestrator error responses. Includes both direct errors
 * and duplicate commands where the original execution failed.
 */
export type CommandOrchestratorErrorResult =
  | {
      status: "rejected" | "failed";
      reason?: string;
      code?: string;
    }
  | {
      status: "duplicate";
      commandStatus: "rejected" | "failed";
      reason?: string;
      code?: string;
    };

/**
 * Options for useMutationWithFeedback hook.
 */
export interface MutationWithFeedbackOptions {
  /**
   * Custom predicate to identify CommandOrchestrator error results.
   *
   * If not provided, defaults to checking for status: "rejected" | "failed".
   * Use this to customize error detection for specific mutation types.
   *
   * @param result - The mutation result to check
   * @returns True if result should be treated as an error
   */
  isOrchestratorError?: (result: unknown) => result is CommandOrchestratorErrorResult;
}

/**
 * Return type for useMutationWithFeedback hook.
 */
export interface MutationWithFeedback<Mutation extends FunctionReference<"mutation", "public">> {
  /** Execute the mutation with the given arguments */
  execute: (args: FunctionArgs<Mutation>) => Promise<FunctionReturnType<Mutation> | undefined>;
  /** Current state of the mutation */
  state: MutationState;
  /** Error message if the mutation failed */
  error: string | null;
  /** Reset the state back to idle */
  reset: () => void;
}

/**
 * Default predicate to identify CommandOrchestrator error results.
 *
 * Checks for objects with status: "rejected" | "failed", or
 * "duplicate" where the original execution failed.
 */
function isDefaultOrchestratorError(result: unknown): result is CommandOrchestratorErrorResult {
  if (!result || typeof result !== "object" || !("status" in result)) {
    return false;
  }

  const status = (result as { status: string }).status;

  // Direct rejection or failure
  if (status === "rejected" || status === "failed") {
    return true;
  }

  // Duplicate where the original execution failed
  if (status === "duplicate") {
    const commandStatus = (result as { commandStatus?: string }).commandStatus;
    return commandStatus === "rejected" || commandStatus === "failed";
  }

  return false;
}

/**
 * Check if a CommandOrchestrator result represents success.
 *
 * This is useful for control flow decisions after awaiting a mutation,
 * where you need to check if the operation succeeded before proceeding.
 *
 * Handles:
 * - `status: "success"` → true
 * - `status: "duplicate"` with successful original execution → true
 * - `status: "rejected" | "failed"` → false
 * - `status: "duplicate"` with failed original execution → false
 *
 * @example
 * ```tsx
 * const result = await execute({ orderId });
 * if (isOrchestratorResultSuccess(result)) {
 *   navigate({ to: "/orders" });
 * }
 * // Error state is handled by useMutationWithFeedback
 * ```
 */
export function isOrchestratorResultSuccess(result: unknown): boolean {
  if (!result || typeof result !== "object" || !("status" in result)) {
    return false;
  }

  const status = (result as { status: string }).status;

  if (status === "success") {
    return true;
  }

  // Duplicate is success if the original execution succeeded
  if (status === "duplicate") {
    const commandStatus = (result as { commandStatus?: string }).commandStatus;
    // If commandStatus is not "rejected" or "failed", treat as success
    // This handles "executed" and undefined (legacy responses)
    return commandStatus !== "rejected" && commandStatus !== "failed";
  }

  return false;
}

/**
 * Wrapper hook for Convex mutations with loading/error state tracking.
 *
 * Provides a clean interface for handling mutation lifecycle:
 * - idle: Initial state, ready to execute
 * - pending: Mutation is in progress
 * - success: Mutation completed successfully
 * - error: Mutation failed with an error
 *
 * ## CommandOrchestrator Integration
 *
 * This hook automatically handles CommandOrchestrator results which return
 * `{ status: "rejected" | "failed", reason?: string }` instead of throwing.
 * These are treated as errors and the reason is extracted for display.
 *
 * To customize error detection (e.g., if you have domain objects that use
 * similar status fields for valid business outcomes), provide a custom
 * `isOrchestratorError` predicate in the options.
 *
 * @param mutation - A Convex mutation function reference
 * @param options - Optional configuration for error detection
 * @returns Object with execute function, state, error, and reset
 *
 * @example
 * ```tsx
 * import { api } from "@convex/_generated/api";
 *
 * function CreateOrderButton() {
 *   const { execute, state, error, reset } = useMutationWithFeedback(
 *     api.orders.createOrder
 *   );
 *
 *   const handleClick = async () => {
 *     const result = await execute({
 *       orderId: crypto.randomUUID(),
 *       customerId: "customer_123",
 *     });
 *
 *     if (result) {
 *       console.log("Order created:", result);
 *     }
 *   };
 *
 *   return (
 *     <div>
 *       <button onClick={handleClick} disabled={state === "pending"}>
 *         {state === "pending" ? "Creating..." : "Create Order"}
 *       </button>
 *       {state === "error" && (
 *         <p className="error">
 *           {error}
 *           <button onClick={reset}>Dismiss</button>
 *         </p>
 *       )}
 *       {state === "success" && <p className="success">Order created!</p>}
 *     </div>
 *   );
 * }
 * ```
 */
export function useMutationWithFeedback<Mutation extends FunctionReference<"mutation", "public">>(
  mutation: Mutation,
  options?: MutationWithFeedbackOptions
): MutationWithFeedback<Mutation> {
  const [state, setState] = useState<MutationState>("idle");
  const [error, setError] = useState<string | null>(null);

  const mutate = useMutation(mutation);
  const isOrchestratorError = options?.isOrchestratorError ?? isDefaultOrchestratorError;

  const execute = useCallback(
    async (args: FunctionArgs<Mutation>): Promise<FunctionReturnType<Mutation> | undefined> => {
      setState("pending");
      setError(null);

      try {
        const result = await mutate(args);

        // Handle CommandOrchestrator results which don't throw on rejection/failure
        // They return { status: "rejected" | "failed", reason: string } instead
        // Also handles "duplicate" where the original execution failed
        if (isOrchestratorError(result)) {
          setState("error");
          // Cast to the error result type for proper narrowing
          const errorResult = result as CommandOrchestratorErrorResult;
          // Determine the effective status (for duplicates, use commandStatus)
          const effectiveStatus =
            errorResult.status === "duplicate" ? errorResult.commandStatus : errorResult.status;
          if (effectiveStatus === "rejected") {
            setError(errorResult.reason || `Validation error: ${errorResult.code || "Unknown"}`);
          } else {
            setError(errorResult.reason || "Operation failed");
          }
          return result as FunctionReturnType<Mutation>;
        }

        setState("success");
        return result as FunctionReturnType<Mutation>;
      } catch (err) {
        setState("error");
        const errorMessage = err instanceof Error ? err.message : "An unexpected error occurred";
        setError(errorMessage);
        return undefined;
      }
    },
    [mutate, isOrchestratorError]
  );

  const reset = useCallback(() => {
    setState("idle");
    setError(null);
  }, []);

  return {
    execute,
    state,
    error,
    reset,
  };
}
