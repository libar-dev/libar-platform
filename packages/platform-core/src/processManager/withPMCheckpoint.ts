/**
 * Process Manager checkpoint helper for idempotent event processing.
 *
 * Provides a wrapper function that handles the PM checkpoint pattern
 * automatically, including lifecycle state transitions and command tracking.
 *
 * Unlike projections (events → read models), Process Managers:
 * - Emit commands as output (fire-and-forget)
 * - Have lifecycle states (idle → processing → completed/failed)
 * - May track custom state for hybrid PMs
 * - Record dead letters on failures
 */

import type { ProcessManagerState } from "./types.js";
import { pmTransitionState } from "./lifecycle.js";
import type { Logger } from "../logging/types.js";
import { createPlatformNoOpLogger } from "../logging/scoped.js";

/**
 * Result of a PM checkpoint process operation.
 *
 * Skip reasons:
 * - `already_processed`: Event was already processed by this PM instance (idempotency)
 * - `terminal_state`: PM is in a terminal state (completed/failed)
 * - `not_subscribed`: PM does not subscribe to this event type
 */
export type PMCheckpointResult =
  | { status: "processed"; commandsEmitted: string[] }
  | { status: "skipped"; reason: "already_processed" | "terminal_state" | "not_subscribed" }
  | { status: "failed"; error: string };

/**
 * Emitted command from PM processing.
 */
export interface EmittedCommand {
  /** Type of command to emit */
  commandType: string;

  /** Command payload */
  payload: Record<string, unknown>;

  /** Optional correlation ID (inherited from trigger event if not specified) */
  correlationId?: string;

  /** Causation ID (typically the triggering event's ID) */
  causationId: string;

  /** Optional partition key for Workpool ordering */
  partitionKey?: string;
}

/**
 * Configuration for PM checkpoint-based processing.
 *
 * @typeParam TCtx - The context type (typically Convex mutation context)
 */
export interface WithPMCheckpointConfig<TCtx> {
  /** Name of the process manager */
  pmName: string;

  /** Instance ID for this PM instance */
  instanceId: string;

  /** Global position of the event being processed */
  globalPosition: number;

  /** Event ID (for causation tracking) */
  eventId: string;

  /** Correlation ID from the trigger event */
  correlationId: string;

  /**
   * Function to retrieve the current PM state.
   * Should return null if no state exists yet.
   */
  getPMState: (
    ctx: TCtx,
    pmName: string,
    instanceId: string
  ) => Promise<ProcessManagerState | null>;

  /**
   * Function to create a new PM state if it doesn't exist.
   * Should be idempotent (return existing if already created).
   */
  getOrCreatePMState: (
    ctx: TCtx,
    pmName: string,
    instanceId: string,
    initialState?: {
      triggerEventId?: string;
      correlationId?: string;
    }
  ) => Promise<ProcessManagerState>;

  /**
   * Function to update PM state.
   * Handles partial updates.
   */
  updatePMState: (
    ctx: TCtx,
    pmName: string,
    instanceId: string,
    updates: Partial<
      Pick<
        ProcessManagerState,
        | "status"
        | "lastGlobalPosition"
        | "commandsEmitted"
        | "commandsFailed"
        | "errorMessage"
        | "customState"
        | "stateVersion"
      >
    >
  ) => Promise<void>;

  /**
   * Function to record a dead letter on failure.
   *
   * @param ctx - The context
   * @param pmName - Process manager name
   * @param instanceId - PM instance ID
   * @param error - Error message
   * @param attemptCount - Number of attempts (derived from commandsFailed + 1)
   * @param context - Additional debugging context
   */
  recordDeadLetter: (
    ctx: TCtx,
    pmName: string,
    instanceId: string,
    error: string,
    attemptCount: number,
    context?: {
      eventId?: string;
      globalPosition?: number;
      correlationId?: string;
      streamType?: string;
      streamId?: string;
      failedCommand?: { commandType: string; payload: Record<string, unknown> };
    }
  ) => Promise<void>;

  /**
   * The PM processing logic.
   * Should return the commands to emit.
   * Only called if the event hasn't been processed yet.
   *
   * @param pmState - Current PM state (includes customState for hybrid PMs)
   */
  process: (pmState: ProcessManagerState) => Promise<EmittedCommand[]>;

