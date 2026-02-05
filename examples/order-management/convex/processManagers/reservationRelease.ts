/**
 * Reservation Release Process Manager
 *
 * Releases reservations when confirmed orders are cancelled.
 * Enables the Agent BC churn risk demo by allowing confirmed order cancellation.
 *
 * Architecture:
 * 1. EventBus delivers OrderCancelled to this PM via subscription
 * 2. PM queries orderWithInventoryStatus projection for reservationId
 * 3. If reservation exists and not already released, emits ReleaseReservation command
 * 4. PM state tracks last processed globalPosition for idempotency
 *
 * @see ADR-033 for Process Manager vs Saga distinction
 */
import { v } from "convex/values";
import { z } from "zod";
import { makeFunctionReference } from "convex/server";
import type { FunctionReference, FunctionVisibility } from "convex/server";
import { internalMutation, type MutationCtx } from "../_generated/server";
import { components } from "../_generated/api";
import { defineProcessManager } from "@libar-dev/platform-bc";
import {
  createProcessManagerExecutor,
  type PMDomainEvent,
  type EmittedCommand,
  type ProcessManagerState,
  type PMEventHandlerArgs,
} from "@libar-dev/platform-core/processManager";
import type { SafeMutationRef } from "@libar-dev/platform-core";
// =============================================================================
// Mutation References (TS2589 Prevention)
// =============================================================================

const processReleaseCommandRef = makeFunctionReference<"mutation">(
  "processManagers/reservationRelease:processReleaseCommand"
) as SafeMutationRef;

// Reference to internal mutation (avoids circular dependency and TS2589)
const releaseReservationRef = makeFunctionReference<"mutation">(
  "inventoryInternal:releaseReservation"
) as SafeMutationRef;

// Export for eventSubscriptions.ts
export const handleOrderCancelledRef = makeFunctionReference<"mutation">(
  "processManagers/reservationRelease:handleOrderCancelled"
) as FunctionReference<"mutation", FunctionVisibility, PMEventHandlerArgs, unknown>;

// ============================================================================
// PM DEFINITION
// ============================================================================

/**
 * Reservation Release Process Manager Definition.
 *
 * Releases reservations when confirmed orders are cancelled.
 */
export const reservationReleasePM = defineProcessManager({
  processManagerName: "reservationReleaseOnOrderCancel",
  description: "Releases reservation when confirmed order is cancelled",
  triggerType: "event",
  eventSubscriptions: ["OrderCancelled"] as const,
  emitsCommands: ["ReleaseReservation"],
  context: "orders",
  correlationStrategy: { correlationProperty: "orderId" },
});

// ============================================================================
// PM HANDLER LOGIC
// ============================================================================

/**
 * Zod schema for OrderCancelled event payload validation.
 */
const OrderCancelledPayloadSchema = z.object({
  orderId: z.string(),
  customerId: z.string(),
  reason: z.string(),
});

/**
 * Zod schema for ReleaseReservation command payload validation.
 */
const ReleaseReservationPayloadSchema = z.object({
  reservationId: z.string(),
  reason: z.string(),
});

/**
 * OrderCancelled event payload type (inferred from Zod schema).
 */
export type OrderCancelledPayload = z.infer<typeof OrderCancelledPayloadSchema>;

/**
 * PM handler that transforms OrderCancelled events into ReleaseReservation commands.
 *
 * Only emits command if:
 * - Order has a reservation (reservationId exists in projection)
 * - Reservation is not already released or expired
 *
 * **Eventual Consistency Note:**
 * This handler depends on the `orderWithInventoryStatus` projection being up-to-date.
 * If the projection record doesn't exist at all (projection lag), the handler throws
 * an error to trigger Workpool retry with backoff. This ensures the reservation is
 * eventually released once the projection catches up.
 *
 * If the projection record exists but has no reservationId, that's a legitimate skip
 * (draft/submitted order cancelled before reservation was made).
 *
 * @see ADR-033 for Process Manager vs Saga distinction
 */
