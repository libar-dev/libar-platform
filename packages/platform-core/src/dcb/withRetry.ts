/**
 * ## DCB Retry Helper - Automatic OCC Conflict Retry via Workpool
 *
 * @libar-docs
 * @libar-docs-pattern DurableFunctionAdapters
 * @libar-docs-status completed
 * @libar-docs-infra
 * @libar-docs-uses DCB, Workpool
 *
 * Wraps DCB operations to automatically retry on OCC (Optimistic Concurrency
 * Control) conflicts using Workpool for durable, delayed execution.
 *
 * ### Flow
 *
 * ```
 * Command → executeWithDCB → conflict? ──┬─► success/rejected/failed → return unchanged
 *                                        │
 *                                        └─► conflict → calculate backoff
 *                                                      → enqueue retry mutation
 *                                                      → return { status: "deferred" }
 * ```
 *
 * ### Why Workpool for Retry?
 *
 * - **Durability**: Retry survives server restarts
 * - **Partition ordering**: Same scope retries execute in order (FIFO)
 * - **Backoff**: Delayed execution via `runAfter` option
 * - **Monitoring**: Standard Workpool status/cancellation APIs
 *
 * @example
 * ```typescript
 * import { withDCBRetry } from "@libar-dev/platform-core/dcb";
 *
 * // In app layer mutation
 * export const reserveWithRetry = internalMutation({
 *   handler: async (ctx, args) => {
 *     const { attempt = 0, expectedVersion, ...commandArgs } = args;
 *
 *     const result = await executeWithDCB(ctx, {
 *       scopeKey: createScopeKey(args.tenantId, "reservation", args.reservationId),
 *       expectedVersion,
 *       // ... rest of config
 *     });
 *
 *     return withDCBRetry(ctx, {
 *       workpool: dcbRetryPool,
 *       retryMutation: internal.reservations.reserveWithRetry,
 *       scopeKey: createScopeKey(args.tenantId, "reservation", args.reservationId),
 *       maxAttempts: 5,
 *     }).handleResult(result, {
 *       attempt,
 *       retryArgs: {
 *         ...commandArgs,
 *         // expectedVersion will be set from conflict.currentVersion
 *       },
 *     });
 *   },
 * });
 * ```
 *
 * @module dcb/withRetry
 * @since Phase 18a
 */

import type { FunctionReference, FunctionVisibility } from "convex/server";
import type { MutationCtx, WorkpoolOnCompleteArgs } from "../orchestration/types.js";
import type { UnknownRecord } from "../types.js";
import type {
  DCBExecutionResult,
  DCBSuccessResult,
  DCBRejectedResult,
  DCBFailedResult,
  DCBConflictResult,
  DCBDeferredResult,
  DCBRetryResult,
  DCBScopeKey,
} from "./types.js";
import { calculateBackoff, BACKOFF_DEFAULTS, defaultJitter } from "./backoff.js";

// =============================================================================
// Types
// =============================================================================

/**
 * Structural type for Workpool component.
 *
 * Uses structural typing to avoid direct dependency on @convex-dev/workpool
 * in platform-core. The app layer provides the concrete Workpool instance.
 */
export interface WorkpoolLikeForDCB {
  enqueueMutation: <TArgs extends UnknownRecord>(
    ctx: MutationCtx,
    handler: FunctionReference<"mutation", FunctionVisibility, TArgs, unknown>,
    args: TArgs,
    options?: {
      key?: string;
      runAfter?: number;
      onComplete?: FunctionReference<
        "mutation",
        FunctionVisibility,
        WorkpoolOnCompleteArgs,
        unknown
      > | null;
      context?: unknown;
    }
  ) => Promise<unknown>;
}

/**
 * Configuration options for DCB retry behavior.
 */
export interface DCBRetryOptions {
  /**
   * Maximum number of retry attempts.
   *
   * After this many attempts, the operation returns rejected
   * with code "DCB_MAX_RETRIES_EXCEEDED".
   *
   * @default 5
   */
  maxAttempts?: number;

  /**
   * Initial backoff delay in milliseconds.
   *
   * @default 100
   */
  initialBackoffMs?: number;

  /**
   * Exponential base for backoff growth.
   *
   * Delay grows as `initialBackoffMs * base^attempt`.
   *
   * @default 2
   */
  backoffBase?: number;