  /**
   * Function to emit commands (typically via Workpool).
   * Called after process() succeeds.
   */
  emitCommands: (ctx: TCtx, commands: EmittedCommand[]) => Promise<void>;

  /**
   * Optional logger for PM execution tracing.
   * If not provided, logging is disabled (no-op logger).
   *
   * Logging points:
   * - DEBUG: State loaded/created, skip reasons
   * - INFO: Processing started/completed
   * - WARN: Invalid state transitions
   * - ERROR: Handler failures, invalid globalPosition
   */
  logger?: Logger;
}

/**
 * Wraps PM handler with checkpoint-based idempotency.
 *
 * This helper implements the standard PM checkpoint pattern:
 * 1. Get or create PM state
 * 2. Check if event was already processed (compare globalPosition)
 * 3. Check if PM is in terminal state
 * 4. Transition to "processing" state
 * 5. Execute PM logic (get commands to emit)
 * 6. Emit commands via callback
 * 7. Transition to "completed" or "failed"
 * 8. Update checkpoint
 *
 * @param ctx - The mutation context
 * @param config - PM checkpoint configuration
 * @returns Result indicating whether event was processed, skipped, or failed
 *
 * @example
 * ```typescript
 * export const onOrderConfirmed = mutation({
 *   args: {
 *     orderId: v.string(),
 *     customerEmail: v.string(),
 *     eventId: v.string(),
 *     globalPosition: v.number(),
 *     correlationId: v.string(),
 *   },
 *   handler: async (ctx, args) => {
 *     return withPMCheckpoint(ctx, {
 *       pmName: "orderNotification",
 *       instanceId: `order:${args.orderId}`,
 *       globalPosition: args.globalPosition,
 *       eventId: args.eventId,
 *       correlationId: args.correlationId,
 *       getPMState: async (ctx, pmName, instanceId) => {
 *         return ctx.runQuery(components.eventStore.lib.getPMState, { pmName, instanceId });
 *       },
 *       getOrCreatePMState: async (ctx, pmName, instanceId, initial) => {
 *         return ctx.runMutation(components.eventStore.lib.getOrCreatePMState, {
 *           pmName, instanceId, ...initial
 *         });
 *       },
 *       updatePMState: async (ctx, pmName, instanceId, updates) => {
 *         await ctx.runMutation(components.eventStore.lib.updatePMState, {
 *           pmName, instanceId, ...updates
 *         });
 *       },
 *       recordDeadLetter: async (ctx, pmName, instanceId, error, context) => {
 *         await ctx.runMutation(components.eventStore.lib.recordPMDeadLetter, {
 *           pmName, instanceId, error, ...context
 *         });
 *       },
 *       // pmState is passed to avoid redundant DB reads
 *       process: async (pmState) => {
 *         // Access customState if needed: pmState.customState
 *         return [{
 *           commandType: "SendNotification",
 *           payload: { email: args.customerEmail, orderId: args.orderId },
 *           causationId: args.eventId,
 *         }];
 *       },
 *       emitCommands: async (ctx, commands) => {
 *         for (const cmd of commands) {
 *           await workpool.enqueue(ctx, { fnArgs: cmd });
 *         }
 *       },
 *     });
 *   },
 * });
 * ```
 */