async function reservationReleaseHandler(
  ctx: MutationCtx,
  event: PMDomainEvent
): Promise<EmittedCommand[]> {
  // Validate payload with Zod safeParse for descriptive error messages
  const parseResult = OrderCancelledPayloadSchema.safeParse(event.payload);
  if (!parseResult.success) {
    throw new Error(
      `Invalid OrderCancelled payload for event ${event.eventId}: ${parseResult.error.message}`
    );
  }
  const payload = parseResult.data;

  // Query cross-context projection for reservationId
  const orderWithInventory = await ctx.db
    .query("orderWithInventoryStatus")
    .withIndex("by_orderId", (q) => q.eq("orderId", payload.orderId))
    .first();

  // No projection record means projection hasn't caught up yet (projection lag).
  // Throw to trigger Workpool retry with backoff — returning [] would mark the PM
  // as "completed" and prevent future redeliveries (permanent skip).
  // NOTE: Orders created via command flow always get projection records (even drafts
  // have records with null reservationId), so missing record = projection lag.
  if (!orderWithInventory) {
    throw new Error(
      `[ReservationReleasePM] Projection not ready for order ${payload.orderId}, ` +
        `event ${event.eventId}. Will retry via Workpool backoff.`
    );
  }

  // No reservation means order was cancelled before reservation was made
  if (!orderWithInventory.reservationId) {
    console.log(
      `[ReservationReleasePM] Skipping: order has no reservation`,
      JSON.stringify({
        orderId: payload.orderId,
        eventId: event.eventId,
        reason: "no_reservation",
      })
    );
    return [];
  }

  // Skip if reservation is already in a terminal state
  if (orderWithInventory.reservationStatus === "released") {
    console.log(
      `[ReservationReleasePM] Skipping: reservation already released`,
      JSON.stringify({
        orderId: payload.orderId,
        reservationId: orderWithInventory.reservationId,
        eventId: event.eventId,
        reason: "already_released",
      })
    );
    return [];
  }
  if (orderWithInventory.reservationStatus === "expired") {
    console.log(
      `[ReservationReleasePM] Skipping: reservation expired`,
      JSON.stringify({
        orderId: payload.orderId,
        reservationId: orderWithInventory.reservationId,
        eventId: event.eventId,
        reason: "reservation_expired",
      })
    );
    return [];
  }

  // Emit ReleaseReservation command
  return [
    {
      commandType: "ReleaseReservation",
      payload: {
        reservationId: orderWithInventory.reservationId,
        reason: `Order ${payload.orderId} cancelled: ${payload.reason}`,
      },
      causationId: event.eventId,
      correlationId: event.correlationId,
      partitionKey: orderWithInventory.reservationId,
    },
  ];
}

// ============================================================================
// PM EXECUTOR
// ============================================================================

/**
 * PM Executor instance.
 *
 * Wraps the handler with:
 * - Idempotency via globalPosition checkpoint
 * - Lifecycle state management
 * - Command emission via scheduler
 * - Dead letter recording on failures
 */
