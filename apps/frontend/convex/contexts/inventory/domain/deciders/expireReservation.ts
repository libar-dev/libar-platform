/**
 * ExpireReservation decider - pure decision logic.
 *
 * Validates that a reservation can be expired and produces ReservationExpired event.
 * Reservation must be pending AND past its expiration time.
 *
 * HYBRID PATTERN:
 * - Decider validates reservation state and produces event
 * - Handler coordinates stock return to multiple InventoryCMS records
 */

import type { DeciderOutput, Decider } from "@libar-dev/platform-core/decider";
import { success, rejected } from "@libar-dev/platform-core/decider";
import { reservationFSM } from "../reservationFSM.js";
import type {
  ReservationCMS,
  InventoryCMS,
  ExpireReservationInput,
  ExpireReservationData,
  ReservationExpiredEvent,
  ReservationStateUpdate,
  DeciderContext,
} from "./types.js";

/**
 * Decide whether to expire a reservation.
 *
 * Pure function: no I/O, no side effects.
 *
 * Invariants:
 * - Reservation must be in pending status (FSM transition)
 * - Reservation must be past its expiresAt time
 *
 * @param state - Current ReservationCMS state
 * @param _command - ExpireReservation command input
 * @param context - Decider context (timestamp, IDs) - now used for expiration check
 * @returns DeciderOutput with ReservationExpired event or rejection
 */
export function decideExpireReservation(
  state: ReservationCMS,
  _command: ExpireReservationInput,
  context: DeciderContext
): DeciderOutput<ReservationExpiredEvent, ExpireReservationData, ReservationStateUpdate> {
  // Validate FSM transition
  if (!reservationFSM.canTransition(state.status, "expired")) {
    return rejected(
      "RESERVATION_NOT_PENDING",
      `Cannot expire reservation in ${state.status} status. Only pending reservations can be expired.`,
      {
        reservationId: state.reservationId,
        currentStatus: state.status,
      }
    );
  }

  // Check if reservation has actually expired using context.now
  if (state.expiresAt >= context.now) {
    return rejected("RESERVATION_NOT_EXPIRED", "Reservation has not expired yet", {
      reservationId: state.reservationId,
      expiresAt: state.expiresAt,
      now: context.now,
    });
  }

  // Build success output
  // Include items in event so projections can update stock without accessing CMS
  return success({
    data: {
      reservationId: state.reservationId,
      orderId: state.orderId,
    },
    event: {
      eventType: "ReservationExpired" as const,
      payload: {
        reservationId: state.reservationId,
        orderId: state.orderId,
        items: state.items, // Include for stock return
      },
    },
    stateUpdate: {
      status: "expired",
    },
  });
}

/**
 * Evolve reservation state by applying ReservationExpired event.
 *
 * Pure function: applies event to produce new state.
 *
 * @param state - Current ReservationCMS state
 * @param _event - ReservationExpired event
 * @returns New ReservationCMS state with status = "expired"
 */
export function evolveExpireReservation(
  state: ReservationCMS,
  _event: ReservationExpiredEvent
): ReservationCMS {
  return {
    ...state,
    status: "expired",
  };
}

/**
 * Evolve inventory state by applying ReservationExpired event.
 *
 * Use this to return reserved stock to available.
 *
 * @param state - Current InventoryCMS state
 * @param event - ReservationExpired event
 * @param productId - Which product to evolve
 * @returns New InventoryCMS state with returned stock
 */
export function evolveExpireReservationForProduct(
  state: InventoryCMS,
  event: ReservationExpiredEvent,
  productId: string
): InventoryCMS {
  const item = event.payload.items.find((i) => i.productId === productId);
  if (!item) {
    return state;
  }

  return {
    ...state,
    availableQuantity: state.availableQuantity + item.quantity,
    reservedQuantity: Math.max(0, state.reservedQuantity - item.quantity),
  };
}

/**
 * Full ExpireReservation Decider combining decide and evolve.
 *
 * Use this for:
 * - Property-based testing
 * - Projection rebuilding
 * - Event replay
 */
export const expireReservationDecider: Decider<
  ReservationCMS,
  ExpireReservationInput,
  ReservationExpiredEvent,
  ExpireReservationData,
  ReservationStateUpdate
> = {
  decide: decideExpireReservation,
  evolve: evolveExpireReservation,
};