  /**
   * Maximum backoff delay in milliseconds.
   *
   * @default 30000
   */
  maxBackoffMs?: number;

  /**
   * Optional jitter function for backoff randomization.
   *
   * Use `noJitter` for deterministic testing.
   *
   * @default defaultJitter (random 0.5-1.5 multiplier)
   */
  jitterFn?: (() => number) | undefined;

  /**
   * Optional onComplete callback for retry completion tracking.
   *
   * Called when the Workpool job completes (success or failure).
   */
  onComplete?: FunctionReference<
    "mutation",
    FunctionVisibility,
    WorkpoolOnCompleteArgs,
    unknown
  > | null;
}

/**
 * Configuration for withDCBRetry wrapper.
 *
 * @typeParam TRetryArgs - Arguments type for the retry mutation
 */
export interface WithDCBRetryConfig<TRetryArgs extends UnknownRecord> {
  /** Workpool instance for scheduling retries */
  workpool: WorkpoolLikeForDCB;

  /**
   * Reference to the retry mutation.
   *
   * This mutation will be called by Workpool with the retry args.
   * Typically references the same mutation that calls withDCBRetry.
   */
  retryMutation: FunctionReference<"mutation", FunctionVisibility, TRetryArgs, unknown>;

  /**
   * Scope key for partition ordering.
   *
   * The Workpool partition key is derived as `dcb:${scopeKey}`.
   */
  scopeKey: DCBScopeKey;

  /** Retry behavior options */
  options?: DCBRetryOptions;
}

/**
 * Context for handling a DCB result with potential retry.
 *
 * @typeParam TRetryArgs - Arguments type for the retry mutation
 */
export interface HandleResultContext<TRetryArgs extends UnknownRecord> {
  /**
   * Current retry attempt (0-indexed).
   *
   * - 0: First execution
   * - 1: First retry
   * - n: nth retry
   */
  attempt: number;

  /**
   * Arguments to pass to the retry mutation.
   *
   * The `expectedVersion` field will be overwritten with the
   * conflict's currentVersion. The `attempt` field will be set
   * to the incremented attempt number.
   */
  retryArgs: Omit<TRetryArgs, "expectedVersion" | "attempt">;
}

/**
 * DCB retry handler returned by withDCBRetry.
 */
export interface DCBRetryHandler<TRetryArgs extends UnknownRecord> {
  /**
   * Handle a DCB execution result, scheduling retry if conflict detected.
   *
   * @param result - Result from executeWithDCB
   * @param context - Retry context including attempt number and args
   * @returns DCBRetryResult (may be "deferred" if retry scheduled)
   */
  handleResult: <TData extends object>(
    result: DCBExecutionResult<TData>,
    context: HandleResultContext<TRetryArgs>
  ) => Promise<DCBRetryResult<TData>>;
}

// =============================================================================
// Constants
// =============================================================================

/**
 * Default retry configuration.
 */
export const DCB_RETRY_DEFAULTS = {
  maxAttempts: 5,
  initialBackoffMs: BACKOFF_DEFAULTS.initialMs,
  backoffBase: BACKOFF_DEFAULTS.base,
  maxBackoffMs: BACKOFF_DEFAULTS.maxMs,
} as const;

/**
 * Rejection code when max retries exceeded.
 */
export const DCB_MAX_RETRIES_EXCEEDED = "DCB_MAX_RETRIES_EXCEEDED";

/**
 * Prefix for DCB retry partition keys.
 */
export const DCB_RETRY_KEY_PREFIX = "dcb:";

// =============================================================================
// Implementation
// =============================================================================

/**
 * Create a DCB retry handler.
 *
 * This is the main entry point for DCB retry functionality. Call this
 * within your mutation to wrap DCB execution with automatic retry.
 *
 * @param ctx - Convex mutation context
 * @param config - Retry configuration including workpool and retry mutation
 * @returns DCB retry handler with handleResult method
 *
 * @example
 * ```typescript
 * // Basic usage
 * const handler = withDCBRetry(ctx, {
 *   workpool: dcbRetryPool,
 *   retryMutation: internal.reservations.reserveWithRetry,
 *   scopeKey: createScopeKey(tenantId, "reservation", reservationId),
 * });
 *
 * const result = await executeWithDCB(ctx, dcbConfig);
 *
 * return handler.handleResult(result, {
 *   attempt: args.attempt ?? 0,
 *   retryArgs: { ...args },
 * });
 * ```
 */