export async function withPMCheckpoint<TCtx>(
  ctx: TCtx,
  config: WithPMCheckpointConfig<TCtx>
): Promise<PMCheckpointResult> {
  const {
    pmName,
    instanceId,
    globalPosition,
    eventId,
    correlationId,
    getPMState,
    getOrCreatePMState,
    updatePMState,
    recordDeadLetter,
    process,
    emitCommands,
    logger: configLogger,
  } = config;

  // Use provided logger or fall back to no-op
  const logger = configLogger ?? createPlatformNoOpLogger();

  // Validate globalPosition to prevent idempotency bypass
  // A negative globalPosition would incorrectly pass the "already processed" check
  if (globalPosition < 0) {
    logger.error("Invalid globalPosition", {
      pmName,
      instanceId,
      globalPosition,
      error: "Must be non-negative",
    });
    return {
      status: "failed",
      error: `Invalid globalPosition: ${globalPosition}. Must be non-negative.`,
    };
  }

  // 1. Get or create PM state
  let pmState = await getPMState(ctx, pmName, instanceId);
  const isNewState = !pmState;

  if (!pmState) {
    pmState = await getOrCreatePMState(ctx, pmName, instanceId, {
      triggerEventId: eventId,
      correlationId,
    });
  }

  logger.debug(isNewState ? "PM state created" : "PM state loaded", {
    pmName,
    instanceId,
    status: pmState.status,
    lastGlobalPosition: pmState.lastGlobalPosition,
  });

  // 2. Check if already processed (idempotency via globalPosition)
  // Only skip if:
  // - globalPosition <= lastGlobalPosition AND
  // - PM is in a stable state (completed or idle with this checkpoint)
  //
  // Allow retry if PM is in "processing" or "failed" state, even with same globalPosition,
  // because those states indicate an incomplete previous attempt.
  const isPMIncomplete = pmState.status === "processing" || pmState.status === "failed";
  if (globalPosition <= pmState.lastGlobalPosition && !isPMIncomplete) {
    logger.debug("Skipped: already processed", {
      pmName,
      instanceId,
      globalPosition,
      lastGlobalPosition: pmState.lastGlobalPosition,
    });
    return { status: "skipped", reason: "already_processed" };
  }

  // 3. Check if in terminal state (completed is terminal for one-shot PMs)
  if (pmState.status === "completed") {
    logger.debug("Skipped: terminal state", {
      pmName,
      instanceId,
      status: pmState.status,
    });
    return { status: "skipped", reason: "terminal_state" };
  }

  // 4. Transition to "processing" state
  // Allow retry from these states:
  // - "idle" → "processing" (normal start via START event)
  // - "processing" → stay in processing (retry from crashed handler)
  // - "failed" → "processing" (retry after failure via RETRY event)
  const isRetryFromFailed = pmState.status === "failed";
  const isRetryFromProcessing = pmState.status === "processing";
  const canStart = pmTransitionState(pmState.status, "START") !== null;
  const canRetry = isRetryFromFailed && pmTransitionState(pmState.status, "RETRY") !== null;

  if (!canStart && !canRetry && !isRetryFromProcessing) {
    logger.warn("Invalid state transition", {
      pmName,
      instanceId,
      currentStatus: pmState.status,
      error: "Cannot process from this state",
    });
    return {
      status: "failed",
      error: `Invalid state transition: cannot process from "${pmState.status}"`,
    };
  }

  if (pmState.status !== "processing") {
    await updatePMState(ctx, pmName, instanceId, {
      status: "processing",
      // Note: lastGlobalPosition is only updated on successful completion (line ~335)
      // to allow retries when emitCommands() fails or handler crashes mid-processing.
      // See: tests/unit/processManager/withPMCheckpoint.test.ts "retry after failure"
    });
  }

  logger.info("Processing started", {
    pmName,
    instanceId,
    eventId,
    globalPosition,
    isRetry: isRetryFromFailed || isRetryFromProcessing,
  });

  // 5. Execute PM logic - pass pmState to avoid redundant read in handler
  let emittedCommands: EmittedCommand[];
  try {
    emittedCommands = await process(pmState);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const attemptCount = pmState.commandsFailed + 1;

    logger.error("Handler failed", {
      pmName,
      instanceId,
      eventId,
      globalPosition,
      attemptCount,
      error: errorMessage,
    });

    // Transition to failed
    await updatePMState(ctx, pmName, instanceId, {
      status: "failed",
      errorMessage,
      commandsFailed: attemptCount,
    });

    // Record dead letter with full event context for debugging
    await recordDeadLetter(ctx, pmName, instanceId, errorMessage, attemptCount, {
      eventId,
      globalPosition,
      correlationId,
    });

    return { status: "failed", error: errorMessage };
  }

  // 6. Emit commands
  try {
    if (emittedCommands.length > 0) {
      await emitCommands(ctx, emittedCommands);
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const attemptCount = pmState.commandsFailed + 1;

    logger.error("Command emission failed", {
      pmName,
      instanceId,
      eventId,
      globalPosition,
      attemptCount,
      commandCount: emittedCommands.length,
      error: errorMessage,
    });

    // Transition to failed
    await updatePMState(ctx, pmName, instanceId, {
      status: "failed",
      errorMessage,
      commandsFailed: attemptCount,
    });

    // Record dead letter with failed command and full event context
    // Use spread pattern for optional property to satisfy exactOptionalPropertyTypes
    const deadLetterContext: {
      eventId?: string;
      globalPosition?: number;
      correlationId?: string;
      failedCommand?: { commandType: string; payload: Record<string, unknown> };
    } = {
      eventId,
      globalPosition,
      correlationId,
    };

    const firstCommand = emittedCommands[0];
    if (firstCommand !== undefined) {
      deadLetterContext.failedCommand = {
        commandType: firstCommand.commandType,
        payload: firstCommand.payload,
      };
    }

    await recordDeadLetter(
      ctx,
      pmName,
      instanceId,
      `Command emission failed: ${errorMessage}`,
      attemptCount,
      deadLetterContext
    );

    return { status: "failed", error: errorMessage };
  }

  // 7. Transition to completed
  await updatePMState(ctx, pmName, instanceId, {
    status: "completed",
    lastGlobalPosition: globalPosition,
    commandsEmitted: pmState.commandsEmitted + emittedCommands.length,
  });

  logger.info("Processing completed", {
    pmName,
    instanceId,
    eventId,
    globalPosition,
    commandsEmitted: emittedCommands.length,
  });

  return {
    status: "processed",
    commandsEmitted: emittedCommands.map((c) => c.commandType),
  };
}

/**
 * Creates a reusable PM checkpoint helper bound to specific storage functions.
 *
 * Use this when you want to configure storage callbacks once and reuse
 * across multiple PM handlers.
 *
 * @param storage - Storage callbacks for PM state management
 * @returns A configured withPMCheckpoint function
 *
 * @example
 * ```typescript
 * // Create a configured PM checkpoint helper
 * const withOrderPMCheckpoint = createPMCheckpointHelper({
 *   getPMState: async (ctx, pmName, instanceId) => {
 *     return ctx.runQuery(components.eventStore.lib.getPMState, { pmName, instanceId });
 *   },
 *   getOrCreatePMState: async (ctx, pmName, instanceId, initial) => {
 *     return ctx.runMutation(components.eventStore.lib.getOrCreatePMState, {
 *       pmName, instanceId, ...initial
 *     });
 *   },
 *   updatePMState: async (ctx, pmName, instanceId, updates) => {
 *     await ctx.runMutation(components.eventStore.lib.updatePMState, {
 *       pmName, instanceId, ...updates
 *     });
 *   },
 *   recordDeadLetter: async (ctx, pmName, instanceId, error, context) => {
 *     await ctx.runMutation(components.eventStore.lib.recordPMDeadLetter, {
 *       pmName, instanceId, error, ...context
 *     });
 *   },
 * });
 *
 * // Use in handlers
 * export const onOrderConfirmed = mutation({
 *   handler: async (ctx, args) => {
 *     return withOrderPMCheckpoint(ctx, {
 *       pmName: "orderNotification",
 *       instanceId: `order:${args.orderId}`,
 *       globalPosition: args.globalPosition,
 *       eventId: args.eventId,
 *       correlationId: args.correlationId,
 *       process: async () => [...],
 *       emitCommands: async (ctx, cmds) => {...},
 *     });
 *   },
 * });
 * ```
 */
export function createPMCheckpointHelper<TCtx>(storage: {
  getPMState: WithPMCheckpointConfig<TCtx>["getPMState"];
  getOrCreatePMState: WithPMCheckpointConfig<TCtx>["getOrCreatePMState"];
  updatePMState: WithPMCheckpointConfig<TCtx>["updatePMState"];
  recordDeadLetter: WithPMCheckpointConfig<TCtx>["recordDeadLetter"];
}) {
  return async function withConfiguredPMCheckpoint(
    ctx: TCtx,
    config: Omit<
      WithPMCheckpointConfig<TCtx>,
      "getPMState" | "getOrCreatePMState" | "updatePMState" | "recordDeadLetter"
    >
  ): Promise<PMCheckpointResult> {
    return withPMCheckpoint(ctx, {
      ...config,
      ...storage,
    });
  };
}
