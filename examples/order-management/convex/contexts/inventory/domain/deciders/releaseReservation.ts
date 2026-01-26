/**
 * ReleaseReservation decider - pure decision logic.
 *
 * Validates that a reservation can be released and produces ReservationReleased event.
 * Reservation must be in pending status.
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
  ReleaseReservationInput,
  ReleaseReservationData,
  ReservationReleasedEvent,
  ReservationStateUpdate,
  DeciderContext,
} from "./types.js";

/**
 * Decide whether to release a reservation.
 *
 * Pure function: no I/O, no side effects.
 *
 * Invariants:
 * - Reservation must be in pending status (FSM transition)
 *
 * @param state - Current ReservationCMS state
 * @param command - ReleaseReservation command input
 * @param _context - Decider context (timestamp, IDs)
 * @returns DeciderOutput with ReservationReleased event or rejection
 */
export function decideReleaseReservation(
  state: ReservationCMS,
  command: ReleaseReservationInput,
  _context: DeciderContext
): DeciderOutput<ReservationReleasedEvent, ReleaseReservationData, ReservationStateUpdate> {
  // Validate FSM transition (FSM encodes all valid transitions, no separate invariant needed)
  if (!reservationFSM.canTransition(state.status, "released")) {
    return rejected(
      "RESERVATION_NOT_PENDING",
      `Cannot release reservation in ${state.status} status. Only pending or confirmed reservations can be released.`,
      {
        reservationId: state.reservationId,
        currentStatus: state.status,
      }
    );
  }

  // Build success output
  // Include items in event so projections can update stock without accessing CMS
  return success({
    data: {
      reservationId: state.reservationId,
      orderId: state.orderId,
      reason: command.reason,
    },
    event: {
      eventType: "ReservationReleased" as const,
      payload: {
        reservationId: state.reservationId,
        orderId: state.orderId,
        reason: command.reason,
        items: state.items, // Include for stock return
      },
    },
    stateUpdate: {
      status: "released",
    },
  });
}

/**
 * Evolve reservation state by applying ReservationReleased event.
 *
 * Pure function: applies event to produce new state.
 *
 * @param state - Current ReservationCMS state
 * @param _event - ReservationReleased event
 * @returns New ReservationCMS state with status = "released"
 */
export function evolveReleaseReservation(
  state: ReservationCMS,
  _event: ReservationReleasedEvent
): ReservationCMS {
  return {
    ...state,
    status: "released",
  };
}

/**
 * Evolve inventory state by applying ReservationReleased event.
 *
 * Use this to return reserved stock to available.
 *
 * @param state - Current InventoryCMS state
 * @param event - ReservationReleased event
 * @param productId - Which product to evolve
 * @returns New InventoryCMS state with returned stock
 */
export function evolveReleaseReservationForProduct(
  state: InventoryCMS,
  event: ReservationReleasedEvent,
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
 * Full ReleaseReservation Decider combining decide and evolve.
 *
 * Use this for:
 * - Property-based testing
 * - Projection rebuilding
 * - Event replay
 */
export const releaseReservationDecider: Decider<
  ReservationCMS,
  ReleaseReservationInput,
  ReservationReleasedEvent,
  ReleaseReservationData,
  ReservationStateUpdate
> = {
  decide: decideReleaseReservation,
  evolve: evolveReleaseReservation,
};
