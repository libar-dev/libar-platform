/**
 * Saga registry for idempotent saga management.
 *
 * Ensures each saga is started only once per business identifier (sagaId).
 * Uses the `sagas` table for saga state tracking.
 */
import { internalMutation, internalQuery } from "../_generated/server";
import { v } from "convex/values";
import { z } from "zod";
import { makeFunctionReference } from "convex/server";
import type { FunctionReference } from "convex/server";
import { createScopedLogger } from "@libar-dev/platform-core";
import { workflowManager, PLATFORM_LOG_LEVEL } from "../infrastructure";
import { SAGA_TYPE as ORDER_FULFILLMENT_SAGA } from "./orderFulfillment";

// =============================================================================
// Internal Function References (TS2589 Prevention)
// =============================================================================
// Using makeFunctionReference() bypasses Convex's FilterApi recursive type
// resolution entirely. This prevents TS2589 errors when accessing internal paths.
// =============================================================================
const orderFulfillmentWorkflowRef = makeFunctionReference<"mutation">(
  "sagas/orderFulfillment:orderFulfillmentWorkflow"
) as unknown as FunctionReference<"mutation", "internal">;
const onSagaCompleteRef = makeFunctionReference<"mutation">(
  "sagas/completion:onSagaComplete"
) as unknown as FunctionReference<"mutation", "internal">;

/**
 * Logger for saga registry operations.
 */
const logger = createScopedLogger("Saga:Registry", PLATFORM_LOG_LEVEL);

// =============================================================================
// Saga Payload Schemas
// =============================================================================

/**
 * Schema for OrderFulfillment saga payload.
 * This is validated at runtime when starting the saga.
 */
const OrderFulfillmentPayloadSchema = z.object({
  customerId: z.string().min(1),
  items: z
    .array(
      z.object({
        productId: z.string().min(1),
        productName: z.string().min(1),
        quantity: z.number().int().positive(),
        unitPrice: z.number().nonnegative(),
      })
    )
    .min(1),
  totalAmount: z.number().nonnegative(),
});

export type OrderFulfillmentPayload = z.infer<typeof OrderFulfillmentPayloadSchema>;

/**
 * Start a saga if it doesn't already exist.
 *
 * This provides idempotency for saga start - multiple events
 * triggering the same saga will only start it once.
 */
export const startSagaIfNotExists = internalMutation({
  args: {
    sagaType: v.string(),
    sagaId: v.string(),
    triggerEventId: v.string(),
    triggerGlobalPosition: v.number(),
    /**
     * Event payload - intentionally uses v.any() for flexibility.
     * Validated at runtime by saga-specific Zod schema (e.g., OrderFulfillmentPayloadSchema).
     * This allows the registry to handle multiple saga types with different payload shapes.
     */
    eventPayload: v.any(),
    /** Correlation ID from triggering event for distributed tracing */
    correlationId: v.string(),
  },
  handler: async (ctx, args) => {
    // 1. Check for existing saga (idempotency)
    const existing = await ctx.db
      .query("sagas")
      .withIndex("by_sagaId", (q) => q.eq("sagaType", args.sagaType).eq("sagaId", args.sagaId))
      .first();

    if (existing) {
      // Saga already exists - return existing info
      logger.debug("Saga already exists", {
        sagaType: args.sagaType,
        sagaId: args.sagaId,
        status: existing.status,
        workflowId: existing.workflowId,
        correlationId: args.correlationId,
      });
      return {
        status: "exists" as const,
        sagaStatus: existing.status,
        workflowId: existing.workflowId,
      };
    }

    const now = Date.now();

    // Start the appropriate workflow based on saga type
    let workflowId: string;

    if (args.sagaType === ORDER_FULFILLMENT_SAGA) {
      // Order Fulfillment Saga - coordinates order confirmation with inventory
      // Validate payload structure at runtime
      const parseResult = OrderFulfillmentPayloadSchema.safeParse(args.eventPayload);
      if (!parseResult.success) {
        logger.error("Payload validation failed", {
          sagaType: args.sagaType,
          sagaId: args.sagaId,
          error: parseResult.error.message,
          correlationId: args.correlationId,
        });
        throw new Error(`Invalid payload for ${args.sagaType}: ${parseResult.error.message}`);
      }
      const payload = parseResult.data;

      workflowId = await workflowManager.start(
        ctx,
        orderFulfillmentWorkflowRef,
        {
          orderId: args.sagaId,
          customerId: payload.customerId,
          items: payload.items,
          totalAmount: payload.totalAmount,
          correlationId: args.correlationId,
        },
        {
          onComplete: onSagaCompleteRef,
          context: { sagaType: args.sagaType, sagaId: args.sagaId },
        }
      );
    } else {
      // Unknown saga type - throw error to prevent silent failures
      logger.error("Unknown saga type", {
        sagaType: args.sagaType,
        sagaId: args.sagaId,
        correlationId: args.correlationId,
      });
      throw new Error(`Unknown saga type: ${args.sagaType}`);
    }

    await ctx.db.insert("sagas", {
      sagaType: args.sagaType,
      sagaId: args.sagaId,
      workflowId,
      status: "pending",
      triggerEventId: args.triggerEventId,
      triggerGlobalPosition: args.triggerGlobalPosition,
      createdAt: now,
      updatedAt: now,
    });

    logger.info("Saga record created", {
      sagaType: args.sagaType,
      sagaId: args.sagaId,
      workflowId,
      correlationId: args.correlationId,
    });

    return { status: "created" as const, workflowId };
  },
});

// Note: Saga status updates are handled by the onComplete callback in sagas/completion.ts.
// The workflow's onComplete handler is registered in startSagaIfNotExists above.

/**
 * Get saga by ID.
 */
export const getSaga = internalQuery({
  args: {
    sagaType: v.string(),
    sagaId: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("sagas")
      .withIndex("by_sagaId", (q) => q.eq("sagaType", args.sagaType).eq("sagaId", args.sagaId))
      .first();
  },
});

/**
 * Get sagas by status (for monitoring/debugging).
 */
export const getSagasByStatus = internalQuery({
  args: {
    sagaType: v.string(),
    status: v.union(
      v.literal("pending"),
      v.literal("running"),
      v.literal("completed"),
      v.literal("failed"),
      v.literal("compensating")
    ),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("sagas")
      .withIndex("by_status", (q) => q.eq("sagaType", args.sagaType).eq("status", args.status))
      .order("desc")
      .take(args.limit ?? 100);
  },
});