export function withDCBRetry<TRetryArgs extends UnknownRecord>(
  ctx: MutationCtx,
  config: WithDCBRetryConfig<TRetryArgs>
): DCBRetryHandler<TRetryArgs> {
  const { workpool, retryMutation, scopeKey, options = {} } = config;

  const {
    maxAttempts = DCB_RETRY_DEFAULTS.maxAttempts,
    initialBackoffMs = DCB_RETRY_DEFAULTS.initialBackoffMs,
    backoffBase = DCB_RETRY_DEFAULTS.backoffBase,
    maxBackoffMs = DCB_RETRY_DEFAULTS.maxBackoffMs,
    jitterFn = defaultJitter,
    onComplete,
  } = options;

  return {
    handleResult: async <TData extends object>(
      result: DCBExecutionResult<TData>,
      context: HandleResultContext<TRetryArgs>
    ): Promise<DCBRetryResult<TData>> => {
      const { attempt, retryArgs } = context;

      // Non-conflict results pass through unchanged
      if (result.status !== "conflict") {
        return result as DCBRetryResult<TData>;
      }

      // Handle conflict
      const conflict = result as DCBConflictResult;

      // Check max attempts (attempt is 0-indexed, so attempt >= maxAttempts means exhausted)
      // Note: maxAttempts includes the initial execution (attempt 0), so maxAttempts=5 means
      // attempts 0,1,2,3,4 are allowed before rejection
      if (attempt >= maxAttempts) {
        return {
          status: "rejected",
          code: DCB_MAX_RETRIES_EXCEEDED,
          reason: `DCB operation failed after ${maxAttempts} total attempts (including initial) due to OCC conflicts`,
          context: {
            scopeKey,
            lastAttempt: attempt,
            lastConflictVersion: conflict.currentVersion,
          },
        } satisfies DCBRejectedResult;
      }

      // Calculate backoff for this retry
      const backoffMs = calculateBackoff(attempt, {
        initialMs: initialBackoffMs,
        base: backoffBase,
        maxMs: maxBackoffMs,
        jitterFn,
      });

      // Build retry args with updated version and incremented attempt
      // Note: Type assertion via unknown is needed because TRetryArgs is generic
      // and TypeScript can't verify the shape matches at compile time
      const fullRetryArgs = {
        ...retryArgs,
        expectedVersion: conflict.currentVersion,
        attempt: attempt + 1,
      } as unknown as TRetryArgs;

      // Build partition key for scope serialization
      const partitionKey = `${DCB_RETRY_KEY_PREFIX}${scopeKey}`;

      // Enqueue retry mutation
      const workId = await workpool.enqueueMutation(ctx, retryMutation, fullRetryArgs, {
        key: partitionKey,
        runAfter: backoffMs,
        onComplete: onComplete ?? null,
        context: {
          scopeKey,
          attempt: attempt + 1,
          expectedVersion: conflict.currentVersion,
        },
      });

      // Return deferred result
      return {
        status: "deferred",
        workId: String(workId),
        retryAttempt: attempt + 1,
        scheduledAfterMs: backoffMs,
      } satisfies DCBDeferredResult;
    },
  };
}

// =============================================================================
// Type Guards
// =============================================================================

/**
 * Type guard to check if a result is a deferred result.
 */
export function isDCBDeferredResult<TData extends object>(
  result: DCBRetryResult<TData>
): result is DCBDeferredResult {
  return result.status === "deferred";
}

/**
 * Type guard to check if a result is a successful result.
 */
export function isDCBSuccessResult<TData extends object>(
  result: DCBRetryResult<TData>
): result is DCBSuccessResult<TData> {
  return result.status === "success";
}

/**
 * Type guard to check if a result is a rejected result.
 */
export function isDCBRejectedResult<TData extends object>(
  result: DCBRetryResult<TData>
): result is DCBRejectedResult {
  return result.status === "rejected";
}

/**
 * Type guard to check if a result is a failed result.
 */
export function isDCBFailedResult<TData extends object>(
  result: DCBRetryResult<TData>
): result is DCBFailedResult {
  return result.status === "failed";
}

/**
 * Check if a rejection is due to max retries exceeded.
 */
export function isMaxRetriesExceeded<TData extends object>(result: DCBRetryResult<TData>): boolean {
  return result.status === "rejected" && result.code === DCB_MAX_RETRIES_EXCEEDED;
}