export const reservationReleaseExecutor = createProcessManagerExecutor<MutationCtx>({
  pmName: reservationReleasePM.processManagerName,
  eventSubscriptions: reservationReleasePM.eventSubscriptions,

  // Storage callbacks for PM state management
  storage: {
    getPMState: async (ctx: MutationCtx, pmName: string, instanceId: string) => {
      const result = await ctx.runQuery(components.eventStore.lib.getPMState, {
        processManagerName: pmName,
        instanceId,
      });
      return result as ProcessManagerState | null;
    },

    getOrCreatePMState: async (
      ctx: MutationCtx,
      pmName: string,
      instanceId: string,
      initial?: { triggerEventId?: string; correlationId?: string }
    ) => {
      // Build options object with defined values to satisfy exactOptionalPropertyTypes
      const hasOptions =
        initial?.correlationId !== undefined || initial?.triggerEventId !== undefined;
      if (hasOptions) {
        const options: { triggerEventId?: string; correlationId?: string } = {};
        if (initial?.triggerEventId !== undefined) options.triggerEventId = initial.triggerEventId;
        if (initial?.correlationId !== undefined) options.correlationId = initial.correlationId;
        const result = await ctx.runMutation(components.eventStore.lib.getOrCreatePMState, {
          processManagerName: pmName,
          instanceId,
          options,
        });
        return result as ProcessManagerState;
      }
      const result = await ctx.runMutation(components.eventStore.lib.getOrCreatePMState, {
        processManagerName: pmName,
        instanceId,
      });
      return result as ProcessManagerState;
    },

    updatePMState: async (
      ctx: MutationCtx,
      pmName: string,
      instanceId: string,
      updates: Partial<ProcessManagerState>
    ) => {
      // Build updates object only with defined values to satisfy exactOptionalPropertyTypes
      const updateObj: {
        status?: "idle" | "processing" | "completed" | "failed";
        lastGlobalPosition?: number;
        commandsEmitted?: number;
        commandsFailed?: number;
        errorMessage?: string;
        customState?: unknown;
        stateVersion?: number;
      } = {};
      if (updates.status !== undefined) updateObj.status = updates.status;
      if (updates.lastGlobalPosition !== undefined)
        updateObj.lastGlobalPosition = updates.lastGlobalPosition;
      if (updates.commandsEmitted !== undefined)
        updateObj.commandsEmitted = updates.commandsEmitted;
      if (updates.commandsFailed !== undefined) updateObj.commandsFailed = updates.commandsFailed;
      if (updates.errorMessage !== undefined) updateObj.errorMessage = updates.errorMessage;
      if (updates.customState !== undefined) updateObj.customState = updates.customState;
      if (updates.stateVersion !== undefined) updateObj.stateVersion = updates.stateVersion;

      await ctx.runMutation(components.eventStore.lib.updatePMState, {
        processManagerName: pmName,
        instanceId,
        updates: updateObj,
      });
    },

    recordDeadLetter: async (
      ctx: MutationCtx,
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
        failedCommand?: { commandType: string; payload: unknown };
      }
    ) => {
      // Build args object with defined values to satisfy exactOptionalPropertyTypes
      const args: {
        processManagerName: string;
        instanceId: string;
        error: string;
        attemptCount: number;
        eventId?: string;
        failedCommand?: { commandType: string; payload: Record<string, unknown> };
        context?: Record<string, unknown>;
      } = {
        processManagerName: pmName,
        instanceId,
        error,
        attemptCount,
      };
      if (context?.eventId !== undefined) {
        args.eventId = context.eventId;
      }
      if (context?.failedCommand !== undefined) {
        args.failedCommand = {
          commandType: context.failedCommand.commandType,
          payload: context.failedCommand.payload as Record<string, unknown>,
        };
      }
      // Include additional context for debugging
      const extraContext: Record<string, unknown> = {};
      if (context?.globalPosition !== undefined)
        extraContext["globalPosition"] = context.globalPosition;
      if (context?.correlationId !== undefined)
        extraContext["correlationId"] = context.correlationId;
      if (context?.streamType !== undefined) extraContext["streamType"] = context.streamType;
      if (context?.streamId !== undefined) extraContext["streamId"] = context.streamId;
      if (Object.keys(extraContext).length > 0) {
        args.context = extraContext;
      }
      await ctx.runMutation(components.eventStore.lib.recordPMDeadLetter, args);
    },
  },

  // Command emission via scheduler for fire-and-forget dispatch
  commandEmitter: async (ctx: MutationCtx, commands: EmittedCommand[]) => {
    for (const cmd of commands) {
      // Warn if correlationId is missing - aids request tracing
      if (!cmd.correlationId) {
        console.warn(
          `[ReservationReleasePM] Command emitted without correlationId`,
          JSON.stringify({
            commandType: cmd.commandType,
            causationId: cmd.causationId,
          })
        );
      }

      await ctx.scheduler.runAfter(0, processReleaseCommandRef, {
        commandType: cmd.commandType,
        payload: cmd.payload,
        correlationId: cmd.correlationId ?? "",
        causationId: cmd.causationId,
      });
    }
  },

  // Business logic handler
  handler: reservationReleaseHandler,

  // Use orderId from event payload as instance ID
  instanceIdResolver: (event) => {
    const result = z.object({ orderId: z.string() }).safeParse(event.payload);
    if (!result.success) {
      console.warn(
        `[ReservationReleasePM] instanceIdResolver fallback to streamId - invalid payload`,
        JSON.stringify({
          eventId: event.eventId,
          eventType: event.eventType,
          streamId: event.streamId,
          error: result.error.message,
        })
      );
      return event.streamId;
    }
    return result.data.orderId;
  },
});

// ============================================================================
// CONVEX MUTATION HANDLERS
// ============================================================================

/**
 * Handle OrderCancelled event - entry point from EventBus.
 *
 * This mutation is registered as a subscription handler and receives
 * events via the EventBus/Workpool infrastructure.
 */
