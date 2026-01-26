/**
 * @libar-docs
 * @libar-docs-implements DurableEventsIntegration
 * @libar-docs-command
 *
 * Durable Command Orchestrator - Intent/Completion Bracketing Wrapper
 *
 * Wraps the standard CommandOrchestrator with durability features:
 * - Intent recording before execution (with scheduled timeout)
 * - Completion recording after success/failure
 * - Orphan detection for stuck commands
 *
 * The existing CommandOrchestrator remains unchanged - this is an opt-in
 * enhancement for commands that need durability guarantees.
 *
 * ### Usage
 *
 * ```typescript
 * // In a mutation handler:
 * const durableExecutor = createDurableExecutor(submitOrderConfig);
 *
 * export const submitOrderDurable = mutation({
 *   args: { ... },
 *   handler: (ctx, args) => durableExecutor(ctx, args),
 * });
 * ```
 *
 * @since Phase 18.5 (DurableEventsIntegration)
 */

import { makeFunctionReference } from "convex/server";
import type { FunctionReference, FunctionVisibility, GenericMutationCtx } from "convex/server";
import type {
  CommandConfig,
  CommandMutationResult,
  CommandHandlerResult,
  UnknownRecord,
} from "@libar-dev/platform-core";
import { commandOrchestrator } from "../infrastructure";
import type { DataModel } from "../_generated/dataModel";

/**
 * App-specific mutation context type.
 */
type MutationCtx = GenericMutationCtx<DataModel>;

// ============================================================================
// TS2589 Prevention - Function References for Intent Dependencies
// ============================================================================

const insertIntentRef = makeFunctionReference<"mutation">(
  "admin/intents:insertIntent"
) as FunctionReference<"mutation", FunctionVisibility>;

const updateIntentStatusRef = makeFunctionReference<"mutation">(
  "admin/intents:updateIntentStatus"
) as FunctionReference<"mutation", FunctionVisibility>;

const handleTimeoutRef = makeFunctionReference<"mutation">(
  "admin/intents:handleTimeout"
) as FunctionReference<"mutation", FunctionVisibility>;

// ============================================================================
// Configuration Types
// ============================================================================

/**
 * Configuration for the durable command executor.
 */
export interface DurableExecutorConfig {
  /**
   * Timeout in milliseconds before an intent is considered orphaned.
   * @default 300000 (5 minutes)
   */
  timeoutMs?: number;

  /**
   * Enable intent bracketing (record intent before, completion after).
   * @default true
   */
  enableIntents?: boolean;

  /**
   * Extract the stream ID from command args.
   * Default extracts orderId, productId, reservationId, or uses "unknown".
   */
  getStreamId?: (args: Record<string, unknown>) => string;
}

// ============================================================================
// Helper: Extract Stream ID from Args
// ============================================================================

/**
 * Default stream ID extractor.
 * Looks for common ID fields in the args.
 */
function defaultGetStreamId(args: Record<string, unknown>): string {
  if (typeof args["orderId"] === "string") return args["orderId"];
  if (typeof args["productId"] === "string") return args["productId"];
  if (typeof args["reservationId"] === "string") return args["reservationId"];
  if (typeof args["streamId"] === "string") return args["streamId"];
  return "unknown";
}

// ============================================================================
// Helper: Build Intent Key
// ============================================================================

/**
 * Build a unique intent key for this command execution.
 * Format: operationType:streamType:streamId:timestamp_random
 *
 * The random component prevents collisions when the same command
 * is executed multiple times within the same millisecond.
 */
function buildIntentKey(operationType: string, streamType: string, streamId: string): string {
  const random = Math.random().toString(36).substring(2, 8);
  return `${operationType}:${streamType}:${streamId}:${Date.now()}_${random}`;
}

// ============================================================================
// Durable Executor Factory
// ============================================================================

/**
 * Create a durable command executor that wraps CommandOrchestrator.
 *
 * The executor:
 * 1. Records an intent before execution (schedules timeout)
 * 2. Executes via the standard CommandOrchestrator
 * 3. Records completion (success/failure) after execution
 *
 * If the command crashes or hangs, the scheduled timeout will detect
 * the orphaned intent and mark it as abandoned.
 *
 * @param config - The command configuration (same as used with CommandOrchestrator)
 * @param durableConfig - Durability settings (timeout, enable/disable)
 * @returns An async function that executes the command with durability
 *
 * @example
 * ```typescript
 * // Create a durable executor for submit order
 * const durableSubmitOrder = createDurableExecutor(submitOrderConfig);
 *
 * // Use in a mutation handler
 * export const submitOrderDurable = mutation({
 *   args: { orderId: v.string(), commandId: v.optional(v.string()) },
 *   handler: (ctx, args) => durableSubmitOrder(ctx, args),
 * });
 * ```
 */
