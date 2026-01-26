/**
 * @libar-docs
 * @libar-docs-pattern OrderFulfillmentSaga
 * @libar-docs-status completed
 * @libar-docs-saga
 * @libar-docs-arch-role saga
 * @libar-docs-arch-layer application
 * @libar-docs-uses OrderCommandHandlers, InventoryCommandHandlers
 *
 * Order Fulfillment Saga.
 *
 * Coordinates the order fulfillment process across bounded contexts:
 * 1. When OrderSubmitted event is received
 * 2. Request inventory reservation from Inventory context
 * 3. If reservation succeeds, confirm order and reservation
 * 4. If reservation fails, cancel order (compensation)
 *
 * Uses @convex-dev/workflow for durable execution that survives restarts.
 * Saga status tracking is handled by the onComplete callback, not inside the workflow.
 */
import { v } from "convex/values";
import { makeFunctionReference } from "convex/server";
import { createScopedLogger, type SafeMutationRef } from "@libar-dev/platform-core";
import { workflowManager, PLATFORM_LOG_LEVEL } from "../infrastructure";

// =============================================================================
// Mutation References (TS2589 Prevention)
// =============================================================================
// Using makeFunctionReference() bypasses Convex's FilterApi recursive type
// resolution entirely. This prevents TS2589 "Type instantiation is excessively
// deep" errors that occur when accessing paths like `api.orders.cancelOrder`.
//
// The string path is resolved at runtime by Convex - same behavior as the
// generated api.js which also uses this approach internally.
//
// Type safety is maintained by Convex's runtime validation layer (throws if
// the path doesn't exist or args don't match the function's validator).
// @see docs/external/deep-research/TS2589-compact.md
// =============================================================================

const reserveStockMutation = makeFunctionReference<"mutation">(
  "inventoryInternal:reserveStock"
) as SafeMutationRef;
const confirmReservationMutation = makeFunctionReference<"mutation">(
  "inventoryInternal:confirmReservation"
) as SafeMutationRef;
const cancelOrderMutation = makeFunctionReference<"mutation">(
  "orders:cancelOrder"
) as SafeMutationRef;
const confirmOrderMutation = makeFunctionReference<"mutation">(
  "orders:confirmOrder"
) as SafeMutationRef;

/**
 * Logger for Order Fulfillment workflow operations.
 */
const logger = createScopedLogger("Saga:OrderFulfillment", PLATFORM_LOG_LEVEL);

export const SAGA_TYPE = "OrderFulfillment" as const;

/**
 * Saga arguments (what triggers the saga).
 */
export interface OrderFulfillmentArgs {
  orderId: string;
  customerId: string;
  items: Array<{
    productId: string;
    productName: string;
    quantity: number;
    unitPrice: number;
  }>;
  totalAmount: number;
  /** Correlation ID from triggering event for distributed tracing */
  correlationId: string;
}

/**
 * Saga result.
 */
export interface OrderFulfillmentResult {
  status: "completed" | "compensated";
  reservationId?: string;
  reason?: string;
}

// =============================================================================
// Type Guards
// =============================================================================

/**
 * Type guard to safely extract reservationId from result.data.
 */
interface ReserveStockSuccessData {
  reservationId: string;
  orderId: string;
  expiresAt: number;
}

function hasReservationId(data: unknown): data is ReserveStockSuccessData {
  return (
    typeof data === "object" &&
    data !== null &&
    "reservationId" in data &&
    typeof (data as ReserveStockSuccessData).reservationId === "string"
  );
}

/**
 * Order Fulfillment Workflow.
 *
 * Business logic only - status tracking is handled by onComplete callback.
 *
 * Steps:
 * 1. Reserve inventory (via internal mutation using CommandOrchestrator)
 * 2. Handle result:
 *    - Success: Confirm order and reservation
 *    - Failed/Rejected: Cancel order (compensation)
 *
 * The workflow is durable - it will resume from the last step on restart.
 * The onComplete callback updates saga status to completed/failed.
 */
export const orderFulfillmentWorkflow = workflowManager.define({
  args: {
    orderId: v.string(),
    customerId: v.string(),
    items: v.array(
      v.object({
        productId: v.string(),
        productName: v.string(),
        quantity: v.number(),
        unitPrice: v.number(),
      })
    ),
    totalAmount: v.number(),
    correlationId: v.string(),
  },
  returns: v.object({
    status: v.union(v.literal("completed"), v.literal("compensated")),
    reservationId: v.optional(v.string()),
    reason: v.optional(v.string()),
  }),
  handler: async (ctx, args): Promise<OrderFulfillmentResult> => {
    logger.info("Workflow started", { orderId: args.orderId, correlationId: args.correlationId });

    // Step 1: Reserve inventory via internal mutation
    // Uses CommandOrchestrator which handles { status: "failed" } for insufficient stock
    const reserveResult = (await ctx.runMutation(reserveStockMutation, {
      orderId: args.orderId,
      items: args.items.map((item) => ({
        productId: item.productId,
        quantity: item.quantity,
      })),
    })) as {
      status: "success" | "rejected" | "failed" | "duplicate";
      data?: unknown;
      reason?: string;
    };

    logger.debug("Reservation step completed", {
      orderId: args.orderId,
      status: reserveResult.status,
      correlationId: args.correlationId,
      // reason only exists on failed/rejected results
      ...("reason" in reserveResult && reserveResult.reason
        ? { reason: reserveResult.reason }
        : {}),
    });

    // Step 2: Handle reservation result
    // CommandOrchestrator returns: success | rejected | failed | duplicate
    if (reserveResult.status === "failed" || reserveResult.status === "rejected") {
      // Compensation: Cancel the order
      const reason = reserveResult.reason ?? "Inventory reservation failed";
      logger.info("Compensation triggered", {
        orderId: args.orderId,
        reason,
        correlationId: args.correlationId,
      });

      await ctx.runMutation(cancelOrderMutation, {
        orderId: args.orderId,
        reason,
        correlationId: args.correlationId,
      });

      return {
        status: "compensated",
        reason,
      };
    }

    // Extract reservationId from success result data using type guard
    let reservationId: string | undefined;
    if (reserveResult.status === "success" && hasReservationId(reserveResult.data)) {
      reservationId = reserveResult.data.reservationId;
    }

    // Step 3: Confirm the order (success path)
    await ctx.runMutation(confirmOrderMutation, {
      orderId: args.orderId,
      correlationId: args.correlationId,
    });
    logger.debug("Order confirmed", { orderId: args.orderId, correlationId: args.correlationId });

    // Step 4: Confirm the reservation (makes permanent, deducts from stock)
    if (reservationId) {
      await ctx.runMutation(confirmReservationMutation, {
        reservationId,
        correlationId: args.correlationId,
      });
      logger.debug("Reservation confirmed", {
        orderId: args.orderId,
        reservationId,
        correlationId: args.correlationId,
      });
    }

    // Build result with proper typing for exactOptionalPropertyTypes
    const result: OrderFulfillmentResult = { status: "completed" };
    if (reservationId !== undefined) {
      result.reservationId = reservationId;
    }

    logger.info("Workflow completed", {
      orderId: args.orderId,
      status: "fulfilled",
      reservationId,
      correlationId: args.correlationId,
    });
    return result;
  },
});
