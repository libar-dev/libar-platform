/**
 * Reservation Finite State Machine definition.
 *
 * Defines valid state transitions for the Reservation aggregate.
 * Used by deciders to validate transitions before emitting events.
 *
 * @example
 * ```typescript
 * import { reservationFSM } from "./reservationFSM";
 *
 * // In decider function
 * if (!reservationFSM.canTransition(state.status, "confirmed")) {
 *   return rejected("INVALID_TRANSITION", `Cannot confirm from ${state.status}`);
 * }
 * ```
 */
import { defineFSM } from "@libar-dev/platform-core/fsm";
import type { ReservationStatus } from "./reservation.js";

/**
 * Reservation aggregate FSM.
 *
 * Valid transitions:
 * - pending → confirmed (ConfirmReservation command)
 * - pending → released (ReleaseReservation command - compensation)
 * - pending → expired (ExpireReservation command - TTL)
 * - confirmed → released (ReleaseReservation command - order cancelled)
 * - released → (terminal)
 * - expired → (terminal)
 */
export const reservationFSM = defineFSM<ReservationStatus>({
  initial: "pending",
  transitions: {
    pending: ["confirmed", "released", "expired"],
    confirmed: ["released"], // can release after confirmation (order cancelled)
    released: [], // terminal state
    expired: [], // terminal state
  },
});
