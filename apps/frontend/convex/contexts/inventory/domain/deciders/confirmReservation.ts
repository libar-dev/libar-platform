/**
 * ConfirmReservation decider - pure decision logic.
 *
 * Validates that a reservation can be confirmed and produces ReservationConfirmed event.
 * Uses FSM for status transition validation and context.now for pure expiration check.
 */

import type { DeciderOutput, Decider } from "@libar-dev/platform-core/decider";
import { success, rejected } from "@libar-dev/platform-core/decider";
import { reservationFSM } from "../reservationFSM.js";
import type {
  ReservationCMS,
  ConfirmReservationInput,
  ConfirmReservationData,
  ReservationConfirmedEvent,
  ReservationStateUpdate,
  DeciderContext,
} from "./types.js";

/**
 * Decide whether to confirm a reservation.
 *
 * Pure function: no I/O, no side effects.
 *
 * Invariants:
 * - Reservation must be in pending status (FSM transition)
 * - Reservation must not be expired
 *
 * @param state - Current ReservationCMS state
 * @param _command - ConfirmReservation command input
 * @param context - Decider context (timestamp, IDs) - used for expiration check
 * @returns DeciderOutput with ReservationConfirmed event or rejection
 */
export function decideConfirmReservation(
  state: ReservationCMS,
  _command: ConfirmReservationInput,
  context: DeciderContext
): DeciderOutput<ReservationConfirmedEvent, ConfirmReservationData, ReservationStateUpdate> {
  // Validate FSM transition
  if (!reservationFSM.canTransition(state.status, "confirmed")) {
    return rejected(
      "RESERVATION_NOT_PENDING",
      `Cannot confirm reservation in ${state.status} status. Only pending reservations can be confirmed.`,
      {
        reservationId: state.reservationId,
        currentStatus: state.status,
      }
    );
  }

  // Check if reservation has expired using context.now
  // This is a pure check using the timestamp from context
  if (state.expiresAt < context.now) {
    return rejected("RESERVATION_EXPIRED", "Reservation has expired and cannot be confirmed", {
      reservationId: state.reservationId,
      expiresAt: state.expiresAt,
      now: context.now,
    });
  }

  // Build success output
  // Include items for consistency with Released/Expired and to enable projection rebuilding
  return success({
    data: {
      reservationId: state.reservationId,
      orderId: state.orderId,
    },
    event: {
      eventType: "ReservationConfirmed" as const,
      payload: {
        reservationId: state.reservationId,
        orderId: state.orderId,
        items: state.items,
      },
    },
    stateUpdate: {
      status: "confirmed",
    },
  });
}

/**
 * Evolve reservation state by applying ReservationConfirmed event.
 *
 * Pure function: applies event to produce new state.
 *
 * @param state - Current ReservationCMS state
 * @param _event - ReservationConfirmed event
 * @returns New ReservationCMS state with status = "confirmed"
 */
export function evolveConfirmReservation(
  state: ReservationCMS,
  _event: ReservationConfirmedEvent
): ReservationCMS {
  return {
    ...state,
    status: "confirmed",
  };
}

/**
 * Full ConfirmReservation Decider combining decide and evolve.
 *
 * Use this for:
 * - Property-based testing
 * - Projection rebuilding
 * - Event replay
 */
export const confirmReservationDecider: Decider<
  ReservationCMS,
  ConfirmReservationInput,
  ReservationConfirmedEvent,
  ConfirmReservationData,
  ReservationStateUpdate
> = {
  decide: decideConfirmReservation,
  evolve: evolveConfirmReservation,
};
