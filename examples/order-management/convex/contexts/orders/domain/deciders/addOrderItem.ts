/**
 * AddOrderItem decider - pure decision logic.
 *
 * Validates that an item can be added and produces OrderItemAdded event.
 * Order must be in draft status.
 */

import type { DeciderOutput, Decider } from "@libar-dev/platform-core/decider";
import { success, rejected } from "@libar-dev/platform-core/decider";
import type { OrderCMS } from "../order.js";
import { OrderItemSchema, calculateTotalAmount } from "../order.js";
import type {
  AddOrderItemInput,
  AddOrderItemData,
  OrderItemAddedEvent,
  OrderStateUpdate,
  DeciderContext,
} from "./types.js";

/**
 * Decide whether to add an item to an order.
 *
 * Pure function: no I/O, no side effects.
 *
 * Invariants:
 * - Order must be in draft status
 * - Item must pass validation (positive quantity, non-negative price)
 *
 * @param state - Current OrderCMS state
 * @param command - AddOrderItem command input
 * @param context - Decider context (timestamp, IDs)
 * @returns DeciderOutput with OrderItemAdded event or rejection
 */
export function decideAddOrderItem(
  state: OrderCMS,
  command: AddOrderItemInput,
  _context: DeciderContext
): DeciderOutput<OrderItemAddedEvent, AddOrderItemData, OrderStateUpdate> {
  // Validate order is in draft
  if (state.status !== "draft") {
    return rejected(
      "ORDER_NOT_IN_DRAFT",
      `Cannot add items to order in ${state.status} status. Only draft orders can be modified.`
    );
  }

  // Validate item
  const itemResult = OrderItemSchema.safeParse(command.item);
  if (!itemResult.success) {
    const issues = itemResult.error.issues.map((i) => i.message).join(", ");
    return rejected("INVALID_ORDER_ITEM", `Invalid item: ${issues}`);
  }
  const validatedItem = itemResult.data;

  // Calculate new state
  const newItems = [...state.items, validatedItem];
  const newTotalAmount = calculateTotalAmount(newItems);

  // Build success output
  return success({
    data: {
      orderId: state.orderId,
      itemCount: newItems.length,
      totalAmount: newTotalAmount,
    },
    event: {
      eventType: "OrderItemAdded" as const,
      payload: {
        orderId: state.orderId,
        item: validatedItem,
        newTotalAmount,
      },
    },
    stateUpdate: {
      items: newItems,
      totalAmount: newTotalAmount,
    },
  });
}

/**
 * Evolve order state by applying OrderItemAdded event.
 *
 * Pure function: applies event to produce new state.
 *
 * @param state - Current OrderCMS state
 * @param event - OrderItemAdded event
 * @returns New OrderCMS state with item appended and total updated
 */
export function evolveAddOrderItem(state: OrderCMS, event: OrderItemAddedEvent): OrderCMS {
  const newItems = [...state.items, event.payload.item];
  return {
    ...state,
    items: newItems,
    totalAmount: event.payload.newTotalAmount,
  };
}

/**
 * Full AddOrderItem Decider combining decide and evolve.
 *
 * Use this for:
 * - Property-based testing
 * - Projection rebuilding
 * - Event replay
 */
export const addOrderItemDecider: Decider<
  OrderCMS,
  AddOrderItemInput,
  OrderItemAddedEvent,
  AddOrderItemData,
  OrderStateUpdate
> = {
  decide: decideAddOrderItem,
  evolve: evolveAddOrderItem,
};
