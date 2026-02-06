/**
 * @libar-docs
 * @libar-docs-pattern OrderNotificationPM
 * @libar-docs-status completed
 * @libar-docs-saga
 * @libar-docs-arch-role process-manager
 * @libar-docs-arch-context orders
 * @libar-docs-arch-layer application
 * @libar-docs-uses OrderCommandHandlers
 * @libar-docs-used-by OrderManagementInfrastructure
 *
 * Process manager: OrderConfirmed -> SendNotification command.
 * Fire-and-forget coordinator (no compensation, unlike Sagas).
 * Subscribed via EventBus at PM priority (200).
 *
 * @see ADR-033 for Process Manager vs Saga distinction
 */
import { v } from "convex/values";
import { z } from "zod";
import { makeFunctionReference } from "convex/server";
import { internalMutation, type MutationCtx } from "../_generated/server";
import { components } from "../_generated/api";
import { defineProcessManager } from "@libar-dev/platform-bc";
import {
  createProcessManagerExecutor,
  type PMDomainEvent,
  type EmittedCommand,
  type ProcessManagerState,
} from "@libar-dev/platform-core/processManager";
import type { SafeMutationRef } from "@libar-dev/platform-core";

// =============================================================================
// Mutation References (TS2589 Prevention)
// =============================================================================
// Using makeFunctionReference() bypasses Convex's FilterApi recursive type
// resolution entirely. This prevents TS2589 "Type instantiation is excessively
// deep" errors that occur when accessing paths like `internal.processManagers.*`.
// =============================================================================

const processNotificationCommandRef = makeFunctionReference<"mutation">(
  "processManagers/orderNotification:processNotificationCommand"
) as SafeMutationRef;

// ============================================================================
// PM DEFINITION
// ============================================================================

/**
 * Order Notification Process Manager Definition.
 *
 * Formal metadata for introspection, documentation, and type safety.
 */
export const orderNotificationPM = defineProcessManager({
  processManagerName: "orderNotification",
  description: "Sends notification when order is confirmed",
  triggerType: "event",
  eventSubscriptions: ["OrderConfirmed"] as const,
  emitsCommands: ["SendNotification"],
  context: "orders",
  correlationStrategy: { correlationProperty: "orderId" },
});

// ============================================================================
// PM HANDLER LOGIC
// ============================================================================

/**
 * Zod schema for OrderConfirmed event payload validation.
 *
 * Using Zod ensures runtime type safety for event payloads,
 * preventing silent data corruption from malformed events.
 */
const OrderConfirmedPayloadSchema = z.object({
  orderId: z.string(),
  customerId: z.string(),
  customerEmail: z.email().optional(),
  totalAmount: z.number(),
  confirmedAt: z.number(),
});

/**
 * OrderConfirmed event payload type (inferred from Zod schema).
 */
export type OrderConfirmedPayload = z.infer<typeof OrderConfirmedPayloadSchema>;

/**
 * PM handler that transforms OrderConfirmed events into SendNotification commands.
 *
 * This is the core business logic of the PM - given an event, what commands
 * should be emitted?
 */
async function orderNotificationHandler(
  _ctx: MutationCtx,
  event: PMDomainEvent
): Promise<EmittedCommand[]> {
  // Validate payload with Zod safeParse for descriptive error messages
  const parseResult = OrderConfirmedPayloadSchema.safeParse(event.payload);
  if (!parseResult.success) {
    throw new Error(
      `Invalid OrderConfirmed payload for event ${event.eventId}: ${parseResult.error.message}`
    );
  }
  const payload = parseResult.data;

  // Generate notification command
  return [
    {
      commandType: "SendNotification",
      payload: {
        type: "order_confirmation",
        orderId: payload.orderId,
        customerId: payload.customerId,
        email: payload.customerEmail ?? `customer-${payload.customerId}@example.com`,
        subject: "Your order has been confirmed!",
        templateData: {
          orderId: payload.orderId,
          totalAmount: payload.totalAmount,
          confirmedAt: new Date(payload.confirmedAt).toISOString(),
        },
      },
      causationId: event.eventId,
      correlationId: event.correlationId,
      partitionKey: payload.customerId, // Partition by customer for notification ordering
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
 * - Command emission via Workpool
 * - Dead letter recording on failures
 */
export const orderNotificationExecutor = createProcessManagerExecutor<MutationCtx>({
  pmName: orderNotificationPM.processManagerName,
  eventSubscriptions: orderNotificationPM.eventSubscriptions,

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

  // Command emission via Workpool for durability
  // Note: partitionKey for ordering is handled by Workpool's internal partitioning
  commandEmitter: async (ctx: MutationCtx, commands: EmittedCommand[]) => {
    for (const cmd of commands) {
      // Use ctx.scheduler for fire-and-forget command dispatch
      // In production, you could use Workpool for better retry handling
      await ctx.scheduler.runAfter(0, processNotificationCommandRef, {
        commandType: cmd.commandType,
        payload: cmd.payload,
        correlationId: cmd.correlationId ?? "",
        causationId: cmd.causationId,
      });
    }
  },

  // Business logic handler
  handler: orderNotificationHandler,

  // Use orderId from event payload as instance ID
  instanceIdResolver: (event) => {
    // Safe extraction with fallback - instanceId resolution shouldn't throw
    const result = z.object({ orderId: z.string() }).safeParse(event.payload);
    return result.success ? result.data.orderId : event.streamId;
  },
});

// ============================================================================
// CONVEX MUTATION HANDLERS
// ============================================================================

/**
 * Handle OrderConfirmed event - entry point from EventBus.
 *
 * This mutation is registered as a subscription handler and receives
 * events via the EventBus/Workpool infrastructure.
 */
export const handleOrderConfirmed = internalMutation({
  args: {
    eventId: v.string(),
    eventType: v.string(),
    globalPosition: v.number(),
    correlationId: v.string(),
    streamType: v.string(),
    streamId: v.string(),
    payload: v.any(),
    timestamp: v.number(),
    // The following fields are provided by EventBus subscription infrastructure
    // for routing and context. They are validated but intentionally not used
    // in the handler because the PM executor handles instance routing internally.
    // Keeping them in args ensures the mutation schema matches the subscription.
    category: v.string(),
    boundedContext: v.string(),
    instanceId: v.string(), // Computed by subscription from correlationStrategy
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

    return orderNotificationExecutor.process(ctx, event);
  },
});

/**
 * Process notification command - worker for command emission.
 *
 * In a real application, this would call an email service or
 * notification API. For this example, it simply acknowledges receipt.
 */
export const processNotificationCommand = internalMutation({
  args: {
    commandType: v.string(),
    payload: v.any(),
    correlationId: v.string(),
    causationId: v.string(),
  },
  returns: v.null(),
  handler: async (_ctx, _args) => {
    // In production: call email service, push notification, etc.
    // Example: await emailService.send(args.payload.email, args.payload.subject, ...);
    //
    // Convex logs function execution automatically. For additional logging,
    // use an external logging service via an action.
    return null;
  },
});
