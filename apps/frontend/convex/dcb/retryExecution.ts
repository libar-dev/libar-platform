/**
 * DCB Retry Execution - Reference Implementation
 *
 * This file demonstrates the pattern for integrating withDCBRetry into
 * command handlers. It shows the self-referential retry pattern where
 * the retry mutation schedules itself for re-execution on OCC conflicts.
 *
 * @libar-docs
 * @libar-docs-pattern DurableFunctionAdapters
 * @libar-docs-status active
 * @libar-docs-infra
 *
 * ## Pattern Overview
 *
 * ```
 * Client → executeWithDCBRetry → executeWithDCB
 *                                      │
 *                    ┌─────────────────┴─────────────────┐
 *                    │                                   │
 *                success/rejected/failed            conflict
 *                    │                                   │
 *                    ▼                                   ▼
 *              return result              withDCBRetry.handleResult
 *                                                        │
 *                                    ┌───────────────────┴────────┐
 *                                    │                            │
 *                              attempt < max              attempt >= max
 *                                    │                            │
 *                                    ▼                            ▼
 *                           enqueue retry              return rejected
 *                           (to dcbRetryPool)         (MAX_RETRIES_EXCEEDED)
 *                                    │
 *                                    ▼
 *                          return deferred
 *                                    │
 *                        (Workpool executes later)
 *                                    │
 *                                    ▼
 *                          executeWithDCBRetry (same mutation, new attempt)
 * ```
 *
 * ## Key Concepts
 *
 * 1. **Self-Referential Pattern**: The mutation schedules itself for retry.
 *    This allows state to be passed through attempts (like expectedVersion).
 *
 * 2. **Partition Key Ordering**: All retries for the same scope use the same
 *    partition key (`dcb:{scopeKey}`), ensuring FIFO execution and preventing
 *    concurrent retry collisions.
 *
 * 3. **Version Tracking**: Each retry uses the `currentVersion` from the
 *    previous conflict as its `expectedVersion`, avoiding stale version checks.
 *
 * 4. **Attempt Counting**: The `attempt` argument is incremented with each
 *    retry, allowing maxAttempts enforcement.
 *
 * @module dcb/retryExecution
 * @since Phase 18a
 */

import { internalMutation } from "../_generated/server";
import { v } from "convex/values";
import { makeFunctionReference } from "convex/server";
import {
  createScopeKey,
  withDCBRetry,
  type SafeMutationRef,
  type DCBScopeKey,
  type DCBExecutionResult as PlatformDCBExecutionResult,
  type EventData,
} from "@libar-dev/platform-core";
import { dcbRetryPool } from "../infrastructure";

// =============================================================================
// Self-Referential Mutation Reference (TS2589 Prevention)
// =============================================================================

/**
 * Reference to this mutation for self-scheduling retries.
 *
 * Using makeFunctionReference at module level prevents TS2589 errors
 * that occur with deep type instantiation of `internal.dcb.retryExecution.*`.
 */
const executeWithDCBRetryRef = makeFunctionReference<"mutation">(
  "dcb/retryExecution:executeWithDCBRetry"
) as SafeMutationRef;

// =============================================================================
// Types
// =============================================================================

/**
 * Result from DCB execution with retry support.
 */
type DCBExecutionResult =
  | { status: "success"; data: Record<string, unknown>; version: number }
  | { status: "rejected"; code: string; reason: string }
  | { status: "failed"; error: string }
  | { status: "deferred"; workId: string; retryAttempt: number; scheduledAfterMs: number };

// =============================================================================
// Reference Implementation
// =============================================================================

/**
 * Execute a DCB operation with automatic OCC conflict retry.
 *
 * This is the main entry point for DCB operations that need retry support.
 * On success, rejected, or failed results, returns immediately.
 * On conflict, schedules a retry via Workpool and returns "deferred".
 *
 * ## Usage
 *
 * ```typescript
 * // From your command handler
 * const result = await ctx.runMutation(internal.dcb.retryExecution.executeWithDCBRetry, {
 *   tenantId: "tenant-123",
 *   scopeType: "reservation",
 *   scopeId: "res-456",
 *   expectedVersion: 0,
 *   attempt: 0,
 *   commandArgs: {
 *     operationId: "op-789",
 *     data: { productId: "prod-abc", quantity: 5 },
 *   },
 * });
 *
 * if (result.status === "deferred") {
 *   // Retry scheduled, will complete asynchronously
 *   return { status: "pending", workId: result.workId };
 * }
 *
 * return result;
 * ```
 *
 * @param args.tenantId - Tenant identifier for scope isolation
 * @param args.scopeType - Type of scope (e.g., "reservation", "order")
 * @param args.scopeId - Unique identifier within scope type
 * @param args.expectedVersion - Expected scope version (0 for new scopes)
 * @param args.attempt - Current retry attempt (0 for first execution)
 * @param args.commandArgs - Command-specific arguments
 */