export function createDurableExecutor<
  TConfigArgs extends UnknownRecord,
  THandlerArgs extends UnknownRecord,
  TResult extends CommandHandlerResult<TData>,
  TProjectionArgs extends UnknownRecord,
  TData,
>(
  config: CommandConfig<TConfigArgs, THandlerArgs, TResult, TProjectionArgs, TData>,
  durableConfig: DurableExecutorConfig = {}
): (
  ctx: MutationCtx,
  args: TConfigArgs & { commandId?: string }
) => Promise<CommandMutationResult<TData>> {
  const {
    timeoutMs = 5 * 60 * 1000, // 5 minutes default
    enableIntents = true,
    getStreamId = defaultGetStreamId,
  } = durableConfig;

  return async (
    ctx: MutationCtx,
    args: TConfigArgs & { commandId?: string }
  ): Promise<CommandMutationResult<TData>> => {
    // If intents are disabled, just execute normally
    // Type cast is safe: we're passing through to orchestrator which handles the commandId extraction
    if (!enableIntents) {
      return commandOrchestrator.execute(
        ctx,
        config as unknown as CommandConfig<
          Omit<TConfigArgs & { commandId?: string }, "commandId">,
          THandlerArgs,
          TResult,
          TProjectionArgs,
          TData
        >,
        args
      );
    }

    // Extract stream ID for the intent
    const streamId = getStreamId(args as Record<string, unknown>);
    const streamType = config.boundedContext; // Use BC as stream type

    // Build unique intent key
    const intentKey = buildIntentKey(config.commandType, streamType, streamId);

    // Extract correlationId if present (using bracket notation for index signature)
    const correlationId = (args as Record<string, unknown>)["correlationId"] as string | undefined;

    // Step 1: Record intent
    await ctx.runMutation(insertIntentRef, {
      intentKey,
      operationType: config.commandType,
      streamType,
      streamId,
      boundedContext: config.boundedContext,
      timeoutMs,
      metadata: { argsKeys: Object.keys(args) },
      correlationId,
    });

    // Schedule timeout check
    await ctx.scheduler.runAfter(timeoutMs, handleTimeoutRef, { intentKey });

    try {
      // Step 2: Execute via standard orchestrator
      // Type cast is safe: we're passing through to orchestrator which handles the commandId extraction
      const result = await commandOrchestrator.execute(
        ctx,
        config as unknown as CommandConfig<
          Omit<TConfigArgs & { commandId?: string }, "commandId">,
          THandlerArgs,
          TResult,
          TProjectionArgs,
          TData
        >,
        args
      );

      // Step 3: Record completion based on result status
      const completionStatus = result.status === "success" ? "completed" : "failed";
      const completionEventId = result.status === "success" ? result.eventId : undefined;
      const errorMessage =
        result.status === "rejected"
          ? result.reason
          : result.status === "failed"
            ? result.reason
            : undefined;

      await ctx.runMutation(updateIntentStatusRef, {
        intentKey,
        status: completionStatus,
        completionEventId,
        error: errorMessage,
      });

      return result;
    } catch (error) {
      // Step 3 (error path): Record failure
      await ctx.runMutation(updateIntentStatusRef, {
        intentKey,
        status: "failed",
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  };
}

// ============================================================================
// Convenience: Pre-configured Durable Executors
// ============================================================================

/**
 * Standard durable executor configuration.
 * 5-minute timeout, intents enabled.
 */
export const STANDARD_DURABLE_CONFIG: DurableExecutorConfig = {
  timeoutMs: 5 * 60 * 1000,
  enableIntents: true,
};

/**
 * Fast durable executor configuration.
 * 1-minute timeout for quick operations.
 */
export const FAST_DURABLE_CONFIG: DurableExecutorConfig = {
  timeoutMs: 60 * 1000,
  enableIntents: true,
};

/**
 * Long-running durable executor configuration.
 * 30-minute timeout for saga-like operations.
 */
export const LONG_RUNNING_DURABLE_CONFIG: DurableExecutorConfig = {
  timeoutMs: 30 * 60 * 1000,
  enableIntents: true,
};
