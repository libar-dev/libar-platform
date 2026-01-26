/**
 * SubmitOrder decider - pure decision logic.
 *
 * Validates that an order can be submitted and produces OrderSubmitted V2 event
 * with customer snapshot (Fat Events pattern).
 *
 * Order must be in draft status with at least one item.
 */

import type { DeciderOutput } from "@libar-dev/platform-core/decider";
import { success, rejected } from "@libar-dev/platform-core/decider";
import type { OrderCMS } from "../order.js";
import { orderFSM } from "../orderFSM.js";
import type {
  SubmitOrderInput,
  SubmitOrderData,
  OrderSubmittedV2Event,
  OrderStateUpdate,
  SubmitOrderContext,
} from "./types.js";

/**
 * Decide whether to submit an order.
 *
 * Pure function: no I/O, no side effects.
 *
 * Produces V2 OrderSubmitted event with customer snapshot (Fat Events pattern).
 * The customer snapshot is provided in the extended context by the handler.
 *
 * Invariants:
 * - Order must be in draft status
 * - Order must have at least one item
 *
 * @param state - Current OrderCMS state
 * @param command - SubmitOrder command input
 * @param context - Extended context with timestamp, IDs, and customer snapshot
 * @returns DeciderOutput with OrderSubmittedV2 event or rejection
 */
export function decideSubmitOrder(
  state: OrderCMS,
  _command: SubmitOrderInput,
  context: SubmitOrderContext
): DeciderOutput<OrderSubmittedV2Event, SubmitOrderData, OrderStateUpdate> {
  // Validate FSM transition
  if (!orderFSM.canTransition(state.status, "submitted")) {
    return rejected(
      "ORDER_NOT_IN_DRAFT",
      `Cannot submit order in ${state.status} status. Only draft orders can be submitted.`
    );
  }

  // Validate items invariant
  if (state.items.length === 0) {
    return rejected("ORDER_HAS_NO_ITEMS", "Cannot submit an order with no items.");
  }

  // Build success output with V2 event (Fat Events: includes customer snapshot)
  return success({
    data: {
      orderId: state.orderId,
      customerId: state.customerId,
      totalAmount: state.totalAmount,
      itemCount: state.items.length,
      items: state.items,
    },
    event: {
      eventType: "OrderSubmitted" as const,
      payload: {
        orderId: state.orderId,
        customerId: state.customerId,
        items: state.items,
        totalAmount: state.totalAmount,
        submittedAt: context.now,
        customer: context.customerSnapshot, // V2: Fat Events enrichment
      },
    },
    stateUpdate: {
      status: "submitted",
    },
  });
}

/**
 * Evolve order state by applying OrderSubmitted V2 event.
 *
 * Pure function: applies event to produce new state.
 * Note: The customer snapshot in the event doesn't affect CMS state -
 * it's for downstream consumers only.
 *
 * @param state - Current OrderCMS state
 * @param event - OrderSubmittedV2 event
 * @returns New OrderCMS state with status = "submitted"
 */
export function evolveSubmitOrder(state: OrderCMS, _event: OrderSubmittedV2Event): OrderCMS {
  return {
    ...state,
    status: "submitted",
  };
}

/**
 * Full SubmitOrder Decider combining decide and evolve.
 *
 * Use this for:
 * - Property-based testing (must provide SubmitOrderContext with customerSnapshot)
 * - Projection rebuilding
 * - Event replay
 *
 * Note: This decider produces V2 events with customer snapshot.
 * The handler must provide SubmitOrderContext with customerSnapshot.
 *
 * Type Note: The Decider interface expects standard DeciderContext, but
 * our decideSubmitOrder requires SubmitOrderContext. This is intentional -
 * the handler is responsible for building the extended context.
 */
export const submitOrderDecider = {
  decide: decideSubmitOrder,
  evolve: evolveSubmitOrder,
} as const;
