/**
 * CancelOrder decider - pure decision logic.
 *
 * Validates that an order can be cancelled and produces OrderCancelled event.
 * Only draft and submitted orders can be cancelled.
 */

import type { DeciderOutput, Decider } from "@libar-dev/platform-core/decider";
import { success, rejected } from "@libar-dev/platform-core/decider";
import type { OrderCMS } from "../order.js";
import { orderFSM } from "../orderFSM.js";
import type {
  CancelOrderInput,
  CancelOrderData,
  OrderCancelledEvent,
  OrderStateUpdate,
  DeciderContext,
} from "./types.js";

/**
 * Decide whether to cancel an order.
 *
 * Pure function: no I/O, no side effects.
 *
 * Invariants:
 * - Order must not already be cancelled
 * - Order must not be confirmed (terminal state)
 *
 * @param state - Current OrderCMS state
 * @param command - CancelOrder command input
 * @param context - Decider context (timestamp, IDs)
 * @returns DeciderOutput with OrderCancelled event or rejection
 */
export function decideCancelOrder(
  state: OrderCMS,
  command: CancelOrderInput,
  _context: DeciderContext
): DeciderOutput<OrderCancelledEvent, CancelOrderData, OrderStateUpdate> {
  // Check for specific terminal states with appropriate error codes
  if (state.status === "cancelled") {
    return rejected("ORDER_ALREADY_CANCELLED", "Order has already been cancelled");
  }

  if (state.status === "confirmed") {
    return rejected("ORDER_ALREADY_CONFIRMED", "Order has already been confirmed");
  }

  // Validate FSM transition (handles any other invalid states)
  if (!orderFSM.canTransition(state.status, "cancelled")) {
    return rejected(
      "ORDER_CANNOT_BE_CANCELLED",
      `Cannot cancel order in ${state.status} status. Only draft or submitted orders can be cancelled.`
    );
  }

  // Build success output
  return success({
    data: {
      orderId: state.orderId,
      reason: command.reason,
    },
    event: {
      eventType: "OrderCancelled" as const,
      payload: {
        orderId: state.orderId,
        customerId: state.customerId,
        reason: command.reason,
      },
    },
    stateUpdate: {
      status: "cancelled",
    },
  });
}

/**
 * Evolve order state by applying OrderCancelled event.
 *
 * Pure function: applies event to produce new state.
 *
 * @param state - Current OrderCMS state
 * @param event - OrderCancelled event
 * @returns New OrderCMS state with status = "cancelled"
 */
export function evolveCancelOrder(state: OrderCMS, _event: OrderCancelledEvent): OrderCMS {
  return {
    ...state,
    status: "cancelled",
  };
}

/**
 * Full CancelOrder Decider combining decide and evolve.
 *
 * Use this for:
 * - Property-based testing
 * - Projection rebuilding
 * - Event replay
 */
export const cancelOrderDecider: Decider<
  OrderCMS,
  CancelOrderInput,
  OrderCancelledEvent,
  CancelOrderData,
  OrderStateUpdate
> = {
  decide: decideCancelOrder,
  evolve: evolveCancelOrder,
};
