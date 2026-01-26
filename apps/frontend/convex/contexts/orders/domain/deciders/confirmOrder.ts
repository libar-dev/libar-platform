/**
 * ConfirmOrder decider - pure decision logic.
 *
 * Validates that an order can be confirmed and produces OrderConfirmed event.
 * Only submitted orders can be confirmed.
 */

import type { DeciderOutput, Decider } from "@libar-dev/platform-core/decider";
import { success, rejected } from "@libar-dev/platform-core/decider";
import type { OrderCMS } from "../order.js";
import { orderFSM } from "../orderFSM.js";
import type {
  ConfirmOrderInput,
  ConfirmOrderData,
  OrderConfirmedEvent,
  OrderStateUpdate,
  DeciderContext,
} from "./types.js";

/**
 * Decide whether to confirm an order.
 *
 * Pure function: no I/O, no side effects.
 *
 * @param state - Current OrderCMS state
 * @param command - ConfirmOrder command input
 * @param context - Decider context (timestamp, IDs)
 * @returns DeciderOutput with OrderConfirmed event or rejection
 */
export function decideConfirmOrder(
  state: OrderCMS,
  _command: ConfirmOrderInput,
  context: DeciderContext
): DeciderOutput<OrderConfirmedEvent, ConfirmOrderData, OrderStateUpdate> {
  // Validate FSM transition
  if (!orderFSM.canTransition(state.status, "confirmed")) {
    return rejected(
      "ORDER_NOT_SUBMITTED",
      `Cannot confirm order in ${state.status} status. Only submitted orders can be confirmed.`
    );
  }

  // Build success output
  return success({
    data: {
      orderId: state.orderId,
    },
    event: {
      eventType: "OrderConfirmed" as const,
      payload: {
        orderId: state.orderId,
        customerId: state.customerId,
        totalAmount: state.totalAmount,
        confirmedAt: context.now,
      },
    },
    stateUpdate: {
      status: "confirmed",
    },
  });
}

/**
 * Evolve order state by applying OrderConfirmed event.
 *
 * Pure function: applies event to produce new state.
 *
 * @param state - Current OrderCMS state
 * @param event - OrderConfirmed event
 * @returns New OrderCMS state with status = "confirmed"
 */
export function evolveConfirmOrder(state: OrderCMS, _event: OrderConfirmedEvent): OrderCMS {
  return {
    ...state,
    status: "confirmed",
  };
}

/**
 * Full ConfirmOrder Decider combining decide and evolve.
 *
 * Use this for:
 * - Property-based testing
 * - Projection rebuilding
 * - Event replay
 */
export const confirmOrderDecider: Decider<
  OrderCMS,
  ConfirmOrderInput,
  OrderConfirmedEvent,
  ConfirmOrderData,
  OrderStateUpdate
> = {
  decide: decideConfirmOrder,
  evolve: evolveConfirmOrder,
};