export const executeWithDCBRetry = internalMutation({
  args: {
    tenantId: v.string(),
    scopeType: v.string(),
    scopeId: v.string(),
    expectedVersion: v.number(),
    attempt: v.number(),
    correlationId: v.string(),
    commandArgs: v.object({
      operationId: v.string(),
      // Using v.record for type-safe validation of command data.
      // The nested v.record allows arbitrary nested objects (v.object({}) only accepts empty objects).
      data: v.record(
        v.string(),
        v.union(
          v.string(),
          v.number(),
          v.boolean(),
          v.null(),
          v.array(v.any()),
          v.record(v.string(), v.any())
        )
      ),
    }),
  },
  returns: v.union(
    v.object({
      status: v.literal("success"),
      data: v.record(v.string(), v.any()),
      version: v.number(),
    }),
    v.object({
      status: v.literal("rejected"),
      code: v.string(),
      reason: v.string(),
    }),
    v.object({
      status: v.literal("failed"),
      error: v.string(),
    }),
    v.object({
      status: v.literal("deferred"),
      workId: v.string(),
      retryAttempt: v.number(),
      scheduledAfterMs: v.number(),
    })
  ),
  handler: async (ctx, args): Promise<DCBExecutionResult> => {
    const { tenantId, scopeType, scopeId, expectedVersion, attempt, correlationId, commandArgs } =
      args;

    // Build scope key for DCB operation
    const scopeKey: DCBScopeKey = createScopeKey(tenantId, scopeType, scopeId);

    // ==========================================================================
    // Execute DCB Operation
    // ==========================================================================
    // In a real implementation, you would:
    // 1. Load entities using the scopeKey
    // 2. Call your decider with the command
    // 3. Apply state updates and append events
    //
    // For this reference, we simulate the DCB execution.
    // Replace this with your actual executeWithDCB call:
    //
    // const result = await executeWithDCB(ctx, {
    //   scopeKey,
    //   expectedVersion,
    //   boundedContext: "orders",
    //   streamType: "Order",
    //   schemaVersion: 1,
    //   entities: { ... },
    //   decider: yourDecider,
    //   command: commandArgs,
    //   applyUpdate: async (ctx, _id, cms, update, version, now) => { ... },
    //   commandId: commandArgs.operationId,
    //   correlationId: `${scopeId}:${Date.now()}`,
    // });

    // Simulated result for reference (replace with actual DCB execution)
    const result = await simulateDCBExecution(scopeKey, expectedVersion);

    // ==========================================================================
    // Handle Result with Retry Logic
    // ==========================================================================

    // Create retry handler
    const retryHandler = withDCBRetry(ctx, {
      workpool: dcbRetryPool,
      retryMutation: executeWithDCBRetryRef,
      scopeKey,
      options: {
        maxAttempts: 5,
        // Faster than Workpool default (250ms) for DCB retries since OCC conflicts
        // are expected to resolve quickly when using proper scope partitioning.
        initialBackoffMs: 100,
        backoffBase: 2,
        maxBackoffMs: 30000,
      },
    });

    // Handle the result - this will:
    // - Return success/rejected/failed results unchanged
    // - Schedule retry and return "deferred" for conflicts
    const handledResult = await retryHandler.handleResult(result, {
      attempt,
      retryArgs: {
        tenantId,
        scopeType,
        scopeId,
        correlationId,
        commandArgs,
      },
    });

    // Map to our return type
    if (handledResult.status === "success") {
      return {
        status: "success",
        data: handledResult.data as Record<string, unknown>,
        version: handledResult.scopeVersion,
      };
    }

    if (handledResult.status === "rejected") {
      return {
        status: "rejected",
        code: handledResult.code,
        reason: handledResult.reason,
      };
    }

    if (handledResult.status === "failed") {
      return {
        status: "failed",
        error: handledResult.reason,
      };
    }

    // Deferred (retry scheduled)
    return {
      status: "deferred",
      workId: handledResult.workId,
      retryAttempt: handledResult.retryAttempt,
      scheduledAfterMs: handledResult.scheduledAfterMs,
    };
  },
});

// =============================================================================
// Simulation Helper (Replace with Real DCB Execution)
// =============================================================================

/**
 * Simulate DCB execution for reference purposes.
 *
 * In production, replace this with actual executeWithDCB call.
 * This simulation randomly returns success or conflict to demonstrate
 * the retry behavior.
 */
async function simulateDCBExecution(
  scopeKey: DCBScopeKey,
  expectedVersion: number
): Promise<PlatformDCBExecutionResult<Record<string, unknown>>> {
  // Simulate a 30% chance of conflict for demonstration
  const shouldConflict = Math.random() < 0.3;

  if (shouldConflict) {
    return {
      status: "conflict",
      currentVersion: expectedVersion + 1,
    };
  }

  return {
    status: "success",
    data: { processed: true, scopeKey },
    scopeVersion: expectedVersion + 1,
    events: [] as EventData[],
  };
}

// =============================================================================
// Exports
// =============================================================================

/**
 * Re-export the mutation reference for use in other modules.
 *
 * This allows other code to schedule DCB operations with retry:
 *
 * ```typescript
 * import { executeWithDCBRetryRef } from "../dcb/retryExecution";
 *
 * await ctx.runMutation(executeWithDCBRetryRef, { ... });
 * ```
 */
export { executeWithDCBRetryRef };
