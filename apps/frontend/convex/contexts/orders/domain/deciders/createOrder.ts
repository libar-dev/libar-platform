/**
 * CreateOrder decider - pure decision logic.
 *
 * Validates that an order can be created and produces OrderCreated event.
 * This is a special decider for entity creation - it takes null state
 * to indicate the entity doesn't exist yet.
 */

import type { DeciderOutput, Decider } from "@libar-dev/platform-core/decider";
import { success, rejected } from "@libar-dev/platform-core/decider";
import type { OrderCMS } from "../order.js";
import { createInitialOrderCMS } from "../order.js";
import type {
  CreateOrderInput,
  CreateOrderData,
  OrderCreatedEvent,
  OrderStateUpdate,
  DeciderContext,
} from "./types.js";

/**
 * Decide whether to create a new order.
 *
 * Pure function: no I/O, no side effects.
 *
 * Invariants:
 * - Order must not already exist (state must be null)
 *
 * Note: For creation commands, the handler wrapper checks existence
 * before calling this decider. The decider receives null to indicate
 * the entity doesn't exist.
 *
 * @param state - Current state (null for creation, OrderCMS if exists)
 * @param command - CreateOrder command input
 * @param context - Decider context (timestamp, IDs)
 * @returns DeciderOutput with OrderCreated event or rejection
 */
export function decideCreateOrder(
  state: OrderCMS | null,
  command: CreateOrderInput,
  _context: DeciderContext
): DeciderOutput<OrderCreatedEvent, CreateOrderData, OrderStateUpdate> {
  // Validate order doesn't exist
  if (state !== null) {
    return rejected("ORDER_ALREADY_EXISTS", `Order ${command.orderId} already exists.`);
  }

  // Build success output
  // Note: stateUpdate is the full initial state for create commands
  return success({
    data: {
      orderId: command.orderId,
      customerId: command.customerId,
    },
    event: {
      eventType: "OrderCreated" as const,
      payload: {
        orderId: command.orderId,
        customerId: command.customerId,
      },
    },
    stateUpdate: {
      status: "draft",
      items: [],
      totalAmount: 0,
    },
  });
}

/**
 * Evolve order state by applying OrderCreated event.
 *
 * Special case: creates initial state from null.
 * For creation deciders, state will be null before the event is applied.
 *
 * @param state - Current state (null for creation)
 * @param event - OrderCreated event
 * @returns New OrderCMS state with initial values
 */
export function evolveCreateOrder(_state: OrderCMS | null, event: OrderCreatedEvent): OrderCMS {
  return createInitialOrderCMS(event.payload.orderId, event.payload.customerId);
}

/**
 * Full CreateOrder Decider combining decide and evolve.
 *
 * Note: This decider is special - it accepts null state for creation.
 *
 * Use this for:
 * - Property-based testing
 * - Projection rebuilding
 * - Event replay
 */
export const createOrderDecider: Decider<
  OrderCMS | null,
  CreateOrderInput,
  OrderCreatedEvent,
  CreateOrderData,
  OrderStateUpdate
> = {
  decide: decideCreateOrder,
  evolve: evolveCreateOrder,
};
