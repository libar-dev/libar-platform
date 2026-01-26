/**
 * Batch Command Demonstrations
 *
 * Demonstrates atomic batch execution for multiple operations on a single aggregate.
 * Uses the BatchExecutor to add multiple items to an order in a single transaction.
 *
 * Key concepts:
 * - Atomic mode: All commands target the same aggregate (order)
 * - Sequential execution: Maintains event ordering within the aggregate
 * - Single-failure stops: If any item fails, remaining items are skipped
 */
import { mutation } from "../_generated/server";
import { v } from "convex/values";
import {
  createBatchExecutor,
  generateCorrelationId,
  toCorrelationId,
  type BatchResult,
  type CommandExecutor,
} from "@libar-dev/platform-core";
import { commandOrchestrator } from "../infrastructure";
import { commandRegistry } from "./registry";
import type { MutationCtx } from "../_generated/server";

/**
 * Creates a command executor for batch operations.
 * Wraps the CommandOrchestrator and converts results to the expected type.
 */
function createOrderBatchExecutor(ctx: MutationCtx) {
  // The executor handles any command type and returns appropriate result
  // Type assertion needed because CommandExecutor is polymorphic over TData
  const executor = (async (commandType, cmdArgs, options) => {
    const registration = commandRegistry.get(commandType);
    if (!registration) {
      return {
        status: "rejected" as const,
        code: "UNKNOWN_COMMAND",
        reason: `Unknown command type: ${commandType}`,
      };
    }

    const result = await commandOrchestrator.execute(ctx, registration.config, {
      ...cmdArgs,
      commandId: options.commandId,
    });

    // Convert CommandMutationResult to CommandHandlerResult
    // Note: We don't include full event data since CommandMutationResult doesn't expose it.
    // eventId is available from result.eventId if needed. Full event data should be
    // queried from the event store if required.
    if (result.status === "success") {
      return {
        status: "success" as const,
        data: result.data,
        version: result.version,
        eventId: result.eventId,
      };
    } else if (result.status === "rejected") {
      return {
        status: "rejected" as const,
        code: result.code,
        reason: result.reason,
      };
    } else if (result.status === "failed") {
      return {
        status: "failed" as const,
        reason: result.reason,
        eventId: result.eventId,
      };
    } else {
      return {
        status: "rejected" as const,
        code: "UNEXPECTED_STATUS",
        reason: `Unexpected command status: ${result.status}`,
      };
    }
  }) as CommandExecutor;

  return createBatchExecutor({
    executor,
    getRegistration: (type) => {
      const reg = commandRegistry.get(type);
      if (!reg) return undefined;
      return {
        category: reg.metadata.category,
        boundedContext: reg.metadata.boundedContext,
        ...(reg.metadata.targetAggregate ? { targetAggregate: reg.metadata.targetAggregate } : {}),
      };
    },
    defaultBoundedContext: "orders",
  });
}

/**
 * Add multiple items to an order atomically.
 *
 * This demonstrates atomic batch execution - all items are added
 * sequentially to maintain event ordering, and if any fails,
 * the remaining items are skipped (but previous items remain).
 *
 * **Note:** Convex doesn't support cross-mutation rollback, so "atomic"
 * here means single-aggregate scope and sequential execution, not
 * transactional rollback of previously executed commands.
 *
 * @example
 * ```typescript
 * // Add 3 items to order at once
 * const result = await addMultipleOrderItems(ctx, {
 *   orderId: "ord_123",
 *   items: [
 *     { productId: "prod_1", productName: "Widget", quantity: 2, unitPrice: 10 },
 *     { productId: "prod_2", productName: "Gadget", quantity: 1, unitPrice: 25 },
 *     { productId: "prod_3", productName: "Gizmo", quantity: 3, unitPrice: 15 },
 *   ],
 * });
 *
 * // Result shows per-item status
 * console.log(result.summary); // { succeeded: 3, failed: 0, rejected: 0, skipped: 0 }
 * ```
 */
export const addMultipleOrderItems = mutation({
  args: {
    orderId: v.string(),
    items: v.array(
      v.object({
        productId: v.string(),
        productName: v.string(),
        quantity: v.number(),
        unitPrice: v.number(),
      })
    ),
    correlationId: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<BatchResult<unknown>> => {
    const batchExecutor = createOrderBatchExecutor(ctx);

    // Build batch commands from input items
    const commands = args.items.map((item) => ({
      commandType: "AddOrderItem",
      args: {
        orderId: args.orderId,
        productId: item.productId,
        productName: item.productName,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
      },
    }));

    // Execute atomically - sequential execution, same aggregate
    const result = await batchExecutor.execute(commands, {
      mode: "atomic",
      aggregateId: args.orderId,
      correlationId: args.correlationId
        ? toCorrelationId(args.correlationId)
        : generateCorrelationId(),
      boundedContext: "orders",
    });

    return result;
  },
});

/**
 * Remove multiple items from an order atomically.
 *
 * Similar to addMultipleOrderItems, but for removal operations.
 * Demonstrates that any aggregate commands can be batched.
 */
export const removeMultipleOrderItems = mutation({
  args: {
    orderId: v.string(),
    productIds: v.array(v.string()),
    correlationId: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<BatchResult<unknown>> => {
    const batchExecutor = createOrderBatchExecutor(ctx);

    const commands = args.productIds.map((productId) => ({
      commandType: "RemoveOrderItem",
      args: {
        orderId: args.orderId,
        productId,
      },
    }));

    return batchExecutor.execute(commands, {
      mode: "atomic",
      aggregateId: args.orderId,
      correlationId: args.correlationId
        ? toCorrelationId(args.correlationId)
        : generateCorrelationId(),
      boundedContext: "orders",
    });
  },
});
