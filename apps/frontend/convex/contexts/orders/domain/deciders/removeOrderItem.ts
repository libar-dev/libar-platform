/**
 * RemoveOrderItem decider - pure decision logic.
 *
 * Validates that an item can be removed and produces OrderItemRemoved event.
 * Order must be in draft status and item must exist.
 */

import type { DeciderOutput, Decider } from "@libar-dev/platform-core/decider";
import { success, rejected } from "@libar-dev/platform-core/decider";
import type { OrderCMS } from "../order.js";
import { calculateTotalAmount } from "../order.js";
import type {
  RemoveOrderItemInput,
  RemoveOrderItemData,
  OrderItemRemovedEvent,
  OrderStateUpdate,
  DeciderContext,
} from "./types.js";

/**
 * Decide whether to remove an item from an order.
 *
 * Pure function: no I/O, no side effects.
 *
 * Invariants:
 * - Order must be in draft status
 * - Item with given productId must exist
 *
 * @param state - Current OrderCMS state
 * @param command - RemoveOrderItem command input
 * @param context - Decider context (timestamp, IDs)
 * @returns DeciderOutput with OrderItemRemoved event or rejection
 */
export function decideRemoveOrderItem(
  state: OrderCMS,
  command: RemoveOrderItemInput,
  _context: DeciderContext
): DeciderOutput<OrderItemRemovedEvent, RemoveOrderItemData, OrderStateUpdate> {
  // Validate order is in draft
  if (state.status !== "draft") {
    return rejected(
      "ORDER_NOT_IN_DRAFT",
      `Cannot remove items from order in ${state.status} status. Only draft orders can be modified.`
    );
  }

  // Validate item exists and capture quantity for event
  const removedItem = state.items.find((item) => item.productId === command.productId);
  if (!removedItem) {
    return rejected(
      "ITEM_NOT_FOUND",
      `Item with productId ${command.productId} not found in order.`
    );
  }

  // Calculate new state
  const newItems = state.items.filter((item) => item.productId !== command.productId);
  const newTotalAmount = calculateTotalAmount(newItems);

  // Build success output
  return success({
    data: {
      orderId: state.orderId,
      itemCount: newItems.length,
      totalAmount: newTotalAmount,
    },
    event: {
      eventType: "OrderItemRemoved" as const,
      payload: {
        orderId: state.orderId,
        productId: command.productId,
        newTotalAmount,
        removedQuantity: removedItem.quantity,
      },
    },
    stateUpdate: {
      items: newItems,
      totalAmount: newTotalAmount,
    },
  });
}

/**
 * Evolve order state by applying OrderItemRemoved event.
 *
 * Pure function: applies event to produce new state.
 *
 * @param state - Current OrderCMS state
 * @param event - OrderItemRemoved event
 * @returns New OrderCMS state with item removed and total updated
 */
export function evolveRemoveOrderItem(state: OrderCMS, event: OrderItemRemovedEvent): OrderCMS {
  const newItems = state.items.filter((item) => item.productId !== event.payload.productId);
  return {
    ...state,
    items: newItems,
    totalAmount: event.payload.newTotalAmount,
  };
}

/**
 * Full RemoveOrderItem Decider combining decide and evolve.
 *
 * Use this for:
 * - Property-based testing
 * - Projection rebuilding
 * - Event replay
 */
export const removeOrderItemDecider: Decider<
  OrderCMS,
  RemoveOrderItemInput,
  OrderItemRemovedEvent,
  RemoveOrderItemData,
  OrderStateUpdate
> = {
  decide: decideRemoveOrderItem,
  evolve: evolveRemoveOrderItem,
};