export const handleOrderCancelled = internalMutation({
  args: {
    eventId: v.string(),
    eventType: v.string(),
    globalPosition: v.number(),
    correlationId: v.string(),
    streamType: v.string(),
    streamId: v.string(),
    payload: v.any(),
    timestamp: v.number(),
    // Fields provided by EventBus subscription infrastructure
    category: v.string(),
    boundedContext: v.string(),
    instanceId: v.string(),
  },
  returns: v.object({
    status: v.union(v.literal("processed"), v.literal("skipped"), v.literal("failed")),
    commandsEmitted: v.optional(v.array(v.string())),
    reason: v.optional(
      v.union(
        v.literal("already_processed"),
        v.literal("terminal_state"),
        v.literal("not_subscribed")
      )
    ),
    error: v.optional(v.string()),
  }),
  handler: async (ctx, args) => {
    const event: PMDomainEvent = {
      eventId: args.eventId,
      eventType: args.eventType,
      globalPosition: args.globalPosition,
      correlationId: args.correlationId,
      streamType: args.streamType,
      streamId: args.streamId,
      payload: args.payload as Record<string, unknown>,
      timestamp: args.timestamp,
    };

    return reservationReleaseExecutor.process(ctx, event);
  },
});

/**
 * Process release command - executes ReleaseReservation via CommandOrchestrator.
 *
 * Uses the existing releaseReservationConfig for proper dual-write and projection
 * triggering.
 *
 * Error Handling:
 * - Validates payload with Zod before execution
 * - Catches and logs command execution errors
 * - Records dead letter for failed commands to enable debugging
 * - Returns success/failure status for observability
 */
export const processReleaseCommand = internalMutation({
  args: {
    commandType: v.string(),
    payload: v.any(),
    correlationId: v.string(),
    causationId: v.string(),
  },
  returns: v.object({
    success: v.boolean(),
    error: v.optional(v.string()),
  }),
  handler: async (ctx, args) => {
    // Validate payload with Zod for type safety and clear error messages
    const parseResult = ReleaseReservationPayloadSchema.safeParse(args.payload);
    if (!parseResult.success) {
      const error = `Invalid ReleaseReservation payload: ${parseResult.error.message}`;
      console.error(
        `[ReservationReleasePM] Payload validation failed`,
        JSON.stringify({
          correlationId: args.correlationId,
          causationId: args.causationId,
          error,
          payload: args.payload,
        })
      );

      // Record dead letter for invalid payload
      await ctx.runMutation(components.eventStore.lib.recordPMDeadLetter, {
        processManagerName: reservationReleasePM.processManagerName,
        instanceId: `command-${args.causationId}`,
        error,
        attemptCount: 1,
        failedCommand: {
          commandType: args.commandType,
          payload: (args.payload ?? {}) as Record<string, unknown>,
        },
        context: {
          correlationId: args.correlationId,
          causationId: args.causationId,
        },
      });

      return { success: false, error };
    }

    const payload = parseResult.data;

    try {
      // Execute via internal mutation which wraps CommandOrchestrator
      // (avoids circular dependency: PM -> infrastructure -> eventSubscriptions -> PM)
      await ctx.runMutation(releaseReservationRef, {
        reservationId: payload.reservationId,
        reason: payload.reason,
        correlationId: args.correlationId,
      });

      console.log(
        `[ReservationReleasePM] Successfully released reservation`,
        JSON.stringify({
          reservationId: payload.reservationId,
          correlationId: args.correlationId,
        })
      );

      return { success: true };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);

      console.error(
        `[ReservationReleasePM] Command execution failed`,
        JSON.stringify({
          reservationId: payload.reservationId,
          correlationId: args.correlationId,
          causationId: args.causationId,
          error: errorMessage,
        })
      );

      // Record dead letter for command execution failure
      await ctx.runMutation(components.eventStore.lib.recordPMDeadLetter, {
        processManagerName: reservationReleasePM.processManagerName,
        instanceId: payload.reservationId,
        error: errorMessage,
        attemptCount: 1,
        failedCommand: {
          commandType: args.commandType,
          payload: payload as Record<string, unknown>,
        },
        context: {
          correlationId: args.correlationId,
          causationId: args.causationId,
          reservationId: payload.reservationId,
        },
      });

      return { success: false, error: errorMessage };
    }
  },
});
